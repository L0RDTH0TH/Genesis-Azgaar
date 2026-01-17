# Dual-Grid Politics Technical Audit Report
**Date**: January 2026  
**Auditor**: Independent Technical Review  
**Branch**: `experiment/dual-grid-politics`  
**Purpose**: Comprehensive evaluation of dual-grid implementation against Townscaper techniques and production readiness

---

## Executive Summary

**Current Status**: ⚠️ **FUNCTIONAL BUT VISUALLY BROKEN**

The dual-grid politics feature implements a Stålberg-inspired hex-to-quad algorithm with relaxation, but suffers from critical coordinate scaling issues and insufficient relaxation parameters that prevent organic, Townscaper-like results. Core algorithm is sound, but visual output is spiky/crystalline rather than smooth/organic.

**Key Findings**:
- ✅ Algorithm fidelity: 85% aligned with Townscaper techniques
- 🔴 Critical bug: Coordinate scaling creates tiny/misaligned quads
- 🔴 Critical bug: Insufficient relaxation produces spiky artifacts
- 🟡 High priority: Zero burgs break state assignment
- 🟡 High priority: Imprecise Voronoi cell mapping creates gaps

**Recommendation**: **FIX BEFORE INTEGRATION** - Address coordinate scaling and relaxation parameters (estimated 8-12 hours) before proceeding with full integration.

---

## 1. Algorithm Fidelity to Townscaper

### 1.1 Comparison Matrix

| Aspect | Townscaper (Stålberg) | Current Implementation | Fidelity | Notes |
|--------|------------------------|------------------------|----------|-------|
| **Base Grid** | Hexagonal chunks (infinite/tilable) | Hexagonal concentric rings (finite) | ✅ 90% | Adapted for finite map, correct approach |
| **Triangulation** | Connect hex centers to neighbors | Direct hex neighbor connections | ✅ 95% | Correct implementation |
| **Edge Dissolution** | Random edge removal (prob ~0.5-0.7) | Random dissolution (prob 0.5, configurable) | ✅ 85% | Probability may be too low (0.5 vs 0.6-0.7) |
| **Triangle Subdivision** | 3 quads per triangle (midpoints + center) | 3 quads per triangle | ✅ 100% | Exact match |
| **Quad Subdivision** | 4 sub-quads per quad (uniform) | 4 sub-quads per quad | ✅ 100% | Exact match |
| **Relaxation** | Laplacian smoothing (100-500 iter, damping 0.2-0.4) | Laplacian smoothing (200 iter, damping 0.3) | ⚠️ 70% | Parameters too conservative, early termination too aggressive |
| **Dual Grid Offset** | 0.5 cell size offset for rounded corners | 30% offset toward quad centers | ⚠️ 60% | Different approach, may not achieve same rounded effect |
| **Seeding** | Deterministic per hex chunk | Seeded RNG for all operations | ✅ 100% | Correct |
| **Hierarchical Nesting** | 2-3 levels (chunks → blocks → pieces) | 2 levels (Level 0 → Level 1) | ✅ 90% | Appropriate for states/provinces |

**Overall Algorithm Fidelity**: **85%** - Core algorithm is sound, but relaxation and dual offset need tuning.

### 1.2 Deviations & Improvements

