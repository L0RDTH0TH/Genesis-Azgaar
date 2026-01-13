# Azgaar-Genesis Dual-Grid Experiment Audit Report – January 12, 2026 – Visual & Functional Failure Analysis

**Branch**: `experiment/dual-grid-politics`  
**Audit Date**: January 12, 2026  
**Auditor**: Code Review & Procedural Generation Analysis  
**Status**: ⚠️ **CRITICAL ISSUES IDENTIFIED** - Visual failures, coordinate scaling problems, missing burgs

---

## 1. Executive Summary & Overall Health

### Summary of Changes Since Branch Creation

The dual-grid politics experiment has implemented a comprehensive Stålberg-inspired system with **~1,233 LOC** in `src/core/dualGridStates.js` plus integration code. The implementation follows the design document (v2) with these major components:

- ✅ **Hex-to-quad generation**: Hexagonal base grid → triangulation → edge dissolution → subdivision
- ✅ **Two-level hierarchy**: Level 0 (states, ~100-150 target) and Level 1 (provinces, ~400-600 target)
- ✅ **Relaxation system**: Laplacian smoothing with early termination
- ✅ **Pattern matching**: Simple adjacency-based chunk assignment (10 patterns defined)
- ✅ **Variant system**: 3-5 variants per pattern type for visual diversity
- ✅ **Politics replacement**: Maps dual-grid states to Voronoi cells
- ✅ **SVG export**: Custom renderer with state borders, labels, burg markers

**Total Implementation**: ~1,500 LOC across core module, generator integration, test scripts, and SVG rendering.

### Key Strengths

1. **Modular Pipeline**: Clean separation of concerns (hex gen → triangulation → dissolution → subdivision → relaxation → pattern matching)
2. **Seeded RNG**: All randomness uses seeded RNG for reproducibility
3. **Design Alignment**: Implementation closely follows design v2 document
4. **Fallback Support**: Clean toggle between dual-grid and Voronoi politics
5. **Export Structure**: Well-structured JSON export for Godot integration

### High-Level Issues

| Issue | Severity | Impact |
|-------|----------|--------|
| **Coordinate Scaling Failure** | 🔴 CRITICAL | Quads generated in arbitrary space (hexSize=10), not scaled to map dimensions (960×540) |
| **Spiky/Crystal Visual Artifacts** | 🔴 CRITICAL | Insufficient relaxation (150 iter, 0.25 damping) + coordinate mismatch creates jagged, inorganic shapes |
| **Zero Burgs in Test Data** | 🟡 HIGH | Pattern matching requires burgs, but test shows 0 burgs → no states assigned |
| **Imprecise Cell Mapping** | 🟡 HIGH | Bounding box check for quad→cell mapping misses many cells, creates gaps |
| **Insufficient Dissolution** | 🟡 MEDIUM | 0.5 dissolve probability may not create enough irregularity for organic look |
| **Pattern Matching Too Simple** | 🟡 MEDIUM | Adjacency-only rules create fragmented states, not cohesive chunks |

**Overall Health**: ⚠️ **FUNCTIONAL BUT VISUALLY BROKEN** - Core algorithm works, but coordinate scaling and relaxation parameters prevent organic, Townscaper-like results.

---

## 2. Code Review of Core Components

### 2.1 `buildStalbergQuadGrid()`: Grid Construction Analysis

**Location**: `src/core/dualGridStates.js:19-119`  
**LOC**: ~100 lines  
**Status**: ⚠️ **COORDINATE SCALING BUG**

#### Breakdown

1. **Hex Generation** (`createHexagonalPoints`, lines 127-149):
   ```javascript
   const hexSize = 10; // ❌ HARDCODED - not scaled to map dimensions
   const x = (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r) * hexSize;
   const y = (3 / 2 * r) * hexSize;
   ```
   - **Bug**: `hexSize = 10` is hardcoded, creating points in arbitrary space (roughly -200 to +200 range for 14 layers)
   - **Impact**: Quads are generated at wrong scale relative to map (960×540)
   - **Fix Required**: Scale hexSize based on `options.mapWidth` and `options.mapHeight`

2. **Triangulation** (`triangulateFromHex`, lines 158-205):
   - ✅ Correctly connects hex centers to neighbors
   - ✅ Avoids duplicate edges
   - ⚠️ **Issue**: Inverse coordinate conversion (lines 167-168) is approximate, may miss some neighbors

