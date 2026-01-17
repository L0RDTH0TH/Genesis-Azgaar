# Dual Grid Visual Audit v2
**Date:** January 14, 2026  
**Issue:** Dense "neural net" wireframe, need simplified chunky quads  
**Goal:** Low-density black wireframe quads (no colors/fills)

---

## Rollback Status

### Color/Style Changes Rolled Back
- ✅ **Yellow stroke (#ffaa00)** → Reverted to original black/dark gray
- ✅ **Blue fill (rgba(135, 206, 250, 0.4))** → Removed (no fills)
- ✅ **Stroke width changes** → Reverted to original (1px)
- ✅ **All styling changes** → Removed, back to wireframe-only

---

## Current State Analysis

### 1. Point Count After Processing

**Generation Flow (After Rollback):**
- Initial hex points: ~4,447 (hexRings=38, hexSize=12)
- After triangulation: ~8,861 triangles
- After dissolution: ~8,502 quads (enabled)
- After triangle→quad subdivision: ~24,786 quads (Level 0)
- After Level 0→Level 1 subdivision: **SKIPPED** (skipLevel1Subdivision=true)
- **Final point count: ~37,015 points** (from last generation)

**Problem:** Still too dense due to:
1. Triangle→quad subdivision (3 quads per triangle = 3x points)
2. hexRings=38 still produces ~4,447 initial points

**Target:** Reduce to ~4-6k total points for chunky, usable quads

---

### 2. Subdivision Analysis

**Current Subdivision Strategy:**
- ✅ **Step 4:** Triangles → 3 quads each (creates Level 0) - **ACTIVE**
- ✅ **Step 6:** Level 0 → Level 1 - **SKIPPED** (skipLevel1Subdivision=true)
- ❌ **Still too dense:** 4,447 points → 37,015 points (8.3x multiplication)

**Evidence:**
- Level 1 subdivision is correctly skipped
- But triangle→quad subdivision still creates 3x density
- Need to reduce initial hexRings to 20-30

---

### 3. Render Mode Analysis

**Current Rendering Logic:**
```javascript
// scripts/generate-interactive-terrain.js:589-646
const useQuads = level0Quads && level0Quads.length > 0;

if (useQuads) {
  // Render dual quads with rounded corners
  // Uses renderPoints (dualPoints) for rounded corners
  // NO FILLS, BLACK STROKE (after rollback)
} else if (rawDelaunayTriangles && rawDelaunayTriangles.length > 0) {
  // Fallback: render wireframe triangles
  // stroke="#4488ff" (blue wireframe) - original fallback
}
```

**Status:**
- ✅ Quads rendering enabled (skipDissolution=false)
- ✅ Uses dualPoints for rounded corners
- ✅ Colors rolled back to black/dark gray
- ✅ No fills (wireframe only)

---

### 4. Fix Implementation Status

**Fix 5 (Enable Quad Rendering):**
- ✅ `skipDissolution: false` set in options
- ✅ Default changed to `false` in dualGridStates.js
- ✅ **Status:** Fully implemented

**Fix 8 (Performance/Reduction):**
- ✅ `skipLevel1Subdivision: true` set (Level 1 skipped)
- ❌ **BUT:** hexRings=38 still too high
- ❌ **Pending:** Reduce hexRings to 20-30

**Color Rollback:**
- ✅ Yellow strokes removed
- ✅ Blue fills removed
- ✅ Back to original black/dark gray wireframe
- ✅ **Status:** Complete

---

### 5. Dissolution & Dual Points Status

**Dissolution:**
- ✅ Enabled (skipDissolution=false)
- ✅ Default changed to false in dualGridStates.js
- ✅ **Status:** Working correctly

**Dual Points:**
- ✅ Generated correctly (~37,015 dual points)
- ✅ Used in rendering (renderPoints = dualPoints)
- ✅ Offset factor 0.5 applied
- ✅ **Status:** Working correctly

---

## Root Cause Summary

1. **Density Issue:** hexRings=38 creates 4,447 initial points → 37,015 final (8.3x)
2. **Solution:** Reduce hexRings to 20-30 → target ~4-6k total points
3. **Subdivision:** Level 1 correctly skipped, but triangle→quad still creates density
4. **Render Mode:** Quads enabled, colors rolled back, wireframe-only

---

## Proposed Fixes

### Fix 1: Reduce hexRings
- Set hexRings=25 (target ~2,500 initial points)
- Expected final: ~15,000 points (6x multiplication)
- Or hexRings=20 for ~4,000 initial → ~20,000 final

### Fix 2: Keep Current Settings
- skipLevel1Subdivision=true ✅
- skipDissolution=false ✅
- No colors/fills ✅

### Fix 3: Add Logging
- Log final point count
- Log render mode (QUADS vs TRIANGLES)

---

## Expected Outcome After Fixes

- **Point count:** ~2,500 initial → ~15,000 final (hexRings=25)
- **Visual:** Black wireframe rounded quads (no fills)
- **Density:** Chunky, organic hex-like cells (not dense mesh)
- **Performance:** Faster rendering with fewer points
