# Cross-Stage Audit Report: Stage 3 & Stage 4
**Date:** 2026-01-15  
**Focus:** Missed Merge Opportunities in Stage 3 + Subdivision Completeness in Stage 4

## Overview

This report documents a cross-stage audit to identify why Stage 3 dissolution leaves more triangles than ideal (including potential missed quads) and to verify that Stage 4 subdivision processes all remaining triangles correctly.

### Key Findings

1. **Stage 3 - No Direct Missed Merges:** Remaining triangles do NOT share edges with each other (no pairs that could form quads). However, some triangles share edges with created quads, indicating they could have been merged if selected earlier.

2. **Stage 3 - Probability Skips:** 15.4% of attempts were skipped due to probability (dissolveProbability=0.85), potentially missing valid merge opportunities.

3. **Stage 4 - Complete Subdivision:** All 28 remaining triangles were successfully subdivided into 84 quads (3 per triangle), with 0 triangles remaining.

4. **Root Cause:** Remaining triangles are isolated (boundary triangles or triangles whose neighbors were already merged), not pairs that could be merged.

## Stage 3 Analysis: Missed Merge Opportunities

### 1. Remaining Triangles Analysis

**Location:** `src/core/dualGridStates.js:1549-1610`

**Code Added:**
```javascript
// CROSS-STAGE AUDIT: Analyze missed merge opportunities
if (debugMode && remainingTriangles.length > 0) {
  // Build edge map for remaining triangles
  const remainingEdgeMap = buildEdgeMap(remainingTriangles.map(t => ({ ...t, removed: false })));
  
  // Find edges shared by exactly 2 remaining triangles
  const missedMergeCandidates = Array.from(remainingEdgeMap.entries())
    .filter(([edgeKey, triObjects]) => triObjects.length === 2);
}
```

**Results from Logs:**
```
[dissolveEdgesToQuads] CROSS-STAGE AUDIT: Analyzing 28 remaining triangles for missed merge opportunities
[dissolveEdgesToQuads] CROSS-STAGE AUDIT: No missed merge opportunities found (no edges shared by 2 remaining triangles)
```

**Analysis:**
- ✅ No pairs of remaining triangles share edges
- ✅ Remaining triangles are isolated (boundary triangles or triangles whose neighbors were already merged)
- ⚠️ This doesn't mean there weren't missed opportunities earlier in the process

### 2. Adjacent Triangle Analysis

**Code Added:**
```javascript
// Check if remaining triangles share edges with created quads
// This would indicate they could have been merged if selected earlier
const quadEdgeSet = new Set();
quads.forEach(quad => {
  // Collect all edges from created quads
});

remainingTriangles.forEach(tri => {
  // Check if triangle edges are shared with quads
  if (sharedWithQuads.length > 0) {
    trianglesAdjacentToQuads++;
  }
});
```

**Results:**
- Analysis shows some remaining triangles share edges with created quads
- This indicates they could have been merged if selected earlier in the dissolution process
- However, once a triangle's neighbor is merged into a quad, it can no longer be merged with that neighbor

### 3. Rejection Breakdown

**From Logs:**
```
[dissolveEdgesToQuads] CROSS-STAGE AUDIT: Rejection breakdown - 19 probability skips, 0 invalid edges, 0 degenerate quads
[dissolveEdgesToQuads] CROSS-STAGE AUDIT: Probability skips represent 15.4% of attempts (dissolveProbability=0.85)
[dissolveEdgesToQuads] CROSS-STAGE AUDIT: Success rate: 83.7% (103 successful out of 123 attempts)
```

**Analysis:**
- ✅ 83.7% success rate (good)
- ⚠️ 15.4% probability skips (could be reduced by increasing dissolveProbability)
- ✅ 0 invalid edges (validation working correctly)
- ✅ 0 degenerate quads (quad creation working correctly)

### 4. Why Merges Were Missed

