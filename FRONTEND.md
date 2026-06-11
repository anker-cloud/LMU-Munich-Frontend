# Frontend Documentation - NeuroAI Medical Dashboard

## Table of Contents
1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Installation & Setup](#installation--setup)
5. [Development Workflow](#development-workflow)
6. [Components](#components)
7. [Routing & Navigation](#routing--navigation)
8. [State Management](#state-management)
9. [API Integration](#api-integration)
10. [Styling](#styling)
11. [Build & Deployment](#build--deployment)
12. [Configuration](#configuration)
13. [Testing](#testing)

---

## Overview

The NeuroAI Medical Dashboard is a modern React-based web application for AI-powered dementia diagnosis. It provides an intuitive interface for:
- Patient identification and management
- MRI scan upload and processing
- Clinical data input
- Real-time analysis visualization
- Interactive dashboards with explainable AI features
- Report generation and export

**Key Features:**
- 📊 Real-time prediction dashboard
- 🧠 Grad-CAM heatmap visualization
- 📈 SHAP value interpretation
- 📄 HTML report export
- 🔄 Hot module replacement (HMR)
- 🎨 Modern, responsive UI

---

## Tech Stack

### Core Framework
- **React**: 18.3.1
- **TypeScript**: 5.6.2
- **Vite**: 6.3.5 (Build tool & dev server)

### UI & Styling
- **Tailwind CSS**: 3.4.17
- **@tailwindcss/vite**: 4.0.14
- **Lucide React**: 0.468.0 (Icon library)
- **Radix UI**: Headless UI components
  - `@radix-ui/react-select`
  - `@radix-ui/react-progress`
  - `@radix-ui/react-slot`

### HTTP & Data
- **Axios**: 1.7.9 (HTTP client)

### Utilities
- **clsx**: 2.1.1 (Class name utility)
- **tailwind-merge**: 2.6.0 (Tailwind class merging)

### Development Tools
- **ESLint**: 9.17.0
- **TypeScript ESLint**: 8.18.2
- **@vitejs/plugin-react**: 4.3.4

---

## Project Structure

```
frontend/
├── public/                    # Static assets
├── src/
│   ├── app/
│   │   ├── components/       # Reusable UI components
│   │   │   ├── ui/           # Base UI components
│   │   │   │   ├── button.tsx
│   │   │   │   ├── card.tsx
│   │   │   │   ├── progress.tsx
│   │   │   │   └── select.tsx
│   │   │   ├── AlternativeDiagnoses.tsx
│   │   │   ├── DiagnosisCard.tsx
│   │   │   ├── MRIHeatmap.tsx
│   │   │   ├── PatientInfo.tsx
│   │   │   └── ShapValues.tsx
│   │   ├── pages/            # Page-level components
│   │   │   ├── IdentificationPage.tsx
│   │   │   └── ProcessingPage.tsx
│   │   ├── App.tsx           # Main application component
│   │   ├── api.ts            # API client & endpoints
│   │   ├── types.ts          # TypeScript type definitions
│   │   └── utils.ts          # Utility functions
│   ├── main.tsx              # Application entry point
│   ├── index.css             # Global styles
│   └── vite-env.d.ts         # Vite type declarations
├── .dockerignore             # Docker build exclusions
├── .eslintrc.cjs             # ESLint configuration
├── .gitignore                # Git exclusions
├── Dockerfile                # Docker container config
├── components.json           # UI component config
├── package.json              # Dependencies & scripts
├── postcss.config.js         # PostCSS configuration
├── tailwind.config.js        # Tailwind CSS config
├── tsconfig.json             # TypeScript config (app)
├── tsconfig.node.json        # TypeScript config (node)
└── vite.config.ts            # Vite configuration
```

---

## Installation & Setup

### Prerequisites
- Node.js >= 18.x
- npm >= 9.x

### Install Dependencies
```bash
cd frontend
npm install
```

### Start Development Server
```bash
npm run dev
```
Access at: **http://localhost:5173**

### Build for Production
```bash
npm run build
```
Output directory: `./dist`

### Preview Production Build
```bash
npm run preview
```

### Lint Code
```bash
npm run lint
```

---

## Development Workflow

### Hot Module Replacement (HMR)
Vite provides instant HMR - changes reflect immediately without full page reload.

### File Changes to Watch
- **Component changes**: Instant UI update
- **API changes**: May require page refresh
- **Config changes**: Requires dev server restart

### Recommended VS Code Extensions
- **ES7+ React/Redux/React-Native snippets**
- **Tailwind CSS IntelliSense**
- **ESLint**
- **Prettier**
- **TypeScript Vue Plugin (Volar)**

---

## Components

### Page Components

#### 1. `IdentificationPage.tsx`
**Purpose**: Patient selection and MRI upload entry point

**Features**:
- Patient dropdown (loads from `/patients` API)
- New patient MRI upload (drag & drop)
- Existing patient selection
- "Open Dashboard" and "Run New Scan" buttons

**Props**:
```typescript
interface IdentificationPageProps {
  onProceed: (id: string, file?: File) => void;
  onAddScan?: (id: string, file: File) => void;
  onRunNewScan?: (id: string) => void;
}
```

**States**:
- `patientList`: Array of patient IDs
- `selectedId`: Currently selected patient
- `registryError`: Backend connection error
- `uploadError`: File validation error

---

#### 2. `ProcessingPage.tsx`
**Purpose**: Clinical data input and analysis progress

**Features**:
- Clinical metadata form (SEX, AGE, EDUCATION, CDR, MMSE, APOE)
- MRI upload interface
- Real-time progress bar
- Analysis status tracking

**Props**:
```typescript
interface ProcessingPageProps {
  onComplete: (data: BackendResponse | null) => void;
  onBack?: () => void;
  patientId: string;
  file?: File;
  isAddingScan?: boolean;
  existingTabularData?: any;
}
```

**States**:
- `step`: 'form' | 'upload' | 'analyzing'
- `formData`: Clinical data object
- `progress`: Analysis progress (0-100)
- `analysisResult`: Backend response

**Form Validation**:
- AGE: 1-120
- EDUCATION: 0-100
- MMSE: 0-30
- All fields required before submission

---

#### 3. `App.tsx`
**Purpose**: Main application container and dashboard

**Features**:
- Patient info card
- Diagnosis card with confidence
- MRI heatmap (Grad-CAM)
- SHAP value visualization
- Alternative diagnoses
- Download HTML report
- Refresh data button

**States**:
- `sessionData`: Current patient data
- `isProcessing`: Processing mode flag
- `isRefreshing`: Refresh in progress

**Key Functions**:
- `handleProceed`: Navigate from identification to processing
- `handleAnalysisComplete`: Process backend results
- `handleDownloadReport`: Generate HTML report
- `handleRefresh`: Regenerate presigned URLs

---

### UI Components

#### `PatientInfo.tsx`
Displays patient metadata in a card:
- Patient ID
- Age, Gender, Education
- CDR, MMSE scores
- APOE genotype

#### `DiagnosisCard.tsx`
Shows primary diagnosis with:
- Diagnosis label
- Confidence percentage
- Severity indicator
- Model description

#### `MRIHeatmap.tsx`
Displays Grad-CAM heatmap:
- Image viewer with error handling
- Refresh button if image fails
- Loading state

#### `ShapValues.tsx`
Visualizes SHAP explainability:
- Feature contribution list
- SHAP value chart
- Color-coded positive/negative values

#### `AlternativeDiagnoses.tsx`
Shows differential diagnoses:
- Probability distribution
- Bar chart visualization
- Sorted by confidence

---

### Base UI Components (`components/ui/`)

#### `Button`
Customizable button with variants:
```typescript
<Button variant="default" size="lg">Click Me</Button>
```

#### `Card`
Container components:
```typescript
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
  </CardHeader>
  <CardContent>Content</CardContent>
</Card>
```

#### `Select`
Dropdown select:
```typescript
<Select onValueChange={setValue} value={value}>
  <SelectTrigger>
    <SelectValue placeholder="Select..." />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="1">Option 1</SelectItem>
  </SelectContent>
</Select>
```

#### `Progress`
Progress bar:
```typescript
<Progress value={75} />
```

---

## Routing & Navigation

### Application Flow
```
IdentificationPage
      ↓
  [Select Patient or Upload New]
      ↓
ProcessingPage
      ↓
  [Upload MRI & Clinical Data]
      ↓
  [Analysis Running]
      ↓
Dashboard (App.tsx)
```

### Navigation States
Managed via state in `App.tsx`:
- `sessionData === null` → IdentificationPage
- `isProcessing === true` → ProcessingPage
- `sessionData && !isProcessing` → Dashboard

### Reset Navigation
Click "Back" or "View Another" returns to IdentificationPage

---

## State Management

### Local State (React useState)
No global state management (Redux/Context) - all state is component-local.

**App.tsx maintains**:
- `sessionData`: Current patient data
- `isProcessing`: View mode flag
- `isRefreshing`: Loading state

**State Flow**:
```typescript
// Parent → Child (Props)
<IdentificationPage onProceed={handleProceed} />

// Child → Parent (Callbacks)
const handleProceed = (id: string, file?: File) => {
  setSessionData({ id, file });
  setIsProcessing(true);
};
```

---

## API Integration

### API Client (`api.ts`)

**Base URL Detection**:
```typescript
const BASE_URL = import.meta.env.DEV 
  ? '/api'                          // Dev: proxy
  : 'http://35.159.51.22:8000';     // Prod: direct
```

### Available Methods

#### `getPatients()`
Fetch all patient IDs
```typescript
const patients = await api.getPatients();
// Returns: string[]
```

#### `getPatientRecord(patientId)`
Fetch patient record with prediction results
```typescript
const data = await api.getPatientRecord('AAA001');
// Returns: PatientRecord
```

#### `registerAndPredict(patientData, file)`
Register new patient and run prediction
```typescript
const result = await api.registerAndPredict({
  SEX: "1",
  AGE: "72",
  EDUCATION: "16",
  CDR: "0.5",
  MMSE: "24",
  APGEN1: "3",
  APGEN2: "4"
}, mriFile);
```

#### `predictPatient(patientId, file, tabularData?)`
Run prediction for existing patient
```typescript
const result = await api.predictPatient('AAA001', mriFile);
```

#### `refreshPatientAssets(patientId)`
Regenerate presigned URLs
```typescript
const refreshed = await api.refreshPatientAssets('AAA001');
```

---

## Styling

### Tailwind CSS

**Configuration** (`tailwind.config.js`):
```javascript
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        // ... custom colors
      }
    }
  }
}
```

### Global Styles (`index.css`)
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    /* ... CSS variables */
  }
}
```

### Common Patterns

**Card Layout**:
```tsx
<Card className="border-none shadow-xl bg-white">
  <CardContent className="p-8">
    {/* Content */}
  </CardContent>
</Card>
```

**Button Styles**:
```tsx
<button className="bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl px-4 py-2">
  Submit
</button>
```

**Gradient Background**:
```tsx
<div className="bg-gradient-to-r from-blue-600 to-purple-600">
  {/* Content */}
</div>
```

---

## Build & Deployment

### Production Build
```bash
npm run build
```

**Output**:
- Directory: `./dist`
- Contains: HTML, CSS, JS (minified)
- Ready for static hosting

### Build Configuration

**Vite Config** (`vite.config.ts`):
```typescript
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    minify: 'terser'
  }
})
```

### Deployment Options

#### Option 1: Static Hosting (S3/Netlify/Vercel)
```bash
npm run build
# Upload ./dist to hosting provider
```

#### Option 2: Docker
```bash
docker build -t neuroai-frontend .
docker run -p 5173:5173 neuroai-frontend
```

#### Option 3: Nginx
```nginx
server {
    listen 80;
    root /var/www/neuroai/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

---

## Configuration

### Environment Variables

Create `.env.local`:
```bash
# Backend API URL
VITE_API_URL=http://35.159.51.22:8000

# Debug mode
VITE_DEBUG=true
```

Access in code:
```typescript
const apiUrl = import.meta.env.VITE_API_URL;
```

### Vite Configuration (`vite.config.ts`)

**Key Settings**:
```typescript
export default defineConfig({
  server: {
    host: true,           // Listen on all interfaces
    port: 5173,           // Dev server port
    proxy: {              // API proxy for CORS
      '/api': {
        target: 'http://35.159.51.22:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
})
```

### TypeScript Configuration

**`tsconfig.json`**:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "jsx": "react-jsx",
    "strict": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

---

## Testing

### Manual Testing Checklist

**Identification Page**:
- [ ] Patient dropdown loads
- [ ] Can select patient
- [ ] File upload accepts .nii, .nii.gz, .zip
- [ ] File upload rejects other formats
- [ ] Drag & drop works
- [ ] "Open Dashboard" button works
- [ ] "Run New Scan" button works

**Processing Page (New Patient)**:
- [ ] All form fields validate correctly
- [ ] Submit button disabled until form valid
- [ ] Age validation (1-120)
- [ ] MMSE validation (0-30)
- [ ] Education validation (0-100)
- [ ] File upload works
- [ ] Analysis starts on submit
- [ ] Progress bar animates

**Processing Page (Existing Patient)**:
- [ ] MRI upload interface shows
- [ ] Can upload new scan
- [ ] Analysis starts immediately
- [ ] Progress updates

**Dashboard**:
- [ ] Patient info displays correctly
- [ ] Diagnosis card shows result
- [ ] Heatmap loads
- [ ] SHAP chart loads
- [ ] Alternative diagnoses show
- [ ] Refresh button works
- [ ] Download report generates HTML
- [ ] Back button returns to identification

### Browser Console
Check for:
- No console errors
- Network requests succeed (200 status)
- Images load correctly

---

## Common Issues & Solutions

### Issue 1: Port Already in Use
```bash
# Error: Port 5173 is already in use
# Solution: Kill process or use different port
npm run dev -- --port 5174
```

### Issue 2: Module Not Found
```bash
# Solution: Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Issue 3: Build Fails
```bash
# Solution: Check TypeScript errors
npm run build -- --mode development
```

### Issue 4: CORS Errors
```
# Solution: Ensure proxy is configured in vite.config.ts
# Or run backend with CORS enabled
```

### Issue 5: Images Not Loading
```
# Solution: Check browser console for 404s
# Click "Refresh Data" button
# Verify backend presigned URLs are valid
```

---

## Performance Optimization

### Code Splitting
Vite automatically splits code by routes.

### Lazy Loading
```typescript
const HeavyComponent = lazy(() => import('./HeavyComponent'));
```

### Image Optimization
- Use appropriate image formats (PNG for medical images)
- Implement lazy loading for images
- Consider WebP format for web delivery

### Bundle Size
Check bundle size:
```bash
npm run build
# Check dist/ folder size
```

---

## Accessibility

### Keyboard Navigation
- All interactive elements are keyboard accessible
- Tab order follows visual flow

### ARIA Labels
```tsx
<button aria-label="Refresh patient data">
  <RefreshCw className="w-4 h-4" />
</button>
```

### Color Contrast
- Text meets WCAG AA standards
- Important information not conveyed by color alone

---

## Browser Support

**Supported Browsers**:
- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

**Not Supported**:
- Internet Explorer (any version)

---

## Scripts Reference

```json
{
  "dev": "vite --host",              // Start dev server
  "build": "tsc -b && vite build",   // Production build
  "lint": "eslint .",                // Lint code
  "preview": "vite preview"          // Preview production build
}
```

---

## Additional Resources

- **React Docs**: https://react.dev
- **Vite Docs**: https://vitejs.dev
- **Tailwind CSS**: https://tailwindcss.com
- **Radix UI**: https://www.radix-ui.com
- **Lucide Icons**: https://lucide.dev

---

**Last Updated**: 2026-06-11  
**Version**: 1.0.0
