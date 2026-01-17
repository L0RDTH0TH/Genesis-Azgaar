# Dual-Grid Implementation Reference
**Date:** January 14, 2026  
**Project:** Azgaar-Genesis Fork - Interactive Terrain Preview  
**File:** `interactive-terrain.html` / `scripts/generate-interactive-terrain.js`

---

## 1. Where and How Dual Grid is Generated

### Main Generation Function
**File:** `src/core/dualGridStates.js`  
**Function:** `buildStalbergQuadGrid(hexLayers, rng, options)`

**Entry Point (Interactive Preview):**
**File:** `scripts/generate-interactive-terrain.js`  
**Function:** `generateInteractiveTerrain()`

```javascript
// Line 55-56: Main generation call
loadOptions(testOptions);
const data = generateMap(Delaunator);
```

**Dual Grid Assignment:**
```javascript
// Line 204 in src/generator.js
pack.dualGrid = buildStalbergQuadGrid(hexLayers, dualGridRng, options);
```

### Key Files
- `src/core/dualGridStates.js` - Core dual-grid construction (Stålberg-inspired algorithm)
- `src/generator.js` - Integration point (line 204)
- `scripts/generate-interactive-terrain.js` - Interactive preview generation

---

## 2. Input Parameters / Configuration

### Options Object (Interactive Preview)
**File:** `scripts/generate-interactive-terrain.js` (lines 32-51)

```javascript
const testOptions = {
  seed: 'interactive-42',
  mapWidth: 960,
  mapHeight: 540,
  statesNumber: 18,
  fullRendering: true,
  useDualGridPolitics: true,
  logRelaxation: false,
  politicsMode: {
    baseHexRings: ringCount,  // 9 (--small) or 12 (default)
    numStates: 10,
    relaxationIterations: 300,
    dampingFactor: 0.3,
    earlyTerminationThreshold: 0.0001,
    lockBoundaries: true,
    progressiveDamping: true,
    dissolveProbability: 0.65,
    dualOffsetFactor: 0.5,  // 50% of avg edge length for dual offset
  },
};
```

### Special Flags
- **`--small` command-line flag**: Forces `baseHexRings = 9` (fast testing mode)
- **`useDualGridPolitics: true`**: Enables dual-grid generation
- **Forced original points**: Currently hardcoded in `renderSVG()` (line 499)

---

## 3. Point Generation Process

### Initial Point Creation
**File:** `src/core/dualGridStates.js`  
**Function:** `createHexagonalPoints(layers, rng)` (lines 121-149)

```javascript
function createHexagonalPoints(layers, rng) {
  const points = [];
  const hexSize = 10; // Size of hex (adjust to fit map scale)
  
  // Center point
  points.push({ x: 0, y: 0 });
  
  // Concentric hex rings using axial coordinates
  for (let ring = 1; ring <= layers; ring++) {
    for (let q = -ring; q <= ring; q++) {
      const r1 = Math.max(-ring, -q - ring);
      const r2 = Math.min(ring, -q + ring);
      for (let r = r1; r <= r2; r++) {
        if (q === 0 && r === 0) continue; // Skip center
        
        // Convert axial to pixel coordinates
        const x = (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r) * hexSize;
        const y = (3 / 2 * r) * hexSize;
        points.push({ x, y });
      }
    }
  }
  return points;
}
```

**Total Points Formula:** `1 + 3 * rings * (rings + 1)`  
- 9 rings ≈ 244 points
- 12 rings ≈ 469 points

### Relaxation Method
**File:** `src/core/dualGridStates.js`  
**Function:** `relaxGrid(points, neighborMap, iterations, damping)` (lines 545-621)

