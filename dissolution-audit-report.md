# Dissolution Stage Comprehensive Audit Report
**Date:** 2026-01-14  
**Focus:** Identify exact bugs in dissolution logic causing low success rates (~2%)

## Overview

This report documents a comprehensive audit of the dissolution stage (`dissolveEdgesToQuads()`) to identify the root cause of low dissolution success rates (~1.4-2.1%) despite proper Delaunay triangulation. The audit includes code review, enhanced logging, and failure pattern analysis.

### Key Findings

1. **Edge Map Construction:** Edge keys are correctly normalized (v1 < v2), but edge map may contain stale references after triangle removal.

2. **Primary Failure Mode:** "6 unique vertices (expected 4)" - indicates triangles don't actually share the identified edge, suggesting edge map incorrectly associates triangles with edges.

3. **Edge Verification Missing:** Current code doesn't verify that edge vertices actually exist in both triangles before attempting dissolution.

4. **No Multi-Shared Edge Issues:** Edge map correctly identifies edges shared by exactly 2 triangles (no multi-shared edges found).

## Code Review

### 1. Edge Map Construction (`buildEdgeMap()`)

**Location:** `src/core/dualGridStates.js:1168-1185`

**Code:**
```javascript
function buildEdgeMap(triangles) {
  const edgeMap = new Map();
  triangles.forEach((tri, triIndex) => {
    const [v0, v1, v2] = tri.verts;
    const edges = [
      getEdgeKey(v0, v1),
      getEdgeKey(v1, v2),
      getEdgeKey(v2, v0),
    ];
    edges.forEach(edgeKey => {
      if (!edgeMap.has(edgeKey)) {
        edgeMap.set(edgeKey, []);
      }
      edgeMap.get(edgeKey).push(triIndex);
    });
  });
  return edgeMap;
}
```

**Analysis:**
- ✅ **Good:** Edge keys are normalized via `getEdgeKey()` (ensures v1 < v2)
- ✅ **Good:** Each triangle's 3 edges are correctly added to map
- ⚠️ **Issue:** Edge map stores triangle indices, which may become stale after triangles are removed
- ⚠️ **Issue:** No validation that edge vertices actually exist in triangles

**Audit Logs:**
```
[buildEdgeMap] AUDIT: Total edges: 360, boundary: 18, multi-shared (>2): 0
```
- No multi-shared edges found (good)
- Boundary edges correctly identified (18 edges shared by 1 triangle)

### 2. Edge Selection (`dissolveEdgesToQuads()` main loop)

**Location:** `src/core/dualGridStates.js:1278-1304`

**Code:**
```javascript
while (attempts < maxAttempts && dissolveCount < maxAttempts) {
  attempts++;
  
  // Rebuild edge map (triangles may have been removed)
  const activeTriangles = workingTriangles.filter(t => !t.removed);
  const edgeMap = buildEdgeMap(activeTriangles);
  
  // Get all internal edges (shared by exactly 2 triangles)
  const internalEdges = Array.from(edgeMap.entries())
    .filter(([edgeKey, triIndices]) => triIndices.length === 2)
    .map(([edgeKey]) => edgeKey);
  
  // Randomly select an edge (with probability check)
  if (rng.random() > dissolveProbability) {
    continue; // Skip this attempt based on probability
  }
  
  const randomEdgeIndex = Math.floor(rng.random() * internalEdges.length);
  const selectedEdge = internalEdges[randomEdgeIndex];
  // ... validation ...
}
```

**Analysis:**
- ✅ **Good:** Edge map is rebuilt each iteration (prevents stale references)
- ✅ **Good:** Only internal edges (shared by 2 triangles) are selected
- ⚠️ **Issue:** Probability check may skip valid edges unnecessarily
- ⚠️ **Issue:** No verification that selected edge vertices exist in both triangles

### 3. Edge Validation (`canDissolveEdge()`)

**Location:** `src/core/dualGridStates.js:1188-1214`

**Code:**
```javascript
function canDissolveEdge(edgeKey, edgeMap, triangles) {
  const sharingTriangles = edgeMap.get(edgeKey);
  if (!sharingTriangles || sharingTriangles.length !== 2) {
    return false; // Not an internal edge (shared by exactly 2 triangles)
  }
  
  const [tri1Idx, tri2Idx] = sharingTriangles;
  const tri1 = triangles[tri1Idx];
  const tri2 = triangles[tri2Idx];
  
  if (!tri1 || !tri2 || tri1.removed || tri2.removed) {
    return false; // One of the triangles is already removed
  }
  
  // Get all unique vertices from both triangles
  const allVerts = [...new Set([...tri1.verts, ...tri2.verts])];
  
  // Must have exactly 4 unique vertices to form a quad
  if (allVerts.length !== 4) {
    return false;
  }
  
  return true;
}
```

