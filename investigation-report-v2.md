# Dual-Grid Pipeline Investigation Report v2
**Date:** 2026-01-14  
**Focus:** Density Reduction Debug/Fix + Stage 3 Dissolution Analysis

## Overview

This report documents the debugging and fixing of the failed density reduction, followed by a re-investigation of the Stage 2→3 break with enhanced logging. The density reduction was failing because it only modified `hexSize` (spacing) without reducing `hexRings` (point count). After fixing this, we re-ran the pipeline with reduced density and captured detailed dissolution failure logs.

### Key Findings

1. **Density Reduction Fixed:** Point count successfully reduced from 1027 → 547 (46.7% reduction) by reducing `hexRings` from 18 → 13 and compensating with increased `hexSize` (12 → 16.97) to maintain grid bounds.

2. **Stage 3 Dissolution Still Failing:** With reduced density, dissolution success rate remains very low (~1.7%), with the primary failure mode being "6 unique vertices (expected 4)" - indicating edge map incorrectly identifies shared edges.

3. **Root Cause Identified:** The edge map is identifying edges that don't actually form valid quads. Two triangles sharing an edge should have exactly 4 unique vertices total (2 shared + 2 unique each). Seeing 6 unique vertices means the triangles don't share an edge - they may share a vertex or have overlapping vertices.

## Density Reduction Debug/Fix

### Problem

Previous density reduction attempt only modified `hexSize` (spacing between points) without reducing `hexRings` (number of points). This resulted in:
- Same number of points generated (1027 for hexRings=18)
- Larger spacing, but then scaled down by `scaleToFit` to maintain bounds
- No actual point count reduction

### Solution

Modified `buildStalbergQuadGrid` to:
1. Reduce `hexRings` by factor of `√densityMultiplier` (for 0.5 density: 18 → 13)
2. Increase `hexSize` by factor of `1/√densityMultiplier` (for 0.5 density: 12 → 16.97)
3. This maintains grid bounds while reducing point count

### Code Changes

```52:72:azgaar-genesis-fork/src/core/dualGridStates.js
  const baseHexRings = options.politicsMode?.hexLayers ?? 45;
  const baseHexSize = options.politicsMode?.hexSize ?? 12;
  const aspectRatio = options.politicsMode?.aspectRatio ?? 1.22;
  
  // STEP-BY-STEP DEBUG: Density reduction for investigation
  // Reduce point density by half (reduce hexRings, increase hexSize to maintain grid size)
  // Point count in hex grid ≈ 3*hexRings*(hexRings+1) + 1, so reducing hexRings reduces points
  // To maintain grid size: reduce hexRings by √densityMultiplier, increase hexSize by 1/√densityMultiplier
  const densityMultiplier = options.politicsMode?.stepByStepDensityMultiplier ?? 1.0;
  
  let hexRings, effectiveHexSize;
  if (densityMultiplier !== 1.0) {
    // Reduce rings to reduce point count, increase size to maintain grid dimensions
    const densityScale = Math.sqrt(densityMultiplier); // For 0.5 density, scale = 0.707
    hexRings = Math.max(1, Math.round(baseHexRings * densityScale));
    effectiveHexSize = baseHexSize / densityScale; // Compensate for reduced rings
    
    console.log(`[buildStalbergQuadGrid] DENSITY REDUCTION: multiplier=${densityMultiplier}, baseHexRings=${baseHexRings}→${hexRings}, baseHexSize=${baseHexSize}→${effectiveHexSize.toFixed(2)}`);
    console.log(`[buildStalbergQuadGrid] DENSITY REDUCTION: Expected point reduction: ~${Math.round(3 * baseHexRings * (baseHexRings + 1) + 1)} → ~${Math.round(3 * hexRings * (hexRings + 1) + 1)} points`);
  } else {
    hexRings = baseHexRings;
    effectiveHexSize = baseHexSize;
  }
  
  const primalPoints = createTransformedHexPoints(hexRings, effectiveHexSize, aspectRatio, rng);
  
  if (densityMultiplier !== 1.0) {
    const expectedAtDensity1 = Math.round(3 * baseHexRings * (baseHexRings + 1) + 1);
    const actualReduction = ((1 - primalPoints.length / expectedAtDensity1) * 100).toFixed(1);
    console.log(`[buildStalbergQuadGrid] DENSITY REDUCTION: Generated ${primalPoints.length} points (expected at density 1.0: ~${expectedAtDensity1}, reduction: ${actualReduction}%)`);
    
    // Verify bounds are maintained
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of primalPoints) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    console.log(`[buildStalbergQuadGrid] DENSITY REDUCTION: Grid bounds maintained: ${minX.toFixed(1)} to ${maxX.toFixed(1)}, ${minY.toFixed(1)} to ${maxY.toFixed(1)}`);
  }
```

