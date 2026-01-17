# Dual Grid Visual Audit v6
**Date:** January 14, 2026  
**Issue:** Uneven cell sizes - tighter/smaller in center, larger/uneven toward edges  
**Goal:** Even cell sizes across grid (no compression in center, no expansion at edges)

---

## Current State (v4/v5 - Unchanged)

### Confirmed Settings
- ✅ **Low density:** 1,027 points, 1,942 quads (hexRings=18)
- ✅ **relaxationIterations: 100** (v4 optimization)
- ✅ **dampingFactor: 0.5** (v4 stability)
- ✅ **dualOffsetFactor: 0.35** (v4 reduced rounding)
- ✅ **skipTriangleSubdivision: true** (low density)
- ✅ **skipLevel1Subdivision: true** (no Level 1)
- ✅ **aspectRatio: 1.22** (horizontal stretch)
- ✅ **hexSize: 12** (initial hex cell size)

---

## Unevenness Analysis

### Root Causes

1. **Center Compression from More Neighbors:**
   - Center points have 6-8 neighbors (higher connectivity)
   - Edge/interior points have 3-5 neighbors (lower connectivity)
   - Laplacian smoothing: `force = (avgNeighbors - current) * damping`
   - Problem: More neighbors = stronger inward pull, but damping is constant
   - Result: Center compresses more → smaller cells

2. **Edge Expansion from Boundary Locking:**
   - Boundary points are completely locked (isBoundary = true)
   - Interior points near boundary can't push outward (boundary acts as barrier)
   - Relaxation creates pressure gradient: center → edge
   - Result: Edge cells expand → larger cells

3. **Aspect Stretch Distortion:**
   - 1.22 horizontal stretch applied uniformly
   - But initial hex spacing already non-uniform near edges (hex grid shape)
   - Stretch amplifies non-uniformity
   - Result: Cells distorted differently by position

4. **Initial Hex Spacing:**
   - Hex grid has natural variation: center denser, edges sparser
   - Even with perfect hex generation, spacing varies by ring
   - Relaxation doesn't fully compensate for initial unevenness

---

## Current Relaxation Algorithm

**Laplacian Smoothing:**
```javascript
// For each point (non-boundary):
avgX = sum(neighbor.x) / neighborCount
avgY = sum(neighbor.y) / neighborCount
forceX = (avgX - point.x) * damping
forceY = (avgY - point.y) * damping
```

**Problem:**
- Same damping (0.5) for all points regardless of neighbor count
- Points with 8 neighbors move 8x more (force accumulates)
- Points with 3 neighbors move 3x less
- Result: Center compresses, edges expand

---

## Proposed Fixes

### Fix 1: Variable Damping Based on Neighbor Count
- Higher damping for points with more neighbors (center)
- Lower damping for points with fewer neighbors (edges)
- Formula: `adaptiveDamping = baseDamping * (avgNeighbors / neighborCount)`
- Balances forces across different connectivity levels

### Fix 2: Neighbor-Weighted Normalization
- Normalize force by neighbor count to prevent over-pull in center
- Or use distance-weighted averaging instead of simple average
- Prevents center compression from too many neighbors

### Fix 3: Soften Boundary Locking
- Allow near-boundary points (1-2 rings from boundary) to move partially
- Scale movement: `movement *= (1 - boundaryDistance / 2)`
- Prevents edge expansion from hard boundary barrier

### Fix 4: Reduce Aspect Stretch
- Reduce from 1.22 → 1.15 (less distortion)
- Or apply stretch more uniformly after relaxation
- Prevents aspect from amplifying unevenness

### Fix 5: Post-Relax Normalization (Optional)
- Calculate average cell area after relaxation
- Scale all points to achieve uniform cell sizes
- Last resort if other fixes insufficient

---

## Expected Outcome After Fixes

**Variable Damping:**
- Center points (8 neighbors): damping = 0.5 * (6 / 8) = 0.375 (less movement)
- Edge points (3 neighbors): damping = 0.5 * (6 / 3) = 1.0 (more movement)
- Result: Balanced forces → even cell sizes

**Softer Boundary:**
- Near-boundary points can move 50% (instead of 0%)
- Reduces pressure gradient center → edge
- Result: Less edge expansion → more uniform sizes

**Lower Aspect:**
- 1.15 stretch (from 1.22) = less distortion
- Result: More uniform cell shapes

---

## Implementation Priority

1. **High:** Variable damping based on neighbor count (Fix 1)
2. **Medium:** Soften boundary locking (Fix 3)
3. **Low:** Reduce aspect (Fix 4) - only if needed
4. **Optional:** Post-relax normalization (Fix 5) - last resort