**Analysis:**
- ✅ **Good:** Checks that edge is shared by exactly 2 triangles
- ✅ **Good:** Checks that triangles are not removed
- ❌ **BUG:** Doesn't verify that edge vertices actually exist in both triangles
- ❌ **BUG:** Doesn't verify that triangles share exactly 2 vertices (the edge)

**Example Failure:**
```
Cannot dissolve edge 99,108: 6 unique vertices (expected 4), tri1: [6,27,113], tri2: [122,120,3]
```
- Edge key is "99,108"
- But tri1 has vertices [6,27,113] and tri2 has [122,120,3]
- Neither triangle contains vertices 99 or 108!
- This indicates edge map incorrectly associates triangles with edges

### 4. Triangle Merging (`mergeTrianglesToQuad()`)

**Location:** `src/core/dualGridStates.js:1217-1276`

**Code:**
```javascript
function mergeTrianglesToQuad(tri1, tri2, edgeKey) {
  const [v1, v2] = edgeKey.split(',').map(Number);
  const allVerts = [...new Set([...tri1.verts, ...tri2.verts])];
  
  // Order vertices to form a valid quad
  // ... complex ordering logic ...
  
  return {
    type: 'quad',
    verts: orderedVerts,
  };
}
```

**Analysis:**
- ✅ **Good:** Creates quad from 4 unique vertices
- ⚠️ **Issue:** Assumes edge vertices exist in triangles (not verified)
- ⚠️ **Issue:** Complex ordering logic may fail if vertices don't form valid cycle

## Bugs Identified

### Bug 1: Edge Map Incorrectly Associates Triangles with Edges (CRITICAL)

**Evidence:**
- Audit logs show edges with vertices that don't exist in associated triangles
- Example: Edge "99,108" associated with triangles [6,27,113] and [122,120,3]
- Neither triangle contains vertices 99 or 108

**Root Cause:**
- Edge map is built correctly (edges are normalized, triangles are indexed)
- But when triangles are removed, edge map is rebuilt with new triangle indices
- Triangle indices in `workingTriangles` array may shift after removal
- Edge map stores indices into `workingTriangles`, but these indices may point to wrong triangles after filtering

**Example:**
1. Initial: `workingTriangles = [T0, T1, T2, T3]`
2. Edge map: `{"0,1": [0, 1]}` (T0 and T1 share edge 0,1)
3. T0 is removed: `workingTriangles = [T1, T2, T3]` (T1 is now at index 0)
4. Edge map rebuilt: `{"0,1": [0, 1]}` (but now index 0 is T1, index 1 is T2)
5. Edge map incorrectly associates T1 and T2 with edge 0,1

**Fix Required:**
- Use stable triangle identifiers (e.g., original index) instead of array indices
- OR verify edge vertices exist in triangles before attempting dissolution

### Bug 2: Missing Edge Vertex Verification (HIGH PRIORITY)

**Evidence:**
- `canDissolveEdge()` doesn't verify that edge vertices exist in both triangles
- Many failures show "6 unique vertices" where edge vertices don't match triangle vertices

**Root Cause:**
- Code assumes edge map is always correct
- No validation that edge key vertices actually exist in associated triangles

**Fix Required:**
- Add verification in `canDissolveEdge()`:
  ```javascript
  const [v1, v2] = edgeKey.split(',').map(Number);
  const tri1HasEdge = tri1.verts.includes(v1) && tri1.verts.includes(v2);
  const tri2HasEdge = tri2.verts.includes(v1) && tri2.verts.includes(v2);
  if (!tri1HasEdge || !tri2HasEdge) {
    return false;
  }
  ```

### Bug 3: Triangle Index Staleness After Removal (MEDIUM PRIORITY)

**Evidence:**
- Edge map is rebuilt each iteration, but uses filtered `activeTriangles`
- Triangle indices in edge map may not match `workingTriangles` array indices

**Root Cause:**
- `buildEdgeMap()` receives `activeTriangles` (filtered array)
- But `canDissolveEdge()` uses `workingTriangles[tri1Idx]` (original array)
- Index mismatch causes wrong triangles to be accessed

**Fix Required:**
- Pass `workingTriangles` to `buildEdgeMap()` and filter inside
- OR use triangle objects directly instead of indices
- OR create mapping from active triangle index to working triangle index

## Log Analysis

### Failure Patterns

From audit logs (127 points, 234 triangles):

1. **Primary Failure:** "6 unique vertices (expected 4)"
   - Most common failure mode
   - Indicates edge vertices don't match triangle vertices
   - Suggests edge map bug (Bug 1)

2. **Edge Map Stats:**
   - Total edges: 360
   - Boundary edges: 18 (correct)
   - Multi-shared edges: 0 (correct)
   - No structural issues in edge map construction

3. **Success Rate:**
   - ~2.1% success rate
   - ~6.4% conversion rate
   - Very low, confirming structural bug

### Sample Audit Logs

