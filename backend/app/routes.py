"""
API Routes for the QC Management System
Handles all HTTP endpoints for authentication, companies, products, and image management.
"""

from flask import Blueprint, request, jsonify, send_from_directory, current_app, Response, redirect
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from .models import db, User, Company, Product, CapturedImage, ClassCount
from .services.minio_service import minio_service
from werkzeug.utils import secure_filename
import os
import uuid
import requests
import subprocess
import json
import tempfile
import socket
import time
import io
import zipfile

bp = Blueprint('routes', __name__)

def get_docker_gateway_ip():
    """Dynamically get the Docker gateway IP to reach the host"""
    try:
        # Method 1: Try to get gateway from route table
        try:
            result = subprocess.run(['ip', 'route', 'show', 'default'], 
                                  capture_output=True, text=True, timeout=5)
            if result.returncode == 0:
                for line in result.stdout.strip().split('\n'):
                    if 'default' in line:
                        parts = line.split()
                        if 'via' in parts:
                            gateway_idx = parts.index('via') + 1
                            if gateway_idx < len(parts):
                                gateway_ip = parts[gateway_idx]
                                current_app.logger.info(f"Found gateway IP via route: {gateway_ip}")
                                return gateway_ip
        except (subprocess.TimeoutExpired, subprocess.CalledProcessError, FileNotFoundError):
            pass
        
        # Method 2: Try to get gateway from /proc/net/route
        try:
            with open('/proc/net/route', 'r') as f:
                for line in f:
                    fields = line.strip().split()
                    if len(fields) >= 3 and fields[1] == '00000000':  # Default route
                        gateway_hex = fields[2]
                        # Convert hex to IP (little-endian)
                        gateway_ip = socket.inet_ntoa(bytes.fromhex(gateway_hex)[::-1])
                        current_app.logger.info(f"Found gateway IP via /proc/net/route: {gateway_ip}")
                        return gateway_ip
        except (IOError, ValueError):
            pass
        
        # Method 3: Try common Docker gateway IPs
        common_gateways = ['172.17.0.1', '172.18.0.1', '172.19.0.1', '172.20.0.1', '172.21.0.1']
        for gateway in common_gateways:
            try:
                # Test if we can reach Label Studio on this gateway
                result = subprocess.run(['curl', '-s', '--max-time', '2', 
                                       f'http://{gateway}:8081/api/projects/', 
                                       '-w', '%{http_code}'], 
                                     capture_output=True, text=True, timeout=3)
                if result.returncode == 0:
                    # Check if we got a reasonable HTTP response (even 401 is good - means LS is there)
                    status_code = result.stdout[-3:] if len(result.stdout) >= 3 else '000'
                    if status_code in ['200', '401', '403']:  # Label Studio is responding
                        current_app.logger.info(f"Found working gateway IP by testing: {gateway}")
                        return gateway
            except (subprocess.TimeoutExpired, subprocess.CalledProcessError):
                continue
        
        # Method 4: Fall back to host.docker.internal if available
        try:
            result = subprocess.run(['getent', 'hosts', 'host.docker.internal'], 
                                  capture_output=True, text=True, timeout=3)
            if result.returncode == 0:
                host_ip = result.stdout.split()[0]
                current_app.logger.info(f"Found host IP via host.docker.internal: {host_ip}")
                return host_ip
        except (subprocess.TimeoutExpired, subprocess.CalledProcessError, FileNotFoundError):
            pass
        
        # Default fallback
        current_app.logger.warning("Could not determine gateway IP, using default 172.20.0.1")
        return '172.20.0.1'
        
    except Exception as e:
        current_app.logger.error(f"Error determining gateway IP: {str(e)}")
        return '172.20.0.1'

def cleanup_label_studio_duplicates_internal(user):
    """Internal function to clean up duplicate projects and tasks"""
    try:
        base_url = get_label_studio_base_url()
        headers = {
            'Authorization': f'Token {user.label_studio_api_key}',
            'Content-Type': 'application/json'
        }
        
        # Get all projects
        projects_response = execute_curl_command(
            method='GET',
            url=f'{base_url}/api/projects/',
            headers=headers,
            timeout=30
        )
        
        if not projects_response['success']:
            current_app.logger.warning("Failed to fetch projects for cleanup")
            return {'deleted_projects': 0, 'deleted_tasks': 0}
        
        projects = projects_response['json']
        if not isinstance(projects, list):
            current_app.logger.warning("Invalid response format from Label Studio during cleanup")
            return {'deleted_projects': 0, 'deleted_tasks': 0}
        
        # Group projects by title to find duplicates
        project_groups = {}
        for project in projects:
            if isinstance(project, dict) and 'title' in project:
                title = project['title']
                if title not in project_groups:
                    project_groups[title] = []
                project_groups[title].append(project)
        
        deleted_projects = 0
        deleted_tasks = 0
        
        # Process each group of projects with the same title
        for title, project_list in project_groups.items():
            if len(project_list) > 1:
                # Keep the first project, delete the rest
                projects_to_delete = project_list[1:]
                
                current_app.logger.info(f"Auto-cleanup: Found {len(project_list)} projects with title '{title}', deleting {len(projects_to_delete)} duplicates")
                
                for project_to_delete in projects_to_delete:
                    project_id = project_to_delete.get('id')
                    if project_id:
                        # Delete the duplicate project
                        delete_response = execute_curl_command(
                            method='DELETE',
                            url=f'{base_url}/api/projects/{project_id}/',
                            headers=headers,
                            timeout=30
                        )
                        
                        if delete_response['success']:
                            deleted_projects += 1
                            current_app.logger.info(f"Auto-cleanup: Deleted duplicate project '{title}' with ID {project_id}")
                
                # Clean up duplicate tasks in the remaining project
                if project_list:
                    remaining_project = project_list[0]
                    project_id = remaining_project.get('id')
                    
                    if project_id:
                        # Get tasks for the remaining project
                        tasks_response = execute_curl_command(
                            method='GET',
                            url=f'{base_url}/api/projects/{project_id}/tasks/',
                            headers=headers,
                            timeout=30
                        )
                        
                        if tasks_response['success'] and tasks_response['json']:
                            tasks = tasks_response['json']
                            
                            # Group tasks by image filename to find duplicates
                            task_groups = {}
                            for task in tasks:
                                if isinstance(task, dict) and 'data' in task:
                                    filename = task['data'].get('image_filename')
                                    if filename:
                                        if filename not in task_groups:
                                            task_groups[filename] = []
                                        task_groups[filename].append(task)
                            
                            # Delete duplicate tasks
                            for filename, task_list in task_groups.items():
                                if len(task_list) > 1:
                                    tasks_to_delete = task_list[1:]  # Keep first, delete rest
                                    
                                    for task_to_delete in tasks_to_delete:
                                        task_id = task_to_delete.get('id')
                                        if task_id:
                                            delete_task_response = execute_curl_command(
                                                method='DELETE',
                                                url=f'{base_url}/api/tasks/{task_id}/',
                                                headers=headers,
                                                timeout=30
                                            )
                                            
                                            if delete_task_response['success']:
                                                deleted_tasks += 1
                                                current_app.logger.info(f"Auto-cleanup: Deleted duplicate task for '{filename}' with ID {task_id}")
        
        if deleted_projects > 0 or deleted_tasks > 0:
            current_app.logger.info(f"Auto-cleanup completed: {deleted_projects} duplicate projects and {deleted_tasks} duplicate tasks deleted")
        
        return {'deleted_projects': deleted_projects, 'deleted_tasks': deleted_tasks}
        
    except Exception as e:
        current_app.logger.error(f"Error during auto-cleanup: {str(e)}")
        return {'deleted_projects': 0, 'deleted_tasks': 0}

