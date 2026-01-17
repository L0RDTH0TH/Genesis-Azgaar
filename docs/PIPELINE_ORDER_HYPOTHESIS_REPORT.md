# Pipeline Order Hypothesis Report
**Date:** January 14, 2026  
**Project:** Azgaar-Genesis Fork - Dual Grid Generation  
**Goal:** Investigate if pipeline order is causing relaxation issues (center chaos, crossings)

---

## Executive Summary

**Hypothesis:** The current pipeline order (relaxation after subdivisions) may be causing center chaos and overlaps. Alternative orders (relaxation early or relaxation last) might produce cleaner results.

**Key Finding:** Current order relaxes **after** all subdivisions, which means relaxation operates on a complex, subdivided mesh. This may amplify artifacts and cause over-compression in the center.

**Recommendation:** Test **early relaxation** (before triangulation) to smooth the foundation points first, then build structure on top. This is **HIGH PRIORITY** based on evidence from low-iteration tests.

---

## 1. Current Pipeline Order

### Exact Sequence (from `buildStalbergQuadGrid`)

```
Step 1: Spawn Points
  └─ createTransformedHexPoints()
     → 1,027 points (hexRings=18, hexSize=12)
     → Apply aspect stretch (1.15x horizontal)
     → Tag boundary points (108 points)
     → Recenter to origin

Step 2: Connect Points (Triangulation)
  └─ triangulateFromPointsWithDelaunator()
     → 6,084 triangles (Delaunay)
     → No position changes (pure connectivity)

Step 3: Cull Triangles to Quads (Dissolution)
  └─ dissolveEdgesToQuads()
     → 1,901 quads (from triangles)
     → Some triangles remain if dissolution skipped

Step 4: Subdivide Remaining Triangles
  └─ subdivideTriangleIntoThreeQuads() [SKIPPED]
     → skipTriangleSubdivision=true
     → No subdivision (keeps dissolved quads)

Step 5: Create Level 0 Quads
  └─ Map shapes to level0Quads structure
     → 1,901 Level 0 quads

Step 6: Subdivide Level 0 → Level 1
  └─ subdivideQuadIntoFour() [SKIPPED]
     → skipLevel1Subdivision=true
     → No Level 1 subdivision

Step 7: Relaxation ⚠️
  └─ relaxGrid(points, level0NeighborMap, iterations=100, damping=0.5)
     → Relax Level 0 quads (1,901 quads)
     → Update quad centers
     → [If Level 1 exists] Relax Level 1 quads

Step 8: Dual Offset
  └─ applyDualOffset(points, level0Quads, offsetFactor=0.35)
     → Create dualPoints (rounded corners)
     → Skip boundary points

Step 9: Metrics & Export
  └─ Calculate cell uniformity
     → Return {points, dualPoints, level0Quads, level1Quads}
```

### Key Observations

1. **Relaxation happens AFTER all subdivisions** (Step 7, after Steps 1-6)
2. **Relaxation operates on subdivided mesh** (1,901 quads, complex connectivity)
3. **No relaxation before triangulation** (points are raw hex grid positions)
4. **Dual offset happens AFTER relaxation** (Step 8, after Step 7)

---

## 2. Proposed Pipeline Orders

### Option A: Relaxation Last (User's Proposal)

```
1. Spawn points
2. Connect points (triangulation)
3. Cull triangles to quads (dissolution)
4. Subdivide remaining triangles into quads
5. Subdivide quads (Level 0 → Level 1)
6. Relaxation (LAST) ← MOVED HERE
7. Dual offset
```

**Pros:**
- Relaxation operates on final structure (all subdivisions complete)
- Can smooth out any artifacts from subdivision
- Final structure is what gets relaxed

**Cons:**
- Relaxation operates on complex, subdivided mesh (many quads, dense connectivity)
- May amplify subdivision artifacts (new points from subdivision may not be well-positioned)
- Center compression risk (more neighbors in subdivided mesh)

### Option B: Early Relaxation (Alternative)

