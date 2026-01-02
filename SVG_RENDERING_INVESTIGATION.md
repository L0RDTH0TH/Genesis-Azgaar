# SVG Rendering Investigation Report

**Date:** 2025-01-01  
**Investigator:** AI Assistant  
**Purpose:** Investigate SVG rendering pipeline and vertex graph structure issues

## Executive Summary

The SVG rendering system in the Azgaar Genesis fork has a **fundamental structural mismatch** between what the isoline rendering expects and what the pack generation provides. The current implementation stores polygon coordinates directly in `cells.v[i]`, but isoline rendering requires vertex indices that reference a vertex graph (`vertices.c` and `vertices.v`).

## 1. Current State of SVG Rendering

### 1.1 SVG Rendering Functions

The SVG rendering pipeline consists of several key functions:

**Location:** `src/rendering/svg.js`

- **`renderMapSVG(data, options)`** - Main entry point (line 665)
- **`drawBiomesSVG(pack, biomesData)`** - Renders biomes (line 239)
- **`drawStatesSVG(pack)`** - Renders states (line 334)
- **`drawBordersSVG(pack)`** - Renders borders (line 361)
- **`drawRiversSVG(pack)`** - Renders rivers (line 500)
- **`drawBurgsSVG(pack)`** - Renders burgs (line 594)
- **`drawFeaturesSVG(pack)`** - Renders features (line 627)
- **`getIsolines(pack, getType, options)`** - Core isoline generation (line 42)

### 1.2 How `getIsolines()` is Called

```javascript
// In drawBiomesSVG (line 264):
const isolines = getIsolines(pack, (cellId) => cells.biome[cellId], {
  fill: true,
  waterGap: true,
});

// In drawStatesSVG (line 340):
const isolines = getIsolines(pack, (cellId) => cells.state[cellId], {
  fill: true,
  waterGap: true,
});

// In drawBordersSVG (line 428):
const startingVertex = cells.v[fromCell]?.find((v) =>
  vertices.c[v]?.some((i) => isLand(i) && isTypeTo(i))
);
```

### 1.3 Error Handling and Fallbacks

**Current Error Handling:**

1. **`getIsolines()` function** (lines 42-114):
   - Wrapped in try-catch (line 43)
   - Early return if `vertices.c` is empty (lines 47-50)
   - Checks if `cells.v` contains coordinates vs indices (lines 53-62)
   - Returns empty object `{}` on any error (line 113)

2. **`drawBiomesSVG()` function** (lines 239-327):
   - Checks for vertex graph availability (lines 246-259)
   - Has polygon fallback rendering (lines 289-324)
   - Falls back to direct polygon rendering when isolines fail

3. **`drawStatesSVG()` function** (lines 334-354):
   - **NO FALLBACK** - directly calls `getIsolines()` without error handling
   - Will fail if vertex graph is missing

**Error Pattern:**
```
TypeError: Cannot read properties of undefined (reading 'XXX')
at getIsolines (svg.js:5708:41)
at drawBiomesSVG (svg.js:5809:20)
at renderMapSVG (svg.js:6050:21)
```

The error occurs when trying to access `vertices.c[v]` where `v` is a vertex index, but `vertices.c` is empty or `vertices.c[v]` is undefined.

## 2. Current State of Vertex Graph

### 2.1 How `cells.v` is Populated

**Location:** `src/core/regraph.js` (lines 99-112)

```javascript
// Get polygon vertices for this cell from Voronoi diagram
const cellPolygon = Voronoi.renderCell(i);
if (cellPolygon && cellPolygon.length > 0) {
  // Store polygon coordinates directly (array of [x, y] pairs)
  // This can be used directly for Canvas rendering
  packCells.v[i] = Array.from(cellPolygon).map(([x, y]) => [x, y]);
  
  // Calculate area from polygon
  packCells.area[i] = Math.abs(d3.polygonArea(cellPolygon));
}
```

**Problem:** `packCells.v[i]` contains **polygon coordinates** `[[x1,y1], [x2,y2], ...]` instead of **vertex indices** `[v1, v2, v3, ...]`.

### 2.2 How `vertices.c` is Populated

**Location:** `src/core/regraph.js` (lines 129-132)

