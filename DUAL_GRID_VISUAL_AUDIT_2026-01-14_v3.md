# Dual Grid Visual Audit v3
**Date:** January 14, 2026  
**Issue:** Still too dense, need more aggressive simplification  
**Goal:** 4-6k total final points, chunky hex-like quads

---

## Current State (After v2)

### Color/Style Status
- ✅ **No colors/fills** - Confirmed black wireframe only
- ✅ **Stroke color:** #333 (dark gray/black)
- ✅ **Fill:** none (wireframe-only)
- ✅ **All styling:** Unchanged, wireframe-only

---

### 1. Point Count Analysis

**Current Generation Flow (hexRings=25):**
- Initial hex points: ~1,951 (hexRings=25, hexSize=12)
- After triangulation: ~3,705 triangles
- After dissolution: ~3,705 quads
- After triangle→quad subdivision: ~10,771 quads (Level 0) - **3x multiplication**
- After Level 0→Level 1 subdivision: **SKIPPED** ✅
- **Final point count: ~16,083 points**

**Problem:** Triangle→quad subdivision creates 3x density:
- 3,705 triangles → 10,771 quads (each triangle becomes 3 quads)
- Each quad adds midpoints + center = ~1.5x point multiplication
- Result: 1,951 initial → 16,083 final (8.2x multiplication)

**Target:** 4-6k final points max
- Need to reduce initial points AND/or skip triangle→quad subdivision

---

### 2. Subdivision Breakdown

**Current Subdivision Strategy:**
1. ✅ **Triangulation:** Points → triangles (inevitable for Delaunay)
2. ✅ **Dissolution:** Triangles → quads (enabled, skipDissolution=false)
3. ❌ **Triangle→quad subdivision:** Remaining triangles → 3 quads each - **ACTIVE, CREATES DENSITY**
4. ✅ **Level 1 subdivision:** Level 0 → Level 1 - **SKIPPED** ✅

**Evidence from Code:**
```javascript
// src/core/dualGridStates.js:91-99
for (const shape of quads) {
  if (shape.type === 'triangle') {
    const subQuads = subdivideTriangleIntoThreeQuads(shape, points, addPoint, midpoint);
    allQuads.push(...subQuads); // Each triangle → 3 quads
  } else {
    allQuads.push(shape); // Keep dissolved quads as-is
  }
}
```

**Impact:**
- Dissolution converts some triangles to quads
- Remaining triangles get subdivided into 3 quads each
- This creates the 3x multiplication

---

### 3. Render Mode Confirmation

**Current Rendering:**
- ✅ Mode: QUADS (level0Quads.length > 0)
- ✅ Uses dualPoints for rounded corners
- ✅ Black wireframe (no fills)
- ✅ skipDissolution=false (quads enabled)

**Status:** Quad rendering is working correctly, just too many quads.

---

### 4. Density Analysis

**Why Still Too Dense:**
1. **hexRings=25** → ~1,951 initial points (too high for 4-6k target)
2. **Triangle→quad subdivision** → 3x multiplication (3,705 → 10,771 quads)
3. **Dual offset** → Adds points for rounded corners
4. **Result:** 1,951 → 16,083 (8.2x multiplication)

**Math:**
- Target: 4-6k final points
- With 3x triangle→quad multiplication: Need 1.3k-2k initial points
- With 8.2x total multiplication: Need ~500-750 initial points
- hexRings=15 → ~1,000 initial points → ~8k final (still high)
- hexRings=18 → ~1,400 initial points → ~11k final

**Solution:** Reduce hexRings to 15-18 AND consider skipping triangle→quad subdivision

---

## Proposed Fixes

### Fix 1: Reduce hexRings Aggressively
- Set hexRings=18 (target ~1,400 initial → ~11k final)
- Or hexRings=15 (target ~1,000 initial → ~8k final)
- Balance: 18 gives better coverage, 15 gives lower density

### Fix 2: Skip Triangle→Quad Subdivision (Optional)
- Add `skipTriangleSubdivision` option
- Keep dissolved quads, skip subdividing remaining triangles
- Would reduce: 3,705 quads → ~3,705 quads (no 3x multiplication)
- Result: 1,400 initial → ~5,000 final (fits target)

### Fix 3: Keep Current Settings
- skipLevel1Subdivision=true ✅
- skipDissolution=false ✅
- Black wireframe only ✅

---

## Expected Outcome After Fixes

**Option A (hexRings=18):**
- Initial: ~1,400 points
- Final: ~11,000 points (still above target but much better)

**Option B (hexRings=15 + skip triangle subdivision):**
- Initial: ~1,000 points
- Final: ~3,000-4,000 points (fits target)
- Chunky, organic quads

**Option C (hexRings=18 + skip triangle subdivision):**
- Initial: ~1,400 points
- Final: ~5,000-6,000 points (fits target perfectly)
- Good coverage with reasonable density