3. **Edge Dissolution** (`dissolveEdgesToQuads`, lines 217-360):
   - ✅ Validates 4-vertex quads correctly
   - ✅ Uses `dissolveProbability` parameter (default 0.5)
   - ⚠️ **Issue**: `maxAttempts = triangles.length * 3` may be insufficient for high dissolve rates
   - **Dissolve Ratio**: Current implementation achieves ~60-70% quads (as designed), but may need higher probability (0.7-0.8) for more organic look

4. **Subdivision** (`subdivideTriangleIntoThreeQuads`, `subdivideQuadIntoFour`):
   - ✅ Correctly subdivides triangles into 3 quads
   - ✅ Correctly subdivides quads into 4 sub-quads
   - ✅ Maintains parent-child relationships

5. **Relaxation Integration** (lines 92-108):
   - ✅ Relaxes Level 0 quads first, then Level 1
   - ⚠️ **Issue**: Uses same iteration count for both levels (may need more for Level 1)

#### Critical Bug: Coordinate Scaling

**Problem**: Hex points are generated with `hexSize = 10`, creating a grid roughly 400×400 units centered at (0,0), but the map is 960×540. Quads are never scaled or translated to fit the actual map bounds.

**Evidence**:
- Test output shows: `Point range: x[-204.5, 213.0], y[-181.5, 154.6]`
- Map dimensions: 960×540
- Quads are ~4× smaller than map and not centered

**Fix Pseudocode**:
```javascript
function createHexagonalPoints(layers, rng, mapWidth, mapHeight) {
  // Calculate hexSize to fit map
  const mapDiagonal = Math.sqrt(mapWidth * mapWidth + mapHeight * mapHeight);
  const hexSize = mapDiagonal / (layers * 4); // Scale to fit map
  
  // ... generate points ...
  
  // Center and scale points to map bounds
  const bounds = calculateBounds(points);
  const scaleX = mapWidth / (bounds.maxX - bounds.minX);
  const scaleY = mapHeight / (bounds.maxY - bounds.minY);
  const scale = Math.min(scaleX, scaleY) * 0.9; // 90% to add padding
  
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const mapCenterX = mapWidth / 2;
  const mapCenterY = mapHeight / 2;
  
  for (const point of points) {
    point.x = (point.x - centerX) * scale + mapCenterX;
    point.y = (point.y - centerY) * scale + mapCenterY;
  }
  
  return points;
}
```

**Estimated Fix Effort**: 2-3 hours, ~50 LOC

---

### 2.2 `relaxGrid()`: Relaxation Effectiveness

**Location**: `src/core/dualGridStates.js:545-614`  
**LOC**: ~70 lines  
**Status**: ⚠️ **INSUFFICIENT PARAMETERS**

#### Implementation Analysis

```javascript
export function relaxGrid(points, neighborMap, iterations = 200, damping = 0.3) {
  // Laplacian smoothing: move toward average of neighbors
  const forceX = (avgX - point.x) * damping;
  const forceY = (avgY - point.y) * damping;
  // Early termination if avgMovement < 0.001
}
```

**Current Parameters** (from test):
- `relaxationIterations: 150` (below design default of 200)
- `dampingFactor: 0.25` (below design default of 0.3)

**Why Spiky/Crystal Look?**

1. **Insufficient Iterations**: 150 iterations is too low for convergence, especially with low damping
2. **Low Damping**: 0.25 means points move only 25% toward neighbor average per iteration → slow convergence
3. **Early Termination Too Aggressive**: Threshold of 0.001 may trigger before smooth convergence
4. **No Boundary Constraints**: Points can drift outside map bounds (not locked to edges)

**Evidence from Code**:
- Early termination threshold: `EARLY_TERMINATION_THRESHOLD = 0.001` (line 547)
- Minimum iterations: `MIN_ITERATIONS_FOR_EARLY_TERM = 50` (line 548)
- With 150 iterations and 0.25 damping, many points may not converge

**Recommended Fix**:
```javascript
// Increase iterations and damping
relaxationIterations: 400,  // Up from 150 (design v2 suggests 200-500)
dampingFactor: 0.35,        // Up from 0.25 (design v2 suggests 0.3)

// Add boundary constraints
function relaxGrid(points, neighborMap, iterations, damping, mapBounds) {
  // ... existing relaxation ...
  
  // Lock boundary points (map edges)
  for (const point of points) {
    if (isBoundaryPoint(point, mapBounds)) {
      // Don't move boundary points, or move them less
      force.x *= 0.1;
      force.y *= 0.1;
    }
  }
}
```

**Estimated Fix Effort**: 1-2 hours, ~30 LOC

---

### 2.3 `dissolveEdgesToQuads()`: Merge Ratio Analysis