**Method:** Laplacian smoothing (not Lloyd's relaxation)

```javascript
export function relaxGrid(points, neighborMap, iterations = 200, damping = 0.3) {
  for (let iter = 0; iter < iterations; iter++) {
    const forces = new Map();
    
    // Accumulate forces (Laplacian smoothing)
    for (let i = 0; i < points.length; i++) {
      const neighborIndices = neighborMap.get(i) || [];
      if (neighborIndices.length === 0) continue;
      
      // Calculate average position of neighbors
      let avgX = 0, avgY = 0;
      for (const neighborIdx of neighborIndices) {
        avgX += points[neighborIdx].x;
        avgY += points[neighborIdx].y;
      }
      avgX /= neighborIndices.length;
      avgY /= neighborIndices.length;
      
      // Calculate force (damped movement toward average)
      const forceX = (avgX - points[i].x) * damping;
      const forceY = (avgY - points[i].y) * damping;
      forces.set(i, { x: forceX, y: forceY });
    }
    
    // Apply forces synchronously
    for (const [pointIdx, force] of forces) {
      points[pointIdx].x += force.x;
      points[pointIdx].y += force.y;
    }
    
    // Early termination check
    // ...
  }
}
```

**Current Settings:**
- **Iterations:** 300 (from `politicsMode.relaxationIterations`)
- **Damping:** 0.3 (fixed, not progressive in current implementation)
- **Early termination:** If avg movement < 0.001 for 10 consecutive iterations

### Post-Processing
**No explicit centering/scaling in current implementation** - Points remain in hexagonal coordinate space after relaxation.

---

## 4. Dual Grid Construction

### Pipeline Steps
**File:** `src/core/dualGridStates.js`  
**Function:** `buildStalbergQuadGrid()` (lines 19-126)

**Steps:**
1. Generate hexagonal points → `createHexagonalPoints()`
2. Triangulate from hex centers → `triangulateFromHex()`
3. Dissolve edges to form quads → `dissolveEdgesToQuads()` (probability: 0.65)
4. Subdivide remaining triangles → `subdivideTriangleIntoThreeQuads()`
5. Create Level 0 quads (coarse states)
6. Subdivide Level 0 → Level 1 quads → `subdivideQuadIntoFour()`
7. Relax Level 0 quads → `relaxGrid()` (300 iterations)
8. Relax Level 1 quads → `relaxGrid()` (300 iterations)
9. **Apply dual offset** → `applyDualOffset()` (lines 114-118)

### Dual Offset Calculation
**File:** `src/core/dualGridStates.js`  
**Function:** `applyDualOffset(points, quads, offsetFactor)` (lines 623-692)

```javascript
function applyDualOffset(points, quads, offsetFactor = 0.30) {
  const dualPoints = points.map(p => ({ x: p.x, y: p.y })); // Copy original
  
  for (const quad of quads) {
    // Compute quad center
    let cx = 0, cy = 0;
    for (const v of quad.verts) {
      cx += points[v].x;
      cy += points[v].y;
    }
    cx /= quad.verts.length;
    cy /= quad.verts.length;
    
    // Calculate minimum edge length for clamping
    let minEdgeLength = Infinity;
    for (let i = 0; i < quad.verts.length; i++) {
      const v0 = points[quad.verts[i]];
      const v1 = points[quad.verts[(i + 1) % quad.verts.length]];
      const edgeLen = Math.sqrt((v1.x - v0.x) ** 2 + (v1.y - v0.y) ** 2);
      minEdgeLength = Math.min(minEdgeLength, edgeLen);
    }
    
    // Move each vertex inward toward center
    for (const v of quad.verts) {
      const p = points[v];
      const dx = cx - p.x;
      const dy = cy - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < 1e-6) continue;
      
      // Clamp move to avoid over-offset (max 10% of min edge length)
      const move = Math.min(offsetFactor * dist, 0.1 * minEdgeLength);
      
      const newPos = {
        x: p.x + (dx / dist) * move,
        y: p.y + (dy / dist) * move,
      };
      
      dualPoints[v] = newPos;
    }
  }
  
  return dualPoints;
}
```

**Current Settings:**
- **Offset Factor:** 0.5 (50% of distance to center, from `politicsMode.dualOffsetFactor`)
- **Clamping:** Max 10% of minimum edge length per quad
- **Applied to:** Level 0 quads only (coarse states)

### Library Used
- **Delaunator:** Used for Voronoi generation (not directly for dual-grid)
- **Custom implementation:** Stålberg-inspired hex-to-quad algorithm (no external triangulation library)

---

## 5. Current Active Points Choice in Rendering

### Forced Original Points
**File:** `scripts/generate-interactive-terrain.js`  
**Function:** `renderSVG()` (line 499)

```javascript
// Temporarily force original points to restore visibility
const activePoints = points; // force original for now to restore render
// TODO: Re-enable dual check once no crash: dualPoints && dualPoints.length === points.length ? dualPoints : points;
console.log('Active points chosen: ORIGINAL (forced), length:', activePoints.length);
```

**Current State:** **Original points are forced** - dual points are generated but not used for rendering.

**Dual Points Status:**
- ✅ Generated: 27,721 dual points (matches original points count)
- ❌ Not used: Rendering uses original `points` array
- **Reason:** Temporarily disabled to restore visibility after crashes

---

## 6. Centering & Scaling Logic

### Current Implementation
**No explicit centering/scaling applied** in the current codebase.

**Points remain in hexagonal coordinate space:**
- Origin at (0, 0)
- Points extend in radial pattern from center
- Coordinates range approximately: x: [-500, 500], y: [-500, 500] (varies by ring count)

**Previous scaling code (commented out):**
- `scaleAndFitToBounds()` function existed but was removed/commented out
- No centroid calculation or translation to map center
- No normalization to target radius or aspect ratio

---

## 7. Rendering Details

### ViewBox Strategy
**File:** `scripts/generate-interactive-terrain.js`  
**Function:** `renderSVG()` (lines 533-542)

**Current:** **Fixed viewBox (temporary test)**

```javascript
// Fix 2: Force fixed viewBox (temporary test)
const viewBoxX = 0;
const viewBoxY = 0;
const viewBoxWidth = 1000;
const viewBoxHeight = 1000;
console.log('FORCED TEST viewBox: 0 0 1000 1000');

// Original dynamic calculation (COMMENTED OUT):
// let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
// for (const p of activePoints) {
//   minX = Math.min(minX, p.x);
//   minY = Math.min(minY, p.y);
//   maxX = Math.max(maxX, p.x);
//   maxY = Math.max(maxY, p.y);
// }
// const padding = 20;
// const width = maxX - minX;
// const height = maxY - minY;
// const viewBoxX = minX - padding;
// const viewBoxY = minY - padding;
// const viewBoxWidth = width + (padding * 2);
// const viewBoxHeight = height + (padding * 2);
```

**SVG Element:**
```javascript
const svg = `<svg xmlns="http://www.w3.org/2000/svg" 
  width="${mapWidth}" height="${mapHeight}" 
  viewBox="${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}" 
  preserveAspectRatio="xMidYMid meet" 
  overflow="visible">`;
```

### Quad Data Used
**Level 0 quads only** (coarse states)

```javascript
// Line 567: Loop over level0Quads
for (let i = 0; i < level0Quads.length; i++) {
  const quad = level0Quads[i];
  const quadVerts = quad.verts.map(vIdx => activePoints[vIdx]);
  // ... render as <path> element
}
```

**Level 1 quads:** Generated but not rendered in interactive preview.

### Debug Overlays Active
**File:** `scripts/generate-interactive-terrain.js` (lines 550-563)

1. **Red debug rectangle** (100×100 at origin):
```javascript
layers.push(`<rect x="0" y="0" width="100" height="100" fill="red" opacity="0.8" stroke="black" stroke-width="2" />`);
```

2. **Green circle** (first original point):
```javascript
if (points.length > 0) {
  const firstOriginal = points[0];
  layers.push(`<circle cx="${firstOriginal.x}" cy="${firstOriginal.y}" r="8" fill="green" opacity="0.9" />`);
}
```

3. **Red circle** (first dual point, if available):
```javascript
if (dualPoints && dualPoints.length > 0) {
  const firstOffset = dualPoints[0];
  layers.push(`<circle cx="${firstOffset.x}" cy="${firstOffset.y}" r="8" fill="red" opacity="0.9" />`);
}
```

4. **Background rectangle** (fills viewBox):
```javascript
layers.push(`<rect x="${viewBoxX}" y="${viewBoxY}" width="${viewBoxWidth}" height="${viewBoxHeight}" fill="#e8f4f8" />`);
```

---

## 8. Known Current Visual State

### Approximate Shape
- **Aspect ratio:** Radial/hexagonal (not rectangular)
- **Roundness:** Hexagonal pattern with organic relaxation
- **Size:** Points span approximately [-500, 500] in both x and y (for 9-12 rings)
- **Centering:** Origin at (0, 0), not centered to map bounds

### Current Issues
1. **Fixed viewBox (0 0 1000 1000):** Temporary test value - may not match actual point bounds
2. **Original points forced:** Dual points generated but not used (rounded corners not visible)
3. **No centering/scaling:** Grid may appear off-center or too small/large
4. **Coordinate space mismatch:** Points in hexagonal space, viewBox in fixed 1000×1000 space

### Last Run Results (from console logs)
- **Points:** 27,721
- **Level 0 quads:** 4,300
- **Level 1 quads:** 17,200
- **Dual points:** 27,721 (generated successfully)
- **Sample dual point:** `{ x: 58.26661669436739, y: -5.360503235235181 }`
- **Offset difference:** ~0.270 units (sample point 0)

---

## Summary

**Current State:**
- ✅ Dual grid generation working (Stålberg-inspired hex-to-quad pipeline)
- ✅ Dual points generated (27,721 points with 0.5 offset factor)
- ✅ Relaxation applied (300 iterations, Laplacian smoothing)
- ⚠️ **Original points forced** in rendering (dual points not used)
- ⚠️ **Fixed viewBox** (0 0 1000 1000) - temporary test value
- ⚠️ **No centering/scaling** - points remain in hexagonal coordinate space
- ✅ Debug overlays active (red rect, green/red circles)

**Key Files:**
- `src/core/dualGridStates.js` - Core implementation
- `scripts/generate-interactive-terrain.js` - Interactive preview
- `src/generator.js` - Integration point