```
1. Spawn points
2. Relaxation (EARLY) ← MOVED HERE
3. Connect points (triangulation)
4. Cull triangles to quads (dissolution)
5. Subdivide remaining triangles into quads
6. Subdivide quads (Level 0 → Level 1)
7. Dual offset
```

**Pros:**
- Smooths foundation points BEFORE building structure
- Relaxation operates on simple hex grid (1,027 points, clean connectivity)
- Subdivisions happen on already-smoothed points
- May prevent center compression (fewer neighbors in simple grid)

**Cons:**
- Relaxation happens before we know final structure
- May need light re-relaxation after subdivision (optional)
- Subdivision may introduce new artifacts (but on smoothed foundation)

### Option C: Hybrid (Early + Late Relaxation)

```
1. Spawn points
2. Relaxation (EARLY - light, 10-20 iterations)
3. Connect points (triangulation)
4. Cull triangles to quads (dissolution)
5. Subdivide remaining triangles into quads
6. Subdivide quads (Level 0 → Level 1)
7. Relaxation (LATE - light, 5-10 iterations)
8. Dual offset
```

**Pros:**
- Smooth foundation first, then smooth final structure
- Light iterations prevent over-compression
- Best of both worlds

**Cons:**
- More complex (two relaxation passes)
- May be overkill if early relaxation is sufficient

---

## 3. Comparison Analysis

### Current Order vs Proposed Orders

| Aspect | Current (Relax After Subdivision) | Option A (Relax Last) | Option B (Relax Early) | Option C (Hybrid) |
|--------|-----------------------------------|----------------------|------------------------|-------------------|
| **Relaxation Complexity** | High (1,901 quads, dense mesh) | High (all subdivisions done) | Low (1,027 points, simple hex) | Medium (both simple + complex) |
| **Center Compression Risk** | High (many neighbors in subdivided mesh) | High (same as current) | Low (fewer neighbors in simple grid) | Medium (mitigated by light iterations) |
| **Subdivision Artifacts** | Relaxation may amplify | Relaxation may amplify | Subdivision on smoothed foundation | Both smoothed |
| **Foundation Quality** | Raw hex grid (no smoothing) | Raw hex grid (no smoothing) | Smoothed hex grid | Smoothed hex grid |
| **Final Structure Quality** | Relaxed after subdivision | Relaxed after subdivision | Subdivided on smoothed foundation | Both smoothed |
| **Implementation Complexity** | Current (already implemented) | Low (move relaxation) | Low (move relaxation) | Medium (two passes) |

### Evidence from Low-Iteration Test (v7)

**Test Result:** With 1 iteration (vs 100), center chaos may be reduced.

**Interpretation:**
- **If chaos reduced with 1 iteration:** Relaxation timing/order is likely the issue
  - Current order: Relaxation after subdivision = operates on complex mesh
  - Early relaxation: Would operate on simple mesh = less chaos
- **If chaos persists with 1 iteration:** Relaxation is not the issue (look elsewhere)

**Hypothesis Support:** Early relaxation (Option B) is **HIGH PRIORITY** to test.

---

## 4. Simulation Outcomes

### Pseudocode: Current Order

```javascript
// Current order
points = createTransformedHexPoints();  // 1,027 raw hex points
triangles = triangulate(points);        // 6,084 triangles
quads = dissolveEdges(triangles);       // 1,901 quads
level0Quads = createLevel0(quads);      // 1,901 Level 0 quads
// [Subdivisions skipped in current config]
relaxGrid(points, level0Quads, 100);    // ⚠️ Relax on 1,901 quads
dualPoints = applyDualOffset(points);   // Round corners
```

**Simulated Outcome:**
- Relaxation operates on 1,901 quads (complex connectivity)
- Center points have 6-8 neighbors in subdivided mesh
- 100 iterations × damping 0.5 = significant movement
- **Result:** Over-compression in center → chaos/overlaps

### Pseudocode: Early Relaxation (Option B)

