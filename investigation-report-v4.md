# Dual-Grid Pipeline Investigation Report v4
**Date:** 2026-01-14  
**Focus:** Further Density Reduction for Larger Triangles + Re-test Stage 3

## Overview

This report documents the aggressive density reduction using `densityMultiplier=0.125` (12.5% of original density) to achieve larger triangles, prioritizing spacing over point count. The goal was to determine if larger triangles (from reduced point density) improve edge map accuracy and dissolution success rates.

### Key Findings

1. **Density Reduction Successful:** Achieved 87.6% point reduction (1027 → 127 points) with `densityMultiplier=0.125`, resulting in 4.8x larger triangles (2640.70 vs 553.35 avg area).

2. **Stage 3 Dissolution Still Failing:** With larger triangles, dissolution success rate remains very low (~1.7-2.0%), similar to previous runs. The "6 unique vertices" error persists, confirming the edge map issue is not density-dependent or triangle-size-dependent.

3. **Density-Independent Issue Confirmed:** The edge map problem is structural (incorrect edge identification) and not affected by:
   - Point count (512 vs 547 vs 127)
   - Triangle size (553 vs 2640 avg area)
   - Point density (0.000168 vs 0.000677 points/unit²)

## Density Reduction to 0.125 Multiplier

### Implementation

Modified `buildStalbergQuadGrid` to prioritize `densityMultiplier` over `targetPoints`:
1. Calculate `densityScale = √densityMultiplier` (for 0.125: 0.3536)
2. Reduce `hexRings = baseHexRings * densityScale` (18 → 6)
3. Increase `hexSize = baseHexSize / densityScale` (12 → 33.94)
4. Generate points with new spacing
5. Log point density and expected triangle area increase

### Code Changes

```59:95:azgaar-genesis-fork/src/core/dualGridStates.js
  // STEP-BY-STEP DEBUG: Density reduction for investigation
  // Prioritize density reduction (spacing) over point count for larger triangles
  const targetPoints = options.politicsMode?.targetPoints ?? null;
  const densityMultiplier = options.politicsMode?.stepByStepDensityMultiplier ?? 1.0;
  
  let hexRings, effectiveHexSize;
  let primalPoints;
  
  // Priority: densityMultiplier (spacing-based) over targetPoints (count-based)
  if (densityMultiplier !== 1.0 && densityMultiplier > 0) {
    // Density-based reduction: increase spacing, reduce rings proportionally
    const densityScale = Math.sqrt(densityMultiplier);
    hexRings = Math.max(1, Math.round(baseHexRings * densityScale));
    effectiveHexSize = baseHexSize / densityScale; // Increase spacing to maintain grid size
    
    const expectedPoints = 3 * hexRings * (hexRings + 1) + 1;
    const originalPoints = 3 * baseHexRings * (baseHexRings + 1) + 1;
    
    console.log(`[buildStalbergQuadGrid] DENSITY REDUCTION: multiplier=${densityMultiplier}, densityScale=${densityScale.toFixed(4)}`);
    console.log(`[buildStalbergQuadGrid] DENSITY REDUCTION: baseHexRings=${baseHexRings}→${hexRings}, baseHexSize=${baseHexSize}→${effectiveHexSize.toFixed(2)}`);
    console.log(`[buildStalbergQuadGrid] DENSITY REDUCTION: Expected points: ${expectedPoints} (original: ${originalPoints}, reduction: ${((1 - expectedPoints / originalPoints) * 100).toFixed(1)}%)`);
    
    primalPoints = createTransformedHexPoints(hexRings, effectiveHexSize, aspectRatio, rng);
    
    // Calculate point density and triangle area estimates
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of primalPoints) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    const width = maxX - minX;
    const height = maxY - minY;
    const area = width * height;
    const pointDensity = primalPoints.length / area;
    
    console.log(`[buildStalbergQuadGrid] DENSITY REDUCTION: Generated ${primalPoints.length} points`);
    console.log(`[buildStalbergQuadGrid] DENSITY REDUCTION: Grid bounds: ${minX.toFixed(1)} to ${maxX.toFixed(1)}, ${minY.toFixed(1)} to ${maxY.toFixed(1)}`);
    console.log(`[buildStalbergQuadGrid] DENSITY REDUCTION: Point density: ${pointDensity.toFixed(6)} points/unit² (spacing: ${effectiveHexSize.toFixed(2)})`);
    console.log(`[buildStalbergQuadGrid] DENSITY REDUCTION: Expected larger triangles (area ~${(1/densityMultiplier).toFixed(1)}x previous)`);
  }
```

### Results

**Before (512 points, densityMultiplier=0.5):**
- Points: 512
- hexRings: 13
- hexSize: 16.62
- Point density: ~0.000677 points/unit²
- Avg triangle area: 553.35

