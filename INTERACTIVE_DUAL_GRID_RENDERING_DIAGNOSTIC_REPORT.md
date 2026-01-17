# Interactive Dual-Grid Rendering Diagnostic Report – Zero Visible Output Edition
**Date:** January 14, 2026  
**Scope:** Zero-visible-render issue in `interactive-terrain.html`  
**Version:** Current main branch post-dual-offset, relaxation tuning, async terrain gen, small-grid mode

---

## Executive Summary

🟥 **Status: RED – No Visible Render**

The interactive terrain HTML page generates successfully (27,721 points, 4,300 Level 0 quads, 17,200 Level 1 quads, 27,721 dual points), but the browser displays zero visible output—no grid, wireframe, or terrain. Only UI elements (header, status bar, buttons) are visible.

**Critical Finding:** Dual points are now being generated correctly (27,721 points, verified in Node console), but browser rendering pipeline appears broken or coordinates are out of viewport range.

---

## 1. SVG / Rendering Pipeline Integrity

### Current Implementation Analysis

**Code Location:** `scripts/generate-interactive-terrain.js` → `renderSVG()` function (lines 476-581)

**Initialization Call:**
- ✅ `renderSVG()` is called on script initialization (line 717, wrapped in try/catch)
- ✅ Fallback test pattern function exists (`drawTestPattern()`) but may not be triggered if container is non-empty but invalid

**ViewBox Calculation:**
```javascript
// Lines 500-516: Dynamic viewBox from actual point bounds
let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
for (const p of activePoints) {
  minX = Math.min(minX, p.x);
  minY = Math.min(minY, p.y);
  maxX = Math.max(maxX, p.x);
  maxY = Math.max(maxY, p.y);
}
const padding = 20;
const viewBoxX = minX - padding;
const viewBoxY = minY - padding;
const viewBoxWidth = width + (padding * 2);
const viewBoxHeight = height + (padding * 2);
```

**Status:** ⚠️ **POTENTIAL ISSUE** – ViewBox is computed from point coordinates, which may be:
- Outside expected range (e.g., negative or very large values)
- Empty if `activePoints` is empty/undefined
- Zero-width/height if all points collapse to a single coordinate

**SVG Element Attributes:**
- ✅ Width/height use `mapWidth`/`mapHeight` (960×540)
- ✅ `viewBox` is dynamically set (should be correct)
- ✅ `preserveAspectRatio="xMidYMid meet"` (correct)
- ❓ No explicit `overflow="visible"` attribute (may clip content)
- ❓ No explicit `fill`/`stroke` defaults if terrain data missing

**Rendering Logic:**
- ✅ Uses `activePoints` (forced to `points` currently, line 491)
- ✅ Quads are rendered as `<path>` elements with `d` attribute
- ✅ Background rect is included
- ⚠️ Debug dots (green/red circles) may not be visible if coordinates are wrong

**Hypothesis:** ViewBox calculated from point bounds may result in:
- Negative viewBox origin (e.g., `viewBox="-100 -100 200 200"`)
- Extremely large viewBox (if points span huge coordinate space)
- Zero-area viewBox (if bounds calculation fails)

---

## 2. Data Export & HTML Population

### Export Data Structure

**Code Location:** `scripts/generate-interactive-terrain.js` → `generateInteractiveTerrain()` (lines 82-93)

**Export Data:**
```javascript
const exportData = {
  points: points.map(p => ({ x: p.x, y: p.y })),
  dualPoints: dualPoints ? dualPoints.map(p => ({ x: p.x, y: p.y })) : null,
  level0Quads: level0Quads.map(q => ({ i: q.i, verts: q.verts, center: q.center })),
  mapWidth: testOptions.mapWidth,
  mapHeight: testOptions.mapHeight,
  seed: testOptions.seed,
};
```

**Node Console Verification (from latest run):**
- ✅ `dualGrid exists? true`
- ✅ `dualPoints in pack? true`
- ✅ `dualPoints length: 27721`
- ✅ `Sample dual point: { x: 58.26661669436739, y: -5.360503235235181 }`

**HTML Embedding:**
```javascript
const DUAL_GRID_DATA = ${JSON.stringify(data, null, 2)};
```

**Status:** ✅ **LIKELY CORRECT** – Data is exported and embedded, but browser console verification needed.

**Potential Issues:**
- ❓ JSON.stringify may truncate if data is too large (unlikely with 27k points)
- ❓ Browser may fail to parse JSON if special characters present (unlikely)
- ❓ `DUAL_GRID_DATA` variable may not be accessible in browser scope (should be in `<script>` tag)

