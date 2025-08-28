#!/usr/bin/env python3
"""
Test script for Label Studio project creation
This script tests creating projects directly from the host system using Legacy Token
"""

import requests
import json
import sys

def test_label_studio_connection(legacy_token):
    """Test the connection to Label Studio using Legacy Token"""
    headers = {
        'Authorization': f'Token {legacy_token}',
        'Content-Type': 'application/json'
    }
    
    try:
        print(f"Testing connection with legacy token: {legacy_token[:10]}...")
        response = requests.get('http://localhost:8081/api/projects/', headers=headers, timeout=10)
        
        if response.status_code == 200:
            print("✓ Connection successful!")
            return True
        else:
            print(f"✗ Connection failed with status code: {response.status_code}")
            print(f"Response: {response.text}")
            return False
            
    except requests.exceptions.ConnectionError:
        print("✗ Cannot connect to Label Studio. Make sure it's running at localhost:8081")
        return False
    except Exception as e:
        print(f"✗ Connection test failed: {e}")
        return False

def create_label_studio_project(legacy_token, project_name, labels=None):
    """Create a new project in Label Studio using Legacy Token"""
    headers = {
        'Authorization': f'Token {legacy_token}',
        'Content-Type': 'application/json'
    }
    
    # Create label config if labels are provided
    label_config = None
    if labels:
        choices_xml = '\n'.join([f'    <Choice value="{label}"/>' for label in labels])
        label_config = f'''<View>
  <Image name="image" value="$image"/>
  <Choices name="choice" toName="image">
{choices_xml}
  </Choices>
</View>'''
    
    # Prepare project data
    project_data = {
        'title': project_name
    }
    
    if label_config:
        project_data['label_config'] = label_config
    
    try:
        print(f"Creating project '{project_name}'...")
        if labels:
            print(f"With labels: {', '.join(labels)}")
        
        response = requests.post(
            'http://localhost:8081/api/projects',
            json=project_data,
            headers=headers,
            timeout=30
        )
        
        if response.status_code == 201:
            project_info = response.json()
            print("✓ Project created successfully!")
            print(f"  Project ID: {project_info.get('id')}")
            print(f"  Project Name: {project_info.get('title')}")
            print(f"  Project URL: http://localhost:8081/projects/{project_info.get('id')}")
            return project_info
        else:
            print(f"✗ Failed to create project. Status: {response.status_code}")
            print(f"Response: {response.text}")
            return None
            
    except Exception as e:
        print(f"✗ Error creating project: {e}")
        return None

def main():
    """Main function to test Label Studio integration"""
    print("Label Studio Project Creation Test")
    print("=" * 40)
    
    # Replace this with your actual Legacy Token from Label Studio
    # Go to: Organization > Access Token Settings > Disable "Personal Access Tokens"
    # Then go to: User Account > Copy Legacy Token
    legacy_token = "89f00d24dd96d099f6209b5d0cff7de455739108"
    
    if legacy_token == "YOUR_LEGACY_TOKEN_HERE":
        print("Please replace 'YOUR_LEGACY_TOKEN_HERE' with your actual Legacy Token!")
        print("Steps to get Legacy Token:")
        print("1. Go to Organization > Access Token Settings")
        print("2. Disable 'Personal Access Tokens'")
        print("3. Go to User Account and copy your Legacy Token")
        return
    
    # Test connection with legacy token
    if not test_label_studio_connection(legacy_token):
        return
    
    print("\n" + "-" * 40)
    
    # Test creating a project without labels
    print("\nTest 1: Creating project without labels")
    project1 = create_label_studio_project(legacy_token, "Test Project - No Labels")
    
    print("\n" + "-" * 40)
    
    # Test creating a project with labels
    print("\nTest 2: Creating project with labels")
    test_labels = ["Good", "Bad", "Defective", "Perfect"]
    project2 = create_label_studio_project(legacy_token, "Test Project - With Labels", test_labels)
    
    print("\n" + "=" * 40)
    print("Test completed!")

if __name__ == "__main__":
    main()