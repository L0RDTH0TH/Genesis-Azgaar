# Dual Grid Visual Audit v4
**Date:** January 14, 2026  
**Issue:** Line crossings/overlaps in center and corners  
**Goal:** Clean, non-crossing quad edges, chunky black quads

---

## Current State (After v3)

### Density Status
- ✅ **Low density achieved:** 1,027 points, 1,942 quads
- ✅ **hexRings=18** (from 25)
- ✅ **skipTriangleSubdivision=true** (skips 3x multiplication)
- ✅ **skipLevel1Subdivision=true** (skips Level 1)
- ✅ **Density settings unchanged** - keeping current low density

### Color/Style Status
- ✅ **No colors/fills** - Confirmed black wireframe only
- ✅ **Stroke color:** #333 (dark gray/black)
- ✅ **Fill:** none (wireframe-only)
- ✅ **All styling:** Unchanged, wireframe-only

---

## Current Parameters Analysis

### Relaxation Parameters

**Current Settings:**
- `relaxationIterations = 30` (default in buildStalbergQuadGrid, relaxGrid default is 200)
- `dampingFactor = 0.3` (default 0.3)
- `EARLY_TERMINATION_THRESHOLD = 0.001`
- `MIN_ITERATIONS_FOR_EARLY_TERM = 50`
- `CONSECUTIVE_LOW_MOVEMENT_LIMIT = 10`

**Evidence from Code:**
```javascript
// src/core/dualGridStates.js:153-154
const relaxationIterations = options.politicsMode?.relaxationIterations ?? 30;
const dampingFactor = options.politicsMode?.dampingFactor ?? 0.3;
```

**Current Behavior:**
- Only 30 iterations (much less than relaxGrid default of 200)
- Early termination may trigger before convergence
- Low damping (0.3) = points move 30% toward average per iteration
- Result: Points may not fully converge, leading to slight misalignments

---

### Dual Offset Parameters

**Current Settings:**
- `dualOffsetFactor = 0.5` (50% of distance to center)
- `clampMaxMove = 0.1 * minEdgeLength` (max 10% of min edge)
- Boundary points: **SKIPPED** ✅ (preserved)

**Evidence from Code:**
```javascript
// src/core/dualGridStates.js:176-178
const dualOffsetFactor = options.politicsMode?.dualOffsetFactor ?? 0.5;
const dualPoints = applyDualOffset(points, level0Quads, dualOffsetFactor);
```

**Current Behavior:**
- 0.5 offset = 50% move toward center (aggressive rounding)
- Clamping to 10% of min edge prevents extreme moves
- But 0.5 is high - may cause vertices to cross edges

---

### Boundary Locking

**Current Status:**
- ✅ Boundary points tagged during generation
- ✅ Boundary points skipped in relaxation
- ✅ Boundary points skipped in dual offset

**Evidence:**
```javascript
// relaxGrid: if (point.isBoundary) { continue; }
// applyDualOffset: if (p.isBoundary) { continue; }
```

**Status:** Fully implemented, but may need strengthening near boundaries

---

## Root Cause Analysis

### Likely Causes of Overlaps

1. **Insufficient Relaxation Iterations:**
   - Only 30 iterations (vs 200 default)
   - Early termination may prevent full convergence
   - Result: Points not fully aligned → slight misalignments → edge crossings

2. **Low Damping Factor:**
   - 0.3 = points move 30% toward average (oscillatory)
   - Lower damping = more movement per iteration, less stable
   - Result: Points may overshoot and oscillate, causing crossings

3. **Aggressive Dual Offset:**
   - 0.5 = 50% move toward center (very aggressive)
   - May push vertices past edges of adjacent quads
   - Result: Rounded corners may cause edge crossings near corners

4. **No Repulsion Force:**
   - Laplacian smoothing only pulls toward average
   - No force to prevent points getting too close
   - Result: Points can cluster/cross in center where density is higher

---

## Proposed Fixes

### Fix 1: Optimize Relaxation Iterations
- Set `relaxationIterations = 100` (balance: enough convergence, not too many)
- Current 30 may be too few for full convergence
- Target 80-120 range for stability

### Fix 2: Increase Damping Factor
- Set `dampingFactor = 0.5` (50% move toward average)
- Higher damping = more stable, less oscillation
- Prevents overshoot that causes crossings

### Fix 3: Reduce Dual Offset Factor
- Set `dualOffsetFactor = 0.35` (35% move toward center)
- Less aggressive rounding reduces edge crossing risk
- Still provides rounded corners but more conservative

### Fix 4: Strengthen Boundary Locking (Optional)
- Already implemented - verify it's working correctly
- Consider locking points within 1-2 hex cells of boundary

### Fix 5: Add Light Repulsion (Optional)
- Very light min-distance repulsion in relaxGrid
- Prevents points from getting too close in center
- May not be needed if damping/iterations fix the issue

---

## Expected Outcome After Fixes

**Relaxation:**
- More iterations (100) → better convergence → aligned points
- Higher damping (0.5) → more stable → less oscillation → no crossings

**Dual Offset:**
- Lower offset (0.35) → less aggressive → fewer edge crossings near corners

**Visual:**
- Clean black quads with no visible crossings/overlaps
- Rounded corners preserved but more conservative
- Smooth, aligned edges throughout

---

## Implementation Priority

1. **Critical:** Reduce dual offset (0.5 → 0.35) - likely main cause
2. **High:** Increase damping (0.3 → 0.5) - reduces oscillation
3. **Medium:** Increase iterations (30 → 100) - better convergence
4. **Low:** Add repulsion - only if overlaps persist