---

## 3. Initialization & Event Handling

### Script Initialization

**Code Location:** `scripts/generate-interactive-terrain.js` → HTML template (lines 714-740)

**Initialization Flow:**
```javascript
try {
  console.log('Script initialization starting...');
  if (!DUAL_GRID_DATA.dualPoints || DUAL_GRID_DATA.dualPoints.length === 0) {
    console.warn('dualPoints MISSING - using original points');
  }
  renderSVG();
  setTimeout(() => {
    const container = document.getElementById('svg-container');
    if (container && (!container.innerHTML || container.innerHTML.trim() === '')) {
      console.warn('Container empty after render - drawing test pattern');
      drawTestPattern();
    }
  }, 100);
  console.log('Script initialization completed');
} catch (err) {
  console.error('Script initialization crashed:', err.message, err.stack);
  drawTestPattern();
}
```

**Status:** ✅ **INITIALIZATION LIKELY RUNS** – Try/catch should prevent silent failures, but browser console verification needed.

**Expected Browser Console Output:**
- `Script initialization starting...`
- `Starting render...`
- `points length: 27721`
- `dualPoints length: 27721` (or `MISSING` if not available)
- `Active points chosen: ORIGINAL (forced), length: 27721`
- `Rendered grid: bounds [...] to [...], viewBox: [...]`
- `Render completed successfully` OR crash error

**Missing Verification:** Browser console logs are not available in this report—need to check browser console directly.

---

## 4. Coordinate Space & Scaling Root Cause Hypotheses

### Coordinate Transformation Analysis

**Pre-Relaxation Scaling:**
- Points are generated in hexagonal coordinate space
- Scaling/centering may occur before or after relaxation (needs verification)

**Post-Dual-Offset Coordinates:**
- Node console shows sample dual point: `{ x: 58.26661669436739, y: -5.360503235235181 }`
- ✅ Y coordinate is negative (expected if grid extends below origin)
- ✅ X coordinate is positive (within reasonable range)

**Hypothesis Ranking (Most → Least Likely):**

1. **ViewBox computed from empty/wrong bounds → SVG viewport 0×0**  
   - **Likelihood:** 🟥 **HIGH**  
   - **Evidence:** ViewBox calculation depends on `activePoints` iteration. If `activePoints` is empty or undefined, bounds remain `Infinity/-Infinity`, resulting in invalid viewBox.  
   - **Debug:** Log `minX, minY, maxX, maxY` before viewBox calculation. Log final `viewBoxX, viewBoxY, viewBoxWidth, viewBoxHeight`.

2. **Points/dualPoints have extreme values → rendered off-screen**  
   - **Likelihood:** 🟡 **MEDIUM**  
   - **Evidence:** Sample dual point shows reasonable coordinates (58.27, -5.36), but full dataset may have outliers.  
   - **Debug:** Log min/max coordinates of all points before rendering.

3. **CSS on #svg-container or svg selector hiding content**  
   - **Likelihood:** 🟡 **MEDIUM**  
   - **Evidence:** HTML template may have CSS rules affecting visibility.  
   - **Debug:** Inspect computed styles in browser DevTools.

4. **<g> or <polygon> transform/clip-path hiding content**  
   - **Likelihood:** 🟢 **LOW**  
   - **Evidence:** No transforms/clip-paths in current rendering code.  
   - **Debug:** Inspect SVG DOM structure in browser.

5. **Browser-specific SVG rendering quirk**  
   - **Likelihood:** 🟢 **LOW**  
   - **Evidence:** Standard SVG syntax should work in all modern browsers.  
   - **Debug:** Test in multiple browsers.

---

## Minimal Debug Additions (Immediate Actions)

### 1. Force Fixed ViewBox (Test)
```javascript
// In renderSVG(), replace dynamic viewBox with fixed test value
const viewBoxX = 0;
const viewBoxY = 0;
const viewBoxWidth = 1000;
const viewBoxHeight = 1000;
console.log('FORCED viewBox: 0 0 1000 1000');
```

### 2. Add Red Debug Rectangle
```javascript
// After background rect, add debug rect at origin
layers.push(`<rect x="0" y="0" width="100" height="100" fill="red" opacity="0.8" />`);
console.log('Debug red rect added at (0,0)');
```