def get_label_studio_base_url():
    """Get the base URL for Label Studio API calls"""
    gateway_ip = get_docker_gateway_ip()
    return f'http://{gateway_ip}:8081'

def execute_curl_command(method, url, headers=None, data=None, timeout=30):
    """Execute a curl command and return the response"""
    try:
        # Build curl command with status code extraction from the start
        curl_cmd = ['curl', '-s', '--max-time', str(timeout), '-X', method.upper(), '-w', '%{http_code}']
        
        # Add headers
        if headers:
            for key, value in headers.items():
                curl_cmd.extend(['-H', f'{key}: {value}'])
        
        # Add data for POST requests
        if data and method.upper() in ['POST', 'PUT', 'PATCH']:
            if isinstance(data, (dict, list)):
                data = json.dumps(data)
            curl_cmd.extend(['-d', data])
        
        # Add URL
        curl_cmd.append(url)
        
        # Execute curl command ONLY ONCE
        request_id = f"curl-{int(time.time())}-{os.getpid()}"
        current_app.logger.info(f"[{request_id}] STARTING curl execution: {method} {url}")
        current_app.logger.info(f"[{request_id}] Full curl command: {' '.join(curl_cmd[:10])}...")  # Don't log sensitive data
        
        result = subprocess.run(curl_cmd, capture_output=True, text=True, timeout=timeout)
        
        current_app.logger.info(f"[{request_id}] COMPLETED curl execution with return code: {result.returncode}")
        current_app.logger.info(f"[{request_id}] COMPLETED curl execution with return code: {result.returncode}")
        
        # Parse response
        response_data = {
            'status_code': 0,
            'text': '',
            'success': result.returncode == 0,
            'json': {}
        }
        
        # Extract HTTP status code and response body
        if result.returncode == 0 and result.stdout:
            try:
                # The last 3 characters should be the HTTP status code
                full_output = result.stdout
                if len(full_output) >= 3:
                    status_code = int(full_output[-3:])
                    response_data['status_code'] = status_code
                    response_data['text'] = full_output[:-3]  # Remove status code from body
                    
                    current_app.logger.info(f"[{request_id}] HTTP Status: {status_code}, Response length: {len(response_data['text'])}")
                    
                    # Try to parse JSON response
                    if response_data['text']:
                        try:
                            response_data['json'] = json.loads(response_data['text'])
                            current_app.logger.info(f"[{request_id}] Successfully parsed JSON response")
                        except json.JSONDecodeError:
                            current_app.logger.warning(f"[{request_id}] Failed to parse JSON response")
                            response_data['json'] = {}
                    else:
                        response_data['json'] = {}
            except (ValueError, IndexError):
                current_app.logger.warning(f"[{request_id}] Could not parse status code from curl output: {result.stdout}")
                response_data['text'] = result.stdout
        
        current_app.logger.info(f"[{request_id}] FINAL RESULT: Status {response_data['status_code']}, Success: {response_data['success']}")
        return response_data
        
    except subprocess.TimeoutExpired:
        return {
            'status_code': 0,
            'text': 'Request timeout',
            'success': False,
            'json': {}
        }
    except Exception as e:
        current_app.logger.error(f"Curl command failed: {str(e)}")
        return {
            'status_code': 0,
            'text': f'Curl execution failed: {str(e)}',
            'success': False,
            'json': {}
        }

# =============================================================================
# LABEL STUDIO API KEY ENDPOINTS
# =============================================================================

@bp.route('/user/label-studio-api-key', methods=['GET'])
@jwt_required()
def get_label_studio_api_key():
    """Return whether the user has set a Label Studio API key (does not return the key itself)"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    return jsonify({'has_key': bool(user.label_studio_api_key)}), 200

@bp.route('/user/label-studio-api-key', methods=['POST'])
@jwt_required()
def set_label_studio_api_key():
    """Set or update the user's Label Studio Legacy Token"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    data = request.json
    api_key = data.get('api_key')
    if not api_key:
        return jsonify({'error': 'Legacy Token is required'}), 400
    user.label_studio_api_key = api_key
    db.session.commit()
    return jsonify({'message': 'Label Studio Legacy Token updated successfully'}), 200

@bp.route('/user/label-studio-api-key', methods=['GET'])
@jwt_required()
def check_label_studio_api_key():
    """Check if user has a Label Studio Legacy Token set"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    has_key = user.label_studio_api_key is not None and len(user.label_studio_api_key.strip()) > 0
    return jsonify({
        'has_key': has_key,
        'message': 'API key status retrieved successfully'
    }), 200

@bp.route('/user/label-studio-api-key', methods=['GET'])
@jwt_required()
def get_label_studio_api_key_status():
    """Check if the user has a Label Studio Legacy Token configured"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    has_key = user.label_studio_api_key is not None and user.label_studio_api_key.strip() != ''
    return jsonify({'has_key': has_key}), 200