```javascript
const vertices = {
  p: allPoints.slice(0, newCells.p.length), // Keep for compatibility
  c: [], // Cells for each vertex (not fully populated - SVG will use polygon fallback)
};
```

**Problem:** `vertices.c` is initialized as an **empty array** `[]`. It is never populated with the vertex-to-cell mapping required for isoline rendering.

### 2.3 How `vertices.v` is Populated

**Location:** `src/core/regraph.js` (lines 129-132)

**Problem:** `vertices.v` is **not defined at all** in the pack vertices structure. The isoline rendering expects `vertices.v[v]` to contain adjacent vertex indices.

### 2.4 Comparison with Original Azgaar Code

**Original Implementation:** `original/modules/voronoi.js` (lines 24-35)

```javascript
constructor(delaunay, points, pointsN) {
  // ...
  this.cells = { v: [], c: [], b: [] }; // voronoi cells: v = cell vertices, c = adjacent cells
  this.vertices = { p: [], v: [], c: [] }; // vertices: p = coordinates, v = adjacent vertices, c = adjacent cells
  
  for (let e = 0; e < this.delaunay.triangles.length; e++) {
    const p = this.delaunay.triangles[this.nextHalfedge(e)];
    if (p < this.pointsN && !this.cells.c[p]) {
      const edges = this.edgesAroundPoint(e);
      this.cells.v[p] = edges.map(e => this.triangleOfEdge(e)); // cell: adjacent vertex INDICES
      // ...
    }
    
    const t = this.triangleOfEdge(e);
    if (!this.vertices.p[t]) {
      this.vertices.p[t] = this.triangleCenter(t); // vertex: coordinates
      this.vertices.v[t] = this.trianglesAdjacentToTriangle(t); // vertex: adjacent vertices
      this.vertices.c[t] = this.pointsOfTriangle(t); // vertex: adjacent cells
    }
  }
}
```

**Key Differences:**
1. Original: `cells.v[p]` = array of **vertex indices** (numbers)
2. Fork: `packCells.v[i]` = array of **polygon coordinates** (arrays)
3. Original: `vertices.c[t]` = array of **cell indices** that share vertex `t`
4. Fork: `vertices.c` = **empty array** `[]`
5. Original: `vertices.v[t]` = array of **adjacent vertex indices**
6. Fork: `vertices.v` = **undefined**

## 3. Modifications That Simplified Polygon Storage

### 3.1 Canvas Rendering Optimization

The fork simplified polygon storage to optimize for Canvas rendering:

**Location:** `src/core/regraph.js` (lines 99-104)

```javascript
// Store polygon coordinates directly (array of [x, y] pairs)
// This can be used directly for Canvas rendering
packCells.v[i] = Array.from(cellPolygon).map(([x, y]) => [x, y]);
```

**Rationale:** Canvas rendering can directly use polygon coordinates, so storing them directly avoids conversion overhead.

**Impact:** This optimization broke SVG isoline rendering, which requires the vertex graph structure.

### 3.2 Simplified Pack Creation

**Location:** `src/generator.js` (lines 62-98)

The `createSimplifiedPack()` function creates a pack without the full Voronoi structure:

```javascript
function createSimplifiedPack(grid, options) {
  // ...
  const packCellsC = [];
  if (gridCells.c) {
    for (let i = 0; i < gridCells.i.length; i++) {
      packCellsC[i] = gridCells.c[i] ? (Array.isArray(gridCells.c[i]) ? gridCells.c[i].slice() : Array.from(gridCells.c[i])) : [];
    }
  }
  // ...
  c: packCellsC,
  // ...
}
```

This is used when `fullRendering === false`, but even with `fullRendering === true`, the vertex graph is not built.

## 4. Console Logs and Error Handling

### 4.1 Current Error Messages

**From `getIsolines()`:**
```javascript
console.warn('getIsolines error:', error.message);
```

**From `drawBiomesSVG()`:**
```javascript
console.warn('Isoline rendering failed, using polygon fallback:', error.message);
```

### 4.2 Error Flow

1. `renderPreviewSVG()` calls `renderMapSVG()`
2. `renderMapSVG()` calls `drawBiomesSVG()` and `drawStatesSVG()`
3. `drawBiomesSVG()` has fallback, so it may succeed with polygon rendering
4. `drawStatesSVG()` has **no fallback**, so it fails when `getIsolines()` returns empty
5. Error propagates up and is caught in `renderPreviewSVG()` (line 476)