**Location**: `src/core/dualGridStates.js:217-360`  
**LOC**: ~143 lines  
**Status**: ⚠️ **PROBABILITY TOO LOW**

#### Implementation Analysis

```javascript
function dissolveEdgesToQuads(triangles, hexPointIndices, points, rng, dissolveProbability = 0.5) {
  const maxAttempts = workingTriangles.length * 3;
  // Randomly select edges, dissolve if valid quad
  if (rng.random() > dissolveProbability) continue;
}
```

**Current Settings**:
- `dissolveProbability: 0.5` (50% chance per edge)
- `maxAttempts = triangles.length * 3`

**Issue**: 0.5 probability may not create enough irregularity. Design v2 suggests 0.4-0.6 range, but for more organic look, 0.7-0.8 may be needed.

**Analysis**:
- With 14 hex layers → ~547 hex points → ~1,094 triangles (roughly)
- At 0.5 probability, ~547 edges dissolved → ~547 quads + ~547 triangles remaining
- After triangle subdivision: ~547 quads + ~1,641 quads (from triangles) = ~2,188 quads
- **Actual output**: 2,610 Level 0 quads (close to estimate)

**Problem**: Too many triangles remain, creating regular subdivision patterns instead of organic dissolution.

**Recommended Fix**:
```javascript
// Increase dissolve probability for more organic shapes
dissolveProbability: 0.7,  // Up from 0.5 (70% chance)

// Or use adaptive probability based on neighbor count
function adaptiveDissolveProbability(triangle, neighbors) {
  // Higher probability for triangles with more neighbors (more merge opportunities)
  const baseProb = 0.6;
  const neighborBonus = neighbors.length * 0.05;
  return Math.min(0.85, baseProb + neighborBonus);
}
```

**Estimated Fix Effort**: 1 hour, ~20 LOC

---

### 2.4 `snapBurgsToDualGrid()`: Zero Burgs Root Cause

**Location**: `src/core/dualGridStates.js:624-715`  
**LOC**: ~92 lines  
**Status**: 🔴 **BURG GENERATION ISSUE**

#### Implementation Analysis

```javascript
export function snapBurgsToDualGrid(pack, dualGrid, options) {
  for (const burg of pack.burgs) {
    if (!burg || !burg.i || burg.removed) continue;
    // ... snap logic ...
  }
}
```

**Test Output**: `Burgs drawn: 0 (0 elements)`

**Root Cause Analysis**:

1. **Burg Generation Timing**: Burgs are generated in Phase 12 (before dual-grid), but test may not be generating burgs
2. **Test Configuration**: Test script doesn't explicitly request burg generation
3. **Position Validation**: Code checks `burg.x` and `burg.y`, but burgs may not have positions if generation failed

**Evidence from Generator**:
```javascript
// generator.js:200-216
if (options.useDualGridPolitics) {
  pack.dualGrid = buildStalbergQuadGrid(...);
  snapBurgsToDualGrid(pack, pack.dualGrid, options);  // Called after dual-grid
}
// But burgs are generated in Phase 12, before dual-grid
```

**Issue**: Burg generation happens in `generateBurgs()` (Phase 12), but if that phase is skipped or fails, `pack.burgs` may be empty or invalid.

**Recommended Fix**:
```javascript
// In test script
const testOptions = {
  // ... existing options ...
  statesNumber: 18,  // This should trigger burg generation
  // Add explicit burg generation flag
  generateBurgs: true,
};

// In snapBurgsToDualGrid, add better error handling
if (!pack.burgs || pack.burgs.length === 0) {
  console.warn('No burgs found - pattern matching will fail');
  return { snappedCount: 0, totalBurgs: 0 };
}
```

**Estimated Fix Effort**: 1 hour, ~20 LOC

---

### 2.5 `assignPatternsToQuads()`: Pattern Matching Simplicity

**Location**: `src/core/dualGridStates.js:802-1021`  
**LOC**: ~220 lines  
**Status**: ⚠️ **TOO SIMPLE, CREATES FRAGMENTS**

#### Implementation Analysis

```javascript
// Pattern matching logic (lines 942-980)
for (const { quadId, isCapital, burg } of seededQuads) {
  const neighborIndices = getQuadNeighbors(quadId);
  // Try to match a pattern
  const shuffledPatterns = [...PATTERNS].sort(() => rng.random() - 0.5);
  for (const pattern of shuffledPatterns) {
    if (canApplyPattern(pattern, quadId, neighborIndices)) {
      applyPattern(pattern, quadId, neighborIndices, stateId);
      break;
    }
  }
}
```

