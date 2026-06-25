# EC2 Deployment Commands for 3d_frontend

## Step 1: Authenticate with ECR

```bash
aws ecr get-login-password --region eu-central-1 | docker login --username AWS --password-stdin 286605288497.dkr.ecr.eu-central-1.amazonaws.com
```

## Step 2: Pull the latest image

```bash
docker pull 286605288497.dkr.ecr.eu-central-1.amazonaws.com/3d_frontend:latest
```

## Step 3: Stop and remove existing container

```bash
docker stop 3d_frontend 2>/dev/null || true
docker rm 3d_frontend 2>/dev/null || true
```

## Step 4: Run the production container

**Important:** Port 80 is already used by `ki-alz-frontend`. We'll use port 5174 instead.

```bash
docker run -d --name 3d_frontend -p 5174:80 -e VITE_API_URL=http://35.159.51.22:8000 --restart unless-stopped 286605288497.dkr.ecr.eu-central-1.amazonaws.com/3d_frontend:latest
```

## Step 5: Check container status

```bash
docker ps | grep 3d_frontend
```

## Step 6: View logs

```bash
docker logs 3d_frontend
```

## Access the application

Once deployed, access your frontend at: **http://63.180.171.31:5174**

(Note: Port 80 is already used by the existing ki-alz-frontend container)

---

## Single Script Version

You can also create a script file on EC2:

```bash
cat > deploy.sh << 'EOF'
#!/bin/bash
aws ecr get-login-password --region eu-central-1 | docker login --username AWS --password-stdin 286605288497.dkr.ecr.eu-central-1.amazonaws.com
docker pull 286605288497.dkr.ecr.eu-central-1.amazonaws.com/3d_frontend:latest
docker stop 3d_frontend 2>/dev/null || true
docker rm 3d_frontend 2>/dev/null || true
docker run -d --name 3d_frontend -p 5174:80 -e VITE_API_URL=http://35.159.51.22:8000 --restart unless-stopped 286605288497.dkr.ecr.eu-central-1.amazonaws.com/3d_frontend:latest
docker ps | grep 3d_frontend
docker logs 3d_frontend
EOF

chmod +x deploy.sh
./deploy.sh
```
