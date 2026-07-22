# Documentation Structure

This directory contains the core documentation for the LMU Medical Dashboard project.

## Core Documentation Files

### 📁 Architecture & Integration
- **INTEGRATION.md** - Complete system integration guide, API specifications, data flow
- **FRONTEND.md** - Frontend architecture, component structure, state management

### 📝 Change Logs
- **FRONTEND_CHANGES.md** - All frontend changes with detailed explanations
  - 3D Brain Visualization (June 15, 2026)
  - Simplified Patient Data Flow (June 15, 2026)
  - PDF Download Improvements (June 17, 2026)

- **BACKEND_CHANGES.md** - All backend changes with technical details
  - Fixed Patient Data Retrieval Bug (June 16, 2026)
  - GradCAM NIfTI Generation (June 16, 2026)
  - File Serving Endpoint (June 16, 2026)

## Quick Reference

### Latest Changes Summary

**Frontend** (June 17, 2026):
- ✅ Component-based PDF generation with smart page breaks
- ✅ Multiplanar MRI view included in PDF reports
- ✅ No content sliced across page boundaries
- ✅ Professional 4-page report layout

**Backend** (June 16, 2026):
- ✅ Fixed "No tabular data found" error for existing patients
- ✅ Properly aligned NIfTI files for 3D visualization
- ✅ Direct file streaming endpoint (no URL expiration)

**Overall Status**: ✅ Production Ready

### File Organization

```
docs/
├── INTEGRATION.md          # System-wide integration
├── FRONTEND.md             # Frontend architecture
├── FRONTEND_CHANGES.md     # Frontend change log
└── BACKEND_CHANGES.md      # Backend change log
```

## For Developers

- **Starting development?** → Read INTEGRATION.md
- **Frontend work?** → Check FRONTEND.md + FRONTEND_CHANGES.md
- **Backend work?** → Check BACKEND_CHANGES.md
- **What changed recently?** → Check the change log files (sorted by date)

---

**Last Updated:** June 17, 2026