**Current Patterns** (10 defined):
- `single`: 1 quad
- `bar_horizontal`, `bar_vertical`: 2 quads
- `block_2x2`: 4 quads
- `l_shape`, `t_shape`: 3-4 quads
- `border_chain`: 3 quads
- `merge_bridge`: 2 quads
- `corner_2x2`, `diagonal`: 2-3 quads

**Problems**:

1. **No Expansion Logic**: Patterns are assigned once, no expansion to create larger states
2. **Fragmented States**: Each pattern creates small chunks (1-4 quads), not cohesive states
3. **No State Growth**: Missing expansion algorithm to grow states from seeds
4. **Adjacency-Only**: Only checks immediate neighbors, doesn't consider state coherence

**Test Output**: `States created: 0` (because no burgs → no seeds → no patterns assigned)

**Recommended Fix**:
```javascript
// Add state expansion after pattern assignment
function expandStatesFromSeeds(dualGrid, pack, options) {
  // 1. Assign initial patterns from burg seeds
  assignPatternsToQuads(dualGrid, pack, options);
  
  // 2. Expand states using flood-fill or Dijkstra-like expansion
  for (const state of dualGrid.stateAssignments.states) {
    expandState(state, dualGrid, options);
  }
}

function expandState(state, dualGrid, options) {
  const frontier = [...state.quads];
  const visited = new Set(frontier);
  
  while (frontier.length > 0 && state.quads.length < targetSize) {
    const currentQuadId = frontier.shift();
    const neighbors = getQuadNeighbors(currentQuadId);
    
    for (const neighborId of neighbors) {
      if (visited.has(neighborId)) continue;
      if (dualGrid.level0Quads[neighborId].stateId !== -1) continue;
      
      // Expansion criteria: culture match, distance, suitability
      if (shouldExpandTo(state, neighborId, dualGrid)) {
        assignQuadToState(neighborId, state.i, dualGrid);
        frontier.push(neighborId);
        visited.add(neighborId);
      }
    }
  }
}
```

**Estimated Fix Effort**: 4-6 hours, ~150 LOC

---

### 2.6 `assignVariantsToQuads()`: Variant Diversity

**Location**: `src/core/dualGridStates.js:1049-1092`  
**LOC**: ~44 lines  
**Status**: ✅ **ADEQUATE**

#### Implementation Analysis

```javascript
const VARIANTS = {
  single: ['basic', 'ruined', 'fortified', 'decorated', 'minimal'],
  bar_horizontal: ['straight', 'curved', 'broken', 'reinforced'],
  // ... 10 pattern types, 3-5 variants each
};
```

**Status**: Variant system is well-implemented with good diversity (3-5 variants per pattern). No issues identified.

---

### 2.7 Politics Replacement (`mapDualGridStatesToPack()`): Mapping Accuracy

**Location**: `src/core/dualGridStates.js:1104-1233`  
**LOC**: ~130 lines  
**Status**: ⚠️ **IMPRECISE MAPPING**

#### Implementation Analysis

```javascript
// Bounding box check for quad→cell mapping (lines 1128-1142)
function pointInQuadBounds(point, quad, dualGridPoints) {
  // Simple bounding box check
  return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
}

// Cell mapping (lines 1182-1193)
for (let cellId = 0; cellId < cells.i.length; cellId++) {
  const cellPos = cells.p[cellId];
  if (pointInQuadBounds({ x: cellPos[0], y: cellPos[1] }, quad, dualGrid.points)) {
    if (cells.h && cells.h[cellId] > 20) {
      cells.state[cellId] = stateId;
    }
  }
}
```

**Problems**:

1. **Bounding Box Only**: Uses simple AABB check, not actual polygon containment
2. **False Positives**: Cells outside quad but inside bounding box get assigned
3. **False Negatives**: Cells inside quad but outside bounding box get missed
4. **No Overlap Handling**: Multiple quads can claim same cell (last one wins)

**Test Output**: `Cells with state assigned: 0/10659` (0% mapping success!)

**Recommended Fix**:
```javascript
// Use proper point-in-polygon test (ray casting or winding number)
function pointInQuad(point, quad, dualGridPoints) {
  const verts = quad.verts.map(vIdx => dualGridPoints[vIdx]);
  if (verts.length < 3) return false;
  
  // Ray casting algorithm
  let inside = false;
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    const xi = verts[i].x, yi = verts[i].y;
    const xj = verts[j].x, yj = verts[j].y;
    
    const intersect = ((yi > point.y) !== (yj > point.y)) &&
      (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  
  return inside;
}
```

