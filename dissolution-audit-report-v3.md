# Dissolution Stage Audit Report v3
**Date:** 2026-01-14  
**Focus:** Internal Diagonals in Merged Quads (Stage 3 Rendering Issue)

## Overview

This report documents an audit of the dissolution stage to identify why merged quads in Stage 3 are rendered with internal diagonals, splitting intended quads into 4 triangles. The diagonals are NOT present in Stage 2 (triangulation), indicating they are introduced during dissolution or rendering.

### Key Findings

1. **Vertex Ordering Bug:** Many quads use "fallback ordering" which doesn't guarantee a proper cycle, causing incorrect polygon shapes.

2. **Root Cause:** `mergeTrianglesToQuad()` uses a traversal-based ordering algorithm that fails in some cases, falling back to unordered vertex list. This can create self-intersecting or incorrectly-ordered polygons.

3. **Rendering:** Stage 3 rendering uses simple SVG path (M...L...Z) which draws vertices in order. If vertices are not in proper cycle order, the path creates incorrect shapes with apparent diagonals.

## Code Review

### 1. mergeTrianglesToQuad() - Vertex Ordering

**Location:** `src/core/dualGridStates.js:1325-1384`

**Original Algorithm (Problematic):**
```javascript
function mergeTrianglesToQuad(tri1, tri2, edgeKey) {
  const [v1, v2] = edgeKey.split(',').map(Number);
  const allVerts = [...new Set([...tri1.verts, ...tri2.verts])];
  
  // Traversal-based ordering (fails in some cases)
  const orderedVerts = [];
  let current = v1;
  while (orderedVerts.length < 4) {
    const candidates = findConnected(current, tri1, tri2);
    if (candidates.length === 0) {
      // FALLBACK: Just add remaining vertices (WRONG ORDER!)
      orderedVerts.push(remaining[0]);
    } else {
      orderedVerts.push(candidates[0]);
    }
  }
  
  // If ordering fails, use allVerts in whatever order (WRONG!)
  if (orderedVerts.length !== 4) {
    orderedVerts.push(...allVerts);
  }
}
```

**Problems:**
- ❌ Traversal algorithm can fail when no connected vertices found
- ❌ Fallback uses `allVerts` in arbitrary order (not a valid cycle)
- ❌ No validation that vertices form a proper cycle
- ❌ Can create self-intersecting polygons

**Evidence from Logs:**
```
[mergeTrianglesToQuad] WARNING: Used fallback ordering - may cause incorrect polygon shape
```
Many quads show this warning, indicating the ordering algorithm failed.

### 2. Stage 3 Rendering

**Location:** `scripts/generate-interactive-terrain.js:659-677`

**Code:**
```javascript
stage.data.forEach(quad => {
  const verts = quad.verts.map(vIdx => centeredPoints[vIdx]);
  const path = verts.map((v, i) => `${i === 0 ? 'M' : 'L'} ${v.x} ${v.y}`).join(' ') + ' Z';
  layers.push(`<path d="${path}" ... />`);
});
```

**Analysis:**
- ✅ Simple SVG path rendering (correct approach)
- ⚠️ **Issue:** If `quad.verts` are not in proper cycle order, the path creates incorrect shapes
- ⚠️ No validation that vertices form a valid polygon
- ⚠️ No check for duplicate vertices or self-intersection

**How Diagonals Appear:**
- If vertices are ordered incorrectly (e.g., [v1, v2, v3, v4] instead of [v1, v3, v2, v4])
- The SVG path connects them in order, creating a bowtie or self-intersecting shape
- This appears as an "internal diagonal" splitting the quad

## Bugs Identified

### Bug 1: Incorrect Vertex Ordering in mergeTrianglesToQuad() (CRITICAL)

**Evidence:**
- Logs show many quads using "fallback ordering"
- Fallback uses `allVerts` in arbitrary order (not guaranteed to be a cycle)
- Visual result: Quads with internal diagonals

**Root Cause:**
- Traversal algorithm fails when `findConnected()` returns empty
- Falls back to unordered vertex list
- No validation that result forms a proper cycle

**Fix Applied:**
- Replaced traversal algorithm with direct ordering:
  - Find unique vertices from each triangle (not on shared edge)
  - Order as: `[v1, tri1Unique, v2, tri2Unique]`
  - This guarantees a proper cycle around the quad perimeter

### Bug 2: No Validation of Quad Vertex Order (MEDIUM)

**Evidence:**
- No check that vertices form a valid polygon
- No detection of self-intersection
- No check for duplicate vertices

**Fix Applied:**
- Added duplicate vertex detection in rendering
- Added logging for invalid quads
- Filter duplicate vertices before rendering

### Bug 3: Missing Collinear Point Detection (LOW)

