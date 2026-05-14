# Use Ezra's required Python version
FROM python:3.10-slim

WORKDIR /app

# Install system dependencies for MRI processing and OpenCV
# libgl1 replaces the deprecated libgl1-mesa-glx
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend logic
COPY . .

EXPOSE 8000

# Run FastAPI with uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]