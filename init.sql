-- Main QC database setup

CREATE TABLE "user" (
    id SERIAL PRIMARY KEY,
    username VARCHAR(80) UNIQUE NOT NULL,
    email VARCHAR(120) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    label_studio_api_key VARCHAR(255)
);

CREATE TABLE company (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    description TEXT
);

CREATE TABLE product (
    id SERIAL PRIMARY KEY,
    company_id INTEGER REFERENCES company(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    image_url VARCHAR(500)
);

CREATE TABLE class_count (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES product(id) ON DELETE CASCADE,
    class VARCHAR(255) NOT NULL
);

CREATE TABLE captured_image (                                                                                                                                                                                                                                                                           
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    product_id INTEGER REFERENCES product(id) ON DELETE CASCADE,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- MinIO/Object Storage fields
    storage_url VARCHAR(1000),           -- Full URL to access the image
    storage_bucket VARCHAR(100) DEFAULT 'qc-images',  -- Bucket name
    storage_key VARCHAR(500),            -- Object key/path in storage
    file_size BIGINT,                    -- File size in bytes
    mime_type VARCHAR(100) DEFAULT 'image/jpeg',  -- MIME type
    checksum VARCHAR(64),                -- MD5 or SHA256 for integrity
    storage_provider VARCHAR(50) DEFAULT 'minio'  -- Storage provider type
);
