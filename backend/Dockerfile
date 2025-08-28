FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    postgresql-client \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
RUN pip install requests

# Copy application code
COPY . .

# Create directory for captured images
RUN mkdir -p captured_images

# Expose port
EXPOSE 5000

# Use gunicorn as the WSGI server with single worker to prevent race conditions
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "1", "run:app"]