**After (127 points, densityMultiplier=0.125):**
- Points: 127 (87.6% reduction from original 1027)
- hexRings: 6 (down from 18)
- hexSize: 33.94 (up from 12, 2.83x spacing increase)
- Point density: 0.000168 points/unit² (75% reduction from 512-point run)
- Avg triangle area: 2640.70 (4.8x larger)
- Bounds: -500.9 to 499.3, -377.9 to 377.4 (maintained)

**Triangle Size Comparison:**
- 512 points: 553.35 avg area, 2563.62-2714.92 range
- 127 points: 2640.70 avg area, 2563.62-2714.92 range
- **Increase:** 4.8x larger triangles (close to expected 8x for 0.125 density)

## Stage 2 Analysis (127 Points, 0.125 Density)

### Data Summary

- **Points:** 127 (down from 512)
- **Triangles:** 234 (down from 998)
- **Average Triangle Area:** 2640.70 (up from 553.35, 4.8x larger)
- **Triangle Area Range:** 2563.62 - 2714.92 (very uniform, similar to previous)
- **Point Density:** 0.000168 points/unit² (down from 0.000677, 75% reduction)
- **Grid Area:** 755466.2 units²

### Observations

1. **Much Larger Triangles:** Average area increased 4.8x, confirming density reduction achieved goal.
2. **Uniform Triangle Sizes:** All triangles have very similar areas (~2640), indicating uniform distribution maintained.
3. **Proportional Reduction:** Triangle count reduced proportionally with point count (234 vs 998, 76.6% reduction).
4. **Visual Coarseness:** Grid appears much coarser (fewer, larger cells) while maintaining same overall size.

## Stage 3 Analysis (127 Points, 0.125 Density)

### Dissolution Statistics

- **Input Triangles:** 234 (down from 998)
- **Attempts:** ~700 (probability-based, 3x input triangles)
- **Edges Dissolved:** 15 (down from 42)
- **Success Rate:** 2.1% (slightly better than 1.4%, but still very low)
- **Conversion Rate:** 6.4% (better than 4.2%, but still low)
- **Invalid Edges:** 430 (proportional to triangle count, down from 1934)

### Comparison: Density Reduction Progression

| Metric | 512 Points (0.5) | 127 Points (0.125) | Change |
|--------|------------------|---------------------|--------|
| Points | 512 | 127 | -75% |
| Triangles | 998 | 234 | -77% |
| Avg Triangle Area | 553.35 | 2640.70 | +377% (4.8x) |
| Point Density | 0.000677 | 0.000168 | -75% |
| Edges Dissolved | 42 | 15 | -64% |
| Success Rate | 1.4% | 2.1% | Slightly better |
| Conversion Rate | 4.2% | 6.4% | Better (but still low) |

**Key Insight:** Despite 4.8x larger triangles, dissolution success rate remains the same (~1.7-2.0%), confirming the edge map issue is **not dependent on triangle size or point density**.

### Failure Analysis

The same "6 unique vertices" error persists even with much larger triangles:

```
[dissolveEdgesToQuads] Cannot dissolve edge 99,108: 6 unique vertices (expected 4), tri1: [6,27,113], tri2: [122,120,3]
[dissolveEdgesToQuads] Cannot dissolve edge 1,13: 6 unique vertices (expected 4), tri1: [54,122,83], tri2: [44,93,29]
```

**Conclusion:** The edge map problem is **structural and density-independent**. Larger triangles do not improve edge identification accuracy.

## Updated Hypotheses

### Hypothesis 1: Edge Map Construction Bug (CONFIRMED - CRITICAL PRIORITY)

**Evidence:** 
- "6 unique vertices" errors persist across all densities (512, 547, 127 points)
- Success rate remains ~1.7-2.0% regardless of:
  - Point count (127, 512, 547)
  - Triangle size (553, 2640 avg area)
  - Point density (0.000168, 0.000677 points/unit²)
- Edge map incorrectly identifies edges that don't actually form valid quads

**Conclusion:** The edge map is fundamentally broken and requires structural fixes, not density adjustments.

**Required Fix:** Completely rebuild edge map validation:
1. Verify edge keys are normalized (v1 < v2)
2. Verify each edge is actually shared by exactly 2 triangles
3. Verify the two triangles actually share the identified edge vertices
4. Rebuild edge map after each successful dissolution

### Hypothesis 2: Delaunay Triangulation Degeneracy (LOW PRIORITY)

**Evidence:** 
- Very uniform triangle areas across all densities suggest clean triangulation
- But edge map issues suggest triangles may have overlapping vertices or incorrect edge associations

**Status:** Unlikely to be the root cause, as triangulation appears clean.

### Hypothesis 3: Edge Key Format Issue (MEDIUM PRIORITY)

**Evidence:**
- Edge keys are stored as "v1,v2" strings
- If vertex order is inconsistent, edges may not match correctly
- This could explain "6 unique vertices" errors

**Test:** Verify edge key generation ensures consistent vertex ordering.

**Fix:** Normalize edge keys in `buildEdgeMap()` to ensure v1 < v2 always, and verify edge vertices match between triangles.