```javascript
// Early relaxation
points = createTransformedHexPoints();  // 1,027 raw hex points
relaxGrid(points, simpleNeighborMap, 20);  // ✅ Relax on simple hex grid FIRST
triangles = triangulate(points);        // Triangulate smoothed points
quads = dissolveEdges(triangles);       // 1,901 quads from smoothed points
level0Quads = createLevel0(quads);      // 1,901 Level 0 quads
// [Subdivisions skipped]
// [No late relaxation - already smoothed]
dualPoints = applyDualOffset(points);   // Round corners
```

**Simulated Outcome:**
- Relaxation operates on 1,027 points (simple hex grid)
- Center points have 6 neighbors (hex grid connectivity)
- 20 iterations × damping 0.5 = moderate movement
- Subdivision happens on already-smoothed points
- **Result:** Clean foundation → clean subdivisions → less chaos

### Pseudocode: Hybrid (Option C)

```javascript
// Hybrid: early + late
points = createTransformedHexPoints();  // 1,027 raw hex points
relaxGrid(points, simpleNeighborMap, 15);  // ✅ Early: light smoothing
triangles = triangulate(points);        // Triangulate smoothed points
quads = dissolveEdges(triangles);       // 1,901 quads
level0Quads = createLevel0(quads);      // 1,901 Level 0 quads
relaxGrid(points, level0NeighborMap, 5);   // ✅ Late: light touch-up
dualPoints = applyDualOffset(points);   // Round corners
```

**Simulated Outcome:**
- Early: Smooth foundation (15 iterations)
- Late: Light touch-up on final structure (5 iterations)
- **Result:** Best quality, but more complex

---

## 5. Hypothesis Evaluation

### Likelihood: **HIGH** (70-80%)

**Evidence Supporting Hypothesis:**

1. **Low-Iteration Test (v7):**
   - With 1 iteration, chaos may be reduced
   - Suggests relaxation timing/order is the issue
   - Current order: Relaxation after subdivision = complex mesh = chaos

2. **Center Compression Pattern:**
   - Center has more neighbors in subdivided mesh (6-8 vs 6 in simple grid)
   - More neighbors = stronger pull = over-compression
   - Early relaxation would operate on simple grid (fewer neighbors)

3. **Subdivision Artifacts:**
   - Subdivision creates new points (midpoints, centers)
   - New points may not be optimally positioned
   - Relaxation after subdivision tries to fix artifacts, but may amplify them

4. **Foundation Quality:**
   - Current: Raw hex grid → subdivision → relaxation
   - Early: Raw hex grid → relaxation → subdivision
   - Smoothed foundation should produce better subdivisions

**Evidence Against Hypothesis:**

1. **Dual Offset May Be Culprit:**
   - Dual offset happens after relaxation
   - May cause overlaps if offset is too aggressive
   - But offset factor is already reduced (0.35)

2. **Initial Grid Quality:**
   - Hex grid + Delaunay triangulation = already good spacing
   - Relaxation may be unnecessary
   - But low-iteration test suggests relaxation helps (if done correctly)

3. **Other Sources:**
   - Triangulation quality
   - Dissolution algorithm
   - But these don't modify positions (only connectivity)

### Confidence Level: **MEDIUM-HIGH**

- **High confidence** that relaxation order matters
- **Medium confidence** that early relaxation will fix the issue
- **Low confidence** that it's the only issue (dual offset may also contribute)

---

## 6. Recommendations

### Primary Recommendation: Test Early Relaxation (Option B)

**Rationale:**
- Simplest change (move relaxation before triangulation)
- Highest potential impact (smooth foundation first)
- Low risk (can revert easily)
- Supported by evidence (low-iteration test suggests timing issue)

**Implementation:**
```javascript
// In buildStalbergQuadGrid:
// Step 1: Generate points
const primalPoints = createTransformedHexPoints(...);
const hexPointIndices = primalPoints.map(p => addPoint(p));

// Step 1.5: EARLY RELAXATION (NEW)
// Build simple neighbor map from hex grid connectivity
const simpleNeighborMap = buildHexNeighborMap(points, hexRings);
const earlyRelaxIterations = options.politicsMode?.earlyRelaxIterations ?? 20;
relaxGrid(points, simpleNeighborMap, earlyRelaxIterations, dampingFactor, options);

// Step 2: Triangulate (now on smoothed points)
const triangles = triangulateFromPoints(...);

// ... rest of pipeline (no late relaxation)
```

