# Dual Grid Visual Audit v7
**Date:** January 14, 2026  
**Issue:** Center chaos (spidery lines/overlaps) persists despite v6 uniformity improvements  
**Goal:** Diagnose if relaxation algorithm is causing compression/chaos in center

---

## Current State (v6 - Unchanged)

### Confirmed Settings
- ✅ **Low density:** 1,027 points, 1,901 quads (hexRings=18)
- ✅ **relaxationIterations: 100** (v4 optimization)
- ✅ **dampingFactor: 0.5** (v4 stability)
- ✅ **dualOffsetFactor: 0.35** (v4 reduced rounding)
- ✅ **skipTriangleSubdivision: true** (low density)
- ✅ **skipLevel1Subdivision: true** (no Level 1)
- ✅ **aspectRatio: 1.15** (v6 reduced from 1.22)
- ✅ **adaptiveDamping: enabled** (v6 fix)
- ✅ **softBoundary: enabled** (v6 fix)
- ✅ **Cell uniformity CV: 231.0%** (high variance, but expected)

---

## Problem Analysis

### Current Symptoms
- **Center chaos:** Spidery lines/overlaps in center region
- **Persists despite v6:** Even with adaptive damping and soft boundaries
- **Edge regions:** Appear cleaner (less chaos)

### Hypothesis: Relaxation Algorithm Culprit

**Theory:**
1. **Iterative Compression:**
   - 100 iterations of Laplacian smoothing
   - Each iteration pulls points toward neighbor average
   - Center points have 6-8 neighbors → stronger pull
   - Result: Over-compression after many iterations

2. **Accumulated Errors:**
   - Small movements per iteration (damping=0.5)
   - But 100 iterations = cumulative large movements
   - Center points move more (more neighbors)
   - Result: Points converge too tightly → overlaps

3. **Adaptive Damping Not Enough:**
   - v6 adaptive damping helps, but still allows movement
   - 100 iterations × adaptive damping = still significant movement
   - Result: Center still compresses, causing chaos

4. **Initial Grid Quality:**
   - Hex grid + Delaunay triangulation = already good spacing
   - Relaxation may be over-correcting an already-decent grid
   - Result: Relaxation degrades rather than improves

---

## Diagnostic Test Plan

### Test 1: Minimal Relaxation (1 iteration)
**Goal:** See if chaos disappears with minimal relaxation

**Hypothesis:**
- If chaos disappears → relaxation is the culprit
- If chaos persists → relaxation is not the issue (look elsewhere)

**Implementation:**
- Add `testLowRelaxation: true` flag
- When enabled, set `relaxationIterations = 1`
- Keep all other v6 fixes (adaptive damping, soft boundary)
- Compare visual result to 100-iteration version

### Test 2: No Relaxation (0 iterations)
**If Test 1 confirms relaxation issue:**
- Set `relaxationIterations = 0` or skip `relaxGrid()` call
- Use initial hex grid + Delaunay triangulation directly
- Apply dual offset only (no relaxation)
- Compare to relaxed versions

---

## Expected Outcomes

### If Relaxation is Culprit:
**With 1 iteration:**
- ✅ Center chaos reduced/eliminated
- ✅ Cleaner grid appearance
- ✅ Fewer overlaps
- ✅ More uniform cell sizes (from initial hex grid)

**With 0 iterations:**
- ✅ Cleanest possible grid
- ✅ No center compression
- ✅ Perfect initial hex spacing preserved
- ⚠️ May need slight adjustments (dual offset only)

### If Relaxation is NOT Culprit:
**With 1 iteration:**
- ❌ Chaos persists
- ❌ Overlaps still present
- → Look elsewhere: dual offset, triangulation, dissolution, etc.

---

## Rollback Plan (If Confirmed)

### Option 1: Disable Relaxation
```javascript
// In buildStalbergQuadGrid:
const relaxationIterations = options.politicsMode?.testLowRelaxation 
  ? 1 
  : (options.politicsMode?.relaxationIterations ?? 0); // Default to 0

// Or skip relaxGrid() call entirely:
if (relaxationIterations > 0) {
  relaxGrid(points, level0NeighborMap, relaxationIterations, dampingFactor, options);
}
```

### Option 2: Minimal Relaxation (1-5 iterations)
- Keep relaxation but minimal
- May help with slight smoothing without chaos
- Tune iterations (1, 2, 3, 5) to find sweet spot

### Option 3: Conditional Relaxation
- Only relax if initial grid quality is poor
- Skip if initial hex grid is already good
- Use heuristics (variance, spacing) to decide

---

## Implementation Notes

### Diagnostic Flag
- Add `testLowRelaxation: true` to `testOptions.politicsMode`
- Check in `buildStalbergQuadGrid`:
  ```javascript
  const relaxationIterations = options.politicsMode?.testLowRelaxation
    ? 1
    : (options.politicsMode?.relaxationIterations ?? 100);
  ```

### Logging
- Log relaxation test mode: `"Relaxation test: iterations=1, center chaos? Manual check"`
- Log cell size variance before/after relaxation
- Compare metrics: CV with 1 iteration vs 100 iterations

### Keep v6 Fixes
- Keep adaptive damping (may help even with 1 iteration)
- Keep soft boundary (may help even with 1 iteration)
- Keep reduced aspect (1.15)
- Test their effect with minimal relaxation

---

## Next Steps After Diagnosis

1. **If relaxation confirmed as culprit:**
   - Rollback to 0-1 iterations
   - Remove or minimize relaxation calls
   - Rely on initial hex grid quality
   - Use dual offset only for rounding

2. **If relaxation NOT the issue:**
   - Investigate dual offset (may cause overlaps)
   - Check triangulation quality
   - Review dissolution algorithm
   - Check for other sources of chaos

3. **Hybrid approach:**
   - Minimal relaxation (1-5 iterations)
   - Tuned for specific use case
   - Balance between smoothing and chaos