## 5. Test Files

### 5.1 Created Test File

**File:** `examples/svg-investigation-test.html`

This test file:
- Tests SVG rendering with error logging
- Inspects vertex graph structure
- Reports `cells.v` data type (coordinates vs indices)
- Reports `vertices.c` and `vertices.v` population status
- Provides detailed console output for debugging

**Usage:**
```bash
npm run build:dev
# Open examples/svg-investigation-test.html in browser
# Click "Test SVG Rendering" or "Inspect Vertex Graph"
```

## 6. Recommendations for Option C (Building Full Vertex Graph)

### 6.1 Required Changes to `regraph.js`

To build the full vertex graph while preserving polygon fidelity:

1. **Build vertex index mapping:**
   - Create a map from polygon coordinates to vertex indices
   - Store vertex indices in `packCells.v[i]` (for isoline rendering)
   - Also store polygon coordinates separately (for canvas rendering)

2. **Populate `vertices.c`:**
   - For each vertex, collect all cells that share that vertex
   - Build `vertices.c[v] = [cell1, cell2, cell3, ...]`

3. **Populate `vertices.v`:**
   - For each vertex, find adjacent vertices (shared edges)
   - Build `vertices.v[v] = [v1, v2, v3]` (typically 3 adjacent vertices)

4. **Populate `vertices.p`:**
   - Already done (line 130), but ensure it matches vertex indices

### 6.2 Implementation Strategy

**Phase 1: Build Vertex Index Map**
```javascript
// Create unique vertex index for each unique coordinate
const vertexMap = new Map(); // coordKey -> vertexIndex
const verticesP = [];
const vertexToCells = []; // vertexIndex -> [cell1, cell2, ...]

for (let cellId = 0; cellId < packCells.v.length; cellId++) {
  const polygon = packCells.v[cellId]; // Currently coordinates
  const vertexIndices = [];
  
  for (const [x, y] of polygon) {
    const coordKey = `${x.toFixed(2)},${y.toFixed(2)}`;
    let vertexId;
    
    if (vertexMap.has(coordKey)) {
      vertexId = vertexMap.get(coordKey);
    } else {
      vertexId = verticesP.length;
      vertexMap.set(coordKey, vertexId);
      verticesP.push([x, y]);
      vertexToCells.push([]);
    }
    
    vertexIndices.push(vertexId);
    vertexToCells[vertexId].push(cellId);
  }
  
  // Store both: indices for isolines, coordinates for canvas
  packCells.v[cellId] = vertexIndices; // For isoline rendering
  packCells.vCoords[cellId] = polygon; // For canvas rendering (new field)
}
```

**Phase 2: Build Adjacent Vertex Graph**
```javascript
// For each vertex, find adjacent vertices (shared by 2 cells)
const vertexToVertices = [];

for (let v = 0; v < verticesP.length; v++) {
  const cells = vertexToCells[v];
  const adjacentVertices = new Set();
  
  // Find vertices shared by cells that also share this vertex
  for (const cellId of cells) {
    const cellVertices = packCells.v[cellId];
    const vIndex = cellVertices.indexOf(v);
    if (vIndex >= 0) {
      // Get previous and next vertex in polygon
      const prev = cellVertices[(vIndex - 1 + cellVertices.length) % cellVertices.length];
      const next = cellVertices[(vIndex + 1) % cellVertices.length];
      adjacentVertices.add(prev);
      adjacentVertices.add(next);
    }
  }
  
  vertexToVertices.push(Array.from(adjacentVertices));
}

vertices.v = vertexToVertices;
vertices.c = vertexToCells;
```

### 6.3 Backward Compatibility

To maintain backward compatibility:

1. **Keep polygon coordinates:** Store in `packCells.vCoords[i]` for canvas rendering
2. **Update canvas renderer:** Use `packCells.vCoords[i]` instead of `packCells.v[i]`
3. **Update SVG renderer:** Use `packCells.v[i]` (vertex indices) for isolines
4. **Fallback support:** Keep polygon fallback in `drawBiomesSVG()` for edge cases

### 6.4 Testing Requirements