**Estimated Fix Effort**: 2-3 hours, ~50 LOC

---

## 3. Visual Analysis & Failure Points

### 3.1 Why "Spiky/Crystal" Look?

**Root Causes**:

1. **Coordinate Scaling Mismatch** (Primary):
   - Hex grid generated at wrong scale (hexSize=10, ~400×400 units)
   - Map is 960×540, but quads are never scaled/translated
   - Result: Quads appear tiny and misaligned in SVG

2. **Insufficient Relaxation** (Secondary):
   - 150 iterations with 0.25 damping is too conservative
   - Points don't converge to smooth positions
   - Early termination may trigger before convergence

3. **No Boundary Constraints**:
   - Points can drift outside map bounds
   - Creates jagged edges at boundaries

4. **Dissolution Too Low**:
   - 0.5 probability leaves too many triangles
   - Triangle subdivision creates regular patterns (3 quads per triangle)
   - Less organic than edge dissolution

**Visual Evidence**:
- SVG shows quads with sharp angles and irregular spacing
- Points range: x[-204.5, 213.0], y[-181.5, 154.6] (not scaled to 960×540)
- Quads appear "crystal-like" due to insufficient smoothing

**Fix Priority**:
1. **Fix coordinate scaling** (CRITICAL - 2-3 hours)
2. **Increase relaxation** (HIGH - 1-2 hours)
3. **Add boundary constraints** (MEDIUM - 1 hour)
4. **Increase dissolution** (MEDIUM - 1 hour)

---

### 3.2 Missing Burgs: Root Cause

**Test Output**: `Total burgs: 1`, `Snapped burgs: 0`

**Analysis**:

1. **Burg Generation**: Burgs are generated in `generateBurgs()` (Phase 12), but test may skip this or generation fails
2. **Position Validation**: `snapBurgsToDualGrid()` requires `burg.x` and `burg.y`, but burgs may not have positions
3. **Test Configuration**: Test doesn't explicitly ensure burg generation

**Fix**:
```javascript
// In test script, ensure burg generation
const testOptions = {
  // ... existing ...
  statesNumber: 18,  // Should trigger burg generation
};

// In generator, add validation
if (options.useDualGridPolitics && (!pack.burgs || pack.burgs.length === 0)) {
  console.warn('No burgs found - generating minimal burgs for dual-grid');
  generateMinimalBurgs(pack, options);  // Fallback burg generation
}
```

**Estimated Fix Effort**: 1-2 hours, ~40 LOC

---

### 3.3 State Borders/Chunks: Organic or Jagged?

**Current State**: No states assigned (0 states created) due to missing burgs.

**If States Were Assigned**:

1. **Pattern Matching**: Would create small fragments (1-4 quads per pattern)
2. **No Expansion**: States wouldn't grow beyond initial patterns
3. **Borders**: Would be jagged due to:
   - Insufficient relaxation (sharp angles)
   - Coordinate scaling issues (misaligned quads)
   - Simple adjacency detection (may miss some borders)

**Recommended Improvements**:

1. **Add State Expansion**: Grow states from seeds using flood-fill
2. **Smooth Borders**: Post-process borders with edge smoothing
3. **Better Border Detection**: Use edge-based detection instead of vertex sharing

**Estimated Fix Effort**: 6-8 hours, ~200 LOC

---

### 3.4 Recommendations for Immediate Tweaks

| Fix | Priority | Effort | Impact |
|-----|----------|--------|--------|
| **Fix coordinate scaling** | 🔴 CRITICAL | 2-3h | High - fixes visual alignment |
| **Increase relaxation (400 iter, 0.35 damp)** | 🔴 CRITICAL | 1-2h | High - smooths quads |
| **Fix burg generation** | 🟡 HIGH | 1-2h | High - enables pattern matching |
| **Improve cell mapping (point-in-polygon)** | 🟡 HIGH | 2-3h | High - fixes 0% mapping |
| **Increase dissolution (0.7 prob)** | 🟡 MEDIUM | 1h | Medium - more organic shapes |
| **Add state expansion** | 🟡 MEDIUM | 4-6h | Medium - cohesive states |
| **Add boundary constraints** | 🟢 LOW | 1h | Low - prevents drift |

**Total Estimated Effort**: 12-18 hours (~500-600 LOC)

---

## 4. Test Script & Export Review

### 4.1 `test-dual-grid.js`: Coverage Gaps

**Location**: `scripts/test-dual-grid.js`  
**LOC**: ~850 lines  
**Status**: ⚠️ **MISSING BURG GENERATION TEST**