### Results

**Before Fix:**
- Points: 1027 (no reduction)
- Grid bounds: maintained via scaling

**After Fix:**
- Points: 547 (46.7% reduction)
- Grid bounds: -500.4 to 500.5, -377.0 to 377.2 (maintained)
- hexRings: 18 → 13
- hexSize: 12 → 16.97

## Stage 2 Analysis

### Data Summary (with reduced density)

- **Points:** 547
- **Triangles:** 1072 (from Delaunay triangulation)
- **Average Triangle Area:** 552.85
- **Triangle Area Range:** 531.52 - 572.73

### Observations

1. **Clean Triangulation:** Stage 2 completes successfully with proper Delaunay triangulation.
2. **Uniform Triangle Sizes:** All triangles have very similar areas (~552), indicating uniform distribution.
3. **No Degenerate Triangles:** All triangles are valid with 3 vertices.

## Stage 3 Analysis

### Dissolution Statistics (with reduced density)

- **Input Triangles:** 1072
- **Attempts:** 3216 (3x input triangles, probability-based)
- **Edges Dissolved:** 54
- **Success Rate:** 1.7%
- **Conversion Rate:** 5.0% (54 quads from 1072 triangles)
- **Final Output:** 1018 total shapes (54 quads, 964 triangles)

### Failure Breakdown

- **Invalid Edges:** 2062 (edges that cannot be dissolved)
- **Degenerate Quads:** 0 (quads with wrong vertex count)
- **Primary Failure Mode:** "6 unique vertices (expected 4)"

### Detailed Failure Analysis

The enhanced logging reveals the root cause:

```
[dissolveEdgesToQuads] Cannot dissolve edge 350,472: 6 unique vertices (expected 4), tri1: [359,284,234], tri2: [187,295,49]
[dissolveEdgesToQuads] Cannot dissolve edge 349,472: 6 unique vertices (expected 4), tri1: [212,295,462], tri2: [191,484,513]
```

**Problem:** Two triangles sharing an edge should have exactly 4 unique vertices total:
- 2 vertices form the shared edge
- 1 unique vertex from each triangle (the opposite corner)

**Reality:** Many edge pairs have 6 unique vertices, meaning:
- The triangles don't actually share an edge
- They may share a vertex (3 shared + 3 unique = 6 total)
- OR the edge map is incorrectly identifying edges

### Edge Map Investigation

The edge map is built from Delaunay triangles using `buildEdgeMap()`. Each edge is stored as a key "v1,v2" where v1 < v2. The map should only contain edges shared by exactly 2 triangles (internal edges).

**Hypothesis:** The edge map may be:
1. Including boundary edges (shared by only 1 triangle)
2. Including edges shared by more than 2 triangles (degenerate cases)
3. Incorrectly identifying edges due to vertex ordering issues

**Evidence:** The fact that we see "6 unique vertices" suggests the edge map is identifying edges where triangles share a vertex but not an edge. This could happen if:
- The edge key format is wrong (e.g., not normalizing vertex order)
- Triangles are being incorrectly associated with edges
- The Delaunay triangulation has degenerate cases not being handled

## Updated Hypotheses

### Hypothesis 1: Edge Map Vertex Ordering Issue (HIGH PRIORITY)

**Evidence:** Many edges fail with "6 unique vertices", suggesting triangles don't share the identified edge.

**Test:** Verify edge key generation in `buildEdgeMap()` ensures consistent vertex ordering (v1 < v2).

**Fix:** Add validation in `buildEdgeMap()` to ensure edges are correctly identified and only include edges shared by exactly 2 triangles.

