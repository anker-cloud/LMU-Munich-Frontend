# Quick Fix Guide for SHAP Backend

## 🔴 CRITICAL BUG IDENTIFIED

**Problem**: SHAP values are computed relative to the **predicted class** (which varies per patient), not a **fixed disease class**.

**Result**: SHAP directions flip depending on what the model predicted!

---

## ⚡ QUICK FIXES (Copy-Paste Ready)

### Fix 1: Update `net_utils/explainability.py`

#### Change 1.1: Update baseline (Line 32)
```python
# BEFORE:
TAB_BASELINES = (1.5, 74.0, 16.0, 0.4, 26.0, 3.0, 3.0)

# AFTER:
TAB_BASELINES = (1.5, 70.0, 16.0, 0.0, 29.0, 3.0, 3.0)
```

#### Change 1.2: Add target_class parameter (Line 36)
```python
# BEFORE:
def compute_shap(model,
                 x_tab: torch.Tensor,
                 pred_idx: int,
                 tab_columns: list,
                 baselines: tuple = TAB_BASELINES,
                 patient_id: str = "unknown") -> list:

# AFTER:
def compute_shap(model,
                 x_tab: torch.Tensor,
                 pred_idx: int,
                 tab_columns: list,
                 baselines: tuple = TAB_BASELINES,
                 patient_id: str = "unknown",
                 target_class: int = 2) -> list:  # ← ADD: Default to AD (class 2)
```

#### Change 1.3: Use fixed target (Line 80-88)
```python
# BEFORE:
from captum.attr import ShapleyValueSampling
print(f"[SHAP] Starting attribution for patient {patient_id}, pred_idx={pred_idx}")
shap_explainer = ShapleyValueSampling(tab_model)
attributions   = shap_explainer.attribute(
    x_tab,
    target=pred_idx,  # ← WRONG: Uses predicted class
    baselines=baseline_tensor,
    n_samples=25,
)

# AFTER:
from captum.attr import ShapleyValueSampling
print(f"[SHAP] Starting attribution for patient {patient_id}, target={target_class}")
shap_explainer = ShapleyValueSampling(tab_model)
attributions   = shap_explainer.attribute(
    x_tab,
    target=target_class,  # ← FIXED: Always use AD class
    baselines=baseline_tensor,
    n_samples=25,
)
```

#### Change 1.4: Update chart legend (Line 139-143)
```python
# BEFORE:
legend_elements = [
    Patch(facecolor='#d73027', label='Increases probability'),
    Patch(facecolor='#4575b4', label='Decreases probability'),
]

# AFTER:
legend_elements = [
    Patch(facecolor='#d73027', label='Increases AD Risk'),
    Patch(facecolor='#4575b4', label='Decreases AD Risk'),
]
```

---

### Fix 2: Update `inference.py`

#### Change 2.1: Pass target_class to compute_shap (Line 263)
```python
# BEFORE:
shap_list, shap_chart_url = compute_shap(
    model       = shap_model,
    x_tab       = x_tab_expl,
    pred_idx    = pred_idx,
    tab_columns = TAB_COLUMNS,
    patient_id  = patient_id,
)

# AFTER:
shap_list, shap_chart_url = compute_shap(
    model       = shap_model,
    x_tab       = x_tab_expl,
    pred_idx    = pred_idx,
    tab_columns = TAB_COLUMNS,
    patient_id  = patient_id,
    target_class = 2,  # ← ADD: Always explain relative to AD
)
```

---

## 🧪 Testing

After making changes, test with these two patients:

### Test Patient 1 (High Risk)
```json
{
  "PATIENT_ID": "TEST001",
  "SEX": 2,
  "AGE": 80,
  "EDUCATION": 12,
  "CDR": 1.0,
  "MMSE": 23,
  "APGEN1": 3,
  "APGEN2": 4
}
```

**Expected SHAP (all should be RED for AD risk)**:
- ✅ AGE (80) → RED (older age increases AD risk)
- ✅ CDR (1.0) → RED (higher CDR increases AD risk)
- ✅ MMSE (23) → RED (lower MMSE increases AD risk)
- ✅ APGEN2 (ε4) → RED (ε4 allele increases AD risk)

### Test Patient 2 (Low Risk)
```json
{
  "PATIENT_ID": "TEST002",
  "SEX": 1,
  "AGE": 60,
  "EDUCATION": 18,
  "CDR": 0.0,
  "MMSE": 29,
  "APGEN1": 3,
  "APGEN2": 3
}
```

**Expected SHAP (all should be BLUE for protection)**:
- ✅ AGE (60) → BLUE (younger age protective)
- ✅ CDR (0.0) → BLUE (normal CDR protective)
- ✅ MMSE (29) → BLUE (high MMSE protective)
- ✅ EDUCATION (18) → BLUE (higher education protective)

---

## 📊 Validation Checklist

After applying fixes:

- [ ] Both test patients show **consistent** SHAP directions
- [ ] High CDR always shows RED (not blue)
- [ ] Low MMSE always shows RED (not blue)
- [ ] ε4 allele always shows RED (not blue)
- [ ] Younger age shows BLUE (not red)
- [ ] SHAP chart legend says "Increases AD Risk" / "Decreases AD Risk"

---

## 🔍 Why This Happened

The original code computed SHAP for `target=pred_idx`:
- If patient predicted as **AD** → SHAP explains "what drives toward AD" → Correct ✅
- If patient predicted as **CN** → SHAP explains "what drives toward normal" → Backwards ❌

**Solution**: Always use `target=2` (AD class) so SHAP always explains "AD risk factors"

---

## 📝 Files to Modify

1. `Lmu_munich-main/net_utils/explainability.py` (4 changes)
2. `Lmu_munich-main/inference.py` (1 change)

Total: **5 line changes** to fix the entire issue!

---

## ⚠️ Important Note

After fixing, **all SHAP values will change** because:
1. Target class is now fixed (AD) instead of varying
2. Baseline is healthier (CDR=0, MMSE=29 instead of CDR=0.4, MMSE=26)

This is **expected and correct**. The new values will be clinically accurate.