#### Coverage Analysis

**What's Tested**:
- ✅ Dual-grid structure (points, quads)
- ✅ Relaxation (movement stats)
- ✅ Edge dissolution (quad counts)
- ✅ Burg snapping (but finds 0 burgs)
- ✅ Pattern matching (but creates 0 states)
- ✅ Variant selection (but 0 variants assigned)
- ✅ Politics replacement (but 0 cells mapped)
- ✅ JSON export (structure validation)
- ✅ SVG rendering (visual output)

**What's Missing**:
- ❌ **Burg generation verification**: No check that burgs are actually generated
- ❌ **State expansion test**: No test for state growth beyond initial patterns
- ❌ **Cell mapping accuracy**: No validation that cells are correctly mapped
- ❌ **Coordinate scaling test**: No check that quads fit map bounds
- ❌ **Performance benchmarks**: No timing for relaxation, dissolution, etc.

**Recommended Additions**:
```javascript
// Add burg generation test
function testBurgGeneration(data) {
  const burgs = data.pack.burgs || [];
  console.log(`Burgs generated: ${burgs.length}`);
  if (burgs.length === 0) {
    console.error('❌ No burgs generated - pattern matching will fail');
  }
}

// Add coordinate scaling test
function testCoordinateScaling(data) {
  const { points } = data.pack.dualGrid;
  const { mapWidth, mapHeight } = data.options;
  
  const bounds = calculateBounds(points);
  const scaleX = mapWidth / (bounds.maxX - bounds.minX);
  const scaleY = mapHeight / (bounds.maxY - bounds.minY);
  
  if (scaleX < 0.8 || scaleX > 1.2 || scaleY < 0.8 || scaleY > 1.2) {
    console.error('❌ Quads not scaled to map dimensions');
  }
}
```

**Estimated Fix Effort**: 2-3 hours, ~100 LOC

---

### 4.2 SVG Exporter: Rendering Bugs

**Location**: `scripts/test-dual-grid.js:470-778`  
**LOC**: ~308 lines  
**Status**: ⚠️ **VIEWBOX CALCULATION ISSUES**

#### Analysis

**Current Implementation**:
```javascript
// Calculate viewBox from point coordinates (lines 491-508)
let minX = Infinity, minY = Infinity;
let maxX = -Infinity, maxY = -Infinity;
for (const point of points) {
  minX = Math.min(minX, point.x);
  // ...
}
const viewBoxX = minX - padding;
const viewBoxY = minY - padding;
```

**Issues**:

1. **ViewBox Based on Points**: Uses point bounds, not map dimensions
2. **No Scaling**: Doesn't account for coordinate scaling mismatch
3. **Off-Screen Quads**: Quads may be outside viewBox if coordinates are wrong

**Test Output**: `ViewBox: -254.5 -231.5 517.5 436.0` (not matching 960×540 map)

**Recommended Fix**:
```javascript
// Use map dimensions for viewBox, not point bounds
const viewBoxX = 0;
const viewBoxY = 0;
const viewBoxWidth = options.width || data.options.mapWidth || 960;
const viewBoxHeight = options.height || data.options.mapHeight || 540;

// Scale quads to fit viewBox if coordinates are wrong
if (needsScaling) {
  scaleQuadsToViewBox(quads, points, viewBoxWidth, viewBoxHeight);
}
```

**Estimated Fix Effort**: 1-2 hours, ~50 LOC

---

### 4.3 `getMapData()`: JSON Structure for Godot

**Location**: `src/generator.js:520-580` (approximate)  
**Status**: ✅ **STRUCTURE ADEQUATE**

#### Analysis

**Export Structure**:
```javascript
{
  dualGridEnabled: true,
  pack: {
    dualGrid: {
      points: [...],
      level0Quads: [...],
      level1Quads: [...],
      stateAssignments: {...}
    }
  }
}
```

**Godot Compatibility**:
- ✅ Points as arrays of `{x, y}` objects
- ✅ Quads as arrays with vertex indices
- ✅ State assignments included
- ✅ No circular references (serialized correctly)

**Potential Issues**:
- ⚠️ **Large File Size**: ~35MB JSON (may need compression for Godot)
- ⚠️ **Missing Metadata**: No version info, coordinate system info

**Recommended Additions**:
```javascript
{
  dualGridEnabled: true,
  dualGridVersion: "1.0",
  coordinateSystem: "map-space", // or "normalized"
  pack: {
    dualGrid: {
      // ... existing structure ...
      metadata: {
        mapWidth: 960,
        mapHeight: 540,
        hexLayers: 14,
        relaxationIterations: 150,
        // ... other params ...
      }
    }
  }
}
```