### Hypothesis 2: Boundary Edge Contamination (MEDIUM PRIORITY)

**Evidence:** Some edges may be boundary edges (shared by only 1 triangle) incorrectly included in the internal edges list.

**Test:** Filter out boundary edges before dissolution attempts.

**Fix:** In `dissolveEdgesToQuads()`, verify that `edgeMap.get(edgeKey).length === 2` before attempting dissolution.

### Hypothesis 3: Degenerate Triangulation Cases (LOW PRIORITY)

**Evidence:** Delaunay triangulation may produce degenerate cases (e.g., colinear points, overlapping triangles).

**Test:** Validate all triangles are non-degenerate before building edge map.

**Fix:** Add triangle validation in Stage 2 to filter out degenerate triangles.

## Recommendations

### Priority 1: Fix Edge Map Validation

1. **Add edge validation in `buildEdgeMap()`:**
   - Ensure edge keys are normalized (v1 < v2)
   - Verify each edge is shared by exactly 2 triangles
   - Log any edges shared by != 2 triangles

2. **Add pre-dissolution validation in `dissolveEdgesToQuads()`:**
   - Verify edge exists in map
   - Verify edge is shared by exactly 2 triangles
   - Verify triangles are not removed
   - Verify triangles share exactly 2 vertices (the edge)

### Priority 2: Improve Dissolution Logic

1. **Rebuild edge map after each dissolution:**
   - Current: Edge map is rebuilt once per attempt iteration
   - Proposed: Rebuild after each successful dissolution to ensure consistency

2. **Add edge validation in `canDissolveEdge()`:**
   - Verify the two triangles actually share the identified edge
   - Check that the edge vertices match between triangles

### Priority 3: Enhanced Debugging

1. **Export edge map statistics:**
   - Count edges by sharing count (1, 2, 3+ triangles)
   - Log sample edges for each category

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
  edgeMap.forEach((triIndices, edgeKey) => {
    if (triIndices.length === 1) boundaryEdges++;
    if (triIndices.length > 2) multiSharedEdges++;
  });
  
  if (boundaryEdges > 0 || multiSharedEdges > 0) {
    console.log(`[buildEdgeMap] WARNING: ${boundaryEdges} boundary edges, ${multiSharedEdges} multi-shared edges`);
  }
  
  return edgeMap;
}
```

### Fix 2: Pre-Dissolution Edge Validation

```javascript
// In dissolveEdgesToQuads(), before calling canDissolveEdge():
const sharingTriangles = edgeMap.get(selectedEdge);
if (!sharingTriangles || sharingTriangles.length !== 2) {
  // Skip - not an internal edge
  continue;
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
  continue;
}
```

## Test Instructions

1. **Reload `interactive-terrain.html`** in browser
2. **Click "Reset Grid"** to regenerate with fixed density reduction
3. **Verify Stage 1:** Should show ~547 yellow dots (down from ~1027)
4. **Verify Stage 2:** Should show larger triangles (due to reduced density)
5. **Verify Stage 3:** Should show cleaner quads (if fixes applied) or same messy output (if not)
6. **Check Console:** Look for enhanced dissolution failure logs showing "6 unique vertices" errors

## Next Steps

1. **Apply Priority 1 fixes** (edge map validation)
2. **Re-run pipeline** and compare dissolution success rate
3. **If still failing:** Apply Priority 2 fixes (rebuild edge map, enhanced validation)
4. **If still failing:** Investigate Delaunay triangulation for degenerate cases
5. **Generate v3 report** with results

## Conclusion

The density reduction fix is successful (46.7% point reduction while maintaining grid bounds). However, Stage 3 dissolution remains broken due to edge map issues. The primary problem is that many edges identified as "shared by 2 triangles" actually have 6 unique vertices, indicating the triangles don't share an edge. This suggests the edge map is incorrectly identifying edges, possibly due to vertex ordering or boundary edge contamination.

The recommended fixes focus on:
1. Validating edge map construction
2. Verifying edges are actually shared before dissolution
3. Rebuilding edge map after each dissolution for consistency

With these fixes, we expect the dissolution success rate to improve significantly.
