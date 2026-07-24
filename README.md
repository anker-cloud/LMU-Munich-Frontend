# NeuroAI Diagnostics — Frontend

A React + TypeScript dashboard for AI-assisted dementia diagnosis. It lets a clinician pick or register a patient, upload an MRI scan, run a prediction against the NeuroAI backend, and review the results — diagnosis confidence, an interactive 3D Grad-CAM brain overlay, SHAP feature explanations, and differential diagnoses — with a one-click PDF report export.

## Tech Stack

- **React 18** + **TypeScript**, built with **Vite 6**
- **Tailwind CSS 4** + **Radix UI** primitives (`select`, `progress`, `slot`) for the component layer
- **@niivue/niivue** for interactive 3D NIfTI (MRI/Grad-CAM overlay) rendering
- **Recharts** for SHAP / probability charts
- **jsPDF** + **html2canvas-pro** for client-side PDF report generation
- **Axios** for API calls

## Project Structure

```
.
├── docker-compose.yml       # Local dev container for the frontend
├── FRONTEND.md              # Detailed frontend architecture reference
└── frontend/
    ├── dockerfile            # Dev image (npm run dev)
    ├── Dockerfile.prod       # Production build image
    ├── nginx.conf            # Nginx config for serving the prod build
    ├── vite.config.ts        # Dev server (port 5174) + /api proxy config
    └── src/
        ├── main.tsx          # App entry point
        ├── app/
        │   ├── App.tsx           # Root component: routing/state + dashboard layout + PDF export
        │   ├── api.ts            # Axios client for the NeuroAI backend
        │   ├── types.ts          # Shared TypeScript types
        │   ├── pages/
        │   │   ├── IdentificationPage.tsx   # Patient select / new-patient upload entry point
        │   │   └── ProcessingPage.tsx       # Clinical data form + analysis progress
        │   └── components/
        │       ├── PatientInfo.tsx          # Patient metadata card
        │       ├── DiagnosisCard.tsx        # Primary diagnosis + confidence
        │       ├── MRIViewer3D.tsx          # Niivue-based 3D MRI/Grad-CAM viewer
        │       ├── MRIHeatmap.tsx           # 2D Grad-CAM heatmap image
        │       ├── ShapValues.tsx           # SHAP explainability chart
        │       ├── AlternativeDiagnoses.tsx # Differential diagnosis probabilities
        │       └── ui/                      # Base UI primitives (button, card, select, progress)
        └── styles/           # Tailwind, theme, and font styles
```

See [`FRONTEND.md`](./FRONTEND.md) for a deeper walkthrough of components, state flow, and styling conventions.

## Application Flow

```
IdentificationPage → ProcessingPage → Dashboard (App.tsx)
   (select/upload)     (clinical data       (diagnosis, 3D Grad-CAM,
                       + MRI, run predict)    SHAP, alt. diagnoses, PDF export)
```

All state is local to `App.tsx` (`useState`) — there is no global store or router; navigation is driven by whether `sessionData` and `isProcessing` are set.

## Getting Started

### Prerequisites
- Node.js 18+
- npm 9+

### Install & Run
```bash
cd frontend
npm install
npm run dev
```
The dev server runs at **http://localhost:5174** and proxies `/api/*` requests to the backend.

### Build for Production
```bash
cd frontend
npm run build     # outputs to frontend/dist
npm run preview   # preview the production build locally
```

## Backend

This repo contains **only the frontend**. It talks to the NeuroAI FastAPI backend, [`Lmu_munich`](https://github.com/anker-cloud/Lmu_munich), which by default runs at `http://35.159.51.22:8000` (see `frontend/src/app/api.ts`). In dev, Vite proxies `/api` to that host (`frontend/vite.config.ts`); in production the frontend calls it directly.

To run the backend locally instead:
```bash
git clone https://github.com/anker-cloud/Lmu_munich.git
cd Lmu_munich
pip install -r requirements.txt
python -m uvicorn api:app --host 0.0.0.0 --port 8000 --reload
```
Then update the target URL in `vite.config.ts` / `api.ts` to point at your local backend.

## Docker

Run the frontend dev server in a container:
```bash
docker compose up
```
This builds `frontend/dockerfile`, mounts the source for hot reload, and exposes port `5174`. `Dockerfile.prod` + `nginx.conf` are available for building/serving a production image.

## Key Backend Endpoints Used

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/patients` | List known patient IDs |
| `GET` | `/patient/{id}` | Fetch a patient's record + latest prediction |
| `POST` | `/patient/register-and-predict` | Register a new patient (tabular data + MRI) and run prediction |
| `POST` | `/patient/{id}/predict` | Run a new scan/prediction for an existing patient |
| `GET` | `/patient/{id}/file/{filename}` | Direct file streaming for heatmaps, SHAP charts, and NIfTI volumes |

## Notes

- MRI uploads accept `.nii`, `.nii.gz`, and `.zip`.
- The downloadable PDF report captures the live dashboard DOM (patient info, diagnosis, differential diagnoses, SHAP) via `html2canvas-pro`; the 3D MRI viewer is intentionally excluded from the report.