### 3. Log Bounds Calculation
```javascript
// After bounds calculation, log values
console.log(`Bounds calc: minX=${minX.toFixed(2)}, minY=${minY.toFixed(2)}, maxX=${maxX.toFixed(2)}, maxY=${maxY.toFixed(2)}`);
console.log(`ViewBox: ${viewBoxX.toFixed(2)} ${viewBoxY.toFixed(2)} ${viewBoxWidth.toFixed(2)} ${viewBoxHeight.toFixed(2)}`);
```

### 4. Log Point Sample
```javascript
// Before bounds calculation, log sample points
if (activePoints.length > 0) {
  console.log(`Sample activePoints[0]:`, activePoints[0]);
  console.log(`Sample activePoints[last]:`, activePoints[activePoints.length - 1]);
}
```

### 5. Test with Hardcoded Tiny Polygon
```javascript
// Replace quad rendering with single test polygon
const testPolygon = `<path d="M 100 100 L 200 100 L 200 200 L 100 200 Z" fill="blue" stroke="black" stroke-width="2" />`;
layers.push(testPolygon);
console.log('Test polygon added (hardcoded coordinates)');
```

---

## Next Immediate Actions

1. **Add debug logging to `renderSVG()` function:**
   - Log `activePoints.length` and sample coordinates
   - Log computed bounds (minX, minY, maxX, maxY)
   - Log final viewBox values
   - Log number of quads rendered

2. **Check browser console:**
   - Verify `Script initialization starting...` appears
   - Check for any JavaScript errors
   - Verify `DUAL_GRID_DATA` is defined
   - Check `renderSVG()` logs

3. **Test with forced viewBox:**
   - Replace dynamic viewBox with fixed `viewBox="0 0 1000 1000"`
   - Add red debug rectangle at (0,0)
   - Verify if ANY content renders

4. **Inspect browser DOM:**
   - Check if `<svg>` element exists in `#svg-container`
   - Inspect SVG element attributes (viewBox, width, height)
   - Check computed CSS styles (display, opacity, overflow)

5. **Test with minimal polygon:**
   - Replace quad rendering with single hardcoded polygon
   - Verify if basic SVG rendering works

---

## Code Snippets for Quick Fixes

### Fix 1: Add Comprehensive Logging to `renderSVG()`
```javascript
function renderSVG() {
  try {
    console.log('Starting render...');
    const { points, level0Quads, mapWidth, mapHeight, dualPoints } = DUAL_GRID_DATA;
    
    // Debug: Log data availability
    console.log('points length:', points?.length || 'MISSING');
    console.log('dualPoints length:', dualPoints?.length || 'MISSING');
    console.log('level0Quads length:', level0Quads?.length || 'MISSING');
    
    const activePoints = points; // Force original for now
    console.log('Active points chosen: ORIGINAL, length:', activePoints.length);
    
    // Debug: Log sample points
    if (activePoints.length > 0) {
      console.log('Sample activePoints[0]:', activePoints[0]);
      console.log('Sample activePoints[last]:', activePoints[activePoints.length - 1]);
    }
    
    // Calculate bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of activePoints) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    
    // Debug: Log bounds
    console.log(`Bounds: minX=${minX.toFixed(2)}, minY=${minY.toFixed(2)}, maxX=${maxX.toFixed(2)}, maxY=${maxY.toFixed(2)}`);
    
    const padding = 20;
    const width = maxX - minX;
    const height = maxY - minY;
    const viewBoxX = minX - padding;
    const viewBoxY = minY - padding;
    const viewBoxWidth = width + (padding * 2);
    const viewBoxHeight = height + (padding * 2);
    
    // Debug: Log viewBox
    console.log(`ViewBox: ${viewBoxX.toFixed(2)} ${viewBoxY.toFixed(2)} ${viewBoxWidth.toFixed(2)} ${viewBoxHeight.toFixed(2)}`);
    
    // ... rest of rendering code ...
    
    console.log("Render completed successfully");
  } catch (err) {
    console.error("Render crashed:", err.message, err.stack);
  }
}
```

### Fix 2: Force Fixed ViewBox (Temporary Test)
```javascript
// Replace viewBox calculation with fixed test value
const viewBoxX = 0;
const viewBoxY = 0;
const viewBoxWidth = 1000;
const viewBoxHeight = 1000;
console.log('FORCED TEST viewBox: 0 0 1000 1000');
```

### Fix 3: Add Red Debug Rectangle
```javascript
// After background rect, add debug rect
layers.push(`<rect x="0" y="0" width="100" height="100" fill="red" opacity="0.8" stroke="black" stroke-width="2" />`);
console.log('Debug red rect added at (0,0)');
```

---

**Report End**
