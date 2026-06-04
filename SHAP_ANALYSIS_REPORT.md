# SHAP Values Analysis & Backend Fix Report
**Date**: 2026-06-04  
**Issue**: Inconsistent and incorrect SHAP feature importance values across patients

---

## 1. CLASS MAPPING VERIFICATION ✅

**File**: `configs/config_all.json` (Line 11-13)

```json
"class_mapping": {
  "CN": 0,        // Cognitively Normal
  "MCI": 1,       // Mild Cognitive Impairment  
  "AD": 2,        // Alzheimer's Disease
  "AD_VASC": 3,   // AD with Vascular Component
  "VASC": 4,      // Vascular Dementia
  "FTD": 5,       // Frontotemporal Dementia
  "CBS": 6,       // Corticobasal Syndrome
  "PSP": 7        // Progressive Supranuclear Palsy
}
```

**Confirmed**: 
- Index **0 = CN (Cognitively Normal)** 
- Index **2 = AD (Alzheimer's Disease)**
- Model outputs logits of shape `[1, 8]` (8 classes)

---

## 2. SHAP BASELINE VERIFICATION ⚠️

**File**: `net_utils/explainability.py` (Line 32)

```python
TAB_BASELINES = (1.5, 74.0, 16.0, 0.4, 26.0, 3.0, 3.0)
# Order:         SEX  AGE   EDUC  CDR  MMSE  APG1 APG2
```

### Analysis:

| Feature | Baseline Value | Clinical Interpretation | Issue |
|---------|---------------|------------------------|-------|
| **SEX** | 1.5 | Between Male(1) and Female(2) | ✅ OK (average) |
| **AGE** | 74.0 | 74 years old | ✅ OK (typical dementia age) |
| **EDUCATION** | 16.0 | 16 years | ✅ OK (college educated) |
| **CDR** | 0.4 | Between 0 (normal) and 0.5 (very mild) | ⚠️ **QUESTIONABLE** |
| **MMSE** | 26.0 | 26/30 (mild impairment) | ⚠️ **SHOULD BE 28-29** |
| **APGEN1** | 3.0 | ε3 allele | ✅ OK (most common) |
| **APGEN2** | 3.0 | ε3 allele | ✅ OK (most common) |

### Problems:

1. **CDR Baseline = 0.4** is neither normal (0.0) nor a clean reference point
   - Patient with CDR=1.0 appears "worse than baseline" but the direction is ambiguous
   
2. **MMSE Baseline = 26.0** is already impaired (normal is 27-30)
   - A patient with MMSE=23 should show RED, but relative to 26 the difference is small

**Recommendation**: Use a **truly healthy baseline**:
```python
TAB_BASELINES = (1.5, 70.0, 16.0, 0.0, 29.0, 3.0, 3.0)
#                    ↑ younger  ↑ normal  ↑ normal MMSE
```

---

## 3. SHAP TARGET CLASS VERIFICATION 🔴 **CRITICAL ISSUE**

**File**: `net_utils/explainability.py` (Line 83-88)

```python
attributions = shap_explainer.attribute(
    x_tab,
    target=pred_idx,  # ← PROBLEM: Uses predicted class for THIS patient
    baselines=baseline_tensor,
    n_samples=25,
)
```

### The Critical Bug:

SHAP is computing feature attributions **relative to the predicted class** (`pred_idx`), which **changes per patient**:

- **Patient 1** predicted as `AD (class 2)` → SHAP shows "what drives toward AD"
- **Patient 2** predicted as `MCI (class 1)` → SHAP shows "what drives toward MCI"  
- **Patient 3** predicted as `CN (class 0)` → SHAP shows "what drives toward CN"

### Why This Causes Backwards Values:

For a patient with **Age=80, CDR=1, MMSE=23, APOE ε4**:

**If predicted as AD (class 2)**:
- High age → Drives toward AD → RED (correct)
- CDR=1 → Drives toward AD → RED (correct)
- APOE ε4 → Drives toward AD → RED (correct)

**If predicted as CN (class 0)**:
- High age → Drives toward CN (i.e., protective against dementia) → BLUE (BACKWARDS!)
- CDR=1 → Drives toward CN → BLUE (BACKWARDS!)
- APOE ε4 → Drives toward CN → BLUE (BACKWARDS!)

### The Legend Says:
```
🔴 Red = Positive Impact (Drives Dementia Score)
🔵 Blue = Negative Impact (Protective/Normal Direction)
```

But if the target is CN (normal), then:
- Red means "drives toward normal" 
- Blue means "drives away from normal (toward dementia)"

**This is completely inverted!**

---

## 4. ROOT CAUSE SUMMARY

### Issue #1: Inconsistent SHAP Target
```python
# Current (WRONG):
target=pred_idx  # Changes per patient
```

The SHAP target should be **fixed** to the dementia/disease class you care about explaining:

```python
# Fixed (CORRECT):
target=2  # Always explain relative to AD (Alzheimer's Disease)
# OR
target=get_dementia_class_idx()  # A function that picks the "worst" diagnosis class
```

### Issue #2: Suboptimal Baseline
The baseline represents a "mildly impaired" patient rather than a healthy one, making the SHAP interpretations less intuitive.

### Issue #3: Display Legend Assumes Fixed Target
Your frontend legend assumes SHAP always explains "risk factors for dementia", but the backend computes SHAP for whatever class the model predicted.

---

## 5. RECOMMENDED FIXES

### Fix #1: Use Fixed SHAP Target (Primary Fix)

**File**: `net_utils/explainability.py`

**Change Line 36-41** to add a parameter:

```python
def compute_shap(model,
                 x_tab: torch.Tensor,
                 pred_idx: int,
                 tab_columns: list,
                 baselines: tuple = TAB_BASELINES,
                 patient_id: str = "unknown",
                 target_class: int = None) -> list:  # ← ADD THIS
```

**Change Line 83-88**:

```python
# Option A: Always explain AD (class 2)
shap_target = target_class if target_class is not None else 2  # AD class

# Option B: Always explain "most severe dementia" (highest class index)
# shap_target = target_class if target_class is not None else pred_idx

attributions = shap_explainer.attribute(
    x_tab,
    target=shap_target,  # ← FIXED: Use consistent target
    baselines=baseline_tensor,
    n_samples=25,
)
```

**Update the call in `inference.py` (Line 263-269)**:

```python
shap_list, shap_chart_url = compute_shap(
    model       = shap_model,
    x_tab       = x_tab_expl,
    pred_idx    = pred_idx,
    tab_columns = TAB_COLUMNS,
    patient_id  = patient_id,
    target_class = 2,  # ← ADD THIS: Always explain relative to AD
)
```

---

### Fix #2: Update Baseline to Healthy Reference

**File**: `net_utils/explainability.py` (Line 32)

```python
# BEFORE (mildly impaired baseline):
TAB_BASELINES = (1.5, 74.0, 16.0, 0.4, 26.0, 3.0, 3.0)

# AFTER (healthy baseline):
TAB_BASELINES = (1.5, 70.0, 16.0, 0.0, 29.0, 3.0, 3.0)
#                    ↑ younger  ↑ CDR=0  ↑ MMSE=29 (normal)
```

**Rationale**:
- **Age 70** instead of 74: Younger = lower baseline risk
- **CDR 0.0** instead of 0.4: Truly normal cognition
- **MMSE 29** instead of 26: Normal cognitive function

---

### Fix #3: Update Chart Legend (Optional)

**File**: `net_utils/explainability.py` (Line 139-143)

If you use **Fixed Target = AD (class 2)**:

```python
legend_elements = [
    Patch(facecolor='#d73027', label='Increases AD Risk'),        # ← Updated
    Patch(facecolor='#4575b4', label='Decreases AD Risk'),        # ← Updated
]
```

If you use **Dynamic Target = pred_idx**:

```python
# Need to pass pred_label to the chart function
legend_elements = [
    Patch(facecolor='#d73027', label=f'Increases {pred_label} probability'),
    Patch(facecolor='#4575b4', label=f'Decreases {pred_label} probability'),
]
```

---

## 6. TESTING AFTER FIX

### Test Case 1: High-Risk Patient
```python
Patient: Age=80, Sex=Female, EDU=12, CDR=1, MMSE=23, APOE=ε3/ε4
Expected SHAP (relative to AD class):
- AGE (80 > 70): 🔴 RED (increases AD risk)
- CDR (1.0 > 0.0): 🔴 RED (increases AD risk) 
- MMSE (23 < 29): 🔴 RED (increases AD risk)
- APGEN2 (ε4): 🔴 RED (increases AD risk)
- EDUCATION (12 < 16): slight RED or neutral
```

### Test Case 2: Low-Risk Patient
```python
Patient: Age=60, Sex=Male, EDU=18, CDR=0, MMSE=29, APOE=ε3/ε3
Expected SHAP (relative to AD class):
- AGE (60 < 70): 🔵 BLUE (decreases AD risk)
- CDR (0.0 = 0.0): neutral
- MMSE (29 = 29): neutral
- APGEN1/2 (ε3): neutral
- EDUCATION (18 > 16): 🔵 BLUE (protective)
```

### Verification:
1. Run inference on both test patients
2. Check SHAP values are **consistent** (same features always same direction)
3. Check SHAP values are **clinically correct** (age/CDR/MMSE up = risk up)

---

## 7. ALTERNATIVE APPROACH: Multi-Class SHAP

If you want to show SHAP for **all classes**, not just AD:

```python
# Compute SHAP for each diagnosis class
shap_results_per_class = {}
for class_idx, class_name in CLASS_NAMES.items():
    attributions = shap_explainer.attribute(
        x_tab,
        target=class_idx,
        baselines=baseline_tensor,
        n_samples=25,
    )
    shap_results_per_class[class_name] = attributions
```

Then display multiple SHAP charts (one per diagnosis). This is more comprehensive but may overwhelm the user.

---

## 8. SUMMARY OF CHANGES NEEDED

### Backend Changes (`net_utils/explainability.py`):

1. **Line 36**: Add `target_class: int = None` parameter to `compute_shap()`
2. **Line 32**: Change baseline to `(1.5, 70.0, 16.0, 0.0, 29.0, 3.0, 3.0)`
3. **Line 83**: Use `target=2` (AD class) instead of `target=pred_idx`
4. **Line 140**: Update legend to "Increases AD Risk" / "Decreases AD Risk"

### Backend Changes (`inference.py`):

5. **Line 263**: Pass `target_class=2` to `compute_shap()` call

### Expected Outcome:

✅ SHAP values will be **consistent** across all patients  
✅ SHAP values will be **clinically correct** (age↑ = risk↑, MMSE↓ = risk↑, ε4 = risk↑)  
✅ SHAP charts will have **correct interpretation** (Red = drives AD risk)

---

## 9. IMPLEMENTATION PRIORITY

**Critical (Must Fix)**:
- ✅ Fix #1: Use fixed SHAP target (Line 83 in explainability.py)
- ✅ Update inference.py call (Line 263)

**Important (Should Fix)**:
- ✅ Fix #2: Update baseline to healthy reference
- ✅ Fix #3: Update chart legend

**Optional (Nice to Have)**:
- Add logging to show which target class is being used
- Add validation to ensure SHAP direction makes clinical sense
- Consider multi-class SHAP display

---

**End of Report**