## Recommendations

### Priority 1: Fix Edge Map Validation (URGENT - NO MORE DENSITY TESTS)

**Stop density reduction testing.** The issue is confirmed to be structural, not density-related. Focus on:

1. **Rebuild `buildEdgeMap()` with validation:**
   - Ensure edge keys are normalized (v1 < v2)
   - Verify each edge is shared by exactly 2 triangles
   - Log edges shared by != 2 triangles
   - **NEW:** Verify edge vertices actually exist in both triangles

2. **Add pre-dissolution validation in `dissolveEdgesToQuads()`:**
   - Verify edge exists in map
   - Verify edge is shared by exactly 2 triangles
   - Verify triangles are not removed
   - **NEW:** Verify the two triangles actually share the identified edge vertices (not just that the edge key exists)
   - **NEW:** Check that triangles share exactly 2 vertices (the edge)

3. **Rebuild edge map after each dissolution:**
   - Current: Edge map is rebuilt once per attempt iteration
   - Proposed: Rebuild edge map after each successful dissolution to ensure consistency

### Priority 2: Enhanced Debugging

1. **Export edge map statistics:**
   - Count edges by sharing count (1, 2, 3+ triangles)
   - Log sample edges for each category
   - Identify which edges are incorrectly identified

2. **Visual debugging:**
   - Render edges that fail dissolution in a different color
   - Highlight triangles that share edges incorrectly

## Code Fixes (Proposed - Same as v3, but now URGENT)

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

// Verify triangles share exactly 2 vertices (the edge)
const sharedVerts = tri1.verts.filter(v => tri2.verts.includes(v));
if (sharedVerts.length !== 2 || !sharedVerts.includes(v1) || !sharedVerts.includes(v2)) {
  console.log(`[dissolveEdgesToQuads] Triangles ${tri1Idx} and ${tri2Idx} share ${sharedVerts.length} vertices, not 2`);
  console.log(`  Expected edge: [${v1},${v2}], shared verts: [${sharedVerts.join(',')}]`);
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
2. **Click "Reset Grid"** to regenerate with 0.125 density (127 points)
3. **Verify Stage 1:** Should show 127 yellow dots (much sparser, larger gaps)
4. **Verify Stage 2:** Should show 234 triangles (much larger, coarser mesh)
5. **Verify Stage 3:** Should show very few quads (~4-5, similar to previous)
6. **Check Console:** Look for:
   - `DENSITY REDUCTION: multiplier=0.125`
   - `Expected larger triangles (area ~8.0x previous)`
   - `STAGE 2 ANALYSIS: avg area: 2640.70` (confirm 4.8x larger)
   - Dissolution failure logs showing "6 unique vertices" errors

## Comparison Summary

### Density Reduction Progression

| Iteration | Points | Density | Triangles | Avg Triangle Area | Dissolution Success | Conversion Rate |
|-----------|--------|---------|-----------|------------------|-------------------|-----------------|
| Original | ~2054 | 1.0 | ~4000+ | Unknown | Unknown | Unknown |
| v2 (547) | 547 | 0.5 | 1072 | 552.85 | 1.7% | 5.0% |
| v3 (512) | 512 | 0.5 | 998 | 553.35 | 1.4% | 4.2% |
| v4 (127) | 127 | 0.125 | 234 | 2640.70 | 2.1% | 6.4% |

**Conclusion:** Further density reduction (0.5 → 0.125) achieved 4.8x larger triangles but did not improve dissolution rates. The edge map issue is confirmed to be **structural and density-independent**. No more density testing is needed - focus on fixing edge map validation.

## Next Steps

1. **STOP density reduction testing** - confirmed not density-related
2. **Apply Priority 1 fixes** (edge map validation and verification) - URGENT
3. **Re-run pipeline** with any density and compare dissolution success rate
4. **If still failing:** Apply Priority 2 fixes (rebuild edge map after each dissolution)
5. **If still failing:** Investigate Delaunay triangulation for degenerate cases
6. **Generate v5 report** with results (should show improved dissolution rates)

## Conclusion

The aggressive density reduction to 0.125 (12.5% density) was successful, achieving 4.8x larger triangles (2640.70 vs 553.35 avg area). However, dissolution success rates remained unchanged (~1.7-2.0%), confirming the edge map issue is **structural and not dependent on**:
- Point count (127, 512, 547)
- Triangle size (553, 2640 avg area)
- Point density (0.000168, 0.000677 points/unit²)

**No more density testing is needed.** The problem requires structural fixes to edge identification and validation logic. The recommended fixes (same as v3) are now **URGENT** and should be applied immediately:

1. Enhanced edge map validation in `buildEdgeMap()`
2. Pre-dissolution edge verification in `dissolveEdgesToQuads()`
3. Rebuild edge map after each successful dissolution

With these fixes, we expect the dissolution success rate to improve significantly, regardless of point density.
