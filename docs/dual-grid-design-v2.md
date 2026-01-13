# Dual-Grid Politics Design v2 – Choices & Rationale

**Date**: January 12, 2026  
**Branch**: `experiment/dual-grid-politics`  
**Purpose**: Synthesize research findings into decisive implementation choices for dual-grid politics experiment

---

## Executive Summary

This document consolidates research on Oskar Stålberg's Townscaper techniques into concrete, opinionated choices for integrating dual-grid politics into the Azgaar-Genesis fork. Our goal: replace Voronoi-based state/province generation with organic, irregular quads that provide rounded borders and seamless political overlays while maintaining compatibility with existing Voronoi terrain pipelines.

**Key Decision**: We will use a **hex-layer → triangulate → dissolve → subdivide → relax** approach with **2-level nesting** (states/provinces) and **simple adjacency-based pattern matching** (not WFC) for our ~10k cell scale. This balances organic aesthetics with implementation complexity and performance.

---

## 1. Chosen Core Grid Construction Algorithm

### Algorithm: Stålberg-Inspired Hex-to-Quad with Edge Dissolution

**Exact Steps**:

1. **Generate Hexagonal Base Layer**
   - Create hexagonal point grid using layered approach (center + concentric rings)
   - Target: ~20–25 hex layers for ~100–150 base hexagons (Level 0)
   - Use redblobgames.com hex grid math for even distribution
   - Seed all random operations for reproducibility

2. **Triangulate from Center**
   - Connect each hex center to its 6 neighbors, forming triangles
   - Use Delaunay-like triangulation if needed, but prefer direct hex connections for simplicity

3. **Random Edge Dissolution**
   - Iteratively dissolve random edges (merge adjacent triangles into quads)
   - Constraint: Only merge if result is a quad (4 vertices), never create 6+ vertex polygons
   - Dissolve probability: 0.4–0.6 (tuned for ~60–70% quads, ~30–40% remaining triangles)
   - Max dissolve attempts: `3 * triangleCount` to avoid infinite loops

4. **Subdivide Remaining Triangles**
   - For each remaining triangle, subdivide into 3 quads:
     - Add midpoint on each edge
     - Add center point
     - Connect midpoints to center → 3 quads

5. **Uniform Quad Subdivision (Level 0 → Level 1)**
   - Subdivide all quads into 4 smaller quads (add midpoints on edges + center, connect)
   - This creates Level 0 (coarse/states): ~100–150 quads
   - Level 1 (fine/provinces): ~400–600 quads after subdivision

**Target Quad Count for Level 0**: 100–150 quads (coarse/states)  
**Rationale**: This provides ~10–15 states per map (typical for Azgaar at our scale), with enough granularity for organic expansion while keeping computation manageable.

**Trade-offs vs. Alternatives**:

- ✅ **Chosen**: Hex-layer → triangulate → dissolve → subdivide
  - **Pros**: Even distribution, proven technique, balanced quad/triangle ratio, organic results
  - **Cons**: Requires hex grid math, edge dissolution needs validation
  - **Performance**: O(n log n) initial triangulation, O(n) dissolution, O(n) subdivision

- ❌ **Alternative**: Pure triangulation + Lloyd's relaxation
  - **Cons**: Less control over quad shape, may produce thin/long quads, more iterations needed
  - **Why not chosen**: Less organic, harder to predict final quad count

- ❌ **Alternative**: Square grid + jitter
  - **Cons**: Too regular, doesn't match Stålberg aesthetic, boring borders
  - **Why not chosen**: Aesthetic mismatch with research goals

**Pseudocode**:

