# Current Rendering State - Before Iteration 5 Unfuck Migration

**Date**: 2026-01-18  
**Purpose**: Document current rendering behavior and capabilities  
**Branch**: `feat/iteration5-unfuck-migration-start`

---

## Rendering Pipeline Overview

**Status**: SVG-only pipeline  
**Canvas Support**: ❌ Removed (comments indicate "Canvas rendering not supported in SVG-only pipeline")

### Primary Rendering Function

#### `renderPreviewSVG(options = {})`
- **Location**: `src/generator.js:670`
- **Parameters**:
  - `options.width` (number, optional): SVG width
  - `options.height` (number, optional): SVG height
  - `options.container` (HTMLElement, optional): Container element for SVG
- **Returns**: `string|null` - SVG string if no container provided, `null` if appended to container
- **Behavior**:
  - Determines dimensions from: `options.width/height` → `container.getBoundingClientRect()` → `state.data.options.mapWidth/mapHeight` → defaults (1000x600)
  - Calls `renderMapSVG(state.data, { width, height })` internally
  - If container provided: `container.innerHTML = svgString` (replaces content)
  - If no container: returns SVG string

---

## Rendering Implementation Details

### SVG Rendering Module (`src/rendering/svg.js`)

#### `renderMapSVG(data, options = {})`
- **Parameters**:
  - `data` (Object): `{grid, pack, options, seed}`
  - `options` (Object): `{width, height}` (container not used here)
- **Returns**: `string` - Complete SVG string
- **Layers** (rendered in order):
  1. Ocean base (rect fill)
  2. Features (lakes, islands) - `<g id="features">`
  3. Landmass base (rect fill)
  4. Biomes - `<g id="biomes" opacity="0.7">`
  5. States - `<g id="states" opacity="0.6">`
  6. Rivers - `<g id="rivers">`
  7. Borders (state + province) - `<g id="borders">`
  8. Burgs - `<g id="burgs">`

#### Internal Drawing Functions
- `drawBiomesSVG(pack)` - Renders biome isolines
- `drawStatesSVG(pack)` - Renders state isolines
- `drawBordersSVG(pack)` - Returns `{stateBorders, provinceBorders}`
- `drawRiversSVG(pack)` - Renders river paths
- `drawBurgsSVG(pack)` - Renders settlement markers
- `drawFeaturesSVG(pack)` - Renders lakes and islands

---

## Canvas Rendering Status

### ❌ Canvas Support Removed

**Evidence**:
1. `src/generator.js:660` - Comment: `// NOTE: renderPreview() removed - Canvas rendering not supported in SVG-only pipeline`
2. `src/rendering/index.js:8` - Comment: `// NOTE: Canvas rendering removed - SVG-only pipeline`
3. `src/rendering/canvas2d.js` - **EXISTS** but not used in public API

**Canvas2DRenderer Class** (`src/rendering/canvas2d.js`):
- ❌ Not exported in `src/rendering/index.js`
- ❌ Not used in `src/generator.js`
- ✅ Code exists (965 lines) but appears to be legacy/unused
- **Status**: Dead code (may be removed in cleanup)

---

## Interactive Elements

### ❌ No Interactive Support Found

**Search Results**:
- No `click` handlers in `src/rendering/`
- No `touch` handlers in `src/rendering/`
- No `addEventListener` in `src/rendering/`
- No `onClick` attributes in SVG generation

**SVG Output**:
- Static SVG paths only
- No `<circle>` or `<rect>` with click handlers
- No JavaScript event handlers embedded

**Conclusion**: Current rendering produces **static SVG only**, no interactive elements.

---

## Missing Features (Expected by Iteration 5 Rules)

### 1. Canvas Rendering ❌
- **Expected**: `renderToCanvas(canvas)` or `renderPreview({ renderConfig })`
- **Current**: Not supported (SVG-only pipeline)

### 2. Interactive SVG ❌
- **Expected**: `renderToSVG({ includeInteractive: true })`
- **Current**: No `includeInteractive` parameter in `renderPreviewSVG()`

### 3. Layer Control ❌
- **Expected**: `renderPreview({ renderConfig: { layers: { biomes: { enabled: true } } } })`
- **Current**: No `renderConfig` parameter, layers always rendered

### 4. Container Parameter ✅
- **Expected**: `renderPreviewSVG({ width, height, container })`
- **Current**: ✅ Supported

---

## Rendering Dependencies

### Required Data Structure
```javascript
{
  grid: {
    cells: { i, h, t, temp, prec, f, b },
    points: [...],
    vertices: { p, v, c },
    features: [...]
  },
  pack: {
    cells: { i, h, t, f, b, g, area, p, c, v, state, province, biome, culture, religion },
    vertices: { p, v, c },
    features: [...],
    burgs: [...],
    states: [...],
    rivers: [...],
    cultures: [...],
    religions: [...],
    provinces: [...],
    dualGrid: {...} // Optional, when useDualGridPolitics is enabled
  },
  options: { mapWidth, mapHeight, ... },
  seed: String
}
```

### Style Constants
- Defined in `src/rendering/svg.js` (STYLE_CONSTANTS)
- Hard-coded colors and stroke widths (matches original Azgaar defaults)

---

## Performance Considerations

### SVG Generation
- Single-pass generation (no caching of SVG strings)
- Isoline calculation for each layer (biomes, states, borders)
- All layers rendered in single SVG string

### Large Map Performance
- No viewport culling (all cells rendered)
- No zoom/pan optimization
- Full SVG string generated regardless of container size

---

## Summary

**Current Rendering Capabilities**:
- ✅ SVG string output
- ✅ Container appending
- ✅ Full layer rendering (ocean, features, land, biomes, states, rivers, borders, burgs)
- ✅ Dual-grid support (when `useDualGridPolitics` enabled)

**Missing Capabilities**:
- ❌ Canvas rendering
- ❌ Interactive SVG elements
- ❌ Layer control (enable/disable layers)
- ❌ Viewport optimization
- ❌ Click handlers for cells

**Rendering Function Signature**:
```javascript
renderPreviewSVG({ width, height, container })
```

**SVG Output**: Static SVG string with 8 layers (fixed order, all enabled).

---

**Documentation Status**: Complete as of 2026-01-18
