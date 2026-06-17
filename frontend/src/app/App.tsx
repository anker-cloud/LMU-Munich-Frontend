import { useState, useEffect } from 'react';
import { Brain, Download, ArrowLeft, RefreshCw } from 'lucide-react';
import { PatientInfo } from './components/PatientInfo';
import { DiagnosisCard } from './components/DiagnosisCard';
import { MRIViewer3D } from './components/MRIViewer3D';
import { ShapValues } from './components/ShapValues';
import { AlternativeDiagnoses } from './components/AlternativeDiagnoses';
import { IdentificationPage } from './pages/IdentificationPage';
import { ProcessingPage } from './pages/ProcessingPage';
import { api } from './api';

export default function App() {
  const [sessionData, setSessionData] = useState<any | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showRefreshSuccess, setShowRefreshSuccess] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [imagesLoaded, setImagesLoaded] = useState({ heatmap: false, shap: false, mri3d: false });
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Suppress harmless Niivue resize errors
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      // Suppress known harmless Niivue canvas errors
      if (event.message?.includes("Cannot use 'in' operator to search for 'width'") ||
          event.message?.includes('resizeListener')) {
        event.preventDefault();
        console.log('[App] Suppressed harmless Niivue resize error');
        return true;
      }
    };

    window.addEventListener('error', handleError);
    return () => {
      window.removeEventListener('error', handleError);
    };
  }, []);

  // Check if images exist and mark as loaded if they don't (must be before early returns)
  useEffect(() => {
    if (!sessionData) return;

    // Extract objects to check
    const dataToDisplay = sessionData.prediction || sessionData.last_prediction || sessionData;
    const shapObject = extractObject(dataToDisplay, "shap");
    const gradcamObject = extractObject(dataToDisplay, "gradcam");

    // Mark as loaded if images don't exist
    if (!gradcamObject?.heatmap_png) {
      setImagesLoaded(prev => ({ ...prev, heatmap: true }));
    }
    if (!shapObject?.chart_path) {
      setImagesLoaded(prev => ({ ...prev, shap: true }));
    }
    if (!gradcamObject?.mri_nifti_url) {
      setImagesLoaded(prev => ({ ...prev, mri3d: true }));
    }
  }, [sessionData, refreshKey]);

  function extractObject(obj: any, targetKey: string): any {
    if (!obj || typeof obj !== 'object') return undefined;
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const res = extractObject(item, targetKey);
        if (res) return res;
      }
      return undefined;
    }
    for (const key of Object.keys(obj)) {
      if (key.toLowerCase() === targetKey.toLowerCase() && typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
        return obj[key];
      }
    }
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        const res = extractObject(obj[key], targetKey);
        if (res) return res;
      }
    }
    return undefined;
  }

  const handleProceed = async (id: string, file?: File) => {
    if (file) {
      // New patient with file - go to processing to enter clinical data
      setSessionData({ id, file });
      setIsProcessing(true);
    } else {
      // Existing patient - fetch their record (includes prediction if available)
      try {
        const data = await api.getPatientRecord(id);

        // Check if patient has stored prediction results
        if (data.prediction || data.last_prediction) {
          // Has existing results - show dashboard directly
          // Note: Presigned URLs may be stale; user can refresh using the refresh button
          setSessionData(data);
          setIsProcessing(false);
        } else {
          // No results yet - need to upload MRI and run prediction
          setSessionData({ id });
          setIsProcessing(true);
        }
      } catch (error) {
        console.error("Failed to fetch patient record:", error);
      }
    }
  };

  const handleAnalysisComplete = async (backendResult: any) => {
    // Strategy: Get the most recently registered patient from the list, then fetch their full record
    // This avoids race conditions where the patient record might not be immediately available

    // Helper function to wait
    const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    try {
      let patientId = backendResult?.patient_id;
      let retries = 3;

      // If backend provided patient_id, try to fetch directly
      if (patientId) {
        console.log('Backend returned patient ID:', patientId);

        // Retry fetching patient record (in case it's not immediately available)
        while (retries > 0) {
          try {
            const fullRecord = await api.getPatientRecord(patientId);
            setSessionData(fullRecord);
            console.log('✅ Full patient record loaded successfully');
            setIsProcessing(false);
            return;
          } catch (error) {
            console.warn(`Attempt ${4 - retries}/3: Patient record not ready yet, retrying...`);
            retries--;
            if (retries > 0) {
              await wait(1000); // Wait 1 second before retry
            }
          }
        }
      }

      // Fallback: Get most recent patient from list
      console.log('Fetching most recent patient from list...');
      const patientList = await api.getPatients();

      if (patientList && patientList.length > 0) {
        const mostRecentPatientId = patientList[patientList.length - 1];
        console.log('Most recent patient ID from list:', mostRecentPatientId);

        const fullRecord = await api.getPatientRecord(mostRecentPatientId);
        setSessionData(fullRecord);
        console.log('✅ Full patient record loaded from most recent patient');
      } else {
        // Last resort: use backend result directly
        console.warn('⚠️ No patients in list, using backend result directly');
        setSessionData(backendResult);
      }
    } catch (error) {
      console.error("❌ Failed to fetch patient record:", error);
      // Last resort fallback: use backend result directly
      setSessionData(backendResult);
    }

    setIsProcessing(false);
  };

  const handleReset = () => {
    setSessionData(null);
    setIsProcessing(false);
    setImagesLoaded({ heatmap: false, shap: false, mri3d: false });
  };

  const handleRefresh = async () => {
    if (!sessionData?.patient_id && !sessionData?.id) return;

    setIsRefreshing(true);
    setShowRefreshSuccess(false);

    try {
      const patientId = sessionData.patient_id || sessionData.id;
      const data = await api.getPatientRecord(patientId);

      // Force cache bust by incrementing refresh key
      setRefreshKey(prev => prev + 1);
      setSessionData(data);
      setImagesLoaded({ heatmap: false, shap: false, mri3d: false });

      // Show success toast briefly
      setShowRefreshSuccess(true);
      setTimeout(() => setShowRefreshSuccess(false), 2000);
    } catch (error) {
      console.error("Failed to refresh patient data:", error);
      alert("Failed to refresh patient data. Please try again.");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDownloadReport = async () => {
    if (!sessionData) return;

    // Check if all images are loaded
    const allLoaded = imagesLoaded.heatmap && imagesLoaded.shap && imagesLoaded.mri3d;
    if (!allLoaded) {
      return; // Button should be disabled, but extra safety check
    }

    setIsGeneratingPdf(true);

    try {
      console.log('[PDF] Starting PDF generation...');
      const { jsPDF } = await import('jspdf');
      const html2canvas = (await import('html2canvas')).default;
      console.log('[PDF] Libraries loaded');

    const dataToDisplay = sessionData.prediction || sessionData.last_prediction || sessionData;
    const patientId = extractPrimitive(sessionData, "patient_id") || extractPrimitive(sessionData, "id") || "UNKNOWN";
    const primaryDiag = extractPrimitive(dataToDisplay, "prediction") || extractPrimitive(dataToDisplay, "diagnosis") || "N/A";
    const modelEngineUsed = extractPrimitive(dataToDisplay, "model_used") || "TAB T1w";
    const probabilitiesMap = extractObject(dataToDisplay, "probabilities");
    const rawConfidence = probabilitiesMap && primaryDiag ? (probabilitiesMap[primaryDiag] ?? 0) : 0;
    const confidencePercentage = Math.round(rawConfidence * 100);

    const ageValue = extractPrimitive(dataToDisplay, "age");
    const genderValue = extractPrimitive(dataToDisplay, "sex") || extractPrimitive(dataToDisplay, "gender");
    const educationValue = extractPrimitive(dataToDisplay, "education");
    const cdrValue = extractPrimitive(dataToDisplay, "cdr");
    const mmseValue = extractPrimitive(dataToDisplay, "mmse");
    const apgen1Value = extractPrimitive(dataToDisplay, "apgen1");
    const apgen2Value = extractPrimitive(dataToDisplay, "apgen2");

    const shapObject = extractObject(dataToDisplay, "shap");
    const gradcamObject = extractObject(dataToDisplay, "gradcam");

    // Capture MRI slices canvas directly from the MRIViewer3D component
    let mriImageData = '';
    const mriCanvas = document.querySelector('canvas') as HTMLCanvasElement;
    if (mriCanvas) {
      try {
        mriImageData = mriCanvas.toDataURL('image/png', 1.0);
      } catch (err) {
        console.warn('Could not capture MRI canvas:', err);
      }
    }

    // Capture individual components for better page layout control
    const captureComponent = async (selector: string): Promise<string | null> => {
      const element = document.querySelector(selector);
      if (!element) return null;
      try {
        const canvas = await html2canvas(element as HTMLElement, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
        });
        return canvas.toDataURL('image/png', 0.95);
      } catch (err) {
        console.warn(`Could not capture ${selector}:`, err);
        return null;
      }
    };

    // Capture heatmap and SHAP images as high quality (if they're img elements on page)
    let heatmapImage = gradcamObject?.heatmap_png || '';
    let shapImage = shapObject?.chart_path || '';

      // Initialize PDF with proper settings
      console.log('[PDF] Initializing jsPDF...');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true
      });
      console.log('[PDF] jsPDF initialized successfully');

      const pageWidth = 210; // A4 width in mm
      const pageHeight = 297; // A4 height in mm
      const margin = 15;
      const contentWidth = pageWidth - (2 * margin);
      let yPos = margin;

      // Helper: Add text with wrapping
      const addText = (text: string, fontSize: number, isBold: boolean = false, color: [number, number, number] = [0, 0, 0]) => {
        pdf.setFontSize(fontSize);
        pdf.setFont('helvetica', isBold ? 'bold' : 'normal');
        pdf.setTextColor(...color);
        const lines = pdf.splitTextToSize(text, contentWidth);
        const textHeight = lines.length * fontSize * 0.35;

        // Check if we need a new page
        if (yPos + textHeight > pageHeight - margin) {
          pdf.addPage();
          yPos = margin;
        }

        pdf.text(lines, margin, yPos);
        yPos += textHeight + 3;
      };

      // Helper: Add image with aspect ratio preservation
      const addImage = (imgData: string, maxHeight: number = 80, caption?: string, darkBg: boolean = false) => {
        if (!imgData) {
          console.log('addImage called with empty imgData');
          return;
        }

        try {
          // Use default dimensions that work well for jsPDF
          // jsPDF will handle aspect ratio automatically
          let imgWidth = contentWidth;
          let imgHeight = maxHeight;

          // Check if we need a new page (image + caption)
          const totalHeight = imgHeight + (caption ? 15 : 0) + (darkBg ? 10 : 0);
          if (yPos + totalHeight > pageHeight - margin) {
            pdf.addPage();
            yPos = margin;
          }

          // Add dark background if requested
          if (darkBg) {
            pdf.setFillColor(15, 23, 42); // slate-900
            pdf.rect(margin, yPos, contentWidth, imgHeight + 10, 'F');
            yPos += 5;
          }

          // Center image horizontally
          const xPos = margin + (contentWidth - imgWidth) / 2;

          // Add image - jsPDF will auto-detect format and handle dimensions
          pdf.addImage(imgData, 'PNG', xPos, yPos, imgWidth, imgHeight, undefined, 'FAST');
          yPos += imgHeight + 5;

          // Add caption if provided
          if (caption) {
            pdf.setFontSize(9);
            pdf.setTextColor(148, 163, 184); // slate-400
            const captionLines = pdf.splitTextToSize(caption, contentWidth);
            // Center-align caption manually
            captionLines.forEach((line: string) => {
              const lineWidth = pdf.getTextWidth(line);
              const xPosCap = margin + (contentWidth - lineWidth) / 2;
              pdf.text(line, xPosCap, yPos);
              yPos += 4;
            });
            yPos += 1;
          }

          if (darkBg) yPos += 5;
          yPos += 5;
        } catch (err) {
          console.error('Error adding image to PDF:', err);
          // Skip this image and continue
        }
      };

      // Helper: Add section header
      const addSectionHeader = (title: string) => {
        // Ensure section header stays with content (don't add at bottom of page)
        if (yPos > pageHeight - margin - 20) {
          pdf.addPage();
          yPos = margin;
        }

        pdf.setFillColor(37, 99, 235); // blue-600
        pdf.rect(margin, yPos, 3, 6, 'F');
        pdf.setFontSize(14);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(15, 23, 42);
        pdf.text(title, margin + 6, yPos + 4.5);
        yPos += 12;
      };

      // Helper: Add box with gradient simulation
      const addColoredBox = (content: { title: string; subtitle?: string; body?: string }, bgColor: [number, number, number]) => {
        const boxHeight = 35;

        // Check space
        if (yPos + boxHeight > pageHeight - margin) {
          pdf.addPage();
          yPos = margin;
        }

        pdf.setFillColor(...bgColor);
        pdf.roundedRect(margin, yPos, contentWidth, boxHeight, 3, 3, 'F');

        // Add text in white
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(16);
        pdf.setFont('helvetica', 'bold');
        pdf.text(content.title, margin + 5, yPos + 8);

        if (content.subtitle) {
          pdf.setFontSize(24);
          pdf.setFont('helvetica', 'bold');
          pdf.text(content.subtitle, margin + 5, yPos + 20);
        }

        if (content.body) {
          pdf.setFontSize(9);
          pdf.setFont('helvetica', 'normal');
          const lines = pdf.splitTextToSize(content.body, contentWidth - 10);
          pdf.text(lines, margin + 5, yPos + 10);
        }

        yPos += boxHeight + 8;
      };

      // ===== PAGE 1: Header + Patient Info + Diagnosis =====
      console.log('[PDF] Starting Page 1...');

      // Header
      pdf.setFillColor(37, 99, 235);
      pdf.rect(0, 0, pageWidth, 25, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(20);
      pdf.setFont('helvetica', 'bold');
      pdf.text('🧠 NeuroAI Diagnostics Report', margin, 12);
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text('AI-Powered Dementia Differential Diagnosis System', margin, 19);
      yPos = 35;

      // Metadata bar
      pdf.setFillColor(241, 245, 249);
      pdf.rect(margin, yPos, contentWidth, 15, 'F');
      pdf.setTextColor(51, 65, 85);
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`Patient ID: ${patientId}`, margin + 3, yPos + 5);
      pdf.text(`Report Generated: ${new Date().toLocaleString()}`, margin + 3, yPos + 10);

      // Right-aligned model text
      const modelText = `Model: ${modelEngineUsed}`;
      const modelTextWidth = pdf.getTextWidth(modelText);
      pdf.text(modelText, pageWidth - margin - modelTextWidth - 3, yPos + 5);
      yPos += 20;

      // Patient Information
      addSectionHeader('Patient Information');
      const patientInfoData = [
        [`Age: ${ageValue || 'N/A'} years`, `Sex: ${genderValue || 'N/A'}`],
        [`Education: ${educationValue || 'N/A'} years`, `CDR Score: ${cdrValue ?? 'N/A'}`],
        [`MMSE Score: ${mmseValue || 'N/A'}`, `APOE: ε${apgen1Value || '?'}/ε${apgen2Value || '?'}`]
      ];

      patientInfoData.forEach(([left, right]) => {
        if (yPos > pageHeight - margin - 10) {
          pdf.addPage();
          yPos = margin;
        }
        pdf.setFillColor(248, 250, 252);
        pdf.roundedRect(margin, yPos, contentWidth / 2 - 2, 12, 2, 2, 'F');
        pdf.roundedRect(margin + contentWidth / 2 + 2, yPos, contentWidth / 2 - 2, 12, 2, 2, 'F');

        pdf.setFontSize(10);
        pdf.setTextColor(15, 23, 42);
        pdf.setFont('helvetica', 'bold');
        pdf.text(left, margin + 3, yPos + 8);
        pdf.text(right, margin + contentWidth / 2 + 5, yPos + 8);
        yPos += 15;
      });
      yPos += 5;

      // Primary Diagnosis
      addSectionHeader('Primary Diagnosis');
      addColoredBox({
        title: primaryDiag,
        subtitle: `${confidencePercentage}% Confidence`,
        body: `Model: ${modelEngineUsed}`
      }, [37, 99, 235]); // blue-600

      // Diagnostic Explainability
      addSectionHeader('Diagnostic Explainability');
      addColoredBox({
        title: 'Machine Learning Interpretation',
        body: 'This section interprets the machine learning pipeline\'s weights. It renders spatial tissue structural metrics through Grad-CAM visual overlays along with SHAP clinical contribution indices. The model analyzes MRI scan features combined with clinical parameters to provide a comprehensive diagnostic assessment.'
      }, [124, 58, 237]); // purple-600

      // ===== PAGE 2: MRI Heatmap + Multiplanar View =====
      console.log('[PDF] Starting Page 2...');
      pdf.addPage();
      yPos = margin;

      addSectionHeader('MRI T1w with Attention Heatmap');
      if (heatmapImage) {
        addImage(heatmapImage, 90, 'Grad-CAM++ Attention Heatmap - Brain regions contributing to the diagnosis', true);
      } else {
        addText('MRI heatmap visualization not available', 10, false, [100, 116, 139]);
      }

      addSectionHeader('MRI T1-weighted Multiplanar Slices');
      if (mriImageData) {
        addImage(mriImageData, 90, 'MRI T1-weighted slices with Grad-CAM overlay (Axial, Sagittal, Coronal views)', true);
      } else {
        addText('MRI multiplanar view not available', 10, false, [100, 116, 139]);
      }

      // ===== PAGE 3: Differential Diagnoses + SHAP =====
      pdf.addPage();
      yPos = margin;

      addSectionHeader('Differential Diagnoses');
      if (probabilitiesMap) {
        const sortedProbs = Object.entries(probabilitiesMap)
          .sort((a, b) => {
            const aVal = typeof a[1] === 'number' ? a[1] : 0;
            const bVal = typeof b[1] === 'number' ? b[1] : 0;
            return bVal - aVal;
          });

        sortedProbs.forEach(([diag, prob]) => {
          if (yPos > pageHeight - margin - 10) {
            pdf.addPage();
            yPos = margin;
          }

          const isHighlight = diag === primaryDiag;

          // Set background color based on highlight
          if (isHighlight) {
            pdf.setFillColor(219, 234, 254); // blue-100
          } else {
            pdf.setFillColor(248, 250, 252); // slate-50
          }
          pdf.roundedRect(margin, yPos, contentWidth, 10, 2, 2, 'F');

          // Add blue accent bar for highlighted item
          if (isHighlight) {
            pdf.setFillColor(37, 99, 235); // blue-600
            pdf.rect(margin, yPos, 2, 10, 'F');
          }

          pdf.setFontSize(10);
          pdf.setTextColor(15, 23, 42);

          if (isHighlight) {
            pdf.setFont('helvetica', 'bold');
          } else {
            pdf.setFont('helvetica', 'normal');
          }

          pdf.text(diag, margin + 4, yPos + 6.5);

          // Right-aligned text
          const probValue = typeof prob === 'number' ? prob : 0;
          const probText = `${Math.round(probValue * 100)}%`;
          const probTextWidth = pdf.getTextWidth(probText);
          pdf.text(probText, pageWidth - margin - probTextWidth, yPos + 6.5);
          yPos += 12;
        });
      } else {
        addText('No differential diagnoses data available', 10, false, [100, 116, 139]);
      }
      yPos += 5;

      // SHAP Values
      if (shapObject?.features) {
        addSectionHeader('SHAP Values (Feature Importance)');
        addText('SHAP (SHapley Additive exPlanations) values indicate the contribution of each clinical feature to the model\'s prediction.', 9, false, [100, 116, 139]);

        shapObject.features.forEach((f: any) => {
          if (yPos > pageHeight - margin - 8) {
            pdf.addPage();
            yPos = margin;
          }

          pdf.setFillColor(241, 245, 249);
          pdf.roundedRect(margin, yPos, contentWidth, 8, 2, 2, 'F');

          pdf.setFontSize(9);
          pdf.setTextColor(51, 65, 85);
          pdf.setFont('helvetica', 'bold');
          pdf.text(f.feature, margin + 3, yPos + 5.5);

          pdf.setFont('helvetica', 'normal');
          const shapColor: [number, number, number] = f.shap > 0 ? [22, 163, 74] : [220, 38, 38];
          pdf.setTextColor(...shapColor);

          // Right-aligned SHAP value
          const shapText = `SHAP: ${f.shap.toFixed(4)}`;
          const shapTextWidth = pdf.getTextWidth(shapText);
          pdf.text(shapText, pageWidth - margin - shapTextWidth - 3, yPos + 5.5);
          yPos += 10;
        });

        yPos += 3;
        if (shapImage) {
          addImage(shapImage, 80, 'SHAP values visualization chart');
        }
      }

      // ===== PAGE 4: Clinical Disclaimer + Footer =====
      if (yPos > pageHeight - margin - 50) {
        pdf.addPage();
        yPos = margin;
      }

      addSectionHeader('Clinical Protocol Considerations');
      pdf.setFillColor(254, 243, 199); // amber-100
      pdf.roundedRect(margin, yPos, contentWidth, 30, 3, 3, 'F');
      pdf.setFillColor(245, 158, 11); // amber-500
      pdf.rect(margin, yPos, 3, 30, 'F');
      pdf.setTextColor(146, 64, 14); // amber-900
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      const disclaimerText = 'Platform outputs trace directly to diagnostic support algorithms utilizing cloud resources. These indicators represent mathematical inferences and do not supersede qualified professional medical evaluations. All clinical decisions must be made by licensed healthcare professionals in consultation with comprehensive patient history, physical examination, and additional diagnostic testing as appropriate.';
      const disclaimerLines = pdf.splitTextToSize(disclaimerText, contentWidth - 12);
      pdf.text(disclaimerLines, margin + 8, yPos + 7);
      yPos += 35;

      // Footer
      pdf.setDrawColor(226, 232, 240);
      pdf.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 5;
      pdf.setFontSize(8);
      pdf.setTextColor(100, 116, 139);
      pdf.setFont('helvetica', 'bold');
      pdf.text('⚠️ Medical Disclaimer:', margin, yPos);
      pdf.setFont('helvetica', 'normal');
      pdf.text('This AI-generated report is for diagnostic support only and does not replace professional medical evaluation.', margin, yPos + 4);
      pdf.text(`Generated by NeuroAI Diagnostics Platform | © ${new Date().getFullYear()}`, margin, yPos + 8);

      // Download PDF
      console.log('[PDF] Saving PDF...');
      const filename = `NeuroAI_Report_${patientId}_${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(filename);
      console.log('[PDF] PDF saved successfully:', filename);
    } catch (error) {
      console.error('Failed to generate PDF:', error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      console.error('Error message:', error instanceof Error ? error.message : String(error));
      alert(`Failed to generate PDF report. Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleAddScan = async (id: string, file: File) => {
    // For existing patient with new scan - fetch their record first to get clinical data
    try {
      const patientRecord = await api.getPatientRecord(id);
      console.log('Fetched patient record for add scan:', patientRecord);

      // Extract patient_info from the record
      const patientInfo = patientRecord?.prediction?.patient_info || patientRecord?.patient_info;
      console.log('Extracted patient_info for add scan:', patientInfo);

      // Transform patient_info to tabular format (numeric values) that backend expects
      let tabularData = null;
      if (patientInfo) {
        tabularData = {
          SEX: patientInfo.sex === "Male" || patientInfo.sex === 1 ? 1 : 2,
          AGE: Number(patientInfo.age) || 0,
          EDUCATION: Number(patientInfo.education) || 0,
          CDR: Number(patientInfo.cdr) || 0,
          MMSE: Number(patientInfo.mmse) || 0,
          APGEN1: Number(patientInfo.apgen1) || 0,
          APGEN2: Number(patientInfo.apgen2) || 0
        };
        console.log('Transformed tabular data for add scan:', tabularData);
      }

      // Set session data with the patient's existing clinical data
      setSessionData({ id, file, isAddingScan: true, tabular: tabularData });
      setIsProcessing(true);
    } catch (error) {
      console.error("Failed to fetch patient record for add scan:", error);
      // Fallback: proceed without pre-fetched data (backend will try to find it)
      setSessionData({ id, file, isAddingScan: true });
      setIsProcessing(true);
    }
  };

  const handleRunNewScan = async (id: string) => {
    // For existing patient - fetch their record first to get clinical data
    // This avoids the S3 tabular data lookup issue in the backend
    try {
      const patientRecord = await api.getPatientRecord(id);
      console.log('Fetched patient record for new scan:', patientRecord);

      // Extract patient_info from the record
      const patientInfo = patientRecord?.prediction?.patient_info || patientRecord?.patient_info;
      console.log('Extracted patient_info for new scan:', patientInfo);

      // Transform patient_info to tabular format if available
      const tabularData = patientInfo ? {
        SEX: patientInfo.sex === 'Male' ? 1 : 2,
        AGE: patientInfo.age,
        EDUCATION: patientInfo.education,
        CDR: patientInfo.cdr,
        MMSE: patientInfo.mmse,
        APGEN1: patientInfo.apgen1,
        APGEN2: patientInfo.apgen2,
      } : null;

      console.log('Transformed tabular data for new scan:', tabularData);

      setSessionData({
        id,
        patient_id: id,
        tabular: tabularData
      });
      setIsProcessing(true);
    } catch (error) {
      console.error('Failed to fetch patient record:', error);
      // Proceed anyway - let backend try S3 lookup
      setSessionData({ id, patient_id: id });
      setIsProcessing(true);
    }
  };

  if (!sessionData) {
    return <IdentificationPage onProceed={handleProceed} onAddScan={handleAddScan} onRunNewScan={handleRunNewScan} />;
  }

  if (isProcessing) {
    return (
      <ProcessingPage
        patientId={sessionData.id}
        file={sessionData.file}
        isAddingScan={sessionData.isAddingScan}
        existingTabularData={sessionData.tabular}
        onComplete={handleAnalysisComplete}
        onBack={handleReset}
      />
    );
  }

  // =========================================================================
  // 🔍 RECURSIVE DEEP-SCANNING ENGINE (IMMUNE TO BACKEND WRAPPING VARIATIONS)
  // =========================================================================
  function extractPrimitive(obj: any, targetKey: string): any {
    if (!obj) return undefined;
    
    // Handle array wrapping seamlessly if endpoint returns a list of history records
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const res = extractPrimitive(item, targetKey);
        if (res !== undefined) return res;
      }
      return undefined;
    }
    
    if (typeof obj !== 'object') return undefined;
    
    // 1. Case-insensitive lookup at the current depth level[cite: 1]
    for (const key of Object.keys(obj)) {
      if (key.toLowerCase() === targetKey.toLowerCase()) {
        if (typeof obj[key] !== 'object' || obj[key] === null) {
          return obj[key];
        }
      }
    }
    
    // 2. Recurse deeper down the JSON tree object branches
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'object' && obj[key] !== null) {
        const res = extractPrimitive(obj[key], targetKey);
        if (res !== undefined) return res;
      }
    }
    return undefined;
  }

  // Handle prediction wrapper from GET /patient/{id} endpoint
  const dataToDisplay = sessionData.prediction || sessionData.last_prediction || sessionData;

  // Extract Patient ID parameters safely
  const patientId = extractPrimitive(sessionData, "patient_id") || extractPrimitive(sessionData, "id") || "N/A";

  // Extract Clinical Metadata Variables - check patient_info first, then fall back to flat structure
  const patientInfoObj = extractObject(dataToDisplay, "patient_info");
  const ageValue = patientInfoObj?.age ?? extractPrimitive(dataToDisplay, "age");
  const genderValue = patientInfoObj?.sex ?? (extractPrimitive(dataToDisplay, "sex") || extractPrimitive(dataToDisplay, "gender"));
  const educationValue = patientInfoObj?.education ?? extractPrimitive(dataToDisplay, "education");
  const cdrValue = patientInfoObj?.cdr ?? extractPrimitive(dataToDisplay, "cdr");
  const mmseValue = patientInfoObj?.mmse ?? extractPrimitive(dataToDisplay, "mmse");
  const apgen1Value = patientInfoObj?.apgen1 ?? extractPrimitive(dataToDisplay, "apgen1");
  const apgen2Value = patientInfoObj?.apgen2 ?? extractPrimitive(dataToDisplay, "apgen2");

  // Extract Machine Learning Architecture Elements cleanly
  const primaryDiag = extractPrimitive(dataToDisplay, "prediction") || extractPrimitive(dataToDisplay, "diagnosis") || "";
  const modelEngineUsed = extractPrimitive(dataToDisplay, "model_used") || extractPrimitive(dataToDisplay, "model used") || "TAB T1w";

  const probabilitiesMap = extractObject(dataToDisplay, "probabilities");
  const rawConfidence = probabilitiesMap && primaryDiag ? (probabilitiesMap[primaryDiag] ?? 0) : 0;
  const confidencePercentage = Math.round(rawConfidence * 100);

  // Extract gradcam and shap objects
  let gradcamObject = extractObject(dataToDisplay, "gradcam");
  let shapObject = extractObject(dataToDisplay, "shap");

  // NEW: Use direct file streaming endpoint (no presigned URLs!)
  // Backend now serves files directly at: /patient/{patient_id}/file/{filename}
  const BASE_URL = import.meta.env.DEV ? '/api' : 'http://35.159.51.22:8000';

  let directHeatmapUrl: string | undefined;
  let directShapUrl: string | undefined;
  let directMriNiftiUrl: string | undefined;
  let directOverlayNiftiUrl: string | undefined;

  if (patientId && patientId !== "N/A") {
    // Add cache-busting timestamp to force browser to reload images
    const cacheBust = `?t=${refreshKey}`;
    directHeatmapUrl = `${BASE_URL}/patient/${patientId}/file/${patientId}_heatmap.png${cacheBust}`;
    directShapUrl = `${BASE_URL}/patient/${patientId}/file/${patientId}_shap.png${cacheBust}`;
    // Different patients have different scan types
    // Try FLAIR first (common for lesion detection), then T1w (common anatomical)
    // Skip preprocessed - some are corrupted/too small
    directMriNiftiUrl = `${BASE_URL}/patient/${patientId}/file/${patientId}_flair.nii.gz${cacheBust}`;
    // Backend saves gradcam with original_stem prefix (usually "scan")
    directOverlayNiftiUrl = `${BASE_URL}/patient/${patientId}/file/${patientId}_gradcam.nii.gz${cacheBust}`;
  }

  // Use direct streaming URLs (bypasses presigned URL expiration issues)
  if (directHeatmapUrl) {
    gradcamObject = { ...gradcamObject, heatmap_png: directHeatmapUrl };
  }
  if (directShapUrl) {
    shapObject = { ...shapObject, chart_path: directShapUrl };
  }
  if (directMriNiftiUrl) {
    gradcamObject = { ...gradcamObject, mri_nifti_url: directMriNiftiUrl };
  }
  if (directOverlayNiftiUrl) {
    gradcamObject = { ...gradcamObject, overlay_nifti_url: directOverlayNiftiUrl };
  }

  // Debug: Log all gradcam URLs
  console.log('[Dashboard] ========================================');
  console.log('[Dashboard] Patient ID:', patientId);
  console.log('[Dashboard] MRI URL:', gradcamObject?.mri_nifti_url);
  console.log('[Dashboard] Overlay URL:', gradcamObject?.overlay_nifti_url);
  console.log('[Dashboard] Heatmap PNG:', gradcamObject?.heatmap_png);
  console.log('[Dashboard] Direct Overlay URL constructed:', directOverlayNiftiUrl);
  console.log('[Dashboard] ========================================');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Refresh Success Toast - subtle notification only */}
      {showRefreshSuccess && (
        <div className="fixed top-24 right-6 z-50 bg-green-600 text-white px-6 py-3 rounded-lg shadow-xl animate-in slide-in-from-top duration-300 flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="font-semibold">Data refreshed successfully!</span>
        </div>
      )}

      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button 
                onClick={handleReset}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors mr-1"
              >
                <ArrowLeft className="w-5 h-5 text-gray-500" />
              </button>
              <div className="p-2 bg-blue-600 rounded-lg">
                <Brain className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">NeuroAI Diagnostics</h1>
                <p className="text-sm text-gray-500 font-medium">AI-Powered Dementia Diagnostic System</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all font-bold text-sm shadow-md disabled:opacity-70 disabled:cursor-not-allowed"
                title="Refresh patient data and reload images"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh Data
              </button>
              <button
                onClick={handleReset}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 transition-all font-bold text-sm shadow-md"
              >
                <ArrowLeft className="w-4 h-4" /> View Another
              </button>
              <div className="relative group">
                <button
                  onClick={handleDownloadReport}
                  disabled={!imagesLoaded.heatmap || !imagesLoaded.shap || !imagesLoaded.mri3d || isGeneratingPdf}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all font-bold text-sm shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download className={`w-4 h-4 ${isGeneratingPdf ? 'animate-bounce' : ''}`} />
                  {isGeneratingPdf ? 'Generating PDF...' : 'Download Report'}
                </button>
                {(!imagesLoaded.heatmap || !imagesLoaded.shap || !imagesLoaded.mri3d) && (
                  <div className="absolute top-full mt-3 right-0 hidden group-hover:block w-56 bg-gray-900 text-white text-xs rounded-lg py-3 px-4 shadow-2xl z-[100]">
                    {!imagesLoaded.heatmap && <div className="mb-1">• Heatmap is still loading...</div>}
                    {!imagesLoaded.shap && <div className="mb-1">• SHAP chart is still loading...</div>}
                    {!imagesLoaded.mri3d && <div className="mb-1">• 3D MRI is still loading...</div>}
                    <div className="mt-2 text-gray-400 border-t border-gray-700 pt-2">Wait until all content is loaded.</div>
                    {/* Arrow pointer pointing up */}
                    <div className="absolute bottom-full right-4 mb-0">
                      <div className="w-0 h-0 border-l-8 border-r-8 border-b-8 border-transparent border-b-gray-900"></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main
        key={refreshKey}
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in duration-500"
      >

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-1">
            <PatientInfo 
              id={patientId} 
              age={ageValue} 
              gender={genderValue}
              education={educationValue}
              cdr={cdrValue}
              mmse={mmseValue}
              apgen1={apgen1Value}
              apgen2={apgen2Value}
            />
          </div>

          <div className="lg:col-span-2 flex flex-col gap-6">
            <DiagnosisCard 
              diagnosis={primaryDiag} 
              confidence={confidencePercentage} 
              severity={confidencePercentage > 85 ? "high" : "medium"}
              description={`Processed via execution pipeline model context: ${modelEngineUsed}. Structural classification map derived from neural network vectors.`}
            />

            <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-6 text-white shadow-lg shadow-blue-100 flex-1 flex flex-col justify-center">
              <h2 className="text-xl font-black mb-1">Diagnostic Explainability</h2>
              <p className="text-blue-55 text-xs font-medium max-w-2xl">
                This section interprets the machine learning pipeline's weights. It renders spatial tissue structural metrics through Grad-CAM visual overlays along with SHAP clinical contribution indices.
              </p>
            </div>
          </div>
        </div>

        {/* Hidden image preload for heatmap (used in PDF) */}
        {gradcamObject?.heatmap_png && (
          <img
            src={gradcamObject.heatmap_png}
            alt="Heatmap preload"
            className="hidden"
            onLoad={() => setImagesLoaded(prev => ({ ...prev, heatmap: true }))}
            onError={() => setImagesLoaded(prev => ({ ...prev, heatmap: true }))}
          />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <MRIViewer3D
            mriUrl={gradcamObject?.mri_nifti_url}
            overlayUrl={gradcamObject?.overlay_nifti_url}
            title="3D Brain with Grad-CAM"
            onRefreshRequest={handleRefresh}
            onLoadComplete={() => setImagesLoaded(prev => ({ ...prev, mri3d: true }))}
          />
          <AlternativeDiagnoses probabilities={probabilitiesMap} />
        </div>

        <div className="mb-6">
          <ShapValues
            shap={shapObject || sessionData?.shap}
            onImageLoad={() => setImagesLoaded(prev => ({ ...prev, shap: true }))}
          />
        </div>

        <footer className="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-8">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-amber-100 rounded-lg">
              <Brain className="w-6 h-6 text-amber-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-black text-amber-900 mb-1 uppercase text-xs tracking-widest">Clinical Protocol Considerations</h3>
              <p className="text-sm text-amber-800 font-medium leading-relaxed">
                Platform outputs trace directly to diagnostic support algorithms utilizing cloud resources. These indicators represent mathematical inferences and do not supersede qualified professional medical evaluations.
              </p>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}