```javascript
function buildStalbergGrid(hexLayers, rng) {
  // Step 1: Generate hexagonal points
  let points = createHexagonalPoints(hexLayers, rng);  // ~100-150 points
  let triangles = triangulateFromHex(points);  // Connect hex centers
  
  // Step 2: Dissolve edges to form quads
  let dissolveCount = 0;
  let maxAttempts = triangles.length * 3;
  while (dissolveCount < maxAttempts) {
    let edge = selectRandomEdge(triangles, rng);
    if (canDissolve(edge, triangles)) {
      dissolveEdge(edge, triangles);
      dissolveCount++;
    }
  }
  
  // Step 3: Subdivide remaining triangles
  let quads = [];
  for (let tri of triangles) {
    if (tri.vertexCount === 3) {
      quads.push(...subdivideTriangleIntoThreeQuads(tri));
    } else {
      quads.push(tri);  // Already a quad
    }
  }
  
  // Step 4: Subdivide all quads for Level 0 → Level 1
  let level0Quads = quads;  // ~100-150 quads
  let level1Quads = [];
  for (let quad of level0Quads) {
    level1Quads.push(...subdivideQuadIntoFour(quad));
  }
  // level1Quads: ~400-600 quads
  
  return { points, level0Quads, level1Quads };
}
```

---

## 2. Relaxation Parameters & Implementation Choice

### Chosen Parameters

- **Default Iterations**: 200
- **Reasonable Range**: 100–500 (user-configurable)
- **Damping Factor**: 0.3 (30% of neighbor average pull per iteration)
- **Force Model**: Simple average of connected neighbors (Laplacian smoothing)

**Rationale**: 200 iterations provides good convergence for ~10k quads without excessive computation. Damping of 0.3 prevents oscillation while allowing movement. Simple average model is sufficient for organic smoothing; advanced force models (spring-mass, etc.) add complexity without clear benefit for our aesthetic goals.

**Trade-offs**:

- ✅ **Chosen**: Simple neighbor average + damping
  - **Pros**: Fast, predictable, easy to implement, proven effective
  - **Cons**: May not handle extreme cases (very irregular initial grid)
  - **Performance**: O(n * iterations) = O(10k * 200) = ~2M operations

- ❌ **Alternative**: Spring-mass system with edge lengths
  - **Cons**: More complex, requires edge length calculations, slower
  - **Why not chosen**: Overkill for our goals; simple average is sufficient

**Scaling Strategy for ~10k Quads**:

1. **Batch Processing**: Process quads in chunks of 1k–2k per batch if memory becomes issue
2. **Progressive Relaxation**: Start with fewer iterations (50), check convergence, add more if needed
3. **Spatial Optimization**: Use spatial hash/quadtree to find neighbors faster (optional optimization)
4. **Early Termination**: Stop if average point movement < threshold (0.01 units) for 10 consecutive iterations

**Pseudocode**:

```javascript
function relaxGrid(points, quads, iterations = 200, damping = 0.3, rng) {
  // Build neighbor map (point -> connected points)
  let neighbors = buildNeighborMap(points, quads);
  
  for (let iter = 0; iter < iterations; iter++) {
    let forces = new Map();
    let maxMovement = 0;
    
    // Accumulate forces
    for (let point of points) {
      let connected = neighbors.get(point) || [];
      if (connected.length === 0) continue;
      
      let avgX = 0, avgY = 0;
      for (let neighbor of connected) {
        avgX += neighbor.x;
        avgY += neighbor.y;
      }
      avgX /= connected.length;
      avgY /= connected.length;
      
      let forceX = (avgX - point.x) * damping;
      let forceY = (avgY - point.y) * damping;
      forces.set(point, { x: forceX, y: forceY });
    }
    
    // Apply forces
    for (let [point, force] of forces) {
      point.x += force.x;
      point.y += force.y;
      maxMovement = Math.max(maxMovement, Math.abs(force.x) + Math.abs(force.y));
    }
    
    // Early termination check
    if (iter > 50 && maxMovement < 0.01) {
      if (consecutiveLowMovement++ > 10) break;
    } else {
      consecutiveLowMovement = 0;
    }
  }
  
  return points;
}
```

---

## 3. Chunk Pattern Matching Strategy

### Chosen Approach: Simple Adjacency Rules (Not WFC)

**Decision**: Use **recursive pattern matching with adjacency rules** instead of Wave Function Collapse (WFC).

**Rationale**:
- WFC is complex to implement and debug, especially at scale
- Simple adjacency rules are sufficient for states/borders/merges
- Faster execution (no entropy calculation, no propagation)
- Easier to reason about and tune

**Pattern Definition Format**: JSON configs (loaded at initialization, can be hot-reloaded for testing)

**Starting Number of Patterns**:
- **States**: 5–8 base patterns (center, edge, corner, border, merge)
- **Borders**: 3–4 patterns (straight, curve, intersection, terminal)
- **Merges**: 2–3 patterns (simple merge, complex merge, triple junction)