**Primary Reasons:**
1. **Probability Skips (15.4%):** Random probability check rejected valid merge attempts
   - Current: `dissolveProbability=0.85`
   - Recommendation: Increase to 0.90-0.95 to reduce skips

2. **Neighbor Already Merged:** Some triangles couldn't be merged because their neighbors were already merged into quads earlier
   - This is expected behavior (can't merge a triangle with a quad)
   - No fix needed - this is correct behavior

3. **Boundary Triangles:** Some remaining triangles are boundary triangles (share edges with hex boundary)
   - Boundary edges can't be dissolved (they're not internal)
   - No fix needed - this is correct behavior

**Evidence from Screenshot:**
- User reports seeing a "potential quad" (two triangles that look adjacent)
- This could be:
  - Two triangles that share an edge but one was already merged
  - Two triangles that look adjacent but don't actually share an edge
  - A visual artifact from rendering

## Stage 4 Analysis: Subdivision Completeness

### 1. Pre-Subdivision Verification

**Location:** `src/core/dualGridStates.js:477-491`

**Code Added:**
```javascript
// CROSS-STAGE AUDIT: Track all triangles to ensure none are missed
const allTrianglesInInput = quads.filter(s => s.type === 'triangle');
const processedTriangleVerts = new Set();

console.log(`[buildStalbergQuadGrid] CROSS-STAGE AUDIT: All triangles to process:`, allTrianglesInInput.map(t => t.verts));
```

**Results from Logs:**
```
[buildStalbergQuadGrid] CROSS-STAGE AUDIT: Stage 4 - Processing 131 shapes (103 quads, 28 triangles)
[buildStalbergQuadGrid] CROSS-STAGE AUDIT: All triangles to process: [array of 28 triangle vertex sets]
```

**Analysis:**
- ✅ All 28 triangles identified before subdivision
- ✅ No triangles missed in input

### 2. Subdivision Processing

**Code Added:**
```javascript
for (const shape of quads) {
  if (shape.type === 'triangle' && !skipTriangleSubdivision) {
    const vertsKey = shape.verts.sort((a, b) => a - b).join(',');
    processedTriangleVerts.add(vertsKey);
    
    const subQuads = subdivideTriangleIntoThreeQuads(shape, points, addPoint, midpoint);
    // Verify subdivision result
    if (subQuads.length !== 3) {
      console.warn(`WARNING - Triangle subdivision returned ${subQuads.length} quads (expected 3)`);
    }
  }
}
```

**Results from Logs:**
```
[buildStalbergQuadGrid] CROSS-STAGE AUDIT: SUCCESS - All 28 triangles were processed
[buildStalbergQuadGrid] CROSS-STAGE AUDIT: Counts match - 28 triangles → 84 quads (3 per triangle)
[buildStalbergQuadGrid] After subdivision: 187 quads (28 triangles subdivided into 84 quads)
[buildStalbergQuadGrid] CROSS-STAGE AUDIT: SUCCESS - All triangles subdivided, 0 triangles remaining
```

**Analysis:**
- ✅ All 28 triangles processed
- ✅ All subdivisions returned exactly 3 quads each
- ✅ Counts match: 28 × 3 = 84 new quads
- ✅ 0 triangles remaining after subdivision

### 3. Post-Subdivision Verification

**Code Added:**
```javascript
// Verify all triangles were processed
const allTriangleVerts = new Set(allTrianglesInInput.map(t => t.verts.sort((a, b) => a - b).join(',')));
const unprocessedTriangles = Array.from(allTriangleVerts).filter(v => !processedTriangleVerts.has(v));

if (unprocessedTriangles.length > 0) {
  console.error(`ERROR - ${unprocessedTriangles.length} triangles were NOT processed`);
} else {
  console.log(`SUCCESS - All ${remainingTrianglesBefore.length} triangles were processed`);
}
```

**Results:**
- ✅ No unprocessed triangles found
- ✅ All triangles successfully subdivided

## Bugs/Issues Identified

### Issue 1: Probability Skips Reduce Merge Opportunities (MEDIUM)

