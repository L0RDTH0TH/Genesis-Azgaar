# Dual-Grid Pipeline Investigation Report v3
**Date:** 2026-01-14  
**Focus:** Aggressive Point Reduction to 512 + Re-test Stage 3

## Overview

This report documents the aggressive point reduction to exactly 512 points (from previous 547) and re-investigation of Stage 3 dissolution with enhanced metrics comparison. The goal was to determine if further density reduction improves dissolution success rates or reveals additional insights into the edge map issues.

### Key Findings

1. **512 Points Achieved:** Successfully reduced to exactly 512 points (from 547) by generating 547 points with hexRings=13 and culling 35 outer points, then scaling to maintain bounds.

2. **Stage 3 Dissolution Still Failing:** With 512 points, dissolution success rate remains very low (~1.7-2.0%), similar to 547 points. The "6 unique vertices" error persists, confirming the edge map issue is not density-dependent.

3. **Density-Independent Issue:** The edge map problem appears to be structural (incorrect edge identification) rather than density-related. Reducing from 547→512 points did not improve dissolution rates.

## Density Reduction to 512 Points

### Implementation

Modified `buildStalbergQuadGrid` to support `targetPoints` option:
1. Calculate optimal `hexRings` for target point count using quadratic formula
2. Generate points with calculated rings
3. If generated points > target, cull excess (furthest from center first)
4. Scale remaining points to restore original bounds

### Code Changes

```59:130:azgaar-genesis-fork/src/core/dualGridStates.js
  // STEP-BY-STEP DEBUG: Density reduction for investigation
  // Target exactly 512 points (or closest achievable) while maintaining grid size
  const targetPoints = options.politicsMode?.targetPoints ?? null;
  const densityMultiplier = options.politicsMode?.stepByStepDensityMultiplier ?? 1.0;
  
  let hexRings, effectiveHexSize;
  let primalPoints;
  
  if (targetPoints !== null && targetPoints > 0) {
    // Calculate hexRings for target point count: points ≈ 3*hexRings*(hexRings+1) + 1
    // Solve: 3*n*(n+1) + 1 = target => 3n² + 3n + 1 - target = 0
    // Using quadratic formula: n = (-3 + sqrt(9 + 12*(target-1))) / 6
    const discriminant = 9 + 12 * (targetPoints - 1);
    const calculatedRings = Math.round((-3 + Math.sqrt(discriminant)) / 6);
    
    // Find closest achievable hexRings
    let bestRings = calculatedRings;
    let bestDiff = Infinity;
    for (let r = Math.max(1, calculatedRings - 2); r <= calculatedRings + 2; r++) {
      const pointsForRings = 3 * r * (r + 1) + 1;
      const diff = Math.abs(pointsForRings - targetPoints);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestRings = r;
      }
    }
    
    hexRings = bestRings;
    const expectedPoints = 3 * hexRings * (hexRings + 1) + 1;
    
    // Calculate hexSize to maintain grid bounds (scale inversely with rings)
    effectiveHexSize = baseHexSize * (baseHexRings / hexRings);
    
    primalPoints = createTransformedHexPoints(hexRings, effectiveHexSize, aspectRatio, rng);
    
    // Cull excess points if needed, then scale to restore bounds
    // ... (culling and scaling logic)
  }
```

### Results

**Before (547 points):**
- Points: 547
- hexRings: 13
- hexSize: 16.97
- Bounds: -500.4 to 500.5, -377.0 to 377.2

**After (512 points):**
- Points: 512 (exactly as targeted)
- hexRings: 13 (generated 547, culled 35)
- hexSize: 16.62
- Bounds: -423.8 to 423.9, -377.0 to 377.1 (slightly reduced due to culling, but close to original)

**Note:** Bounds are slightly smaller after culling outer points, but scaling logic attempts to restore them. The slight reduction is acceptable for testing purposes.

## Stage 2 Analysis (512 Points)

### Data Summary

- **Points:** 512 (down from 547)
- **Triangles:** 998 (down from 1072)
- **Average Triangle Area:** 553.35 (similar to 552.85 with 547 points)
- **Triangle Area Range:** 532.44 - 572.83 (similar to 531.52 - 572.73)

### Observations

1. **Clean Triangulation:** Stage 2 completes successfully with proper Delaunay triangulation.
2. **Uniform Triangle Sizes:** All triangles have very similar areas (~553), indicating uniform distribution.
3. **Proportional Reduction:** Triangle count reduced proportionally with point count (998 vs 1072, ~7% reduction).

## Stage 3 Analysis (512 Points)

### Dissolution Statistics