**Total Starting Patterns**: ~10–15 patterns (expandable as needed)

**Pattern Matching Logic**:

1. **Selection Phase**: For each quad, determine its "role" (state center, border, merge candidate)
2. **Matching Phase**: Check adjacency constraints (e.g., border pattern requires at least one neighbor with different state)
3. **Assignment Phase**: Assign pattern variant (from available variants for that pattern type)

**Pseudocode**:

```javascript
// Pattern config structure
const patternConfigs = {
  states: [
    {
      id: 'center',
      type: 'state',
      variants: ['state_center_1', 'state_center_2', 'state_center_3'],
      constraints: { minNeighborsSameState: 4 }
    },
    {
      id: 'border',
      type: 'border',
      variants: ['border_straight', 'border_curve', 'border_intersection'],
      constraints: { minNeighborsDifferentState: 1 }
    },
    {
      id: 'merge',
      type: 'merge',
      variants: ['merge_simple', 'merge_complex'],
      constraints: { minNeighborsDifferentState: 2 }
    }
  ]
};

function matchChunkPattern(quad, neighbors, stateMap, patterns) {
  // Determine quad role
  let quadState = stateMap.get(quad);
  let neighborStates = neighbors.map(n => stateMap.get(n));
  let sameStateCount = neighborStates.filter(s => s === quadState).length;
  let differentStateCount = neighborStates.length - sameStateCount;
  
  // Match pattern based on constraints
  for (let pattern of patterns) {
    if (pattern.constraints.minNeighborsSameState && sameStateCount >= pattern.constraints.minNeighborsSameState) {
      return selectVariant(pattern, rng);
    }
    if (pattern.constraints.minNeighborsDifferentState && differentStateCount >= pattern.constraints.minNeighborsDifferentState) {
      return selectVariant(pattern, rng);
    }
  }
  
  // Default: center pattern
  return selectVariant(patterns.find(p => p.id === 'center'), rng);
}

function selectVariant(pattern, rng) {
  let variants = pattern.variants;
  return variants[Math.floor(rng.random() * variants.length)];
}
```

**Trade-offs**:

- ✅ **Chosen**: Simple adjacency rules
  - **Pros**: Fast, easy to implement, predictable, sufficient for our use case
  - **Cons**: Less flexible than WFC, may need manual pattern addition for edge cases

- ❌ **Alternative**: Wave Function Collapse (WFC)
  - **Cons**: Complex implementation, harder to debug, slower (entropy calculation), overkill for simple state/border patterns
  - **Why not chosen**: Complexity not justified by benefits at our scale

- ❌ **Alternative**: Pure random selection
  - **Cons**: No adjacency awareness, incoherent borders, ugly results
  - **Why not chosen**: Aesthetic mismatch

---

## 4. Nesting / Hierarchy Model

### Chosen Model: 2-Level Hierarchy (States → Provinces)

**Exact Number of Levels**: **2 levels** (Level 0: states, Level 1: provinces)

**Rationale**: 3 levels (states → provinces → burgs) adds unnecessary complexity. Burgs are better handled as point placements within provinces, not as quad subdivisions. 2 levels provide clear hierarchy: states (coarse) and provinces (fine).

**Subdivision Rule**: **Uniform ×4 subdivision** (each quad splits into 4 sub-quads)

**Level Structure**:
- **Level 0 (States)**: ~100–150 quads (coarse grid, one quad ≈ one state or part of state)
- **Level 1 (Provinces)**: ~400–600 quads (Level 0 × 4, one quad ≈ one province or part of province)

**Parent-Child Linking Mechanism**: Direct reference arrays

- Each Level 1 quad stores `parentQuadId` (index into Level 0 array)
- Each Level 0 quad stores `childQuadIds` (array of Level 1 indices)
- Fast lookup: `O(1)` parent lookup, `O(k)` child lookup (where k = 4 on average)

**Province and Burg Assignment**:

- **Provinces**: Assigned to Level 1 quads via expansion algorithm (similar to existing state expansion)
  - Start from province center (burg location)
  - Expand to adjacent Level 1 quads
  - Constraint: All Level 1 quads in a province share the same Level 0 parent (state boundary)

