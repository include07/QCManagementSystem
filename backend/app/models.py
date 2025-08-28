"""
Database Models for the QC Management System
Defines all SQLAlchemy models for users, companies, products, steps, class counts, and captured images.
"""

from . import db
from werkzeug.security import generate_password_hash, check_password_hash

class User(db.Model):
    """User model for authentication and authorization"""
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    label_studio_api_key = db.Column(db.String(255), nullable=True)  # User's Label Studio Legacy Token
    
    def set_password(self, password):
        """Hash and set user password"""
        self.password_hash = generate_password_hash(password)
    
    def check_password(self, password):
        """Verify user password against stored hash"""
        return check_password_hash(self.password_hash, password)

class Company(db.Model):
    """Company model representing business entities in the system"""
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False, unique=True)
    description = db.Column(db.Text, nullable=True)
    # Relationships
    products = db.relationship('Product', backref='company', cascade="all, delete-orphan")

class Product(db.Model):
    """Product model representing items manufactured by companies"""
    id = db.Column(db.Integer, primary_key=True)
    company_id = db.Column(db.Integer, db.ForeignKey('company.id'), nullable=False)
    name = db.Column(db.String(255), nullable=False)
    image_url = db.Column(db.String(500), nullable=True)
    # Relationships
    class_counts = db.relationship('ClassCount', backref='product', cascade="all, delete-orphan")

class ClassCount(db.Model):
    """ClassCount model for tracking different classes in products (renamed for legacy compatibility)"""
    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey('product.id'), nullable=False)
    class_ = db.Column('class', db.String(255), nullable=False)

class CapturedImage(db.Model):
    """CapturedImage model for storing metadata about uploaded images"""
    __tablename__ = 'captured_image'  # Explicitly define table name for consistency
    id = db.Column(db.Integer, primary_key=True)
    filename = db.Column(db.String(255), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey('product.id'), nullable=False)
    timestamp = db.Column(db.DateTime, server_default=db.func.now())
    
    # MinIO/Object Storage fields
    storage_url = db.Column(db.String(1000), nullable=True)  # Full URL to access the image
    storage_bucket = db.Column(db.String(100), default='qc-images')  # Bucket name
    storage_key = db.Column(db.String(500), nullable=True)  # Object key/path in storage
    file_size = db.Column(db.BigInteger, nullable=True)  # File size in bytes
    mime_type = db.Column(db.String(100), default='image/jpeg')  # MIME type
    checksum = db.Column(db.String(64), nullable=True)  # MD5 or SHA256 for integrity
    storage_provider = db.Column(db.String(50), default='minio')  # Storage provider type

    # Relationships
    product = db.relationship('Product', backref='images')
    
    def get_access_url(self, expires=3600):
        """Get a URL for accessing the image via backend serving endpoint"""
        if self.storage_provider == 'minio' and self.storage_key:
            # Use backend serving endpoint instead of presigned URLs
            from flask import current_app
            base_url = current_app.config.get('EXTERNAL_URL', 'http://localhost:5000')
            return f"{base_url}/serve-image/{self.storage_key}"
        return self.storage_url