@bp.route('/label-studio/test-connection', methods=['POST'])
@jwt_required()
def test_label_studio_connection():
    """Test the Label Studio API connection with the user's Legacy Token using curl"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    if not user.label_studio_api_key:
        return jsonify({'error': 'Label Studio Legacy Token not set. Please set your Legacy Token first.'}), 400
    
    try:
        current_app.logger.info(f"Testing connection with legacy token ending in: ...{user.label_studio_api_key[-4:] if user.label_studio_api_key else 'None'}")
        
        # Use curl to test connection to Label Studio via dynamic gateway discovery
        base_url = get_label_studio_base_url()
        headers = {
            'Authorization': f'Token {user.label_studio_api_key}',
            'Content-Type': 'application/json'
        }
        
        current_app.logger.info(f"Using Label Studio URL: {base_url}")
        
        response = execute_curl_command(
            method='GET',
            url=f'{base_url}/api/projects/',
            headers=headers,
            timeout=10
        )
        
        if response['success'] and response['status_code'] == 200:
            current_app.logger.info("Label Studio connection test successful")
            return jsonify({
                'success': True,
                'message': 'Successfully connected to Label Studio! Your Legacy Token is valid.',
                'projects_count': len(response['json'].get('results', [])) if isinstance(response['json'], dict) else 0
            }), 200
        else:
            error_msg = response['text'] or f"HTTP {response['status_code']}"
            current_app.logger.error(f"Connection test failed. Status: {response['status_code']}, Response: {error_msg}")
            
            if response['status_code'] == 401:
                return jsonify({'error': 'Legacy Token authentication failed. Please verify your Legacy Token is correct.'}), 401
            else:
                return jsonify({'error': f'Connection failed: {error_msg}'}), 400
                
    except Exception as e:
        current_app.logger.error(f"Connection test error: {str(e)}")
        return jsonify({'error': f'Connection test failed: {str(e)}'}), 500

@bp.route('/label-studio/create-project', methods=['POST'])
@jwt_required()
def create_label_studio_project():
    """Create a Label Studio project for a specific product with classes as labels using curl"""
    try:
        user_id = get_jwt_identity()
        user = User.query.get(user_id)
        
        current_app.logger.info(f"CREATE PROJECT REQUEST - User: {user_id}, Request ID: {request.headers.get('X-Request-ID', 'unknown')}")
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
            
        if not user.label_studio_api_key:
            return jsonify({'error': 'Label Studio Legacy Token not configured. Please set your Legacy Token first.'}), 400
            
        data = request.get_json()
        product_id = data.get('product_id')
        
        if not product_id:
            return jsonify({'error': 'product_id is required'}), 400
            
        # Get product
        product = Product.query.get(product_id)
        if not product:
            return jsonify({'error': 'Product not found'}), 404

        # Create a unique project title for deduplication check
        # Ensure the title is at least 3 characters long as required by Label Studio
        base_title = product.name.strip()
        if len(base_title) < 3:
            project_title = f'{base_title}_QC_Project'  # Append suffix to make it longer
        else:
            project_title = base_title
            
        current_app.logger.info(f"Product name: '{product.name}', base_title: '{base_title}', final project_title: '{project_title}', length: {len(project_title)}")
        
        # Check if project with this exact title already exists in Label Studio
        base_url = get_label_studio_base_url()
        headers = {
            'Authorization': f'Token {user.label_studio_api_key}',
            'Content-Type': 'application/json'
        }
        
        # First, get existing projects to check for duplicates
        existing_projects_response = execute_curl_command(
            method='GET',
            url=f'{base_url}/api/projects/',
            headers=headers,
            timeout=30
        )
        
        if existing_projects_response['success']:
            existing_projects = existing_projects_response['json']
            current_app.logger.info(f"Fetched existing projects: {type(existing_projects)}, {existing_projects}")
            
            # Check if existing_projects is a list (expected format)
            if isinstance(existing_projects, list):
                # Check if a project with the same title already exists
                for project in existing_projects:
                    if isinstance(project, dict) and project.get('title') == project_title:
                        current_app.logger.info(f"Project '{project_title}' already exists with ID: {project.get('id')}")
                        return jsonify({
                            'success': True,
                            'project': project,
                            'message': f'Project "{project_title}" already exists',
                            'labels': [cc.class_ for cc in ClassCount.query.filter_by(product_id=product_id).all()],
                            'project_url': f'http://localhost:8081/projects/{project.get("id")}'
                        })
            else:
                current_app.logger.warning(f"Unexpected response format from Label Studio: {existing_projects}")
        else:
            current_app.logger.warning(f"Failed to fetch existing projects: {existing_projects_response}")
            # Continue with project creation if we can't check for duplicates
            
        # Get classes for this product
        class_counts = ClassCount.query.filter_by(product_id=product_id).all()
        labels = [cc.class_ for cc in class_counts]
        
        if not labels:
            return jsonify({'error': 'No classes found for this product. Please add classes first.'}), 400
        
        # Prepare project data for Label Studio
        project_data = {
            'title': project_title,
            'description': f'Quality control project for {project_title}',
            'label_config': '''<View>
  <Image name="image_object" value="$image_url"/>
  <RectangleLabels name="label" toName="image_object">
''' + '\n'.join([f'    <Label value="{label}" background="red"/>' for label in labels]) + '''
  </RectangleLabels>
</View>'''
        }
        
        # Use curl to create the project via dynamic gateway discovery
        base_url = get_label_studio_base_url()
        headers = {
            'Authorization': f'Token {user.label_studio_api_key}',
            'Content-Type': 'application/json'
        }
        
        current_app.logger.info(f"Creating Label Studio project '{project_data['title']}' with {len(labels)} labels at {base_url}")
        current_app.logger.info(f"Project creation request ID: {request.headers.get('X-Request-ID', 'unknown')}")
        current_app.logger.info(f"Project data being sent: {project_data}")
        
        response = execute_curl_command(
            method='POST',
            url=f'{base_url}/api/projects/',
            headers=headers,
            data=project_data,
            timeout=30
        )
        
        if response['success'] and response['status_code'] == 201:
            project_info = response['json']
            current_app.logger.info(f"Project created successfully with ID: {project_info.get('id')}")
            
            # Automatically clean up duplicates after project creation
            cleanup_results = cleanup_label_studio_duplicates_internal(user)
            cleanup_msg = ""
            if cleanup_results['deleted_projects'] > 0 or cleanup_results['deleted_tasks'] > 0:
                cleanup_msg = f" (Auto-cleanup: {cleanup_results['deleted_projects']} duplicate projects and {cleanup_results['deleted_tasks']} duplicate tasks removed)"
            
            return jsonify({
                'success': True,
                'project': project_info,
                'message': f'Project "{project_info.get("title")}" created successfully{cleanup_msg}',
                'labels': labels,
                'project_url': f'http://localhost:8081/projects/{project_info.get("id")}'
            })
        else:
            error_detail = response['text'] or f"HTTP {response['status_code']}"
            current_app.logger.error(f"Failed to create project. Status: {response['status_code']}, Response: {error_detail}")
            
            if response['status_code'] == 401:
                return jsonify({'error': 'Legacy Token authentication failed. Please verify your Legacy Token is correct.'}), 401
            elif response['status_code'] == 403:
                return jsonify({'error': 'Access forbidden. Please check your Legacy Token permissions.'}), 403
            else:
                return jsonify({
                    'error': f'Failed to create Label Studio project: {error_detail}',
                    'status_code': response['status_code']
                }), 400
                
    except Exception as e:
        current_app.logger.error(f"Unexpected error creating project: {str(e)}")
        return jsonify({'error': f'Unexpected error: {str(e)}'}), 500

@bp.route('/label-studio/import-images', methods=['POST'])
@jwt_required()
def import_images_to_label_studio():
    """Import images from MinIO to Label Studio project"""
    try:
        user_id = get_jwt_identity()
        user = User.query.get(user_id)
        
        current_app.logger.info(f"IMPORT IMAGES REQUEST - User: {user_id}, Request ID: {request.headers.get('X-Request-ID', 'unknown')}")
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
            
        if not user.label_studio_api_key:
            return jsonify({'error': 'Label Studio Legacy Token not configured'}), 400
            
        data = request.get_json()
        project_id = data.get('project_id')
        product_id = data.get('product_id')
        
        if not project_id or not product_id:
            return jsonify({'error': 'project_id and product_id are required'}), 400
            
        # Get product info for folder structure
        product = Product.query.get(product_id)
        if not product:
            return jsonify({'error': 'Product not found'}), 404
            
        company = product.company
        if not company:
            return jsonify({'error': 'Company not found for product'}), 404
        
        # Generate folder prefix for MinIO
        def sanitize_name(name):
            return name.replace(' ', '_').replace('/', '_').lower()
        
        company_name = sanitize_name(company.name)
        product_name = sanitize_name(product.name)
        
        folder_prefix = f"{company_name}/{product_name}/"
        
        # Get images from MinIO for this product
        images = minio_service.list_images(prefix=folder_prefix)
        
        if not images:
            return jsonify({'error': 'No images found for this product'}), 404
        
        # Generate presigned URLs for Label Studio access (24 hours expiry)
        tasks_to_import = []
        successful_urls = 0
        
        for image in images:
            try:
                # Generate presigned URL (valid for 24 hours)
                image_url = minio_service.get_presigned_url(image['object_name'], expires=86400)
                
                # Create task data for Label Studio
                task_data = {
                    'image_url': image_url,
                    'image_filename': image['object_name'].split('/')[-1],  # Just the filename
                    'product': product.name,
                    'company': company.name,
                    'file_size': image['size'],
                    'upload_date': image['last_modified'].isoformat() if image['last_modified'] else None
                }
                
                tasks_to_import.append(task_data)
                successful_urls += 1
                
            except Exception as e:
                current_app.logger.error(f"Error generating URL for {image['object_name']}: {str(e)}")
                continue
        
        if not tasks_to_import:
            return jsonify({'error': 'Failed to generate accessible URLs for images'}), 500
        
        # Check for existing tasks in the project to avoid duplicates
        base_url = get_label_studio_base_url()
        headers = {
            'Authorization': f'Token {user.label_studio_api_key}',
            'Content-Type': 'application/json'
        }
        
        # Get existing tasks
        existing_tasks_response = execute_curl_command(
            method='GET',
            url=f'{base_url}/api/projects/{project_id}/tasks/',
            headers=headers,
            timeout=30
        )
        
        existing_filenames = set()
        if existing_tasks_response['success'] and existing_tasks_response['json']:
            for task in existing_tasks_response['json']:
                if isinstance(task, dict) and 'data' in task:
                    filename = task['data'].get('image_filename')
                    if filename:
                        existing_filenames.add(filename)
        
        # Filter out tasks that already exist
        original_count = len(tasks_to_import)
        tasks_to_import = [task for task in tasks_to_import if task['image_filename'] not in existing_filenames]
        
        if not tasks_to_import:
            return jsonify({
                'success': True,
                'message': f'All {original_count} images already exist in the project',
                'imported_count': 0,
                'total_images_found': len(images),
                'project_url': f'http://localhost:8081/projects/{project_id}'
            })
        
        current_app.logger.info(f"Filtered {original_count - len(tasks_to_import)} duplicate tasks, importing {len(tasks_to_import)} new tasks")
        current_app.logger.info(f"Image import request ID: {request.headers.get('X-Request-ID', 'unknown')}")
        
        # Import tasks to Label Studio using curl
        
        # Import tasks in batches (Label Studio can handle multiple tasks at once)
        import_response = execute_curl_command(
            method='POST',
            url=f'{base_url}/api/projects/{project_id}/import',
            headers=headers,
            data=tasks_to_import,
            timeout=60  # Longer timeout for potentially large imports
        )
        
        if import_response['success'] and import_response['status_code'] in [200, 201]:
            current_app.logger.info(f"Successfully imported {len(tasks_to_import)} tasks to project {project_id}")
            
            # Automatically clean up duplicate tasks after import
            cleanup_results = cleanup_label_studio_duplicates_internal(user)
            cleanup_msg = ""
            if cleanup_results['deleted_tasks'] > 0:
                cleanup_msg = f" (Auto-cleanup: {cleanup_results['deleted_tasks']} duplicate tasks removed)"
            
            return jsonify({
                'success': True,
                'message': f'Successfully imported {len(tasks_to_import)} images to Label Studio project{cleanup_msg}',
                'imported_count': len(tasks_to_import),
                'total_images_found': len(images),
                'project_url': f'http://localhost:8081/projects/{project_id}'
            })
        else:
            error_detail = import_response['text'] or f"HTTP {import_response['status_code']}"
            current_app.logger.error(f"Failed to import tasks. Status: {import_response['status_code']}, Response: {error_detail}")
            
            return jsonify({
                'error': f'Failed to import images to Label Studio: {error_detail}',
                'status_code': import_response['status_code']
            }), 400
            
    except Exception as e:
        current_app.logger.error(f"Unexpected error importing images: {str(e)}")
        return jsonify({'error': f'Unexpected error: {str(e)}'}), 500

@bp.route('/label-studio/existing-projects', methods=['GET'])
@jwt_required()
def get_existing_label_studio_projects():
    """Get existing Label Studio projects and match them with products"""
    try:
        user_id = get_jwt_identity()
        user = User.query.get(user_id)
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
            
        if not user.label_studio_api_key:
            return jsonify({'error': 'Label Studio Legacy Token not configured'}), 400
        
        # Get all existing projects from Label Studio
        base_url = get_label_studio_base_url()
        headers = {
            'Authorization': f'Token {user.label_studio_api_key}',
            'Content-Type': 'application/json'
        }
        
        existing_projects_response = execute_curl_command(
            method='GET',
            url=f'{base_url}/api/projects/',
            headers=headers,
            timeout=30
        )
        
        existing_projects = []
        if existing_projects_response['success']:
            projects_data = existing_projects_response['json']
            if isinstance(projects_data, dict) and 'results' in projects_data:
                existing_projects = projects_data['results']
            elif isinstance(projects_data, list):
                existing_projects = projects_data
        
        # Get all products from our system (no more steps)
        products = Product.query.all()
        products_with_projects = []
        
        for product in products:
            company = product.company
            if not company:
                continue
                
            # Get classes for this product
            class_counts = ClassCount.query.filter_by(product_id=product.id).all()
            classes = [cc.class_ for cc in class_counts]
            has_classes = len(classes) > 0
            
            # Expected project title format - use same logic as project creation
            base_title = product.name.strip()
            if len(base_title) < 3:
                expected_title = f'{base_title}_QC_Project'  # Append suffix to make it longer
            else:
                expected_title = base_title
            
            # Find matching project in Label Studio
            matching_project = None
            for project in existing_projects:
                if isinstance(project, dict) and project.get('title') == expected_title:
                    matching_project = project
                    break
            
            product_info = {
                'product_id': product.id,
                'product_name': product.name,
                'company_name': company.name,
                'project_name': expected_title,
                'classes': classes,
                'has_classes': has_classes,
                'has_existing_project': matching_project is not None,
                'project_id': matching_project.get('id') if matching_project else None,
                'project_url': f'http://localhost:8081/projects/{matching_project.get("id")}' if matching_project else None,
                'task_count': matching_project.get('task_number', 0) if matching_project else 0,
                'annotated_count': matching_project.get('num_tasks_with_annotations', 0) if matching_project else 0
            }
            
            products_with_projects.append(product_info)
        
        return jsonify({
            'success': True,
            'products': products_with_projects,
            'total_existing_projects': len(existing_projects)
        })
        
    except Exception as e:
        current_app.logger.error(f"Unexpected error getting existing projects: {str(e)}")
        return jsonify({'error': f'Unexpected error: {str(e)}'}), 500

@bp.route('/label-studio/products', methods=['GET'])
@jwt_required()
def get_products_for_labeling():
    """Get all products with their associated classes for labeling project creation"""
    try:
        # Get all products (system is shared across users)
        products = Product.query.all()
        
        result = []
        for product in products:
            # Get all class counts for this product
            class_counts = ClassCount.query.filter_by(product_id=product.id).all()
            classes = [cc.class_ for cc in class_counts]  # Using class_ not class_name
            
            result.append({
                'product_id': product.id,
                'product_name': product.name,
                'classes': classes,
                'project_name': product.name,
                'has_classes': len(classes) > 0
            })
        
        return jsonify({'products': result}), 200
        
    except Exception as e:
        current_app.logger.error(f"Error fetching products: {str(e)}")
        return jsonify({'error': f'Failed to fetch products: {str(e)}'}), 500

@bp.route('/label-studio/products-with-companies', methods=['GET'])
@jwt_required()
def get_products_with_companies():
    """Get all products with their companies for Label Studio project creation"""
    try:
        products = Product.query.join(Company).all()
        
        result = []
        for product in products:
            # Get classes for this product  
            class_counts = ClassCount.query.filter_by(product_id=product.id).all()
            classes = [cc.class_ for cc in class_counts]
            
            result.append({
                'id': product.id,
                'name': product.name,
                'company_name': product.company.name,
                'classes': classes,
                'class_count': len(classes)
            })
        
        return jsonify({'products': result}), 200
        
    except Exception as e:
        current_app.logger.error(f"Error fetching products: {str(e)}")
        return jsonify({'error': f'Failed to fetch products: {str(e)}'}), 500

# =============================================================================
# HEALTH CHECK AND INFO ENDPOINTS
# =============================================================================

@bp.route('/health', methods=['GET'])
def health():
    """Health check endpoint for monitoring system status"""
    return jsonify({'status': 'healthy', 'message': 'API is running'}), 200

@bp.route('/init-db', methods=['POST'])
def init_database():
    """Initialize database tables - for development/setup purposes"""
    try:
        db.create_all()
        return jsonify({
            'status': 'success',
            'message': 'Database tables created successfully'
        }), 200
    except Exception as e:
        current_app.logger.error(f"Error initializing database: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'Failed to initialize database: {str(e)}'
        }), 500

@bp.route('/', methods=['GET'])
def root():
    """Root endpoint providing API information and available endpoints"""
    return jsonify({
        'api': 'QC Management System API',
        'version': '1.0',
        'documentation': 'Access API documentation at /api/docs',
        'endpoints': {
            'auth': ['/register', '/login'],
            'companies': ['/companies', '/companies/<id>'],
            'products': ['/products', '/products/<id>'],
            'classcounts': ['/classcounts', '/classcounts/<id>'],
            'images': ['/images', '/images/<id>', '/images/<filename>'],
            'health': ['/health']
        }
    }), 200

@bp.route('/protected', methods=['GET'])
@jwt_required()
def protected():
    """Protected endpoint for testing JWT authentication"""
    current_user_id = get_jwt_identity()
    return jsonify({'message': f'Hello user {current_user_id}! This is a protected endpoint.', 'user_id': current_user_id}), 200

# =============================================================================
# AUTHENTICATION ENDPOINTS
# =============================================================================

@bp.route('/register', methods=['POST'])
def register():
    """Register a new user account"""
    data = request.json
    
    # Check if username already exists
    if User.query.filter_by(username=data['username']).first():
        return jsonify({'message': 'Username already exists'}), 400
    
    # Check if email already exists
    if User.query.filter_by(email=data['email']).first():
        return jsonify({'message': 'Email already exists'}), 400
    
    # Create new user
    user = User(username=data['username'], email=data['email'])
    user.set_password(data['password'])
    db.session.add(user)
    db.session.commit()
    
    return jsonify({'message': 'User created successfully'}), 201

@bp.route('/login', methods=['POST'])
def login():
    """Authenticate user and return JWT token"""
    data = request.json
    user = User.query.filter_by(username=data['username']).first()
    
    if user and user.check_password(data['password']):
        access_token = create_access_token(identity=str(user.id))
        return jsonify({'access_token': access_token, 'user_id': user.id, 'username': user.username}), 200
    
    return jsonify({'message': 'Invalid credentials'}), 401

# =============================================================================
# IMAGE MANAGEMENT ENDPOINTS
# =============================================================================

@bp.route('/images', methods=['POST'])
@jwt_required()
def upload_image():
    """Upload an image file and associate it with a product"""
    if 'image' not in request.files:
        return jsonify({'error': 'No image file provided'}), 400
    
    image = request.files['image']
    product_id = request.form.get('product_id')

    if not product_id:
        return jsonify({'error': 'Product ID is required'}), 400

    # Validate product existence
    product = Product.query.get(product_id)
    if not product:
        return jsonify({'error': 'Invalid product ID'}), 400
    
    company = product.company
    if not company:
        return jsonify({'error': 'Invalid company for product'}), 400

    try:
        # Upload to MinIO with meaningful names (using product name as step)
        object_key, metadata = minio_service.upload_image(
            image, 
            company.name, 
            product.name, 
            product.name  # Use product name as the folder level
        )
        
        # Store metadata in database
        img = CapturedImage(
            filename=image.filename,
            product_id=product_id,
            storage_url=metadata['storage_url'],
            storage_bucket=metadata['storage_bucket'],
            storage_key=metadata['storage_key'],
            file_size=metadata['file_size'],
            mime_type=metadata['mime_type'],
            checksum=metadata['checksum'],
            storage_provider=metadata['storage_provider']
        )
        db.session.add(img)
        db.session.commit()

        response_data = {
            'id': img.id,
            'filename': img.filename,
            'product_id': img.product_id,
            'storage_url': img.storage_url,
            'file_size': img.file_size,
            'timestamp': img.timestamp.isoformat() if img.timestamp else None
        }
        
        response = jsonify(response_data)
        response.status_code = 201
        response.headers['Content-Type'] = 'application/json'
        return response
        
    except Exception as e:
        return jsonify({'error': f'Failed to upload image: {str(e)}'}), 500

@bp.route('/images', methods=['GET'])
@jwt_required()
def list_images():
    """Get a list of all captured images with metadata"""
    images = CapturedImage.query.all()
    return jsonify([
        {
            'id': img.id,
            'filename': img.filename,
            'product_id': img.product_id,
            'timestamp': img.timestamp.isoformat() if img.timestamp else None,
            'access_url': img.get_access_url(),  # Get presigned URL
            'file_size': img.file_size,
            'mime_type': img.mime_type,
            'storage_provider': img.storage_provider
        } for img in images
    ])

@bp.route('/images/<int:image_id>', methods=['DELETE'])
@jwt_required()
def delete_image(image_id):
    """Delete an image by ID from both MinIO storage and database"""
    img = CapturedImage.query.get_or_404(image_id)
    
    try:
        # Remove file from MinIO if it exists
        if img.storage_key and img.storage_provider == 'minio':
            minio_service.delete_image(img.storage_key)
        
        # Remove from database
        db.session.delete(img)
        db.session.commit()
        return jsonify({'message': 'Image deleted successfully'}), 200
        
    except Exception as e:
        # If MinIO deletion fails, still try to remove from database
        db.session.delete(img)
        db.session.commit()
        return jsonify({'message': 'Image deleted from database, storage cleanup may have failed'}), 200

@bp.route('/images/<int:image_id>/url', methods=['GET'])
@jwt_required()
def get_image_url(image_id):
    """Get a presigned URL for accessing an image"""
    img = CapturedImage.query.get_or_404(image_id)
    
    try:
        # Get presigned URL (valid for 1 hour by default)
        expires = request.args.get('expires', 3600, type=int)
        access_url = img.get_access_url(expires)
        
        return jsonify({
            'id': img.id,
            'filename': img.filename,
            'access_url': access_url,
            'expires_in': expires
        })
    except Exception as e:
        return jsonify({'error': f'Failed to generate access URL: {str(e)}'}), 500

@bp.route('/serve-image/<path:object_key>', methods=['GET'])
def serve_image(object_key):
    """Serve images directly from MinIO through the backend"""
    try:
        # Get the object from MinIO
        response = minio_service.client.get_object(minio_service.bucket_name, object_key)
        
        # Read the data
        data = response.read()
        
        # Determine content type based on file extension
        content_type = 'image/jpeg'  # default
        if object_key.lower().endswith('.png'):
            content_type = 'image/png'
        elif object_key.lower().endswith('.gif'):
            content_type = 'image/gif'
        elif object_key.lower().endswith('.webp'):
            content_type = 'image/webp'
        
        return Response(data, mimetype=content_type)
        
    except Exception as e:
        return jsonify({'error': f'Failed to serve image: {str(e)}'}), 404

@bp.route('/images/<path:filename>', methods=['GET'])
def get_image(filename):
    """Legacy endpoint - redirect to use image ID instead"""
    return jsonify({
        'error': 'This endpoint is deprecated. Use /images/<id>/url instead',
        'message': 'Images are now stored in object storage. Use the image ID to get access URLs.'
    }), 410  # Gone status

@bp.route('/storage/stats', methods=['GET'])
@jwt_required()
def get_storage_stats():
    """Get storage statistics from MinIO"""
    try:
        stats = minio_service.get_bucket_stats()
        return jsonify(stats)
    except Exception as e:
        return jsonify({'error': f'Failed to get storage stats: {str(e)}'}), 500

# =============================================================================
# IMAGE DOWNLOAD ENDPOINTS
# =============================================================================

@bp.route('/download/images/all', methods=['GET'])
@jwt_required()
def download_all_images():
    """Download all images as a ZIP file"""
    import io
    import zipfile
    from datetime import datetime
    
    try:
        # Get all images
        images = CapturedImage.query.all()
        
        if not images:
            return jsonify({'error': 'No images found'}), 404
        
        # Create ZIP file in memory
        zip_buffer = io.BytesIO()
        
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            for idx, img in enumerate(images):
                try:
                    # Get the image data from MinIO
                    if img.storage_key and img.storage_provider == 'minio':
                        response = minio_service.client.get_object(minio_service.bucket_name, img.storage_key)
                        image_data = response.read()
                        
                        # Create a meaningful filename with folder structure
                        company_name = img.product.company.name if img.product and img.product.company else 'Unknown_Company'
                        product_name = img.product.name if img.product else 'Unknown_Product'
                        step_name = img.step.name if img.step else 'Unknown_Step'
                        
                        # Clean names for file system
                        company_name = "".join(c for c in company_name if c.isalnum() or c in (' ', '-', '_')).rstrip()
                        product_name = "".join(c for c in product_name if c.isalnum() or c in (' ', '-', '_')).rstrip()
                        step_name = "".join(c for c in step_name if c.isalnum() or c in (' ', '-', '_')).rstrip()
                        
                        # Create unique filename to avoid overwrites
                        base_name, ext = img.filename.rsplit('.', 1) if '.' in img.filename else (img.filename, 'jpg')
                        unique_filename = f"{idx+1:03d}_{img.id}_{base_name}.{ext}"
                        
                        zip_path = f"{company_name}/{product_name}/{step_name}/{unique_filename}"
                        zip_file.writestr(zip_path, image_data)
                        
                except Exception as e:
                    current_app.logger.warning(f"Failed to add image {img.filename} to ZIP: {str(e)}")
                    continue
        
        zip_buffer.seek(0)
        
        # Generate filename with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"all_images_{timestamp}.zip"
        
        return Response(
            zip_buffer.getvalue(),
            mimetype='application/zip',
            headers={'Content-Disposition': f'attachment; filename={filename}'}
        )
        
    except Exception as e:
        current_app.logger.error(f"Error creating ZIP file: {str(e)}")
        return jsonify({'error': f'Failed to create ZIP file: {str(e)}'}), 500

# @bp.route('/download/images/step/<int:step_id>/product/<int:product_id>', methods=['GET'])
# @jwt_required()
# def download_step_product_images(step_id, product_id):
#     """Download images for a specific step and product combination as a ZIP file"""
#     # This function is disabled as we removed the step model
#     return jsonify({'error': 'Step-based downloads are no longer supported'}), 400
        
#         # Get images for this specific step and product
#         images = CapturedImage.query.filter_by(step_id=step_id, product_id=product_id).all()
#         
#         if not images:
#             return jsonify({'error': 'No images found for this step and product combination'}), 404
#         
#         # Create ZIP file in memory
#         zip_buffer = io.BytesIO()
#         
#         with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
#             for idx, img in enumerate(images):
#                 try:
#                     # Get the image data from MinIO
#                     if img.storage_key and img.storage_provider == 'minio':
#                         response = minio_service.client.get_object(minio_service.bucket_name, img.storage_key)
#                         image_data = response.read()
#                         
#                         # Create unique filename to avoid overwrites
#                         # Add image ID and index to ensure uniqueness
#                         base_name, ext = img.filename.rsplit('.', 1) if '.' in img.filename else (img.filename, 'jpg')
#                         unique_filename = f"{idx+1:03d}_{img.id}_{base_name}.{ext}"
#                         
#                         zip_file.writestr(unique_filename, image_data)
#                         
#                 except Exception as e:
#                     current_app.logger.warning(f"Failed to add image {img.filename} to ZIP: {str(e)}")
#                     continue
#         
#         zip_buffer.seek(0)
#         
#         # Generate filename with meaningful names and timestamp
#         company_name = product.company.name if product.company else 'Unknown_Company'
#         company_name = "".join(c for c in company_name if c.isalnum() or c in (' ', '-', '_')).rstrip()
#         product_name = "".join(c for c in product.name if c.isalnum() or c in (' ', '-', '_')).rstrip()
#         step_name = "".join(c for c in step.name if c.isalnum() or c in (' ', '-', '_')).rstrip()
#         timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
#         
#         filename = f"{company_name}_{product_name}_{step_name}_{timestamp}.zip"
#         
#         return Response(
#             zip_buffer.getvalue(),
#             mimetype='application/zip',
#             headers={'Content-Disposition': f'attachment; filename={filename}'}
#         )
#         
#     except Exception as e:
#         current_app.logger.error(f"Error creating ZIP file for step and product: {str(e)}")
#         return jsonify({'error': f'Failed to create ZIP file: {str(e)}'}), 500

# =============================================================================
# COMPANY MANAGEMENT ENDPOINTS
# =============================================================================

@bp.route('/companies', methods=['POST'])
@jwt_required()
def create_company():
    """Create a new company"""
    data = request.json
    
    # Check if company name already exists
    existing_company = Company.query.filter_by(name=data['name']).first()
    if existing_company:
        return jsonify({'message': 'Company name already exists'}), 400
    
    company = Company(
        name=data['name'],
        description=data.get('description', None)
    )
    db.session.add(company)
    db.session.commit()
    return jsonify({
        'id': company.id, 
        'name': company.name,
        'description': company.description
    }), 201

@bp.route('/companies', methods=['GET'])
@jwt_required()
def get_companies():
    """Get a list of all companies"""
    companies = Company.query.all()
    return jsonify([{
        'id': c.id, 
        'name': c.name, 
        'description': c.description
    } for c in companies])

@bp.route('/companies/<int:id>', methods=['PUT'])
@jwt_required()
def update_company(id):
    """Update a company by ID"""
    data = request.json
    company = Company.query.get_or_404(id)
    company.name = data.get('name', company.name)
    db.session.commit()
    return jsonify({'id': company.id, 'name': company.name})

@bp.route('/companies/<int:id>', methods=['DELETE'])
@jwt_required()
def delete_company(id):
    """Delete a company by ID"""
    company = Company.query.get_or_404(id)
    db.session.delete(company)
    db.session.commit()
    return '', 204

@bp.route('/companies/<int:company_id>/images', methods=['GET'])
@jwt_required()
def get_images_for_company(company_id):
    """Get all images associated with a specific company"""
    images = CapturedImage.query.join(Product).filter(Product.company_id == company_id).all()
    return jsonify([
        {
            'id': img.id,
            'filename': img.filename,
            'product_id': img.product_id,
            'timestamp': img.timestamp.isoformat() if img.timestamp else None,
            'access_url': img.get_access_url(),  # Get presigned URL
            'file_size': img.file_size,
            'mime_type': img.mime_type,
            'storage_provider': img.storage_provider
        } for img in images
    ])

# =============================================================================
# PRODUCT MANAGEMENT ENDPOINTS
# =============================================================================

@bp.route('/products', methods=['POST'])
@jwt_required()
def create_product():
    """Create a new product for a company"""
    data = request.json
    product = Product(name=data['name'], company_id=data['company_id'], image_url=data.get('image_url'))
    db.session.add(product)
    db.session.commit()
    return jsonify({'id': product.id, 'name': product.name, 'company_id': product.company_id, 'image_url': product.image_url}), 201

@bp.route('/products', methods=['GET'])
@jwt_required()
def get_products():
    """Get a list of all products"""
    products = Product.query.all()
    return jsonify([{'id': p.id, 'name': p.name, 'company_id': p.company_id, 'image_url': p.image_url} for p in products])

@bp.route('/products/<int:id>', methods=['PUT'])
@jwt_required()
def update_product(id):
    """Update a product by ID"""
    data = request.json
    product = Product.query.get_or_404(id)
    product.name = data.get('name', product.name)
    product.company_id = data.get('company_id', product.company_id)
    product.image_url = data.get('image_url', product.image_url)
    db.session.commit()
    return jsonify({'id': product.id, 'name': product.name, 'company_id': product.company_id, 'image_url': product.image_url})

@bp.route('/products/<int:id>', methods=['DELETE'])
@jwt_required()
def delete_product(id):
    """Delete a product by ID"""
    product = Product.query.get_or_404(id)
    db.session.delete(product)
    db.session.commit()
    return '', 204

# =============================================================================
# STEP MANAGEMENT ENDPOINTS
# =============================================================================

# STEP ENDPOINTS COMMENTED OUT - NO LONGER NEEDED WITH NEW STRUCTURE
# @bp.route('/steps', methods=['POST'])
# @jwt_required()
# def create_step():
#     """Create a new step for a product"""
#     data = request.json
#     step = Step(name=data['name'], product_id=data['product_id'], step_number=data['step_number'])
#     db.session.add(step)
#     db.session.commit()
#     return jsonify({'id': step.id, 'name': step.name, 'product_id': step.product_id, 'step_number': step.step_number}), 201

# @bp.route('/steps', methods=['GET'])
# @jwt_required()
# def get_steps():
#     """Get a list of all steps"""
#     steps = Step.query.all()
#     return jsonify([{'id': s.id, 'name': s.name, 'product_id': s.product_id, 'step_number': s.step_number} for s in steps])

# @bp.route('/steps/<int:id>', methods=['PUT'])
# @jwt_required()
# def update_step(id):
#     """Update a step by ID"""
#     data = request.json
#     step = Step.query.get_or_404(id)
#     step.name = data.get('name', step.name)
#     step.product_id = data.get('product_id', step.product_id)
#     step.step_number = data.get('step_number', step.step_number)
#     db.session.commit()
#     return jsonify({'id': step.id, 'name': step.name, 'product_id': step.product_id, 'step_number': step.step_number})

# @bp.route('/steps/<int:id>', methods=['DELETE'])
# @jwt_required()
# def delete_step(id):
#     """Delete a step by ID and all associated images from database and MinIO storage"""
#     step = Step.query.get_or_404(id)
#     
#     try:
#         # Get all images associated with this step before deletion
#         associated_images = CapturedImage.query.filter_by(step_id=id).all()
#         
#         # Delete each image from MinIO storage first
#         for img in associated_images:
#             if img.storage_key and img.storage_provider == 'minio':
#                 try:
#                     minio_service.delete_image(img.storage_key)
#                     current_app.logger.info(f"Deleted image from MinIO: {img.storage_key}")
#                 except Exception as e:
#                     current_app.logger.warning(f"Failed to delete image from MinIO: {img.storage_key}, error: {e}")
#                     # Continue with database deletion even if MinIO deletion fails
#         
#         # Delete the step (this will cascade delete associated images from database due to FK constraints)
#         db.session.delete(step)
#         db.session.commit()
#         
#         # Additional cleanup: remove any orphaned images that might exist
#         try:
#             orphaned_images = db.session.query(CapturedImage).outerjoin(
#                 Step, CapturedImage.step_id == Step.id
#             ).filter(Step.id.is_(None)).all()
#             
#             for img in orphaned_images:
#                 if img.storage_key and img.storage_provider == 'minio':
#                     try:
#                         minio_service.delete_image(img.storage_key)
#                     except:
#                         pass  # Ignore MinIO errors during cleanup
#                 db.session.delete(img)
#             
#             if orphaned_images:
#                 db.session.commit()
#                 current_app.logger.info(f"Cleaned up {len(orphaned_images)} orphaned images")
#                 
#         except Exception as e:
#             current_app.logger.warning(f"Orphaned image cleanup failed: {e}")
#             # Don't fail the entire operation for cleanup issues
#         
#         current_app.logger.info(f"Successfully deleted step {id} and {len(associated_images)} associated images")
#         return '', 204
#         
#     except Exception as e:
#         db.session.rollback()
#         current_app.logger.error(f"Error deleting step {id}: {str(e)}")
#         return jsonify({'error': f'Failed to delete step: {str(e)}'}), 500

# =============================================================================
# CLASS COUNT MANAGEMENT ENDPOINTS
# =============================================================================

@bp.route('/classcounts', methods=['POST'])
@jwt_required()
def create_classcount():
    """Create a new class for a product"""
    data = request.json
    cc = ClassCount(class_=data['class'], product_id=data['product_id'])
    db.session.add(cc)
    db.session.commit()
    return jsonify({'id': cc.id, 'class': cc.class_, 'product_id': cc.product_id}), 201

@bp.route('/classcounts', methods=['GET'])
@jwt_required()
def get_classcounts():
    """Get a list of all classes"""
    classcounts = ClassCount.query.all()
    return jsonify([{'id': cc.id, 'class': cc.class_, 'product_id': cc.product_id} for cc in classcounts])

@bp.route('/classcounts/<int:id>', methods=['PUT'])
@jwt_required()
def update_classcount(id):
    """Update a class by ID"""
    data = request.json
    cc = ClassCount.query.get_or_404(id)
    cc.class_ = data.get('class', cc.class_)
    cc.product_id = data.get('product_id', cc.product_id)
    db.session.commit()
    return jsonify({'id': cc.id, 'class': cc.class_, 'product_id': cc.product_id})

@bp.route('/classcounts/<int:id>', methods=['DELETE'])
@jwt_required()
def delete_classcount(id):
    """Delete a class by ID"""
    cc = ClassCount.query.get_or_404(id)
    db.session.delete(cc)
    db.session.commit()
    return '', 204


# =============================================================================
# DATABASE CLEANUP ENDPOINTS
# =============================================================================

@bp.route('/cleanup/orphaned-images', methods=['POST'])
@jwt_required()
def cleanup_orphaned_images():
    """Remove orphaned image records that reference non-existent products"""
    try:
        # Find images with non-existent products (no longer checking steps since we removed that model)
        orphaned_product_images = db.session.query(CapturedImage).outerjoin(
            Product, CapturedImage.product_id == Product.id
        ).filter(Product.id.is_(None)).all()
        
        all_orphaned = orphaned_product_images
        
        deleted_count = 0
        for img in all_orphaned:
            try:
                # Delete from MinIO storage if it exists
                if img.storage_key and img.storage_provider == 'minio':
                    minio_service.delete_image(img.storage_key)
                
                # Delete from database
                db.session.delete(img)
                deleted_count += 1
                
            except Exception as e:
                current_app.logger.warning(f"Failed to delete orphaned image {img.id}: {e}")
                continue
        
        db.session.commit()
        
        return jsonify({
            'status': 'success',
            'message': f'Cleaned up {deleted_count} orphaned images',
            'deleted_count': deleted_count
        }), 200
        
    except Exception as e:
        db.session.rollback()
        current_app.logger.error(f"Error during orphaned images cleanup: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'Failed to cleanup orphaned images: {str(e)}'
        }), 500

@bp.route('/label-studio/cleanup-duplicates', methods=['POST'])
@jwt_required()
def cleanup_label_studio_duplicates():
    """Clean up duplicate projects and tasks in Label Studio"""
    try:
        user_id = get_jwt_identity()
        user = User.query.get(user_id)
        
        current_app.logger.info(f"CLEANUP DUPLICATES REQUEST - User: {user_id}")
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
            
        if not user.label_studio_api_key:
            return jsonify({'error': 'Label Studio Legacy Token not configured'}), 400
        
        base_url = get_label_studio_base_url()
        headers = {
            'Authorization': f'Token {user.label_studio_api_key}',
            'Content-Type': 'application/json'
        }
        
        # Get all projects
        projects_response = execute_curl_command(
            method='GET',
            url=f'{base_url}/api/projects/',
            headers=headers,
            timeout=30
        )
        
        if not projects_response['success']:
            return jsonify({'error': 'Failed to fetch projects from Label Studio'}), 500
        
        projects = projects_response['json']
        if not isinstance(projects, list):
            return jsonify({'error': 'Invalid response format from Label Studio'}), 500
        
        # Group projects by title to find duplicates
        project_groups = {}
        for project in projects:
            if isinstance(project, dict) and 'title' in project:
                title = project['title']
                if title not in project_groups:
                    project_groups[title] = []
                project_groups[title].append(project)
        
        deleted_projects = 0
        deleted_tasks = 0
        cleanup_details = []
        
        # Process each group of projects with the same title
        for title, project_list in project_groups.items():
            if len(project_list) > 1:
                # Keep the first project, delete the rest
                projects_to_keep = project_list[:1]
                projects_to_delete = project_list[1:]
                
                current_app.logger.info(f"Found {len(project_list)} projects with title '{title}', keeping 1, deleting {len(projects_to_delete)}")
                
                for project_to_delete in projects_to_delete:
                    project_id = project_to_delete.get('id')
                    if project_id:
                        # Delete the duplicate project
                        delete_response = execute_curl_command(
                            method='DELETE',
                            url=f'{base_url}/api/projects/{project_id}/',
                            headers=headers,
                            timeout=30
                        )
                        
                        if delete_response['success']:
                            deleted_projects += 1
                            current_app.logger.info(f"Deleted duplicate project '{title}' with ID {project_id}")
                            cleanup_details.append(f"Deleted duplicate project '{title}' (ID: {project_id})")
                        else:
                            current_app.logger.error(f"Failed to delete project {project_id}: {delete_response}")
                
                # For the remaining project, clean up duplicate tasks
                if projects_to_keep:
                    remaining_project = projects_to_keep[0]
                    project_id = remaining_project.get('id')
                    
                    if project_id:
                        # Get tasks for the remaining project
                        tasks_response = execute_curl_command(
                            method='GET',
                            url=f'{base_url}/api/projects/{project_id}/tasks/',
                            headers=headers,
                            timeout=30
                        )
                        
                        if tasks_response['success'] and tasks_response['json']:
                            tasks = tasks_response['json']
                            
                            # Group tasks by image filename to find duplicates
                            task_groups = {}
                            for task in tasks:
                                if isinstance(task, dict) and 'data' in task:
                                    filename = task['data'].get('image_filename')
                                    if filename:
                                        if filename not in task_groups:
                                            task_groups[filename] = []
                                        task_groups[filename].append(task)
                            
                            # Delete duplicate tasks
                            for filename, task_list in task_groups.items():
                                if len(task_list) > 1:
                                    tasks_to_delete = task_list[1:]  # Keep first, delete rest
                                    
                                    for task_to_delete in tasks_to_delete:
                                        task_id = task_to_delete.get('id')
                                        if task_id:
                                            delete_task_response = execute_curl_command(
                                                method='DELETE',
                                                url=f'{base_url}/api/tasks/{task_id}/',
                                                headers=headers,
                                                timeout=30
                                            )
                                            
                                            if delete_task_response['success']:
                                                deleted_tasks += 1
                                                current_app.logger.info(f"Deleted duplicate task for '{filename}' with ID {task_id}")
                                                cleanup_details.append(f"Deleted duplicate task for '{filename}' (ID: {task_id})")
        
        return jsonify({
            'success': True,
            'message': f'Cleanup completed: {deleted_projects} duplicate projects and {deleted_tasks} duplicate tasks deleted',
            'deleted_projects': deleted_projects,
            'deleted_tasks': deleted_tasks,
            'details': cleanup_details
        })
        
    except Exception as e:
        current_app.logger.error(f"Error during Label Studio cleanup: {str(e)}")
        return jsonify({
            'error': f'Cleanup failed: {str(e)}'
        }), 500
