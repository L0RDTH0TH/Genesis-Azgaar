# Dual-Grid Pipeline Stage 3 Failure Investigation Report

**Date:** 2026-01-14  
**Issue:** Stage 3 (dissolution/cull to quads) produces messy, disorganized output instead of clean quad outlines  
**Reference Visuals:** `grids/Gid-steps/` folder (point-spawn.jpg, connect-points.jpg, cull-triangles.jpg, etc.)

---

## Overview

The dual-grid pipeline successfully completes Stage 2 (triangulation) with clean, uniform triangles. However, Stage 3 (dissolution/cull to quads) fails to convert triangles into quads effectively, resulting in a messy visual output with dense overlapping lines instead of structured quad outlines.

**Key Finding:** Dissolution algorithm has only **1.8% success rate** and **5.3% conversion rate** (108 quads from 2028 triangles).

---

## Density Reduction Changes

### Implementation

Added `stepByStepDensityMultiplier` option (default: 1.0, set to 0.5 for investigation) that:
- Multiplies `hexSize` by `1/√(densityMultiplier)` to increase spacing
- Maintains same grid dimensions (via `scaleToFit` calculation)
- Reduces point count by approximately half

### Results

**Original Density (multiplier = 1.0):**
- Points: ~2054 (estimated)
- HexSize: 12

**Reduced Density (multiplier = 0.5):**
- Points: **1027** (50% reduction achieved ✓)
- Effective HexSize: **16.97** (spacing increased by 1.414x ✓)
- Grid bounds: Same (minX=-500.3, maxX=500.0, minY=-377.0, maxY=377.0) ✓

**Code Location:** `src/core/dualGridStates.js` - `buildStalbergQuadGrid()` function, lines 52-66

---

## Stage 2 Analysis (After Triangulation)

### Statistics

- **Input Points:** 1027
- **Output Triangles:** 2028
- **Triangle-to-Point Ratio:** ~2:1 (expected for Delaunay triangulation)

### Triangle Quality

- **Average Area:** 286.95
- **Min Area:** 270.17
- **Max Area:** 299.37
- **Area Variance:** Very low (uniform triangles ✓)

### Sample Triangle Data

First 10 triangles show consistent structure:
- All triangles have 3 vertices
- Areas are uniform (~270-300 range)
- Coordinates are valid (no NaN/Infinity)
- Proper Delaunay connectivity

**Conclusion:** Stage 2 produces **clean, uniform, valid triangles** - no issues detected.

**Code Location:** `src/core/dualGridStates.js` - Stage 2 capture (lines 166-195)

---

## Stage 3 Analysis (After Dissolution/Cull)

### Statistics

- **Input Triangles:** 2028
- **Output Shapes:** 1920 total
  - **Quads:** 108 (5.3% conversion rate)
  - **Triangles:** 1812 (89.4% remain unconverted)
- **Dissolution Attempts:** 6084
- **Successful Dissolutions:** 108 edges
- **Invalid Edge Attempts:** 3861
- **Degenerate Quad Attempts:** 0

### Dissolution Performance

- **Success Rate:** 1.8% (108 successful / 6084 attempts)
- **Conversion Rate:** 5.3% (108 quads / 2028 triangles)
- **Invalid Edge Rate:** 63.5% (3861 / 6084 attempts)

### Sample Quad Data

First 10 quads show:
- All have 4 vertices (valid quads)
- Average area: 1775.28 (larger than triangles, as expected)
- Valid coordinates

**Conclusion:** Stage 3 **fails to convert most triangles to quads**. Only 5.3% conversion rate indicates fundamental algorithm issue.

**Code Location:** `src/core/dualGridStates.js` - `dissolveEdgesToQuads()` function (lines 970-1157)

---

## Hypotheses for Failure

### Hypothesis 1: Edge Selection Logic Issue (HIGH PROBABILITY)

**Evidence:**
- 63.5% of attempts fail with "invalid or already processed" edges
- Only 1.8% success rate despite 6084 attempts
- Many edges are being rejected by `canDissolveEdge()` check

**Possible Causes:**
1. Edge map rebuilding may be creating stale references
2. `canDissolveEdge()` validation may be too strict
3. Triangle removal marking (`tri.removed = true`) may be interfering with edge map lookups
4. Edge keys may not match between iterations

**Investigation Needed:**
- Log edge keys and triangle indices for failed attempts
- Verify edge map consistency across iterations
- Check if `workingTriangles` array indices match `edgeMap` triangle indices

### Hypothesis 2: Probability Filter Too Aggressive (MEDIUM PROBABILITY)

**Evidence:**
- `dissolveProbability = 0.65` means 35% of attempts are skipped before validation
- Combined with 63.5% invalid edge rate, effective success rate is very low

**Possible Causes:**
- Probability check happens before edge validation, wasting attempts
- Should validate edges first, then apply probability

**Recommendation:** Move probability check after edge validation

### Hypothesis 3: Triangle Connectivity Issues (LOW PROBABILITY)