- **Burgs**: Assigned as **points** (not quads) within provinces
  - Map Voronoi burg positions to nearest Level 1 quad center
  - Store burg coordinates and `provinceQuadId` reference
  - Burgs can be placed anywhere within their province quad (not constrained to quad center)

**Pseudocode**:

```javascript
function createNestedGrid(baseQuads, levels = 2) {
  let hierarchy = {
    level0: baseQuads,  // ~100-150 quads (states)
    level1: []          // ~400-600 quads (provinces)
  };
  
  // Build Level 1 by subdividing Level 0
  for (let i = 0; i < hierarchy.level0.length; i++) {
    let parentQuad = hierarchy.level0[i];
    let children = subdivideQuadIntoFour(parentQuad);
    
    // Link parent-child
    parentQuad.childQuadIds = [];
    for (let child of children) {
      child.parentQuadId = i;
      child.level = 1;
      let childId = hierarchy.level1.length;
      hierarchy.level1.push(child);
      parentQuad.childQuadIds.push(childId);
    }
  }
  
  return hierarchy;
}

function assignProvincesToLevel1(hierarchy, provinceCenters, stateMap) {
  // provinceCenters: array of {x, y, stateId}
  // stateMap: Level 0 quad -> stateId
  
  let provinceAssignments = new Map();  // Level 1 quad -> provinceId
  
  for (let center of provinceCenters) {
    // Find nearest Level 1 quad
    let nearestQuad = findNearestQuad(hierarchy.level1, center.x, center.y);
    
    // Expand province from center
    expandProvince(nearestQuad, center.stateId, stateMap, hierarchy, provinceAssignments);
  }
  
  return provinceAssignments;
}

function assignBurgsToProvinces(burgs, hierarchy, provinceAssignments) {
  for (let burg of burgs) {
    // Find nearest Level 1 quad
    let nearestQuad = findNearestQuad(hierarchy.level1, burg.x, burg.y);
    let provinceQuadId = nearestQuad.index;
    burg.provinceQuadId = provinceQuadId;
    burg.provinceId = provinceAssignments.get(nearestQuad);
  }
}
```

**Trade-offs**:

- ✅ **Chosen**: 2-level hierarchy
  - **Pros**: Clear separation (states/provinces), manageable complexity, sufficient granularity
  - **Cons**: Less fine-grained than 3-level, but burgs don't need quad-level precision