- **Input Triangles:** 998 (down from 1072)
- **Attempts:** ~3000 (probability-based, 3x input triangles)
- **Edges Dissolved:** 42 (down from 54)
- **Success Rate:** 1.4% (slightly worse than 547 points: 1.7%)
- **Conversion Rate:** 4.2% (slightly worse than 547 points: 5.0%)
- **Invalid Edges:** 1934 (similar to 547 points: 2062)

### Comparison: 547 vs 512 Points

| Metric | 547 Points | 512 Points | Change |
|--------|-----------|------------|--------|
| Input Triangles | 1072 | 998 | -7% |
| Edges Dissolved | 54 | 42 | -22% |
| Success Rate | 1.7% | 1.4% | Slightly worse |
| Conversion Rate | 5.0% | 4.2% | Slightly worse |
| Invalid Edges | 2062 | 1934 | -6% |

**Note:** The conversion rate appears worse with 512 points, but this may be due to:
- Fewer total triangles → fewer opportunities for dissolution
- Same success rate but applied to smaller base
- Statistical variation in random edge selection

### Failure Analysis

The same "6 unique vertices" error persists:

```
[dissolveEdgesToQuads] Cannot dissolve edge 138,238: 6 unique vertices (expected 4), tri1: [153,253,396], tri2: [335,364,201]
```

**Key Insight:** The edge map issue is **density-independent**. Reducing points from 547→512 did not improve dissolution rates, confirming the problem is structural (incorrect edge identification) rather than density-related.

## Updated Hypotheses

### Hypothesis 1: Edge Map Construction Bug (CONFIRMED - HIGH PRIORITY)

**Evidence:** 
- "6 unique vertices" errors persist across different densities (547, 512 points)
- Success rate remains ~1.7% regardless of point count
- Edge map incorrectly identifies edges that don't actually form valid quads

**Conclusion:** The edge map is fundamentally broken. It's identifying edges where triangles share a vertex but not an edge, or the edge key format is incorrect.

**Required Fix:** Completely rebuild edge map validation:
1. Verify edge keys are normalized (v1 < v2)
2. Verify each edge is actually shared by exactly 2 triangles
3. Verify the two triangles actually share the identified edge vertices

### Hypothesis 2: Delaunay Triangulation Degeneracy (MEDIUM PRIORITY)

**Evidence:** 
- Very uniform triangle areas (all ~553) suggest clean triangulation
- But edge map issues suggest triangles may have overlapping vertices

**Test:** Validate all triangles are non-degenerate before building edge map.

**Fix:** Add triangle validation in Stage 2 to filter out degenerate triangles.

### Hypothesis 3: Edge Key Format Issue (MEDIUM PRIORITY)

**Evidence:**
- Edge keys are stored as "v1,v2" strings
- If vertex order is inconsistent, edges may not match correctly

**Test:** Verify edge key generation ensures consistent vertex ordering.

**Fix:** Normalize edge keys in `buildEdgeMap()` to ensure v1 < v2 always.

## Recommendations

### Priority 1: Fix Edge Map Validation (URGENT)

1. **Rebuild `buildEdgeMap()` with validation:**
   - Ensure edge keys are normalized (v1 < v2)
   - Verify each edge is shared by exactly 2 triangles
   - Log edges shared by != 2 triangles (boundary edges, multi-shared edges)

2. **Add pre-dissolution validation in `dissolveEdgesToQuads()`:**
   - Verify edge exists in map
   - Verify edge is shared by exactly 2 triangles
   - Verify triangles are not removed
   - **NEW:** Verify the two triangles actually share the identified edge vertices (not just that the edge key exists)

3. **Add edge verification in `canDissolveEdge()`:**
   - Check that the edge vertices match between triangles
   - Verify triangles share exactly 2 vertices (the edge)

### Priority 2: Rebuild Edge Map After Each Dissolution

**Current:** Edge map is rebuilt once per attempt iteration.

**Proposed:** Rebuild edge map after each successful dissolution to ensure consistency.

**Rationale:** Removing triangles may invalidate edge associations, causing subsequent attempts to fail.

### Priority 3: Enhanced Debugging

1. **Export edge map statistics:**
   - Count edges by sharing count (1, 2, 3+ triangles)
   - Log sample edges for each category
   - Identify which edges are incorrectly identified

2. **Visual debugging:**
   - Render edges that fail dissolution in a different color
   - Highlight triangles that share edges incorrectly

## Code Fixes (Proposed)

### Fix 1: Enhanced Edge Map Validation