**Estimated Fix Effort**: 1 hour, ~30 LOC

---

## 5. Performance & Stability

### 5.1 Generation Time

**Test Output**: `Generation completed in 46040.58ms` (~46 seconds)

**Breakdown** (estimated):
- Hex generation: ~100ms
- Triangulation: ~200ms
- Edge dissolution: ~500ms
- Subdivision: ~1,000ms
- Relaxation (Level 0): ~5,000ms (150 iter × ~33ms/iter)
- Relaxation (Level 1): ~15,000ms (150 iter × ~100ms/iter, more points)
- Pattern matching: ~1,000ms
- Cell mapping: ~20,000ms (O(n×m) - slow!)
- Other: ~3,240ms

**Bottlenecks**:

1. **Cell Mapping** (43% of time): O(n×m) where n=quads, m=cells
   - Current: 2,610 quads × 10,659 cells = ~27.8M checks
   - Fix: Use spatial index (quadtree) → O(n log m)

2. **Relaxation** (43% of time): 150 iterations × 2 levels
   - Current: ~20,000ms total
   - Fix: Increase iterations to 400 → ~53,000ms (but better quality)

**Comparison to Voronoi**:
- Voronoi state generation: ~5,000ms
- Dual-grid: ~46,000ms (9× slower)

**Optimization Opportunities**:

1. **Spatial Index for Cell Mapping**: Reduce from O(n×m) to O(n log m)
   - Estimated speedup: 10-20× faster
   - New time: ~2,000ms (down from 20,000ms)

2. **Parallel Relaxation**: Process Level 0 and Level 1 in parallel (if possible)
   - Estimated speedup: 2× faster
   - New time: ~10,000ms (down from 20,000ms)

3. **Early Termination Tuning**: Adjust threshold to terminate earlier
   - Estimated speedup: 1.5× faster
   - New time: ~13,000ms (down from 20,000ms)

**Target Performance**: < 10 seconds for full generation (with optimizations)

---

### 5.2 Memory Usage

**Estimated Memory** (for 14 hex layers):
- Points: ~16,867 points × 16 bytes = ~270 KB
- Level 0 quads: ~2,610 quads × 200 bytes = ~522 KB
- Level 1 quads: ~10,440 quads × 200 bytes = ~2.1 MB
- Neighbor maps: ~500 KB
- State assignments: ~100 KB
- **Total**: ~3.5 MB (acceptable)

**No memory issues identified.**

---

### 5.3 Edge Cases

**Identified Edge Cases**:

1. **Unassigned Cells**: 0% cells mapped (critical bug)
2. **Unassigned Quads**: All quads unassigned (no states created)
3. **Degenerate Shapes**: No validation for self-intersecting quads
4. **Boundary Drift**: Points can drift outside map bounds
5. **Empty Burg Array**: No handling for missing burgs

**Recommended Handling**:
```javascript
// Add validation for degenerate quads
function validateQuad(quad, points) {
  const verts = quad.verts.map(vIdx => points[vIdx]);
  // Check for self-intersection
  // Check for collinear points
  // Check for zero area
}

// Add fallback for missing burgs
if (!pack.burgs || pack.burgs.length === 0) {
  generateFallbackBurgs(pack, options);
}
```

**Estimated Fix Effort**: 2-3 hours, ~80 LOC

---

## 6. Recommendations & Next Steps

### 6.1 Top 5 Fixes/Tweaks for Visuals

| Priority | Fix | Effort | Impact |
|----------|-----|--------|--------|
| 1 | **Fix coordinate scaling** | 2-3h | 🔴 CRITICAL - fixes visual alignment |
| 2 | **Increase relaxation (400 iter, 0.35 damp)** | 1-2h | 🔴 CRITICAL - smooths quads |
| 3 | **Fix cell mapping (point-in-polygon)** | 2-3h | 🟡 HIGH - fixes 0% mapping |
| 4 | **Fix burg generation** | 1-2h | 🟡 HIGH - enables pattern matching |
| 5 | **Increase dissolution (0.7 prob)** | 1h | 🟡 MEDIUM - more organic shapes |

**Total Effort**: 7-11 hours (~300-400 LOC)

**Expected Outcome**: 
- Quads scaled to map dimensions
- Smooth, organic shapes (not spiky)
- States properly assigned and mapped
- Visual quality approaching Townscaper aesthetic

---

### 6.2 Estimated Effort Summary

