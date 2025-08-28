"""
MinIO Object Storage Service
Handles all interactions with MinIO for storing and retrieving captured images
"""

import os
import uuid
import hashlib
from datetime import datetime, timedelta
from typing import Optional, Tuple
from minio import Minio
from minio.error import S3Error
from werkzeug.datastructures import FileStorage
import logging

logger = logging.getLogger(__name__)

class MinIOService:
    def __init__(self):
        """Initialize MinIO client with configuration from environment variables"""
        self.endpoint = os.getenv('MINIO_ENDPOINT', 'qc-minio:9000')
        self.external_endpoint = os.getenv('MINIO_EXTERNAL_ENDPOINT', 'localhost:9000')
        self.access_key = os.getenv('MINIO_ACCESS_KEY', 'minio')
        self.secret_key = os.getenv('MINIO_SECRET_KEY', 'minio123')
        self.bucket_name = os.getenv('MINIO_BUCKET_NAME', 'quality-control-images')
        self.secure = os.getenv('MINIO_SECURE', 'False').lower() == 'true'
        
        # Initialize MinIO client for internal operations (uploads, deletes, etc.)
        self.client = Minio(
            self.endpoint,
            access_key=self.access_key,
            secret_key=self.secret_key,
            secure=False  # Set to True if using HTTPS
        )
        
        # For Label Studio integration, we need to use an endpoint accessible from within Docker network
        # We'll use the Docker gateway IP to make MinIO accessible to Label Studio
        self.label_studio_endpoint = self._get_minio_endpoint_for_label_studio()
        
        # Initialize separate MinIO client for presigned URL generation with gateway endpoint
        self.external_client = Minio(
            self.label_studio_endpoint,
            access_key=self.access_key,
            secret_key=self.secret_key,
            secure=False  # Set to True if using HTTPS
        )
        
        # Ensure bucket exists
        self._ensure_bucket_exists()
    
    def _get_minio_endpoint_for_label_studio(self):
        """Get MinIO endpoint accessible by Label Studio container"""
        try:
            # Method 1: Try to get gateway from route table
            import subprocess
            import socket
            
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
                                    logger.info(f"Using gateway IP for MinIO access: {gateway_ip}:9000")
                                    return f"{gateway_ip}:9000"
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
                            logger.info(f"Using gateway IP from /proc/net/route: {gateway_ip}:9000")
                            return f"{gateway_ip}:9000"
            except (FileNotFoundError, ValueError):
                pass
            
            # Fallback: Use localhost (might work in some setups)
            logger.warning("Could not determine gateway IP, falling back to localhost:9000")
            return "localhost:9000"
            
        except Exception as e:
            logger.error(f"Error determining MinIO endpoint for Label Studio: {str(e)}")
            return "localhost:9000"
    
    
    def _ensure_bucket_exists(self):
        """Create bucket if it doesn't exist"""
        try:
            if not self.client.bucket_exists(self.bucket_name):
                self.client.make_bucket(self.bucket_name)
                logger.info(f"Created bucket: {self.bucket_name}")
        except S3Error as e:
            logger.error(f"Error creating bucket: {e}")
            raise
    
    def _generate_object_key(self, company_name: str, product_name: str, step_name: str, filename: str) -> str:
        """Generate a structured object key using meaningful names"""
        # Sanitize names for filesystem safety
        def sanitize_name(name: str) -> str:
            """Remove or replace characters that aren't safe for object keys"""
            import re
            # Replace spaces with underscores and remove special characters
            sanitized = re.sub(r'[^a-zA-Z0-9_-]', '_', str(name))
            # Remove multiple consecutive underscores
            sanitized = re.sub(r'_+', '_', sanitized)
            # Remove leading/trailing underscores
            return sanitized.strip('_').lower()
        
        company = sanitize_name(company_name)
        product = sanitize_name(product_name)
        step = sanitize_name(step_name)
        
        # Keep original filename but add unique prefix to avoid conflicts
        unique_id = str(uuid.uuid4())[:8]
        file_extension = filename.split('.')[-1] if '.' in filename else 'jpg'
        safe_filename = f"{unique_id}_{filename}" if filename else f"{unique_id}.{file_extension}"
        
        return f"{company}/{product}/{step}/{safe_filename}"
    
    def _calculate_checksum(self, file_data: bytes) -> str:
        """Calculate MD5 checksum for file integrity"""
        return hashlib.md5(file_data).hexdigest()
    
    def upload_image(self, 
                    file: FileStorage, 
                    company_name: str,
                    product_name: str, 
                    step_name: str) -> Tuple[str, dict]:
        """
        Upload an image to MinIO using meaningful folder structure
        
        Args:
            file: The uploaded file object
            company_name: Name of the company
            product_name: Name of the product
            step_name: Name of the step
            
        Returns:
            Tuple containing the object key and metadata dictionary
        """
        try:
            # Read file data
            file_data = file.read()
            file.seek(0)  # Reset file pointer
            
            # Generate object key with meaningful names
            object_key = self._generate_object_key(company_name, product_name, step_name, file.filename)
            
            # Calculate metadata
            file_size = len(file_data)
            checksum = self._calculate_checksum(file_data)
            mime_type = file.content_type or 'image/jpeg'
            
            # Upload to MinIO
            self.client.put_object(
                bucket_name=self.bucket_name,
                object_name=object_key,
                data=file,
                length=file_size,
                content_type=mime_type
            )
            
            # Generate access URL
            storage_url = f"http://{self.endpoint}/{self.bucket_name}/{object_key}"
            
            # Prepare metadata
            metadata = {
                'storage_url': storage_url,
                'storage_bucket': self.bucket_name,
                'storage_key': object_key,
                'file_size': file_size,
                'mime_type': mime_type,
                'checksum': checksum,
                'storage_provider': 'minio'
            }
            
            logger.info(f"Successfully uploaded image: {object_key}")
            return object_key, metadata
            
        except S3Error as e:
            logger.error(f"MinIO error uploading image: {e}")
            raise Exception(f"Failed to upload image to storage: {e}")
        except Exception as e:
            logger.error(f"Unexpected error uploading image: {e}")
            raise
    
    def get_presigned_url(self, object_key: str, expires: int = 3600) -> str:
        """
        Generate a presigned URL for accessing an object using Label Studio accessible endpoint
        
        Args:
            object_key: The object key in MinIO
            expires: URL expiration time in seconds (default: 1 hour)
            
        Returns:
            Presigned URL string with gateway endpoint for Label Studio access
        """
        try:
            # Use external client to generate presigned URLs with correct hostname
            url = self.external_client.presigned_get_object(
                bucket_name=self.bucket_name,
                object_name=object_key,
                expires=timedelta(seconds=expires)
            )
            
            logger.info(f"Generated presigned URL with Label Studio endpoint: {self.label_studio_endpoint}")
            return url
        except S3Error as e:
            logger.error(f"Error generating presigned URL: {e}")
            raise
    
    def delete_image(self, object_key: str) -> bool:
        """
        Delete an image from MinIO
        
        Args:
            object_key: The object key to delete
            
        Returns:
            True if successful, False otherwise
        """
        try:
            self.client.remove_object(
                bucket_name=self.bucket_name,
                object_name=object_key
            )
            logger.info(f"Successfully deleted image: {object_key}")
            return True
        except S3Error as e:
            logger.error(f"Error deleting image: {e}")
            return False
    
    def list_images(self, prefix: str = "") -> list:
        """
        List all images with optional prefix filter
        
        Args:
            prefix: Optional prefix to filter objects
            
        Returns:
            List of object information
        """
        try:
            objects = self.client.list_objects(
                bucket_name=self.bucket_name,
                prefix=prefix,
                recursive=True
            )
            
            return [
                {
                    'object_name': obj.object_name,
                    'size': obj.size,
                    'last_modified': obj.last_modified,
                    'etag': obj.etag
                }
                for obj in objects
            ]
        except S3Error as e:
            logger.error(f"Error listing images: {e}")
            return []
    
    def get_bucket_stats(self) -> dict:
        """Get bucket statistics"""
        try:
            objects = list(self.client.list_objects(
                bucket_name=self.bucket_name,
                recursive=True
            ))
            
            total_size = sum(obj.size for obj in objects)
            total_count = len(objects)
            
            return {
                'bucket_name': self.bucket_name,
                'total_objects': total_count,
                'total_size_bytes': total_size,
                'total_size_mb': round(total_size / (1024 * 1024), 2)
            }
        except S3Error as e:
            logger.error(f"Error getting bucket stats: {e}")
            return {}

# Singleton instance
minio_service = MinIOService()
