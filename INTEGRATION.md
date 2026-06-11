# Integration Guide - NeuroAI Medical Dashboard

## Table of Contents
1. [System Architecture](#system-architecture)
2. [Component Integration](#component-integration)
3. [API Integration](#api-integration)
4. [Docker Integration](#docker-integration)
5. [Frontend-Backend Communication](#frontend-backend-communication)
6. [Data Flow](#data-flow)
7. [Authentication & Security](#authentication--security)
8. [File Upload & Storage](#file-upload--storage)
9. [Error Handling](#error-handling)
10. [Deployment Strategies](#deployment-strategies)
11. [Monitoring & Logging](#monitoring--logging)
12. [Troubleshooting](#troubleshooting)

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  NeuroAI Medical Dashboard                   │
└─────────────────────────────────────────────────────────────┘

┌───────────────────┐          ┌───────────────────┐
│                   │          │                   │
│     Frontend      │          │      Backend      │
│   React + Vite    │◄────────►│     FastAPI       │
│   Port: 5173      │   HTTP   │   Port: 8000      │
│                   │          │                   │
└───────────────────┘          └───────────────────┘
         │                              │
         │                              │
         ▼                              ▼
┌───────────────────┐          ┌───────────────────┐
│   Static Assets   │          │     AWS S3        │
│   (Images/Fonts)  │          │  - MRI Scans      │
│                   │          │  - Predictions    │
└───────────────────┘          │  - Heatmaps       │
                               │  - SHAP Charts    │
                               └───────────────────┘
```

### Technology Stack Overview

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | React 18 + TypeScript | UI Framework |
| **Build Tool** | Vite 6 | Dev server & bundler |
| **Styling** | Tailwind CSS | Utility-first CSS |
| **HTTP Client** | Axios | API requests |
| **Backend** | FastAPI (Python) | REST API server |
| **Storage** | AWS S3 | File storage |
| **Containerization** | Docker + Docker Compose | Deployment |
| **Reverse Proxy** | Nginx (optional) | Production hosting |

---

## Component Integration

### Frontend Components Hierarchy

```
App.tsx (Root)
├── IdentificationPage
│   ├── PatientSelector (Select)
│   ├── FileUpload (Drag & Drop)
│   └── ActionButtons
│
├── ProcessingPage
│   ├── ClinicalDataForm
│   │   ├── TextInputs (Age, MMSE, Education)
│   │   └── Selects (Sex, CDR, APOE)
│   ├── FileUploadArea
│   └── ProgressTracker
│       └── ProgressBar
│
└── Dashboard (Result View)
    ├── Header
    │   ├── Logo
    │   ├── RefreshButton
    │   └── DownloadButton
    ├── PatientInfo (Card)
    ├── DiagnosisCard
    ├── ExplainabilityBanner
    ├── MRIHeatmap (Grad-CAM)
    ├── AlternativeDiagnoses
    ├── ShapValues
    │   ├── FeatureList
    │   └── ShapChart (Image)
    └── DisclaimerFooter
```

### Component Communication

**Props Down, Events Up Pattern**:
```typescript
// Parent → Child (Props)
<ProcessingPage 
  patientId={sessionData.id}
  onComplete={handleAnalysisComplete}
/>

// Child → Parent (Callback)
const handleAnalysisComplete = (result) => {
  setSessionData(result);
  setIsProcessing(false);
};
```

---

## API Integration

### Endpoint Mapping

| Frontend Function | Backend Endpoint | Method | Purpose |
|-------------------|------------------|--------|---------|
| `getPatients()` | `/patients` | GET | List all patient IDs |
| `getPatientRecord(id)` | `/patient/{id}` | GET | Fetch patient data from S3 |
| `registerAndPredict(data, file)` | `/patient/register-and-predict` | POST | New patient + prediction |
| `predictPatient(id, file)` | `/patient/{id}/predict` | POST | Run prediction for existing patient |
| `refreshPatientAssets(id)` | `/patient/{id}` | GET | Regenerate presigned URLs |
| N/A | `/patient/{id}/file/{filename}` | GET | Direct file streaming |

### API Client Implementation

**File**: `frontend/src/app/api.ts`

```typescript
import axios from 'axios';

// Environment-based URL selection
const BASE_URL = import.meta.env.DEV 
  ? '/api'                          // Dev: uses Vite proxy
  : 'http://35.159.51.22:8000';     // Prod: direct to backend

export const api = {
  // GET /patients - List all patient IDs
  getPatients: async () => {
    const response = await axios.get(`${BASE_URL}/patients`);
    return response.data.patients;
  },

  // GET /patient/{id} - Fetch patient record
  getPatientRecord: async (patientId: string) => {
    const response = await axios.get(`${BASE_URL}/patient/${patientId}`);
    return response.data;
  },

  // POST /patient/register-and-predict
  registerAndPredict: async (patientData: any, file: File) => {
    const formData = new FormData();
    
    // Transform to numeric values
    const tabularData = {
      SEX: Number(patientData.SEX),
      AGE: Number(patientData.AGE),
      EDUCATION: Number(patientData.EDUCATION),
      CDR: Number(patientData.CDR),
      MMSE: Number(patientData.MMSE),
      APGEN1: Number(patientData.APGEN1),
      APGEN2: Number(patientData.APGEN2)
    };

    formData.append('tabular', JSON.stringify(tabularData));
    formData.append('t1w_file', file);
    formData.append('explain', 'true');

    const response = await axios.post(
      `${BASE_URL}/patient/register-and-predict`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return response.data;
  },

  // POST /patient/{id}/predict
  predictPatient: async (patientId: string, file: File, tabularData?: any) => {
    const formData = new FormData();
    formData.append('t1w_file', file);
    formData.append('explain', 'true');

    // Include tabular data if provided (fallback if not in S3)
    if (tabularData) {
      formData.append('tabular', JSON.stringify(tabularData));
    }

    const response = await axios.post(
      `${BASE_URL}/patient/${patientId}/predict`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return response.data;
  }
};
```

### Request/Response Examples

#### 1. List Patients

**Request**:
```http
GET /patients HTTP/1.1
Host: 35.159.51.22:8000
```

**Response**:
```json
{
  "patients": [
    "AAA001",
    "AAA002",
    "AAA003"
  ]
}
```

---

#### 2. Get Patient Record

**Request**:
```http
GET /patient/AAA001 HTTP/1.1
Host: 35.159.51.22:8000
```

**Response (Success)**:
```json
{
  "patient_id": "AAA001",
  "prediction": {
    "diagnosis": "Alzheimer's Disease",
    "confidence": 0.92,
    "probabilities": {
      "Alzheimer's Disease": 0.92,
      "Mild Cognitive Impairment": 0.06,
      "Normal": 0.02
    },
    "shap": {
      "features": [
        {"feature": "MMSE", "value": 24, "shap": -0.15},
        {"feature": "AGE", "value": 72, "shap": 0.08}
      ],
      "chart_path": "https://s3.presigned.url/..."
    },
    "gradcam": {
      "heatmap_png": "https://s3.presigned.url/..."
    },
    "patient_info": {
      "age": 72,
      "sex": "Male",
      "education": 16,
      "cdr": 0.5,
      "mmse": 24,
      "apgen1": 3,
      "apgen2": 4
    },
    "model_used": "TAB T1w"
  },
  "files": [
    "AAA001_heatmap.png",
    "AAA001_shap.png",
    "prediction.json"
  ]
}
```

**Response (Patient Not Found)**:
```json
{
  "detail": "Patient 'AAA001' not found in S3."
}
```

---

#### 3. Register and Predict

**Request**:
```http
POST /patient/register-and-predict HTTP/1.1
Host: 35.159.51.22:8000
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary

------WebKitFormBoundary
Content-Disposition: form-data; name="tabular"

{"SEX":1,"AGE":72,"EDUCATION":16,"CDR":0.5,"MMSE":24,"APGEN1":3,"APGEN2":4}
------WebKitFormBoundary
Content-Disposition: form-data; name="t1w_file"; filename="scan.nii.gz"
Content-Type: application/gzip

<binary MRI data>
------WebKitFormBoundary
Content-Disposition: form-data; name="explain"

true
------WebKitFormBoundary--
```

**Response**:
```json
{
  "patient_id": "AAA077",
  "diagnosis": "Alzheimer's Disease",
  "confidence": 0.89,
  "probabilities": { ... },
  "shap": { ... },
  "gradcam": { ... },
  "patient_info": { ... },
  "model_used": "TAB T1w"
}
```

---

## Docker Integration

### Docker Compose Configuration

**File**: `docker-compose.yml`

```yaml
version: '3.8'

services:
  frontend:
    build: ./frontend
    container_name: neuroai-frontend
    ports:
      - "5173:5173"
    volumes:
      # Mount source code for hot reload
      - ./frontend:/app
      # Prevent host node_modules from overriding container
      - /app/node_modules
    environment:
      # Point to production backend
      - VITE_API_URL=http://35.159.51.22:8000
      - NODE_ENV=development
    stdin_open: true
    tty: true
    restart: unless-stopped

# Backend is deployed separately on AWS EC2
# Not included in this docker-compose
```

### Frontend Dockerfile

**File**: `frontend/Dockerfile`

```dockerfile
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Expose port
EXPOSE 5173

# Start development server
# --host allows access from outside container
CMD ["npm", "run", "dev", "--", "--host"]
```

### Docker .dockerignore

**File**: `frontend/.dockerignore`

```
node_modules
dist
.git
.gitignore
.env
.env.local
npm-debug.log
.DS_Store
coverage
.vscode
README.md
```

### Docker Commands

```bash
# Build images
docker-compose build

# Start containers (detached)
docker-compose up -d

# Start with live logs
docker-compose up

# Stop containers
docker-compose down

# Restart services
docker-compose restart

# View logs
docker-compose logs -f frontend

# Rebuild and restart
docker-compose up -d --build

# Remove volumes (clean slate)
docker-compose down -v

# Execute commands in container
docker-compose exec frontend npm install axios
```

---

## Frontend-Backend Communication

### Development Proxy (Vite)

**File**: `frontend/vite.config.ts`

```typescript
export default defineConfig({
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://35.159.51.22:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        configure: (proxy, options) => {
          // Add custom proxy configuration
          proxy.on('error', (err, req, res) => {
            console.log('Proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('Proxy request:', req.method, req.url);
          });
        }
      }
    }
  }
});
```

**How it works**:
1. Frontend requests `/api/patients`
2. Vite proxy intercepts the request
3. Rewrites URL to `/patients` (removes `/api`)
4. Forwards to `http://35.159.51.22:8000/patients`
5. Returns response to frontend

**Benefits**:
- No CORS issues in development
- Clean separation of frontend/backend URLs
- Easy to switch backends

### Production Direct Connection

In production build:
```typescript
const BASE_URL = 'http://35.159.51.22:8000';
```

Frontend makes direct requests to backend (CORS must be enabled on backend).

### CORS Configuration (Backend)

**Backend must allow frontend origin**:
```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "https://your-frontend-domain.com"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## Data Flow

### Complete User Flow Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                    User Journey                               │
└──────────────────────────────────────────────────────────────┘

1. User opens app
        ↓
2. IdentificationPage loads
        ↓
3. Frontend: GET /patients
        ↓
4. Backend: Returns patient list
        ↓
5a. USER PATH A: New Patient
    - Upload MRI file
    - Fill clinical form
    - Submit
        ↓
    Frontend: POST /patient/register-and-predict
        ↓
    Backend:
      - Generate patient ID
      - Process MRI
      - Run AI model
      - Generate SHAP & Grad-CAM
      - Upload to S3
      - Return results
        ↓
    Frontend: Display dashboard

5b. USER PATH B: Existing Patient
    - Select patient from dropdown
    - Click "Open Dashboard"
        ↓
    Frontend: GET /patient/{id}
        ↓
    Backend: Check S3
        ↓
    Case 1: Patient has data
      - Return prediction results
      - Frontend displays dashboard
    Case 2: Patient has no data (404)
      - Frontend catches error
      - Redirects to upload page
      - User uploads MRI
      - POST /patient/{id}/predict
      - Backend processes & stores
      - Frontend displays dashboard
```

### Request Flow Detail

#### New Patient Registration
```
Frontend                 Backend                   S3
   │                        │                      │
   │ POST /register-and-    │                      │
   │ predict (MRI + data)   │                      │
   ├───────────────────────►│                      │
   │                        │ 1. Generate ID       │
   │                        │    (e.g., AAA077)    │
   │                        │                      │
   │                        │ 2. Process MRI       │
   │                        │    - Extract features│
   │                        │    - Run CNN model   │
   │                        │                      │
   │                        │ 3. Run tabular model │
   │                        │    - Combine features│
   │                        │    - Generate predict│
   │                        │                      │
   │                        │ 4. Generate SHAP     │
   │                        │    - Feature contrib.│
   │                        │    - Save chart PNG  │
   │                        │                      │
   │                        │ 5. Generate Grad-CAM │
   │                        │    - Attention map   │
   │                        │    - Overlay on MRI  │
   │                        │                      │
   │                        │ 6. Upload to S3      │
   │                        ├─────────────────────►│
   │                        │  - MRI file          │
   │                        │  - heatmap.png       │
   │                        │  - shap.png          │
   │                        │  - prediction.json   │
   │                        │                      │
   │ 7. Return results      │                      │
   │◄───────────────────────┤                      │
   │   {patient_id, diag,   │                      │
   │    shap, gradcam...}   │                      │
   │                        │                      │
   │ 8. Display dashboard   │                      │
   │                        │                      │
```

---

## Authentication & Security

### Current Implementation
**No authentication** - Open system (development/demo phase)

### Future Implementation Considerations

#### JWT Authentication Flow
```
1. User login → Backend issues JWT token
2. Frontend stores token (localStorage/cookie)
3. All API requests include: Authorization: Bearer <token>
4. Backend validates token on each request
```

#### Recommended Setup
```typescript
// api.ts
const token = localStorage.getItem('auth_token');

axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

// Login
const login = async (username: string, password: string) => {
  const response = await axios.post(`${BASE_URL}/auth/login`, {
    username,
    password
  });
  localStorage.setItem('auth_token', response.data.token);
};
```

### Security Best Practices

1. **HTTPS in Production**: Always use SSL/TLS
2. **Input Validation**: Sanitize all user inputs
3. **File Upload Limits**: Restrict file size/type
4. **Rate Limiting**: Prevent API abuse
5. **CORS Configuration**: Whitelist allowed origins only
6. **S3 Presigned URLs**: Time-limited access (currently implemented)
7. **Environment Variables**: Never commit secrets to Git

---

## File Upload & Storage

### Frontend File Upload

**Drag & Drop Implementation**:
```typescript
<div
  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
  onDragLeave={() => setIsDragging(false)}
  onDrop={(e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  }}
  className={`border-2 border-dashed ${isDragging ? 'border-blue-500' : 'border-gray-300'}`}
>
  <input
    type="file"
    ref={fileInputRef}
    className="hidden"
    onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
    accept=".nii,.gz,.zip"
  />
</div>
```

**File Validation**:
```typescript
const ALLOWED_FORMATS = [".nii", ".nii.gz", ".zip"];

const validateFile = (file: File) => {
  const fileName = file.name.toLowerCase();
  const isValid = ALLOWED_FORMATS.some(ext => fileName.endsWith(ext));
  
  if (!isValid) {
    throw new Error('Invalid format. Please upload NIfTI or ZIP files only.');
  }
  
  return true;
};
```

### Backend File Processing

**Steps**:
1. Receive multipart/form-data
2. Extract MRI file from form
3. Validate file format
4. Process MRI (convert if needed)
5. Run AI model
6. Generate visualizations
7. Upload results to S3
8. Return prediction + presigned URLs

### S3 Storage Structure

```
s3://medical-dashboard-bucket/
├── AAA001/
│   ├── AAA001_t1w.nii.gz
│   ├── AAA001_heatmap.png
│   ├── AAA001_shap.png
│   └── prediction.json
├── AAA002/
│   ├── AAA002_t1w.nii.gz
│   ├── AAA002_heatmap.png
│   ├── AAA002_shap.png
│   └── prediction.json
└── ...
```

### Presigned URL Handling

**Frontend receives**:
```json
{
  "gradcam": {
    "heatmap_png": "https://bucket.s3.region.amazonaws.com/AAA001/heatmap.png?X-Amz-Signature=..."
  }
}
```

**Issue**: URLs expire after set time (e.g., 1 hour)

**Solution**: 
1. **Refresh button** - regenerates URLs via `GET /patient/{id}`
2. **Direct streaming** - bypass presigned URLs via `/patient/{id}/file/{filename}`

```typescript
// Direct streaming approach (no expiration)
const directUrl = `${BASE_URL}/patient/${patientId}/file/${patientId}_heatmap.png`;

<img src={directUrl} alt="Heatmap" />
```

---

## Error Handling

### Frontend Error Handling

**API Error Handling**:
```typescript
try {
  const data = await api.getPatientRecord(patientId);
  setSessionData(data);
} catch (error) {
  console.error("Failed to fetch patient record:", error);
  
  // Axios error
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 404) {
      // Patient not found - redirect to upload
      setSessionData({ id: patientId });
      setIsProcessing(true);
    } else {
      setError(error.response?.data?.detail || error.message);
    }
  } else {
    setError('An unexpected error occurred');
  }
}
```

**User-Facing Error Display**:
```tsx
{error && (
  <div className="bg-red-50 border border-red-200 rounded-xl p-4">
    <p className="text-red-600 font-bold">{error}</p>
  </div>
)}
```

### Common Error Scenarios

| Error | Status | Frontend Handling |
|-------|--------|-------------------|
| Patient not found | 404 | Redirect to upload page |
| Invalid file format | 400 | Show validation error |
| Backend unavailable | 500/503 | Show "Service unavailable" |
| Network error | - | Show "Connection failed" |
| File too large | 413 | Show "File size limit exceeded" |

---

## Deployment Strategies

### Strategy 1: Separate Deployments (Current)

**Frontend**: Docker container or static hosting  
**Backend**: AWS EC2 instance  

**Pros**:
- Independent scaling
- Easy to update separately
- Frontend can use CDN

**Cons**:
- CORS configuration needed
- Two deployment pipelines

---

### Strategy 2: Single Server with Nginx

```
┌─────────────────────────────────┐
│         Nginx (Port 80)         │
├─────────────────────────────────┤
│  /          → Frontend (React)  │
│  /api/*     → Backend (FastAPI) │
└─────────────────────────────────┘
```

**Nginx Config**:
```nginx
server {
    listen 80;
    server_name example.com;

    # Frontend
    location / {
        root /var/www/neuroai/dist;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:8000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

**Pros**:
- Single domain (no CORS)
- Centralized SSL certificate
- Simplified deployment

---

### Strategy 3: Docker Compose Full Stack

**docker-compose.yml**:
```yaml
services:
  frontend:
    build: ./frontend
    ports:
      - "5173:5173"
    depends_on:
      - backend
    environment:
      - VITE_API_URL=http://backend:8000

  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
      - AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
    volumes:
      - ./backend:/app

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
    depends_on:
      - frontend
      - backend
```

---

## Monitoring & Logging

### Frontend Logging

**Console Logging** (Development):
```typescript
console.log('=== PREDICT API REQUEST ===');
console.log('Patient ID:', patientId);
console.log('File:', file.name);
```

**Production Logging** (Consider):
- **Sentry**: Error tracking
- **Google Analytics**: User behavior
- **LogRocket**: Session replay

### Backend Logging

**FastAPI Logging**:
```python
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@app.post("/patient/{patient_id}/predict")
async def predict(patient_id: str, file: UploadFile):
    logger.info(f"Prediction request for patient {patient_id}")
    # Process...
    logger.info(f"Prediction completed for {patient_id}")
```

### Docker Logs

```bash
# View all logs
docker-compose logs

# Follow frontend logs
docker-compose logs -f frontend

# Last 100 lines
docker-compose logs --tail=100 backend

# Filter by timestamp
docker-compose logs --since 2023-01-01 frontend
```

---

## Troubleshooting

### Issue 1: Cannot Connect to Backend

**Symptom**: "Could not connect to backend registry"

**Diagnosis**:
```bash
# Test backend health
curl http://35.159.51.22:8000/health

# Check if backend is running
curl -I http://35.159.51.22:8000/patients

# Test from frontend container
docker-compose exec frontend curl http://35.159.51.22:8000/patients
```

**Solutions**:
1. Verify backend is running
2. Check firewall/security groups
3. Verify proxy configuration in `vite.config.ts`
4. Check CORS settings on backend

---

### Issue 2: Images Not Loading

**Symptom**: Broken image icons on dashboard

**Diagnosis**:
```bash
# Check presigned URL in browser console
# Copy image URL and test:
curl -I "<presigned-url>"

# Test direct streaming endpoint
curl http://35.159.51.22:8000/patient/AAA001/file/AAA001_heatmap.png
```

**Solutions**:
1. Click "Refresh Data" button
2. Check S3 bucket permissions
3. Verify files exist in S3
4. Use direct streaming endpoint instead of presigned URLs

---

### Issue 3: File Upload Fails

**Symptom**: Upload doesn't progress or returns error

**Diagnosis**:
```bash
# Check file size
ls -lh scan.nii.gz

# Test upload with curl
curl -X POST http://35.159.51.22:8000/patient/register-and-predict \
  -F "t1w_file=@scan.nii.gz" \
  -F "tabular={\"SEX\":1,\"AGE\":72,...}" \
  -F "explain=true"
```

**Solutions**:
1. Check file format (must be .nii, .nii.gz, .zip)
2. Verify file size under backend limit
3. Check network connectivity
4. Review backend logs for processing errors

---

### Issue 4: Docker Container Won't Start

**Symptom**: `docker-compose up` fails

**Diagnosis**:
```bash
# Check logs
docker-compose logs frontend

# Check if port is in use
netstat -ano | findstr :5173

# Verify Docker is running
docker ps
```

**Solutions**:
```bash
# Remove containers and rebuild
docker-compose down
docker-compose up -d --build

# Change port if 5173 is in use
# In docker-compose.yml: "5174:5173"
```

---

### Issue 5: Hot Reload Not Working

**Symptom**: Code changes don't reflect in browser

**Solutions**:
1. Ensure volumes are mounted correctly
2. Check `vite.config.ts` has `host: true`
3. Add polling for Docker:
```typescript
server: {
  watch: {
    usePolling: true
  }
}
```
4. Clear browser cache (Ctrl+Shift+R)

---

## Performance Optimization

### Frontend Optimization

1. **Code Splitting**: Vite automatically splits routes
2. **Image Lazy Loading**: Use `loading="lazy"` attribute
3. **Debounce API Calls**: For search/filter features
4. **Memoization**: Use `useMemo` for expensive calculations
5. **Bundle Analysis**:
```bash
npm run build -- --mode analyze
```

### Backend Optimization

1. **Response Compression**: Enable gzip
2. **Caching**: Cache patient records (Redis)
3. **CDN**: Use CloudFront for S3 files
4. **Connection Pooling**: For database connections
5. **Async Processing**: Background tasks for predictions

---

## Security Checklist

- [ ] HTTPS enabled in production
- [ ] CORS properly configured
- [ ] Input validation on all forms
- [ ] File upload size limits
- [ ] File type validation
- [ ] SQL injection prevention (if using DB)
- [ ] XSS prevention (sanitize inputs)
- [ ] Rate limiting on API
- [ ] Environment variables for secrets
- [ ] S3 bucket not publicly accessible
- [ ] Presigned URLs with expiration
- [ ] Regular dependency updates
- [ ] Security headers (CSP, X-Frame-Options)

---

## API Testing Tools

### cURL Examples
```bash
# List patients
curl http://35.159.51.22:8000/patients

# Get patient
curl http://35.159.51.22:8000/patient/AAA001

# Upload and predict
curl -X POST http://35.159.51.22:8000/patient/register-and-predict \
  -F "t1w_file=@scan.nii.gz" \
  -F "tabular={\"SEX\":1,\"AGE\":72,\"EDUCATION\":16,\"CDR\":0.5,\"MMSE\":24,\"APGEN1\":3,\"APGEN2\":4}" \
  -F "explain=true"
```

### Postman Collection
Import the following into Postman:
```json
{
  "info": {
    "name": "NeuroAI API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Get Patients",
      "request": {
        "method": "GET",
        "url": "http://35.159.51.22:8000/patients"
      }
    },
    {
      "name": "Get Patient Record",
      "request": {
        "method": "GET",
        "url": "http://35.159.51.22:8000/patient/AAA001"
      }
    }
  ]
}
```

---

## Continuous Integration/Deployment

### GitHub Actions Example

**.github/workflows/deploy.yml**:
```yaml
name: Deploy Frontend

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: |
          cd frontend
          npm ci
      
      - name: Build
        run: |
          cd frontend
          npm run build
      
      - name: Deploy to S3
        run: |
          aws s3 sync frontend/dist s3://your-bucket --delete
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

---

## Additional Resources

- **FastAPI Docs**: https://fastapi.tiangolo.com
- **React Docs**: https://react.dev
- **Vite Docs**: https://vitejs.dev
- **Docker Docs**: https://docs.docker.com
- **AWS S3 Docs**: https://docs.aws.amazon.com/s3
- **Axios Docs**: https://axios-http.com

---

**Last Updated**: 2026-06-11  
**Version**: 1.0.0  
**Maintainers**: NeuroAI Development Team