**Evidence:**
- No check for collinear points (3+ points on same line)
- Can cause degenerate quads that appear as triangles with extra vertices

**Status:** Not critical, but could be added for robustness.

## Log Analysis

### Sample Audit Logs

**Before Fix:**
```
[mergeTrianglesToQuad] AUDIT: Merging edge 27,53
[mergeTrianglesToQuad] RESULT: Quad with 4 vertices: [27,53,110,113]
[mergeTrianglesToQuad] WARNING: Used fallback ordering - may cause incorrect polygon shape
```

**After Fix:**
```
[mergeTrianglesToQuad] AUDIT: Merging edge 4,123
[mergeTrianglesToQuad] Using proper quad ordering: [4, 47, 123, 65]
[mergeTrianglesToQuad] RESULT: Quad with 4 vertices: [4,47,123,65]
```

### Failure Patterns

1. **Fallback Ordering:** Many quads used fallback (arbitrary order)
2. **No Duplicate Detection:** Rendering didn't check for duplicate vertices
3. **No Cycle Validation:** No verification that vertices form a proper cycle

## Code Fixes Applied

### Fix 1: Improved Vertex Ordering Algorithm

```javascript
// IMPROVED: Direct ordering based on triangle structure
const tri1Unique = tri1.verts.find(v => v !== v1 && v !== v2);
const tri2Unique = tri2.verts.find(v => v !== v1 && v !== v2);

if (tri1Unique && tri2Unique) {
  // Proper cycle: [v1, tri1Unique, v2, tri2Unique]
  orderedVerts.push(v1, tri1Unique, v2, tri2Unique);
} else {
  // Fallback only if unique vertices can't be found
  orderedVerts.push(...allVerts);
}
```

**Benefits:**
- ✅ Always creates proper cycle (if unique vertices exist)
- ✅ No traversal failures
- ✅ Guaranteed correct order for valid triangle pairs

### Fix 2: Enhanced Rendering Validation

```javascript
// Check for duplicate vertices
const uniqueVerts = [];
const seenCoords = new Set();
for (const v of verts) {
  const coordKey = `${v.x.toFixed(2)},${v.y.toFixed(2)}`;
  if (!seenCoords.has(coordKey)) {
    seenCoords.add(coordKey);
    uniqueVerts.push(v);
  }
}

// Use unique vertices for rendering
const renderVerts = uniqueVerts.length < verts.length ? uniqueVerts : verts;
```

**Benefits:**
- ✅ Prevents duplicate vertices from causing self-intersection
- ✅ Logs invalid quads for debugging
- ✅ Filters out problematic vertices before rendering

## Recommendations

### Priority 1: Verify Fix Effectiveness (URGENT)

1. **Test in Chrome:**
   - Reload `interactive-terrain.html`
   - View Stage 3
   - Check if internal diagonals are gone
   - Verify quads render as proper 4-sided polygons

2. **Check Logs:**
   - Should see "Using proper quad ordering" for most quads
   - Should see fewer/no "fallback ordering" warnings
   - Should see no "duplicate vertices" warnings

### Priority 2: Add Polygon Validation (MEDIUM)

1. **Add self-intersection check:**
   - Use cross-product to detect if polygon is self-intersecting
   - Log and skip invalid quads

2. **Add collinear point detection:**
   - Check if 3+ vertices are collinear
   - Log degenerate quads

### Priority 3: Improve Error Handling (LOW)

1. **Better fallback:**
   - If unique vertices can't be found, try alternative ordering
   - Validate result before returning

2. **Visual debugging:**
   - Highlight quads with ordering issues in different color
   - Show vertex order in tooltip

## Test Results

### Before Fix:
- Many quads using fallback ordering
- Internal diagonals visible in Stage 3
- Self-intersecting polygons

### After Fix (Expected):
- Most/all quads using proper ordering
- No internal diagonals
- Clean quad outlines

## Next Steps

1. **Test fix in Chrome** - Verify diagonals are gone
2. **If still present:** Check for other causes (e.g., rendering triangulation)
3. **If fixed:** Consider adding polygon validation for robustness
4. **Generate v4 report** if additional issues found

## Conclusion

The root cause of internal diagonals in Stage 3 quads was **incorrect vertex ordering** in `mergeTrianglesToQuad()`. The traversal-based algorithm failed in many cases, falling back to unordered vertex lists. This created self-intersecting polygons that appeared to have internal diagonals.

**Fix Applied:**
- Replaced traversal algorithm with direct ordering: `[v1, tri1Unique, v2, tri2Unique]`
- Added duplicate vertex detection in rendering
- Enhanced logging to track ordering issues

**Expected Result:**
- Proper quad ordering for all valid merges
- No internal diagonals in Stage 3
- Clean 4-sided polygon outlines