- ❌ **Alternative**: 3-level hierarchy (states → provinces → burgs)
  - **Cons**: Overkill for burgs (they're points, not regions), adds complexity, slower
  - **Why not chosen**: Burgs are better as point placements; quad-level precision unnecessary

- ❌ **Alternative**: 1-level hierarchy (states only)
  - **Cons**: No province granularity, less interesting political structure
  - **Why not chosen**: Provinces are important for gameplay/narrative

---

## 5. Integration with Existing Voronoi Pipeline

### Integration Point: After Burg Generation, Before State Generation

**Exact Phase**: Dual-grid generation starts **after Phase 12 (Burg Generation)** and **before Phase 13 (State Generation)**.

**Rationale**: Burgs are placed using Voronoi cells (they need terrain data, culture data, etc.). Once burgs exist, we can generate the dual grid and map burgs to dual-grid points. Then, state/province generation (Phases 13–14) uses the dual grid instead of Voronoi.

**Phase Flow**:

```
Phase 1-11: Voronoi terrain/cultures (unchanged)
Phase 12: Burg generation (Voronoi-based, unchanged)
→ [NEW] Dual-grid generation (map burgs to dual-grid)
Phase 13: State generation (dual-grid-based, replaces Voronoi states)
Phase 14: Province generation (dual-grid-based, replaces Voronoi provinces)
Phase 15-16: Religions/emblems (unchanged, may reference dual-grid states)
```

**Burg Mapping Strategy**:

1. **Generate dual-grid** from Voronoi outline (bounding box of land cells)
2. **Snap burg positions** to nearest dual-grid point (Level 1 quad center)
3. **Store mapping**: `burg.dualGridPointId` (reference to Level 1 quad)
4. **Preserve original coordinates**: `burg.x`, `burg.y` remain unchanged (for rendering)

**Culture Mapping Strategy**:

- Cultures are already assigned to Voronoi cells
- Map Voronoi cell culture to overlapping/nearest Level 1 quad
- Propagate culture to Level 1 quads via majority vote (if multiple Voronoi cells overlap a quad)

**Fallback Behavior**:

When `options.useDualGridPolitics = false` (or undefined):

- Skip dual-grid generation entirely
- Use existing Voronoi-based state/province generation (current implementation)
- `pack.dualGrid` is `undefined` or `null`
- All other phases (burgs, religions, etc.) work as before

**Pseudocode**:

```javascript
// In generateMapInternal() after Phase 12
if (options.useDualGridPolitics !== false) {
  // Generate dual-grid
  let dualGrid = generateDualGrid({
    mapWidth: options.mapWidth,
    mapHeight: options.mapHeight,
    voronoiOutline: getVoronoiLandOutline(grid),  // Bounding box of land cells
    rng
  });
  
  // Map burgs to dual-grid
  mapBurgsToDualGrid(pack.burgs, dualGrid);
  
  // Map cultures to dual-grid (for state expansion)
  mapCulturesToDualGrid(grid, pack, dualGrid);
  
  // Store dual-grid in pack
  pack.dualGrid = dualGrid;
  
  // Phase 13: State generation (dual-grid-based)
  generateStatesDualGrid({ pack, grid, options, rng });
  
  // Phase 14: Province generation (dual-grid-based)
  generateProvincesDualGrid({ pack, grid, options, rng });
} else {
  // Fallback: Use existing Voronoi-based generation
  generateStates({ pack, options, rng });  // Existing function
  generateProvinces({ pack, options, rng });  // Existing function
}
```

**Voronoi Outline Extraction**:

```javascript
function getVoronoiLandOutline(grid) {
  // Find bounding box of land cells (height > 20)
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  
  for (let i = 0; i < grid.cells.i.length; i++) {
    if (grid.cells.h[i] > 20) {  // Land cell
      let [x, y] = grid.cells.p[i];
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}
```

---

## 6. Output Data Structure (final pack.dualGrid shape)

### Structure Definition

**Top-Level Shape**:

```javascript
pack.dualGrid = {
  levels: [
    {
      level: 0,
      quads: [ /* Level 0 quads (states) */ ],
      pointCount: 150
    },
    {
      level: 1,
      quads: [ /* Level 1 quads (provinces) */ ],
      pointCount: 600
    }
  ],
  points: [ /* All points (shared across levels) */ ],
  relaxationIterations: 200,
  relaxationDamping: 0.3
};
```

**Quad Object Structure**:

```javascript
{
  i: 42,                    // Quad index (unique per level)
  level: 0,                 // 0 = states, 1 = provinces
  verts: [0, 1, 2, 3],      // Indices into points array (4 vertices)
  center: {x: 512.5, y: 384.2},  // Quad center point
  parentQuadId: null,       // Level 1 only: index into level 0 quads
  childQuadIds: [100, 101, 102, 103],  // Level 0 only: indices into level 1 quads
  stateId: 5,               // Assigned state ID (or -1 if unassigned)
  provinceId: 12,           // Assigned province ID (Level 1 only, or -1)
  patternId: 'border',      // Matched pattern ID
  variantId: 'border_curve_2',  // Selected variant ID
  culture: 3                // Assigned culture ID (from Voronoi mapping)
}
```

**Realistic JSON Example** (2 nested levels, truncated):

```json
{
  "dualGrid": {
    "levels": [
      {
        "level": 0,
        "pointCount": 120,
        "quads": [
          {
            "i": 0,
            "level": 0,
            "verts": [0, 1, 2, 3],
            "center": {"x": 250.5, "y": 200.3},
            "parentQuadId": null,
            "childQuadIds": [0, 1, 2, 3],
            "stateId": 1,
            "provinceId": -1,
            "patternId": "center",
            "variantId": "state_center_1",
            "culture": 2
          },
          {
            "i": 1,
            "level": 0,
            "verts": [2, 4, 5, 3],
            "center": {"x": 350.8, "y": 210.1},
            "parentQuadId": null,
            "childQuadIds": [4, 5, 6, 7],
            "stateId": 1,
            "provinceId": -1,
            "patternId": "border",
            "variantId": "border_straight",
            "culture": 2
          }
        ]
      },
      {
        "level": 1,
        "pointCount": 480,
        "quads": [
          {
            "i": 0,
            "level": 1,
            "verts": [10, 11, 12, 13],
            "center": {"x": 240.2, "y": 195.5},
            "parentQuadId": 0,
            "childQuadIds": null,
            "stateId": 1,
            "provinceId": 5,
            "patternId": "center",
            "variantId": "province_center_1",
            "culture": 2
          },
          {
            "i": 1,
            "level": 1,
            "verts": [13, 14, 15, 12],
            "center": {"x": 260.7, "y": 205.1},
            "parentQuadId": 0,
            "childQuadIds": null,
            "stateId": 1,
            "provinceId": 5,
            "patternId": "border",
            "variantId": "border_curve",
            "culture": 2
          }
        ]
      }
    ],
    "points": [
      {"x": 230.0, "y": 190.0},
      {"x": 270.0, "y": 190.0},
      {"x": 270.0, "y": 210.0},
      {"x": 230.0, "y": 210.0},
      {"x": 330.0, "y": 200.0},
      {"x": 370.0, "y": 220.0}
    ],
    "relaxationIterations": 200,
    "relaxationDamping": 0.3
  },
  "burgs": [
    {
      "i": 1,
      "x": 245.3,
      "y": 198.7,
      "cell": 42,
      "dualGridPointId": 0,
      "provinceQuadId": 0,
      "stateId": 1,
      "provinceId": 5,
      "culture": 2
    }
  ],
  "states": [
    {
      "i": 1,
      "name": "Kingdom of Eldoria",
      "capital": 1,
      "color": "#8B4513",
      "dualGridQuads": [0, 1, 2, 3, 4, 5]
    }
  ]
}
```

**Key Fields**:

- `pack.dualGrid.levels[].quads[].stateId`: Assigned state (used for rendering, expansion)
- `pack.dualGrid.levels[].quads[].provinceId`: Assigned province (Level 1 only)
- `pack.dualGrid.levels[].quads[].patternId` / `variantId`: Pattern matching results (for rendering variants)
- `pack.burgs[].dualGridPointId`: Reference to Level 1 quad (for fast lookups)
- `pack.states[].dualGridQuads`: Array of Level 0 quad indices belonging to this state

---

## 7. Overlay Mode & Parameter Controls

### Proposed Options Structure

```javascript
options.politicsMode = {
  useDualGrid: true,                    // Enable dual-grid politics (default: false for compatibility)
  hexLayers: 22,                        // Number of hex layers (default: 22, range: 15-30)
  relaxationIterations: 200,            // Relaxation iterations (default: 200, range: 100-500)
  relaxationDamping: 0.3,               // Damping factor (default: 0.3, range: 0.1-0.5)
  patternConfigPath: 'patterns.json',   // Path to pattern configs (optional, uses defaults if not provided)
  enableEarlyTermination: true          // Early termination for relaxation (default: true)
};
```

**Parameter Exposure by Overlay Mode**:

- **Terrain Mode** (existing Voronoi): `options.politicsMode.useDualGrid = false`
  - No dual-grid parameters exposed (all Voronoi-based)
  - Existing parameters unchanged

- **Politics Mode** (dual-grid): `options.politicsMode.useDualGrid = true`
  - All `politicsMode.*` parameters exposed
  - User can adjust hex layers, relaxation iterations/damping
  - Pattern configs can be customized

**Default Values** (for compatibility):

```javascript
const defaultPoliticsMode = {
  useDualGrid: false,  // Off by default (existing behavior)
  hexLayers: 22,
  relaxationIterations: 200,
  relaxationDamping: 0.3,
  patternConfigPath: null,  // Use built-in defaults
  enableEarlyTermination: true
};
```

**Validation**:

```javascript
function validatePoliticsModeOptions(options) {
  if (!options.politicsMode) {
    options.politicsMode = { ...defaultPoliticsMode };
    return;
  }
  
  if (options.politicsMode.hexLayers !== undefined) {
    options.politicsMode.hexLayers = clamp(options.politicsMode.hexLayers, 15, 30);
  }
  if (options.politicsMode.relaxationIterations !== undefined) {
    options.politicsMode.relaxationIterations = clamp(options.politicsMode.relaxationIterations, 100, 500);
  }
  if (options.politicsMode.relaxationDamping !== undefined) {
    options.politicsMode.relaxationDamping = clamp(options.politicsMode.relaxationDamping, 0.1, 0.5);
  }
}
```

**Usage in Generator**:

```javascript
// In generateMapInternal()
const useDualGrid = options.politicsMode?.useDualGrid ?? false;

if (useDualGrid) {
  const hexLayers = options.politicsMode?.hexLayers ?? 22;
  const relaxationIterations = options.politicsMode?.relaxationIterations ?? 200;
  const relaxationDamping = options.politicsMode?.relaxationDamping ?? 0.3;
  
  // Generate dual-grid with user parameters
  let dualGrid = generateDualGrid({ hexLayers, relaxationIterations, relaxationDamping, ... });
} else {
  // Use existing Voronoi-based generation
  generateStates({ pack, options, rng });
  generateProvinces({ pack, options, rng });
}
```

---

## 8. Risks, Mitigations & First Prototype Scope

### Top 3 Technical Risks

#### Risk 1: Relaxation Oscillation / Non-Convergence

**Description**: Points oscillate or never converge, especially at borders or with irregular initial grids.

**Impact**: High (breaks generation, produces unusable output)

**Mitigations**:

1. **Damping Factor**: Use conservative damping (0.3) to prevent overshooting
2. **Early Termination**: Stop if average movement < threshold for 10 consecutive iterations
3. **Maximum Iterations Cap**: Hard cap at 500 iterations (user-configurable)
4. **Boundary Constraints**: Lock boundary points (map edges) to prevent drift
5. **Progressive Relaxation**: Start with fewer iterations (50), check convergence, add more if needed

**Validation**: Test with extreme cases (very irregular hex grids, high hex layer counts)

---

#### Risk 2: Performance at Scale (~10k quads)

**Description**: Relaxation and pattern matching may be too slow for real-time/interactive use.

**Impact**: Medium (affects UX, may require optimization)

**Mitigations**:

1. **Batch Processing**: Process quads in chunks (1k–2k per batch) if memory becomes issue
2. **Spatial Optimization**: Use spatial hash/quadtree for neighbor lookups (O(1) instead of O(n))
3. **Early Termination**: Reduce iterations if convergence detected early
4. **Progressive Generation**: Generate Level 0 first, show preview, then generate Level 1
5. **Web Workers**: Offload relaxation to Web Worker if available (future optimization)

**Target Performance**: < 5 seconds for full dual-grid generation (including relaxation) at ~10k quads

**Validation**: Benchmark with 10k, 20k, 50k quads; measure iteration time

---

#### Risk 3: Pattern Matching Edge Cases / Incoherent Borders

**Description**: Simple adjacency rules may produce ugly borders (gaps, misaligned patterns) in complex state configurations.

**Impact**: Medium (aesthetic issue, may require pattern expansion)

**Mitigations**:

1. **Fallback Patterns**: Always have a default pattern if no match found
2. **Pattern Expansion**: Start with 10–15 patterns, expand based on observed edge cases
3. **Validation Pass**: After pattern matching, validate border coherence (check for gaps, ensure smooth transitions)
4. **Manual Pattern Tuning**: Allow pattern configs to be customized (JSON files)
5. **Post-Processing**: Smooth border patterns with simple interpolation if needed

**Validation**: Test with various state counts (5, 10, 15, 20 states); check border quality visually

---

### Minimal Viable Prototype Goals

**Scope**: First prototype should demonstrate core algorithm and integration point, not full feature set.

**Must-Have (MVP)**:

1. ✅ **Hex Grid Generation**: Generate hexagonal point grid (layers from center)
2. ✅ **Triangulation**: Connect hex centers to form triangles
3. ✅ **Edge Dissolution**: Dissolve edges to form quads (basic version, no complex validation)
4. ✅ **Subdivision**: Subdivide quads into 4 sub-quads (Level 0 → Level 1)
5. ✅ **Relaxation**: Basic relaxation (simple neighbor average, fixed iterations)
6. ✅ **Integration Point**: Generate dual-grid after burg generation, store in `pack.dualGrid`
7. ✅ **Fallback**: Skip dual-grid if `options.useDualGridPolitics = false`

**Nice-to-Have (Post-MVP)**:

- ❌ Pattern matching (use simple state assignment instead)
- ❌ Culture mapping (use Voronoi culture as-is)
- ❌ Early termination (use fixed iterations)
- ❌ User-configurable parameters (use hardcoded defaults)

**MVP Output Structure**:

```javascript
pack.dualGrid = {
  levels: [
    {
      level: 0,
      quads: [ /* Basic quads with verts, center, childQuadIds */ ]
    },
    {
      level: 1,
      quads: [ /* Basic quads with verts, center, parentQuadId */ ]
    }
  ],
  points: [ /* All points */ ]
};
```

**MVP Success Criteria**:

1. Dual-grid generates successfully (no crashes)
2. Level 0 has ~100–150 quads, Level 1 has ~400–600 quads
3. Quads are reasonably organic (not too irregular after relaxation)
4. Integration point works (dual-grid appears in pack after burg generation)
5. Fallback works (no dual-grid if option is false)

**Estimated Effort**: 5–7 days for MVP (300–400 LOC)

**Next Steps After MVP**:

1. Add pattern matching (3–4 days)
2. Add culture mapping (2–3 days)
3. Add user-configurable parameters (1–2 days)
4. Integrate with state/province generation (replace Voronoi-based) (5–7 days)
5. Performance optimization (2–3 days)

---

## Implementation References

### Key Algorithms (from Research)

**Hex Grid Generation** (redblobgames.com):

```javascript
function createHexagonalPoints(layers, rng) {
  let points = [];
  let center = { x: 0, y: 0 };
  points.push(center);
  
  // Hex grid math: axial coordinates
  for (let q = -layers; q <= layers; q++) {
    let r1 = Math.max(-layers, -q - layers);
    let r2 = Math.min(layers, -q + layers);
    for (let r = r1; r <= r2; r++) {
      if (q === 0 && r === 0) continue;  // Skip center (already added)
      let x = (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r) * hexSize;
      let y = (3 / 2 * r) * hexSize;
      points.push({ x, y });
    }
  }
  
  return points;
}
```

**Quad Subdivision**:

```javascript
function subdivideQuadIntoFour(quad) {
  let [p0, p1, p2, p3] = quad.verts;
  let mid01 = midpoint(points[p0], points[p1]);
  let mid12 = midpoint(points[p1], points[p2]);
  let mid23 = midpoint(points[p2], points[p3]);
  let mid30 = midpoint(points[p3], points[p0]);
  let center = {
    x: (points[p0].x + points[p1].x + points[p2].x + points[p3].x) / 4,
    y: (points[p0].y + points[p1].y + points[p2].y + points[p3].y) / 4
  };
  
  // Add midpoints and center to points array, get indices
  let i01 = addPoint(mid01);
  let i12 = addPoint(mid12);
  let i23 = addPoint(mid23);
  let i30 = addPoint(mid30);
  let ic = addPoint(center);
  
  // Create 4 sub-quads
  return [
    { verts: [p0, i01, ic, i30] },
    { verts: [i01, p1, i12, ic] },
    { verts: [ic, i12, p2, i23] },
    { verts: [i30, ic, i23, p3] }
  ];
}
```

---

## Conclusion

This design document provides clear, justified choices for implementing dual-grid politics in the Azgaar-Genesis fork. Key decisions:

1. **Stålberg-inspired hex-to-quad algorithm** with edge dissolution and subdivision
2. **200 iterations, 0.3 damping** for relaxation (simple neighbor average)
3. **Simple adjacency rules** (not WFC) for pattern matching
4. **2-level hierarchy** (states/provinces, burgs as points)
5. **Integration after burg generation** with fallback to Voronoi
6. **Structured output format** with clear parent-child links
7. **Configurable parameters** via `options.politicsMode`

The MVP scope focuses on core algorithm demonstration; pattern matching and full integration can follow in subsequent iterations.

---

**Document Status**: ✅ Complete  
**Next Step**: Implement `buildStalbergQuadGrid()` function in `src/core/dualGridStates.js`