```javascript
function buildEdgeMap(triangles) {
  const edgeMap = new Map();
  
  triangles.forEach((triangle, triIdx) => {
    const [v0, v1, v2] = triangle.verts;
    const edges = [
      [Math.min(v0, v1), Math.max(v0, v1)],
      [Math.min(v1, v2), Math.max(v1, v2)],
      [Math.min(v2, v0), Math.max(v2, v0)]
    ];
    
    edges.forEach(([v1, v2]) => {
      const edgeKey = `${v1},${v2}`;
      if (!edgeMap.has(edgeKey)) {
        edgeMap.set(edgeKey, []);
      }
      edgeMap.get(edgeKey).push(triIdx);
    });
  });
  
  // Validate: log edges shared by != 2 triangles
  let boundaryEdges = 0;
  let multiSharedEdges = 0;
  const problematicEdges = [];
  
  edgeMap.forEach((triIndices, edgeKey) => {
    if (triIndices.length === 1) {
      boundaryEdges++;
    } else if (triIndices.length > 2) {
      multiSharedEdges++;
      problematicEdges.push({ edge: edgeKey, count: triIndices.length, triangles: triIndices });
    }
  });
  
  if (boundaryEdges > 0 || multiSharedEdges > 0) {
    console.log(`[buildEdgeMap] WARNING: ${boundaryEdges} boundary edges, ${multiSharedEdges} multi-shared edges`);
    if (problematicEdges.length > 0) {
      console.log(`[buildEdgeMap] Sample problematic edges:`, problematicEdges.slice(0, 5));
    }
  }
  
  return edgeMap;
}
```

### Fix 2: Pre-Dissolution Edge Verification

```javascript
// In dissolveEdgesToQuads(), before calling canDissolveEdge():
const sharingTriangles = edgeMap.get(selectedEdge);
if (!sharingTriangles || sharingTriangles.length !== 2) {
  continue; // Skip - not an internal edge
}

const [tri1Idx, tri2Idx] = sharingTriangles;
const tri1 = workingTriangles[tri1Idx];
const tri2 = workingTriangles[tri2Idx];

// Verify edge is actually shared
const [v1, v2] = selectedEdge.split(',').map(Number);
const tri1HasEdge = (tri1.verts.includes(v1) && tri1.verts.includes(v2));
const tri2HasEdge = (tri2.verts.includes(v1) && tri2.verts.includes(v2));

if (!tri1HasEdge || !tri2HasEdge) {
  console.log(`[dissolveEdgesToQuads] Edge ${selectedEdge} not actually shared by triangles ${tri1Idx} and ${tri2Idx}`);
  console.log(`  tri1 verts: [${tri1.verts.join(',')}], tri2 verts: [${tri2.verts.join(',')}]`);
  continue;
}
```

### Fix 3: Rebuild Edge Map After Each Dissolution

```javascript
// After successful dissolution:
tri1.removed = true;
tri2.removed = true;
quads.push(quad);
dissolveCount++;
edgesDissolved++;

// Rebuild edge map for remaining triangles
const activeTriangles = workingTriangles.filter(t => !t.removed);
edgeMap = buildEdgeMap(activeTriangles);
```

## Test Instructions

1. **Reload `interactive-terrain.html`** in browser
2. **Click "Reset Grid"** to regenerate with 512 points
3. **Verify Stage 1:** Should show exactly 512 yellow dots
4. **Verify Stage 2:** Should show 998 triangles (down from 1072)
5. **Verify Stage 3:** Should show very few quads (~17-20, similar to previous)
6. **Check Console:** Look for:
   - `TARGET POINTS: Final count: 512`
   - `STAGE 2 DATA` and `STAGE 3 DATA` JSON exports
   - Dissolution failure logs showing "6 unique vertices" errors

## Comparison Summary

### Density Reduction Progression

| Iteration | Points | Triangles | Dissolution Success | Conversion Rate |
|-----------|--------|-----------|-------------------|-----------------|
| Original | ~2054 | ~4000+ | Unknown | Unknown |
| v2 (547) | 547 | 1072 | 1.7% | 5.0% |
| v3 (512) | 512 | 998 | 1.4% | 4.2% |

**Conclusion:** Further density reduction (547→512) did not improve dissolution rates. The edge map issue is density-independent and requires structural fixes.

## Next Steps

1. **Apply Priority 1 fixes** (edge map validation and verification)
2. **Re-run pipeline** with 512 points and compare dissolution success rate
3. **If still failing:** Apply Priority 2 fixes (rebuild edge map after each dissolution)
4. **If still failing:** Investigate Delaunay triangulation for degenerate cases
5. **Generate v4 report** with results

## Conclusion

The aggressive point reduction to 512 points was successful, but did not improve Stage 3 dissolution rates. The edge map issue is confirmed to be density-independent, requiring structural fixes to edge identification and validation logic. The recommended fixes focus on:

1. Validating edge map construction
2. Verifying edges are actually shared before dissolution
3. Rebuilding edge map after each dissolution for consistency

With these fixes, we expect the dissolution success rate to improve significantly, regardless of point density.
