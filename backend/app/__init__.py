"""
Application Factory for QC Management System
Creates and configures the Flask application with all necessary extensions and blueprints.
"""

import os
from datetime import timedelta
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager
from flask_cors import CORS
from flask_migrate import Migrate

# Initialize extensions
db = SQLAlchemy()
jwt = JWTManager()
migrate = Migrate()

def create_app():
    """Application factory function to create and configure Flask app"""
    app = Flask(__name__)
    
    # Application Configuration
    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'your-secret-string')
    app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'postgresql://admin:admin@db:5432/qc')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['JWT_SECRET_KEY'] = os.environ.get('JWT_SECRET_KEY', 'your-secret-string')
    app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(hours=1)
    
    # MinIO configuration (object storage replaces local file storage)
    app.config['MINIO_ENDPOINT'] = os.environ.get('MINIO_ENDPOINT', 'localhost:9000')
    app.config['MINIO_ACCESS_KEY'] = os.environ.get('MINIO_ACCESS_KEY', 'admin')
    app.config['MINIO_SECRET_KEY'] = os.environ.get('MINIO_SECRET_KEY', 'password123')
    app.config['MINIO_BUCKET_NAME'] = os.environ.get('MINIO_BUCKET_NAME', 'qc-images')

    # Initialize extensions with app
    db.init_app(app)
    jwt.init_app(app)
    
    # Configure CORS to allow frontend access
    CORS(app, origins=[
        "http://localhost:3000",  # Frontend development server
        "http://127.0.0.1:3000",  # Alternative localhost format
        "http://0.0.0.0:3000"     # Docker internal access
    ], supports_credentials=True)
    
    migrate.init_app(app, db)

    # Register blueprints
    from . import routes
    app.register_blueprint(routes.bp)


    # Automatically create tables if they do not exist (at startup)
    with app.app_context():
        db.create_all()

    # Label Studio integration is user-driven via personal access tokens
    # No automatic initialization required

    return app