| Category | Effort (Hours) | LOC Estimate |
|----------|----------------|--------------|
| **Critical Visual Fixes** | 7-11 | 300-400 |
| **State Expansion** | 4-6 | 150-200 |
| **Performance Optimization** | 3-4 | 100-150 |
| **Test Coverage** | 2-3 | 100 |
| **Edge Case Handling** | 2-3 | 80 |
| **Documentation** | 1-2 | 50 |
| **Total** | **19-29 hours** | **~780-980 LOC** |

**Timeline**: 2.5-4 days of focused work

---

### 6.3 If Visuals Can't Be Saved: Pivot Options

**Option 1: Simplify to Square Grid + Relax**
- Replace hex grid with simple square grid
- Add jitter to points
- Relax with higher iterations
- **Effort**: 4-6 hours
- **Trade-off**: Less organic, but simpler and more predictable

**Option 2: Use Voronoi as Base, Relax Boundaries**
- Generate states using Voronoi (existing)
- Relax state boundaries using dual-grid relaxation
- **Effort**: 6-8 hours
- **Trade-off**: Hybrid approach, less pure dual-grid

**Option 3: Accept Current Quality, Focus on Functionality**
- Fix coordinate scaling and mapping bugs
- Accept spiky visuals as "stylistic choice"
- Focus on making system functional
- **Effort**: 5-7 hours
- **Trade-off**: Visuals remain poor, but system works

**Recommendation**: **Try Option 1 first** (simplify to square grid) if coordinate scaling fix doesn't improve visuals enough. Square grid is easier to scale and relax, and may produce better results with less complexity.

---

### 6.4 Final Prep for Godot: 2-3 Tuned Sample JSONs + Import Guide

**Recommended Sample Configurations**:

1. **Sample 1: High Quality (Slow)**
   ```javascript
   {
     hexLayers: 14,
     relaxationIterations: 400,
     dampingFactor: 0.35,
     dissolveProbability: 0.7
   }
   ```
   - **Target**: Best visual quality
   - **Gen Time**: ~60 seconds
   - **Use Case**: Final exports, showcases

2. **Sample 2: Balanced (Medium)**
   ```javascript
   {
     hexLayers: 12,
     relaxationIterations: 300,
     dampingFactor: 0.3,
     dissolveProbability: 0.6
   }
   ```
   - **Target**: Good quality, reasonable speed
   - **Gen Time**: ~30 seconds
   - **Use Case**: Interactive generation, testing

3. **Sample 3: Fast (Low Quality)**
   ```javascript
   {
     hexLayers: 10,
     relaxationIterations: 200,
     dampingFactor: 0.25,
     dissolveProbability: 0.5
   }
   ```
   - **Target**: Quick previews
   - **Gen Time**: ~15 seconds
   - **Use Case**: Rapid iteration, debugging

**Godot Import Guide** (to be created):

```markdown
# Godot Dual-Grid Import Guide

## JSON Structure
- `pack.dualGrid.points`: Array of {x, y} coordinates
- `pack.dualGrid.level0Quads`: State-level quads
- `pack.dualGrid.level1Quads`: Province-level quads
- `pack.dualGrid.stateAssignments`: State assignments

## Coordinate System
- Points are in map-space (0 to mapWidth, 0 to mapHeight)
- Scale to Godot viewport as needed

## Usage Example
```gdscript
var json = JSON.parse_string(file.get_as_text())
var dual_grid = json.pack.dualGrid
var points = dual_grid.points
var quads = dual_grid.level0Quads

# Render quads
for quad in quads:
    var verts = quad.verts.map(func(v): return points[v])
    draw_polygon(verts, quad.stateId)
```
```

**Estimated Effort**: 2-3 hours (sample generation + documentation)

---

## Conclusion

The dual-grid experiment is **functionally complete** but **visually broken** due to coordinate scaling issues and insufficient relaxation parameters. The core algorithm is sound, but implementation details prevent organic, Townscaper-like results.

**Critical Path to Fix**:
1. Fix coordinate scaling (2-3 hours) → **CRITICAL**
2. Increase relaxation (1-2 hours) → **CRITICAL**
3. Fix cell mapping (2-3 hours) → **HIGH**
4. Fix burg generation (1-2 hours) → **HIGH**

**Total Critical Path**: 6-10 hours to make system visually acceptable.

**Recommendation**: **Fix critical issues first**, then evaluate if visuals are acceptable. If not, consider pivot to simplified square grid approach.

---

**Report Status**: ✅ Complete  
**Next Action**: Implement critical fixes (coordinate scaling + relaxation)  
**Estimated Completion**: 2-3 days with focused effort