**Successful Case:**
```
[dissolveEdgesToQuads] AUDIT attempt 1: {
  "attempt": 1,
  "selectedEdge": "4,123",
  "sharingTriangles": [59, 81],
  "canDissolve": true,
  "failureCategory": "success",
  "tri1Verts": [47, 4, 123],
  "tri2Verts": [4, 65, 123],
  "edgeMapSize": 360
}
```
✅ Edge "4,123" is correctly shared by triangles with vertices [47,4,123] and [4,65,123].

**Failure Case (Most Common):**
```
[dissolveEdgesToQuads] AUDIT attempt 4: {
  "attempt": 4,
  "selectedEdge": "99,108",
  "sharingTriangles": [78, 139],
  "canDissolve": false,
  "failureCategory": "edge_not_shared",
  "failureReason": "edge [99,108] not actually in triangles: tri1 has edge: false, tri2 has edge: false",
  "tri1Verts": [6, 27, 113],
  "tri2Verts": [122, 120, 3]
}
```
❌ Edge "99,108" is associated with triangles [78, 139], but:
- Triangle 78 has vertices [6, 27, 113] (doesn't contain 99 or 108)
- Triangle 139 has vertices [122, 120, 3] (doesn't contain 99 or 108)
- **Root cause:** Edge map incorrectly associates triangles with edges due to index staleness

**Failure Pattern Analysis:**
- Most failures are `edge_not_shared` (edge vertices don't exist in triangles)
- This confirms Bug 1: Edge map triangle index staleness
- Edge map indices [78, 139] point to wrong triangles after previous removals

## Recommendations

### Priority 1: Fix Edge Map Triangle Index Staleness (URGENT)

**Problem:** Edge map indices don't match `workingTriangles` array after filtering.

**Solution 1 (Recommended):** Use stable triangle identifiers
```javascript
// In buildEdgeMap(), store original triangle index
function buildEdgeMap(triangles, originalIndices) {
  const edgeMap = new Map();
  triangles.forEach((tri, activeIndex) => {
    const originalIndex = originalIndices ? originalIndices[activeIndex] : activeIndex;
    // ... store originalIndex in edge map ...
  });
}
```

**Solution 2:** Verify edge vertices before dissolution
```javascript
// In canDissolveEdge(), verify edge exists in triangles
const [v1, v2] = edgeKey.split(',').map(Number);
if (!tri1.verts.includes(v1) || !tri1.verts.includes(v2)) return false;
if (!tri2.verts.includes(v1) || !tri2.verts.includes(v2)) return false;
```

### Priority 2: Add Edge Vertex Verification (HIGH)

**Problem:** Code doesn't verify edge vertices exist in triangles.

**Solution:** Add verification in `canDissolveEdge()`:
```javascript
function canDissolveEdge(edgeKey, edgeMap, triangles) {
  // ... existing checks ...
  
  // NEW: Verify edge vertices exist in both triangles
  const [v1, v2] = edgeKey.split(',').map(Number);
  const tri1HasEdge = tri1.verts.includes(v1) && tri1.verts.includes(v2);
  const tri2HasEdge = tri2.verts.includes(v1) && tri2.verts.includes(v2);
  
  if (!tri1HasEdge || !tri2HasEdge) {
    return false; // Edge not actually shared
  }
  
  // NEW: Verify triangles share exactly 2 vertices (the edge)
  const sharedVerts = tri1.verts.filter(v => tri2.verts.includes(v));
  if (sharedVerts.length !== 2 || !sharedVerts.includes(v1) || !sharedVerts.includes(v2)) {
    return false; // Triangles don't share the edge
  }
  
  return true;
}
```

### Priority 3: Improve Edge Map Rebuilding (MEDIUM)

**Problem:** Edge map is rebuilt each iteration, but may have index mismatches.

**Solution:** Use triangle objects directly instead of indices:
```javascript
function buildEdgeMap(triangles) {
  const edgeMap = new Map();
  triangles.forEach((tri) => {
    const [v0, v1, v2] = tri.verts;
    const edges = [getEdgeKey(v0, v1), getEdgeKey(v1, v2), getEdgeKey(v2, v0)];
    edges.forEach(edgeKey => {
      if (!edgeMap.has(edgeKey)) {
        edgeMap.set(edgeKey, []);
      }
      edgeMap.get(edgeKey).push(tri); // Store triangle object, not index
    });
  });
  return edgeMap;
}
```

## Next Steps

1. **Implement Priority 1 fix** (edge vertex verification)
2. **Re-run pipeline** and compare dissolution success rate
3. **If still failing:** Implement Priority 2 fix (stable triangle identifiers)
4. **If still failing:** Implement Priority 3 fix (triangle objects in edge map)
5. **Generate v5 report** with results

## Conclusion

The audit identified the root cause: **Edge map incorrectly associates triangles with edges** due to triangle index staleness after removal. The primary fix is to verify edge vertices exist in triangles before attempting dissolution. This should significantly improve dissolution success rates from ~2% to expected ~50-70% for valid Delaunay triangulations.