1. **Visual comparison:** Generated maps should look identical before/after
2. **Data comparison:** Export JSON and compare cell counts, state counts, etc.
3. **Performance:** Measure generation time (should be minimal increase)
4. **Edge cases:** Test with different cell counts, map sizes, seeds

## 7. Code Snippets

### 7.1 Current `getIsolines()` Early Return Check

```42:62:src/rendering/svg.js
function getIsolines(pack, getType, options = { fill: false, waterGap: false, halo: false }) {
  try {
    const { cells, vertices } = pack;
    
    // Check if vertex graph is available (required for isoline rendering)
    if (!vertices || !vertices.c || !Array.isArray(vertices.c) || vertices.c.length === 0) {
      // Return empty isolines to trigger polygon fallback
      return {};
    }
    
    // Additional safety check: verify cells.v contains vertex indices, not polygon coordinates
    if (cells.v && cells.v.length > 0) {
      const firstCellV = cells.v[0];
      if (firstCellV && Array.isArray(firstCellV) && firstCellV.length > 0) {
        // Check if first element is a coordinate array (polygon) or a number (vertex index)
        if (Array.isArray(firstCellV[0])) {
          // This is polygon coordinates, not vertex indices - can't do isoline rendering
          return {};
        }
      }
    }
```

### 7.2 Current `regraph.js` Vertex Structure

```123:132:src/core/regraph.js
  // Create vertices structure
  // For full rendering, polygon coordinates are stored directly in pack.cells.v[i]
  // This vertices structure is kept for compatibility with existing code
  // Note: For rendering, use pack.cells.v[i] directly instead of vertices
  // SVG isoline rendering requires vertices.c to be populated, but that's complex
  // The SVG renderer will fall back to polygon rendering if isolines fail
  const vertices = {
    p: allPoints.slice(0, newCells.p.length), // Keep for compatibility
    c: [], // Cells for each vertex (not fully populated - SVG will use polygon fallback)
  };
```

### 7.3 Polygon Fallback in `drawBiomesSVG()`

```289:324:src/rendering/svg.js
  // Fallback: render polygons directly if isolines not available
  // Group cells by biome and render as polygons
  const biomeGroups = {};
  for (let i = 0; i < cells.i.length; i++) {
    const biomeId = cells.biome[i];
    if (biomeId === undefined || biomeId < 0) continue;
    
    if (!biomeGroups[biomeId]) {
      biomeGroups[biomeId] = [];
    }
    
    // Get polygon from cells.v[i] (polygon coordinates)
    if (cells.v[i] && Array.isArray(cells.v[i]) && cells.v[i].length > 0) {
      const polygon = cells.v[i];
      // Check if it's coordinates or indices
      const isCoordinates = Array.isArray(polygon[0]) && polygon[0].length === 2;
      
      if (isCoordinates) {
        // Convert polygon coordinates to SVG path
        const path = polygon.map(([x, y], idx) => 
          idx === 0 ? `M${x},${y}` : `L${x},${y}`
        ).join(' ') + ' Z';
        
        const color = biomeId < biomesData.color.length 
          ? biomesData.color[biomeId] 
          : biomesData.color[0];
        
        biomeGroups[biomeId].push(`<path d="${path}" fill="${color}" stroke="${color}" stroke-width="0.5" opacity="0.7" />`);
      }
    }
  }
```

## 8. Next Steps

1. **Review this report** and approve the investigation findings
2. **Decide on implementation approach:**
   - Option A: Build full vertex graph (recommended for full SVG support)
   - Option B: Enhance polygon fallback for all SVG functions
   - Option C: Hybrid approach (build vertex graph but keep polygon fallback)
3. **Create implementation plan** with specific code changes
4. **Test thoroughly** with the investigation test file
5. **Update documentation** to reflect vertex graph requirements

## 9. Files Modified/Created

- ✅ `examples/svg-investigation-test.html` - Test file for investigation
- ✅ `SVG_RENDERING_INVESTIGATION.md` - This report

## 10. Conclusion

The SVG rendering system is **partially functional** with polygon fallback for biomes, but **fails for states and borders** due to missing vertex graph. The root cause is the simplification of polygon storage for canvas optimization, which broke the isoline rendering that requires vertex indices and a vertex graph.

**Recommendation:** Implement Option C (build full vertex graph) to restore full SVG isoline rendering while maintaining backward compatibility with canvas rendering.