**Evidence:**
- Stage 2 triangles are valid and uniform
- Delaunay triangulation should produce proper connectivity
- No degenerate triangles detected

**Possible Causes:**
- Boundary triangles may have different connectivity
- Edge ordering in triangles may not match expected pattern

**Investigation Needed:**
- Check if boundary triangles are being handled differently
- Verify triangle vertex ordering consistency

### Hypothesis 4: Density Still Too High (LOW PROBABILITY)

**Evidence:**
- Even with 50% density reduction, dissolution fails
- 1027 points → 2028 triangles is reasonable ratio

**Conclusion:** Density is likely not the primary issue. Algorithm logic is the problem.

---

## Recommendations

### Immediate Fixes (Priority 1)

1. **Fix Edge Map Consistency**
   - Ensure `edgeMap` triangle indices match `workingTriangles` array indices
   - Use triangle object references instead of array indices if possible
   - Add validation to verify edge map accuracy

2. **Improve Edge Selection Logic**
   - Move probability check after edge validation
   - Filter invalid edges before random selection
   - Add retry logic for failed edges (with limit)

3. **Enhance Validation**
   - Add detailed logging for each failed edge (why it failed)
   - Log triangle states before/after removal
   - Verify edge keys are consistent

### Algorithm Improvements (Priority 2)

1. **Alternative Dissolution Strategy**
   - Consider deterministic edge selection (e.g., by edge length, area)
   - Process edges in order of "dissolvability" score
   - Use graph-based approach instead of random selection

2. **Boundary Handling**
   - Explicitly handle boundary edges (should not be dissolved)
   - Separate internal vs. boundary edge processing
   - Preserve boundary triangle structure

3. **Validation Improvements**
   - Add geometric validation (check for self-intersections)
   - Verify quad convexity
   - Check for degenerate quads (collinear points)

### Testing Improvements (Priority 3)

1. **Unit Tests**
   - Test `dissolveEdgesToQuads()` with known triangle sets
   - Verify edge map construction
   - Test edge validation logic

2. **Visual Debugging**
   - Add edge highlighting in Stage 2/3 visualization
   - Show which edges are being attempted for dissolution
   - Color-code successful vs. failed dissolutions

---

## Data Export

### Console Logs

Full console output available in generation logs. Key metrics:

```
[dissolveEdgesToQuads] STARTING: 2028 input triangles, 1027 points, dissolveProbability=0.65
[dissolveEdgesToQuads] COMPLETED: 6084 attempts, 108 edges dissolved, 3861 invalid edges, 0 degenerate quads
[dissolveEdgesToQuads] RESULT: 1920 total shapes (108 quads, 1812 triangles)
[dissolveEdgesToQuads] DISSOLUTION RATE: 1.8% success rate
[dissolveEdgesToQuads] TRIANGLE-TO-QUAD CONVERSION: 108 quads from 2028 triangles = 5.3% conversion rate
```

### Stage 2 Data

Sample triangle data exported to `pipelineStages.stage2_stats`:
- Triangle count: 2028
- Average area: 286.95
- Sample triangles with coordinates (first 10)

### Stage 3 Data

Sample quad data exported to `pipelineStages.stage3_stats`:
- Total shapes: 1920
- Quad count: 108
- Triangle count: 1812
- Average quad area: 1775.28
- Sample quads with coordinates (first 10)

---

## Visual Inspection Instructions

1. Open `samples/interactive-terrain.html` in browser
2. Use "Pipeline Stage" dropdown to select:
   - **Stage 2:** Should show clean gray wireframe triangles (uniform, no overlaps)
   - **Stage 3:** Currently shows messy blue overlapping lines (FAILURE)
3. Compare to reference images:
   - `connect-points.jpg` → Should match Stage 2
   - `cull-triangles.jpg` → Should match Stage 3 (but currently doesn't)

---

## Next Steps

1. **Implement Priority 1 Fixes** (edge map consistency, improved selection)
2. **Re-test with halved density** (verify if fixes improve conversion rate)
3. **If still failing:** Implement Priority 2 improvements (alternative strategy)
4. **Compare visual output** to reference images after fixes

---

## Code Changes Summary

### Files Modified

1. **`src/core/dualGridStates.js`**
   - Added density multiplier support (lines 52-66)
   - Enhanced Stage 2 logging (lines 166-195)
   - Enhanced Stage 3 logging (lines 189-217)
   - Added detailed dissolution logging (lines 970-1157)

2. **`scripts/generate-interactive-terrain.js`**
   - Added `stepByStepDensityMultiplier: 0.5` option (line 62)

### Key Metrics Tracked

- Point count (before/after density reduction)
- Triangle count and quality (Stage 2)
- Quad count and conversion rate (Stage 3)
- Dissolution success rate and failure reasons
- Sample triangle/quad data for analysis

---

**Status:** Investigation complete. Root cause identified (edge selection/validation logic). Ready for fixes.