**Evidence:**
- 15.4% of attempts skipped due to probability
- Some valid merge opportunities may be missed

**Impact:**
- More triangles remain after Stage 3 than necessary
- Lower conversion rate (83.7% success, but could be higher)

**Recommendation:**
- Increase `dissolveProbability` from 0.85 to 0.90-0.95
- This would reduce probability skips from 15.4% to ~5-10%

### Issue 2: No Final Merge Pass (LOW)

**Evidence:**
- Remaining triangles are isolated (no pairs to merge)
- However, some triangles share edges with quads (could have been merged earlier)

**Impact:**
- Minor - remaining triangles are correctly isolated
- No fix needed - this is expected behavior

### Issue 3: Visual "Potential Quad" in Screenshot (UNKNOWN)

**Evidence:**
- User reports seeing a "potential quad" in zoomed screenshot
- Analysis shows no pairs of remaining triangles share edges

**Possible Explanations:**
1. Two triangles that look adjacent but don't share an edge (visual artifact)
2. Two triangles where one was already merged (can't merge triangle with quad)
3. Boundary triangles that appear adjacent but share boundary edges (can't dissolve)

**Recommendation:**
- Add visual debugging to highlight remaining triangles and their edges
- Add tooltip showing triangle vertices and shared edges

## Recommendations

### Priority 1: Increase Dissolution Probability (URGENT)

**Action:**
- Change `dissolveProbability` from 0.85 to 0.90-0.95
- This will reduce probability skips and increase merge opportunities

**Expected Result:**
- Probability skips reduced from 15.4% to ~5-10%
- Higher conversion rate (from 83.7% to ~90%+)
- Fewer remaining triangles after Stage 3

### Priority 2: Add Final Merge Pass (MEDIUM)

**Action:**
- After main dissolution loop, check if any remaining triangles can still be merged
- Use higher probability (0.95) for final pass
- Limit to 1-2 passes to avoid infinite loops

**Expected Result:**
- Catch any remaining merge opportunities
- Further reduce remaining triangles

### Priority 3: Visual Debugging (LOW)

**Action:**
- Add visual highlighting for remaining triangles in Stage 3
- Show edges shared with quads vs. boundary edges
- Add tooltip with triangle vertices and merge status

**Expected Result:**
- Easier identification of "potential quads"
- Better understanding of why merges were missed

## Test Results

### Stage 3 Results:
- **Input:** 234 triangles
- **Output:** 103 quads + 28 triangles
- **Success Rate:** 83.7% (103 successful out of 123 attempts)
- **Probability Skips:** 15.4% (19 out of 123 attempts)
- **Remaining Triangles:** 28 (all isolated, no pairs to merge)

### Stage 4 Results:
- **Input:** 28 triangles
- **Output:** 84 quads (28 × 3 = 84)
- **Processing:** 100% complete (all triangles subdivided)
- **Remaining Triangles:** 0 (all successfully subdivided)

## Conclusion

### Stage 3 Findings:
- ✅ No direct missed merges (remaining triangles don't share edges)
- ⚠️ Probability skips (15.4%) reduce merge opportunities
- ✅ Validation working correctly (0 invalid edges, 0 degenerate quads)
- ✅ Remaining triangles are correctly isolated (boundary or neighbors already merged)

### Stage 4 Findings:
- ✅ All triangles successfully subdivided
- ✅ Counts match exactly (28 triangles → 84 quads)
- ✅ No triangles missed or skipped
- ✅ Subdivision function working correctly

### Top Issues:
1. **Probability skips (15.4%)** - Increase dissolveProbability to 0.90-0.95
2. **Visual "potential quad"** - May be visual artifact or already-merged neighbor
3. **No final merge pass** - Could catch remaining opportunities (low priority)

### Next Steps:
1. **Increase dissolveProbability** to 0.90-0.95 and re-test
2. **Add visual debugging** to identify "potential quads" in screenshot
3. **Consider final merge pass** if probability increase doesn't reduce remaining triangles enough
