# Dual Grid Visual Audit
**Date:** January 14, 2026  
**Issue:** Dense "neuron mesh" wireframe instead of smooth rounded quads  
**Goal:** Smooth yellow rounded quads matching reference close-up

---

## Current State Analysis

### 1. Point Count After Processing

**Generation Flow:**
- Initial hex points: ~4,447 (hexRings=38, hexSize=12)
- After triangulation: ~8,861 triangles
- After dissolution: **SKIPPED** (see below)
- After triangle→quad subdivision: ~24,786 quads (Level 0)
- After Level 0→Level 1 subdivision: ~99,144 quads (Level 1)
- **Final point count: ~160,945 points** (from generation logs)

**Problem:** Massive point explosion from double subdivision:
1. Triangles → 3 quads each (adds midpoints + center = 4 new points per triangle)
2. Level 0 → Level 1: 4 quads each (adds 4 midpoints + 1 center = 5 new points per quad)

**Result:** 4,447 initial points → 160,945 final points (36x multiplication)

---

### 2. Subdivision Analysis

**Current Subdivision Strategy:**
- ✅ **Step 4:** Triangles → 3 quads each (creates Level 0)
- ✅ **Step 6:** Level 0 → Level 1 (4 quads each)
- ❌ **No skip option** for Level 1 subdivision

**Evidence from Code:**
```javascript
// src/core/dualGridStates.js:115-136
// Step 6: Subdivide Level 0 quads into Level 1 quads
const level1Quads = [];
for (let i = 0; i < level0Quads.length; i++) {
  const parentQuad = level0Quads[i];
  const subQuads = subdivideQuadIntoFour(parentQuad, points, addPoint, midpoint);
  // ... creates 4 children per parent
}
```

**Impact:** Level 1 subdivision is **always applied**, creating 4x more quads than needed for visual preview.

---

### 3. Render Mode Analysis

**Current Rendering Logic:**
```javascript
// scripts/generate-interactive-terrain.js:589-646
const useQuads = level0Quads && level0Quads.length > 0;

if (useQuads) {
  // Render dual quads with rounded corners
  // Uses renderPoints (dualPoints) for rounded corners
} else if (rawDelaunayTriangles && rawDelaunayTriangles.length > 0) {
  // Fallback: render wireframe triangles
  // stroke="#4488ff" (blue wireframe)
}
```

**Evidence:**
- ✅ Code path exists for quad rendering
- ✅ Uses `dualPoints` via `renderPoints` (line 599)
- ❌ **BUT:** If `level0Quads.length === 0`, falls back to triangles
- ❌ **Current visual:** Dense blue wireframe suggests triangle fallback is active

**Hypothesis:** Either:
1. `level0Quads` is empty/missing → triangle fallback
2. OR quads are rendering but with wrong styling (should be yellow, not blue)

---

### 4. Fix Implementation Status

**Fix 5 (Enable Quad Rendering):**
- ✅ `skipDissolution: false` set in options (line 55)
- ❌ **BUT:** Default in `dualGridStates.js` is `true` (line 80)
- ❌ **Result:** Dissolution is **still being skipped** due to default override

**Fix 8 (Performance/Reduction):**
- ✅ `hexLayers: 38` set (reduced from 45)
- ❌ **BUT:** Level 1 subdivision still creates 160k points
- ❌ **Result:** Density reduction ineffective due to subdivision

**Fix 2+3 (Boundary Preservation):**
- ✅ Boundary tagging implemented
- ✅ Boundary preserved in dual offset
- ✅ Subdivision preserves boundary tags
- ✅ **Status:** Fully implemented

---

### 5. Dissolution & Dual Points Status

**Dissolution:**
```javascript
// src/core/dualGridStates.js:80
const skipDissolution = options.politicsMode?.skipDissolution ?? true;
// Default is TRUE, so skipDissolution: false in options may not override
```

**Problem:** The `??` operator means if `options.politicsMode?.skipDissolution` is `undefined`, it defaults to `true`.

**Dual Points:**
- ✅ Generated correctly (160,945 dual points)
- ✅ Used in rendering (`renderPoints` = `dualPoints` after centering)
- ✅ Offset factor 0.5 applied

---

## Root Cause Summary

1. **Density Issue:** Level 1 subdivision creates 160k points (36x multiplication)
2. **Dissolution Skipped:** Default `skipDissolution: true` overrides options
3. **Triangle Fallback:** Either quads missing or wrong styling (blue vs yellow)
4. **Visual Style:** Current wireframe is blue triangles, not yellow rounded quads

---

## Proposed Fixes

### Fix 1: Skip Level 1 Subdivision for Preview
- Add `skipLevel1Subdivision` option
- Only create Level 0 quads for visual preview
- Reduces points from 160k → ~25k

### Fix 2: Force Dissolution
- Change default `skipDissolution` to `false` OR
- Ensure options properly override default

### Fix 3: Fix Quad Rendering Style
- Change stroke color to yellow (`stroke="#ffaa00"` or similar)
- Increase stroke width for visibility
- Ensure fill is semi-transparent blue/light color

### Fix 4: Add Skip Option for Level 1
- Add `skipLevel1Subdivision: true` to options
- Only subdivide if explicitly needed

---

## Expected Outcome After Fixes

- **Point count:** ~4,447 initial → ~25,000 after Level 0 only (5.6x, not 36x)
- **Visual:** Yellow rounded quads with blue fill, not blue wireframe triangles
- **Density:** Smooth, chunky cells matching reference close-up
- **Performance:** Faster rendering with fewer points