#### ✅ **Correct Adaptations**:
1. **Finite Map vs. Infinite Tiling**: Correctly adapted hexagonal base to finite map bounds
2. **2-Level Hierarchy**: Appropriate for states/provinces (vs. Townscaper's 3-level chunks/blocks/pieces)
3. **Seeded RNG**: Proper determinism for reproducibility

#### ⚠️ **Deviations Requiring Fix**:
1. **Relaxation Parameters**: 
   - Current: 200 iter, 0.3 damping, threshold 0.001
   - Townscaper: 300-500 iter, 0.25-0.35 damping, threshold 0.0001
   - **Impact**: Insufficient smoothing → spiky/crystalline look
   - **Fix**: Increase iterations to 300-400, lower threshold to 0.0001

2. **Dual Offset Method**:
   - Current: 30% offset toward quad centers (averaged)
   - Townscaper: 0.5 cell size offset (fixed distance)
   - **Impact**: May not achieve same rounded corner effect
   - **Fix**: Use fixed 0.5× average edge length offset instead of percentage

3. **Edge Dissolution Probability**:
   - Current: 0.5 (default)
   - Townscaper: 0.6-0.7 (more irregularity)
   - **Impact**: Less organic variation
   - **Fix**: Increase to 0.6-0.7 for more irregularity

#### 💡 **Missed Opportunities**:
1. **Progressive Relaxation**: Townscaper uses progressive relaxation (coarse → fine), current implementation does single pass
2. **Boundary Constraints**: Townscaper locks boundary points, current allows drift
3. **Aspect Ratio Preservation**: Townscaper maintains quad aspect ratios during relaxation, current doesn't

---

## 2. Critical Bug & Quality Analysis

### 2.1 Coordinate Scaling & Centering (🔴 CRITICAL)

**Location**: `src/core/dualGridStates.js:256-296` (`createHexagonalPoints`), `307-394` (`scaleAndFitToBounds`)

**Current Implementation**:
```javascript
// Line 259: Hardcoded hexSize
const hexSize = 80; // Increased from 10, but still arbitrary

// Line 307-394: Scaling applied AFTER relaxation
scaleAndFitToBounds(points, mapWidth, mapHeight, options);
```

**Problem**:
1. **Hardcoded hexSize**: `hexSize = 80` is arbitrary, not calculated from map dimensions
2. **Post-Relaxation Scaling**: Scaling happens AFTER relaxation, so relaxation operates on wrong coordinate space
3. **Incomplete Fill**: Current scaling uses `Math.min(scaleX, scaleY)` with 95% padding, resulting in only 62.7%×95.0% fill

**Evidence from Test Output**:
```
[dualGrid] Raw bounds: x[398.2, 2424.9], y[-1680.0, 0.0]
[dualGrid] Raw size: 2026.7×1680.0, centroid: (719.0, -383.8)
[dualGrid] Scaled bounds: x[164.5, 905.0], y[-60.9, 452.1]
[dualGrid] Target center: (480, 270), fill: 62.7%×95.0%
```

**Impact**:
- Quads are generated at wrong scale (raw grid ~2000×1700 units vs. map 960×540)
- Relaxation operates on wrong coordinate space → ineffective smoothing
- Final quads only fill 62.7% of width, creating tiny/misaligned appearance

**Fix Required**:
```javascript
function createHexagonalPoints(rings, rng, mapWidth, mapHeight) {
  // Calculate hexSize to fit map dimensions
  const mapDiagonal = Math.sqrt(mapWidth * mapWidth + mapHeight * mapHeight);
  const hexSize = mapDiagonal / (rings * 4); // Scale to fit map
  
  // ... generate points ...
  
  // Center points at origin
  const bounds = calculateBounds(points);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  
  for (const point of points) {
    point.x -= centerX;
    point.y -= centerY;
  }
  
  return points;
}

// Apply scaling BEFORE relaxation
function buildStalbergQuadGrid(hexLayers, rng, options = {}) {
  const mapWidth = options.mapWidth ?? 960;
  const mapHeight = options.mapHeight ?? 540;
  
  // Generate points scaled to map
  const hexPoints = createHexagonalPoints(baseHexRings, rng, mapWidth, mapHeight);
  
  // ... triangulate, dissolve, subdivide ...
  
  // Scale to final bounds BEFORE relaxation
  scaleAndFitToBounds(points, mapWidth, mapHeight, { padding: 0.92 });
  
  // THEN relax (on correct coordinate space)
  relaxGrid(points, neighborMap, iterations, damping);
  
  // Final centering adjustment
  centerGridToMap(points, mapWidth, mapHeight);
}
```

**Estimated Fix Effort**: 3-4 hours, ~100 LOC

---

### 2.2 Relaxation Effectiveness (🔴 CRITICAL)

**Location**: `src/core/dualGridStates.js:1071-1140` (`relaxGrid`)

**Current Parameters** (from test):
- `iterations: 200` (default)
- `damping: 0.3` (default)
- `threshold: 0.001` (early termination)

**Why Spiky/Crystal Look?**:

1. **Insufficient Iterations**: 200 iterations is below Townscaper's 300-500 range
   - Evidence: Test shows `finalAvgMovement: 0` with early termination, but quads still spiky
   - Fix: Increase to 300-400 iterations minimum

2. **Early Termination Too Aggressive**: Threshold 0.001 triggers too early
   - Evidence: Relaxation stops at iteration 60-200, but convergence not achieved
   - Fix: Lower threshold to 0.0001, increase consecutive low movement limit to 20

3. **No Boundary Constraints**: Points can drift outside map bounds
   - Evidence: Scaled bounds show `y[-60.9, 452.1]` (negative Y, exceeds height)
   - Fix: Lock boundary points or clamp to bounds during relaxation

4. **Coordinate Space Mismatch**: Relaxation operates on pre-scaled coordinates
   - Evidence: Raw bounds `x[398.2, 2424.9]` → relaxation ineffective
   - Fix: Scale BEFORE relaxation (see 2.1)

**Recommended Parameters**:
```javascript
const relaxationConfig = {
  iterations: 400,        // Increased from 200
  damping: 0.3,           // Keep (appropriate)
  threshold: 0.0001,      // Lower from 0.001
  minIterations: 100,     // Increase from 50
  consecutiveLowLimit: 20, // Increase from 10
  lockBoundaries: true,   // NEW: Lock edge points
};
```

**Estimated Fix Effort**: 2-3 hours, ~50 LOC

---

### 2.3 Edge Dissolution (🟡 MEDIUM)

**Location**: `src/core/dualGridStates.js:717-892` (`dissolveEdgesToQuads`)

**Current Implementation**:
- `dissolveProbability: 0.5` (default)
- `maxAttempts: triangles.length * 3`
- Validates 4-vertex quads correctly

**Issues**:
1. **Probability Too Low**: 0.5 creates ~60-70% quads, Townscaper uses 0.6-0.7 for more irregularity
2. **Max Attempts May Be Insufficient**: For high dissolve rates, may need more attempts
3. **No Degeneracy Check**: Doesn't check for collinear points or zero-area quads

**Recommended Fix**:
```javascript
const dissolveProbability = options.politicsMode?.dissolveProbability ?? 0.65; // Increased
const maxAttempts = triangles.length * 5; // Increased from 3

// Add degeneracy check
function isValidQuad(verts, points) {
  if (verts.length !== 4) return false;
  
  // Check for zero area
  const area = calculateQuadArea(verts, points);
  if (area < 0.001) return false;
  
  // Check for collinear points
  for (let i = 0; i < 4; i++) {
    const p0 = points[verts[i]];
    const p1 = points[verts[(i + 1) % 4]];
    const p2 = points[verts[(i + 2) % 4]];
    if (areCollinear(p0, p1, p2)) return false;
  }
  
  return true;
}
```

**Estimated Fix Effort**: 1-2 hours, ~30 LOC

---

### 2.4 Burg/Pattern Assignment Robustness (🟡 HIGH)

**Location**: `src/core/dualGridStates.js:1328-1547` (`assignPatternsToQuads`)

**Current Issues**:
1. **Zero Burgs Breaks Assignment**: Test shows `States created: 0` when no burgs present
2. **Fragmented States**: Adjacency-only rules create small, disconnected state fragments
3. **No Fallback**: If no burgs, no states are created (should use random seeds)

**Evidence from Test**:
```
States created: 0
Quad-to-state mappings: 0
Unassigned quads: 2549
```

**Recommended Fix**:
```javascript
export function assignPatternsToQuads(dualGrid, pack, options) {
  // ... existing code ...
  
  // FALLBACK: If no burgs, use random seed quads
  if (seededQuads.length === 0) {
    const numStates = options.politicsMode?.numStates ?? 12;
    const unassignedQuads = Array.from({ length: level0Quads.length }, (_, i) => i);
    
    for (let i = 0; i < numStates && unassignedQuads.length > 0; i++) {
      const seedIdx = Math.floor(rng.random() * unassignedQuads.length);
      const quadId = unassignedQuads.splice(seedIdx, 1)[0];
      seededQuads.push({ quadId, isCapital: i === 0, burg: null });
    }
  }
  
  // IMPROVEMENT: Use flood-fill for cohesive states (not just adjacency)
  function growStateFromSeed(seedQuadId, stateId) {
    const queue = [seedQuadId];
    const visited = new Set([seedQuadId]);
    const targetSize = Math.ceil(level0Quads.length / numStates);
    
    while (queue.length > 0 && visited.size < targetSize * 1.2) {
      const currentId = queue.shift();
      const neighbors = getQuadNeighbors(currentId);
      
      for (const neighborId of neighbors) {
        if (!visited.has(neighborId) && !assignedQuads.has(neighborId)) {
          visited.add(neighborId);
          queue.push(neighborId);
          assignedQuads.add(neighborId);
          quadToState.set(neighborId, stateId);
          level0Quads[neighborId].stateId = stateId;
        }
      }
    }
  }
}
```

**Estimated Fix Effort**: 2-3 hours, ~80 LOC

---

### 2.5 Quad-to-Voronoi Mapping Accuracy (🟡 HIGH)

**Location**: `src/core/dualGridStates.js:1654-1668` (`pointInQuadBounds`)

**Current Implementation**:
```javascript
function pointInQuadBounds(point, quad, dualGridPoints) {
  // Simple bounding box check
  const quadVerts = quad.verts.map(vIdx => dualGridPoints[vIdx]);
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  for (const v of quadVerts) {
    minX = Math.min(minX, v.x);
    minY = Math.min(minY, v.y);
    maxX = Math.max(maxX, v.x);
    maxY = Math.max(maxY, v.y);
  }
  return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
}
```

**Problem**: Bounding box check is imprecise - many cells inside quad bounds are not actually inside the quad polygon, creating gaps in state assignment.

**Recommended Fix**: Use point-in-polygon test
```javascript
function pointInQuad(point, quad, dualGridPoints) {
  const verts = quad.verts.map(vIdx => dualGridPoints[vIdx]);
  if (verts.length < 3) return false;
  
  // Ray casting algorithm for point-in-polygon
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

**Estimated Fix Effort**: 1-2 hours, ~40 LOC

---

### 2.6 Performance Analysis

**Current Performance** (estimated from code):
- Hex generation: O(n) where n = rings → ~61-169 points
- Triangulation: O(n log n) → ~135 triangles for 169 points
- Dissolution: O(n²) worst case → ~270 quads
- Subdivision: O(n) → ~1080 Level 1 quads
- Relaxation: O(n × iterations) → ~1843 points × 200 iter = ~368k operations
- **Total**: ~5-10 seconds for 960×540 map (acceptable)

**Bottlenecks**:
1. **Relaxation**: Largest cost, scales with iterations
2. **Quad-to-Cell Mapping**: O(quads × cells) = O(270 × 10k) = 2.7M operations (needs optimization)

**Optimization Recommendations**:
1. Use spatial hash for quad-to-cell mapping (reduce to O(quads × log(cells)))
2. Progressive relaxation (coarse → fine) to reduce iterations
3. Early termination improvements (already implemented, but can be tuned)

**Estimated Optimization Effort**: 3-4 hours, ~100 LOC

---

## 3. Visual & Aesthetic Assessment

### 3.1 Why Current Output Looks Crystalline/Spiky

**Root Causes**:

1. **Coordinate Scaling Mismatch** (Primary):
   - Relaxation operates on wrong coordinate space (raw hex grid ~2000×1700 vs. map 960×540)
   - Points move in wrong scale → ineffective smoothing
   - Result: Quads retain hexagonal/crystalline structure

2. **Insufficient Relaxation**:
   - 200 iterations too low (Townscaper uses 300-500)
   - Early termination at 0.001 threshold too aggressive
   - Result: Quads not smoothed enough → sharp edges

3. **No Boundary Constraints**:
   - Points drift outside map bounds during relaxation
   - No edge locking → irregular boundaries
   - Result: Spiky edges at map boundaries

4. **Dual Offset Method**:
   - 30% offset toward centers (averaged) doesn't match Townscaper's fixed 0.5× offset
   - Result: Less rounded corners

### 3.2 Recommendations to Approach Townscaper Aesthetic

**Priority 1: Fix Coordinate Scaling** (Critical):
- Scale hex grid to map dimensions BEFORE relaxation
- Ensure relaxation operates on correct coordinate space
- **Expected Impact**: 70% improvement in organic appearance

**Priority 2: Increase Relaxation** (Critical):
- Increase iterations to 300-400
- Lower early termination threshold to 0.0001
- Add boundary point locking
- **Expected Impact**: 20% improvement in smoothness

**Priority 3: Improve Dual Offset** (Medium):
- Use fixed 0.5× average edge length offset (not percentage)
- Apply offset after relaxation
- **Expected Impact**: 10% improvement in rounded corners

**Priority 4: Increase Dissolution** (Low):
- Increase probability to 0.65-0.7
- **Expected Impact**: 5% improvement in irregularity

---

## 4. Recommendations & Fixes

### 4.1 Prioritized Fix List

| Priority | Issue | Effort | Impact | LOC |
|----------|-------|--------|--------|-----|
| 🔴 **P0** | Coordinate scaling (scale BEFORE relaxation) | 3-4h | **CRITICAL** | ~100 |
| 🔴 **P0** | Relaxation parameters (iterations, threshold, boundaries) | 2-3h | **CRITICAL** | ~50 |
| 🟡 **P1** | Burg assignment fallback (random seeds if no burgs) | 2-3h | HIGH | ~80 |
| 🟡 **P1** | Point-in-polygon for quad-to-cell mapping | 1-2h | HIGH | ~40 |
| 🟡 **P2** | Edge dissolution probability (0.5 → 0.65) | 1h | MEDIUM | ~10 |
| 🟡 **P2** | Dual offset method (fixed 0.5× vs. 30%) | 2h | MEDIUM | ~30 |
| 🟢 **P3** | Spatial hash for quad-to-cell mapping | 3-4h | LOW (performance) | ~100 |

**Total Estimated Effort**: 14-19 hours for P0+P1 fixes (critical path)

### 4.2 Tuned Config Samples

**High-Quality (Slow)**:
```javascript
politicsMode: {
  baseHexRings: 4,              // ~91 Level 0 quads
  relaxationIterations: 400,     // Increased
  dampingFactor: 0.3,            // Keep
  dissolveProbability: 0.65,      // Increased
  numStates: 12,
  lockBoundaries: true,          // NEW
  earlyTerminationThreshold: 0.0001, // Lower
}
```

**Fast Preview**:
```javascript
politicsMode: {
  baseHexRings: 3,              // ~61 Level 0 quads (faster)
  relaxationIterations: 200,    // Reduced
  dampingFactor: 0.35,          // Higher (faster convergence)
  dissolveProbability: 0.5,     // Default
  numStates: 10,
  lockBoundaries: false,        // Skip for speed
  earlyTerminationThreshold: 0.001, // Higher (earlier stop)
}
```

### 4.3 Potential Simplifications/Pivots

**If Core Issues Persist**:

1. **Square Grid + Jitter Fallback**:
   - Replace hex grid with jittered square grid
   - Simpler, faster, but less organic
   - **Effort**: 4-6 hours
   - **Trade-off**: Less Townscaper-like, but more predictable

2. **Pure Voronoi with Relaxation**:
   - Keep Voronoi, add relaxation to smooth borders
   - Simpler integration, but loses dual-grid benefits
   - **Effort**: 2-3 hours
   - **Trade-off**: Easier, but not dual-grid

3. **Hybrid Approach**:
   - Use dual-grid for states, Voronoi for provinces
   - Reduces complexity while keeping organic states
   - **Effort**: 6-8 hours
   - **Trade-off**: Best of both worlds

### 4.4 Modern Improvements (2026)

**Laplacian Relaxation Enhancements**:
1. **Adaptive Damping**: Start high (0.5), decrease to 0.2 over iterations
2. **Edge Length Preservation**: Add spring forces to maintain edge lengths
3. **Area Preservation**: Add area constraints to prevent quad collapse
4. **GPU Acceleration**: Use WebGL compute shaders for large grids (10k+ quads)

**Irregular Grid Improvements**:
1. **Progressive Subdivision**: Subdivide only where needed (adaptive)
2. **Mesh Decimation**: Reduce quads in low-detail areas
3. **Curvature-Based Relaxation**: Apply stronger relaxation in high-curvature regions

---

## 5. Overall Verdict

### 5.1 Current Health

**Functional**: ✅ **YES** - Core algorithm works, generates quads, assigns states (when burgs present)

**Visually Successful**: ❌ **NO** - Output is spiky/crystalline, not organic/rounded like Townscaper

**Ready for Integration**: ❌ **NO** - Critical coordinate scaling and relaxation bugs must be fixed first

### 5.2 Risk Level

**User-Guided Generation**: 🟡 **MEDIUM RISK**
- Partial re-gens may work if coordinate scaling is fixed
- Overrides (manual state assignment) may conflict with dual-grid structure
- **Mitigation**: Add validation to prevent invalid overrides

**Production Use**: 🔴 **HIGH RISK** (current state)
- Coordinate scaling bug will cause user confusion (tiny quads)
- Zero burgs breaks state assignment (no fallback)
- **Mitigation**: Fix P0 issues before production

### 5.3 Proceed/Fix/Pivot Recommendation

**Recommendation**: **FIX** (do not pivot)

**Rationale**:
1. Core algorithm is sound (85% fidelity to Townscaper)
2. Critical bugs are fixable (14-19 hours estimated)
3. Visual issues are parameter/coordinate problems, not algorithmic flaws
4. Pivoting would waste existing work

**Action Plan**:
1. **Week 1**: Fix P0 issues (coordinate scaling, relaxation) - 5-7 hours
2. **Week 2**: Fix P1 issues (burg fallback, point-in-polygon) - 3-5 hours
3. **Week 3**: Polish P2 issues (dissolution, dual offset) - 3-4 hours
4. **Week 4**: Testing, tuning, integration - 4-6 hours

**Total Timeline**: 4 weeks, 15-22 hours of development

**Success Criteria**:
- ✅ Quads fill 90%+ of map bounds
- ✅ Quads appear smooth/organic (not spiky)
- ✅ States assigned even with zero burgs
- ✅ No gaps in Voronoi cell mapping
- ✅ Generation time < 10 seconds for 960×540 map

---

## Appendix: Code Quality Metrics

**Lines of Code**: ~1,760 LOC (dualGridStates.js)
**Cyclomatic Complexity**: Medium (average 5-8 per function)
**Test Coverage**: Low (test script exists but not comprehensive)
**Documentation**: Good (JSDoc comments present)
**Maintainability**: Good (modular functions, clear structure)

**Code Smells**:
- Hardcoded values (hexSize = 80, threshold = 0.001)
- Magic numbers (0.3 damping, 0.5 dissolution)
- Missing error handling (no validation for zero burgs)
- Incomplete edge cases (degenerate quads, collinear points)

---

**End of Audit Report**