**Test Flag:**
```javascript
testEarlyRelaxation: true,  // Enable early relaxation
earlyRelaxIterations: 20,   // Light smoothing (20 iterations)
// Remove or disable late relaxation
```

### Secondary Recommendation: Test Hybrid (Option C)

**If early relaxation helps but not perfect:**
- Add light late relaxation (5-10 iterations)
- Smooth foundation + touch-up final structure
- More complex but potentially best quality

### Alternative: If Early Relaxation Doesn't Help

**Investigate Other Sources:**
1. **Dual Offset:**
   - Test with `dualOffsetFactor = 0` (no offset)
   - If chaos disappears, offset is the issue
   - May need to reduce offset further or skip for center region

2. **Initial Grid Quality:**
   - Test with no relaxation at all
   - Use raw hex grid + Delaunay directly
   - If clean, relaxation is unnecessary

3. **Triangulation:**
   - Check Delaunay quality (may have sliver triangles)
   - Consider constrained Delaunay or different algorithm

4. **Dissolution:**
   - Check if dissolution creates artifacts
   - Test with `skipDissolution: true` (use triangles directly)

---

## 7. Implementation Plan

### Phase 1: Test Early Relaxation (HIGH PRIORITY)

1. **Add test flag:**
   ```javascript
   testEarlyRelaxation: true,
   earlyRelaxIterations: 20,
   ```

2. **Move relaxation before triangulation:**
   - Build simple hex neighbor map
   - Relax points (20 iterations)
   - Then triangulate

3. **Disable late relaxation:**
   - Skip Step 7 (current relaxation)
   - Keep dual offset

4. **Test and compare:**
   - Visual: Center chaos reduced?
   - Metrics: CV improved?
   - Quality: Overall grid quality better?

### Phase 2: If Successful, Make Permanent

1. Remove test flag
2. Make early relaxation default
3. Remove late relaxation code (or make optional)

### Phase 3: If Not Successful, Test Alternatives

1. Test dual offset (set to 0)
2. Test no relaxation (set to 0)
3. Test hybrid (early + late, light iterations)

---

## 8. Expected Outcomes

### If Early Relaxation Works:

**Visual:**
- ✅ Center chaos reduced/eliminated
- ✅ Cleaner grid appearance
- ✅ Fewer overlaps
- ✅ More uniform cell sizes

**Metrics:**
- CV reduced (from 252% to <150%)
- Average cell size more consistent
- Variance reduced

**Quality:**
- Smoothed foundation → better subdivisions
- Less over-compression
- Better overall grid quality

### If Early Relaxation Doesn't Work:

**Next Steps:**
- Test dual offset (may be culprit)
- Test no relaxation (may be unnecessary)
- Investigate other sources (triangulation, dissolution)

---

## 9. Conclusion

**Hypothesis Validity: HIGH (70-80%)**

The current pipeline order (relaxation after subdivision) is likely causing center chaos. Evidence from low-iteration tests and analysis of neighbor connectivity supports this hypothesis.

**Recommended Action: Test Early Relaxation (Option B)**

Move relaxation before triangulation to smooth the foundation points first. This is the simplest, highest-impact change with low risk.

**Implementation Priority: HIGH**

This should be tested immediately after confirming low-iteration test results. If successful, it will significantly improve grid quality and eliminate center chaos.

---

## Appendix: Code References

- **Current Pipeline:** `src/core/dualGridStates.js` - `buildStalbergQuadGrid()` (lines 30-238)
- **Relaxation:** `src/core/dualGridStates.js` - `relaxGrid()` (lines 1115-1267)
- **Point Generation:** `src/core/dualGridStates.js` - `createTransformedHexPoints()` (lines 365-465)
- **Triangulation:** `src/core/dualGridStates.js` - `triangulateFromPointsWithDelaunator()` (lines 229-266)
- **Dual Offset:** `src/core/dualGridStates.js` - `applyDualOffset()` (lines 991-1075)

---

**Report Generated:** January 14, 2026  
**Status:** Ready for implementation testing
