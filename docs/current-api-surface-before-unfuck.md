# Current Public API Surface - Before Iteration 5 Unfuck Migration

**Date**: 2026-01-18  
**Purpose**: Document exact public API surface before any changes  
**Branch**: `feat/iteration5-unfuck-migration-start`

---

## Public API Exports (from `src/index.js`)

### Core Generator Functions

#### `initGenerator({ container = null } = {})`
- **Parameters**:
  - `container` (HTMLElement|null, optional): Optional container element for SVG rendering
- **Returns**: `void`
- **Throws**: `InitializationError` if already initialized or invalid container provided
- **Description**: Initialize the generator with optional container for SVG rendering. Must be called before any other generator functions.

#### `loadOptions(curatedParams = {})`
- **Parameters**:
  - `curatedParams` (Object, optional): Partial options object (e.g., `{ seed: 42, mapWidth: 800 }`)
- **Returns**: `void`
- **Throws**: `InitializationError` if generator not initialized, `InvalidOptionError` for invalid option values
- **Description**: Load and merge options with defaults, performing validation and clamping.

#### `generateMap(DelaunatorClass = null)`
- **Parameters**:
  - `DelaunatorClass` (Function|null, optional): Delaunator class (required as peer dependency for Voronoi phase)
- **Returns**: `Object` - Reference to generated data `{grid, pack, seed}`
- **Throws**: `InitializationError` if generator not initialized, `GenerationError` if generation fails
- **Description**: Generate map data using current options and store in state. Runs full generation pipeline.

#### `generatePartial(phasesToRun, DelaunatorClass = null)` ⚠️ **NOT EXPORTED IN index.js**
- **Parameters**:
  - `phasesToRun` (Array<string>, required): Array of phase names to run (from PHASES constant)
  - `DelaunatorClass` (Function|null, optional): Delaunator class (required if VORONOI phase is included)
- **Returns**: `Object` - Reference to generated data `{grid, pack, seed}`
- **Throws**: `InitializationError` if generator not initialized, `GenerationError` if generation fails or dependencies are missing
- **Description**: Generate partial map data by running only specified phases. Dependencies are automatically resolved and validated.
- **Note**: This function exists in `generator.js` but is NOT exported in `index.js`, so it's not part of the public API.

#### `getMapData()`
- **Parameters**: None
- **Returns**: `Object` - JSON object matching schema in `docs/api-spec.md`
- **Throws**: `InitializationError` if generator not initialized, `NoDataError` if no data generated yet
- **Description**: Get structured JSON data from generated map (deep cloned, excludes internal fields).

#### `renderPreviewSVG(options = {})`
- **Parameters**:
  - `options` (Object, optional): Rendering options
    - `width` (number, optional): SVG width (defaults to `container.width`, `options.mapWidth`, or 1000)
    - `height` (number, optional): SVG height (defaults to `container.height`, `options.mapHeight`, or 600)
    - `container` (HTMLElement, optional): Container element for SVG (defaults to `state.container`)
- **Returns**: `string|null` - SVG string if no container provided, `null` if appended to container
- **Throws**: `InitializationError` if generator not initialized, `NoDataError` if no data generated yet
- **Description**: Render stored map data to SVG (returns SVG string or appends to container).

#### `loadMapData(jsonData)`
- **Parameters**:
  - `jsonData` (Object, required): JSON data matching `getMapData()` output structure
- **Returns**: `void`
- **Throws**: `InitializationError` if generator not initialized, `InvalidOptionError` if JSON structure is invalid
- **Description**: Load map data from JSON (for data-driven regeneration/display).

#### `resetGeneratorState()`
- **Parameters**: None
- **Returns**: `void`
- **Throws**: `InitializationError` if generator not initialized
- **Description**: Reset generator state (for multiple map generations). Clears generated data to allow new generation without reinitializing.

---

### Utility Exports

#### `getDefaultOptions()`
- **Parameters**: None
- **Returns**: `Object` - Default options object
- **Description**: Get default options object with all default values.

#### `mergeOptions(curatedParams = {})`
- **Parameters**:
  - `curatedParams` (Object, optional): Partial options object
- **Returns**: `Object` - Merged options object
- **Throws**: `InvalidOptionError` for invalid option values
- **Description**: Merge partial options with defaults, performing validation and clamping.

#### `RNG`
- **Type**: Class
- **Description**: Seeded random number generator class exported from `src/utils/rng.js`.

---

### Core Module Re-exports

#### `export * from './core/index.js'`
- **Description**: Re-export all core modules for advanced usage. Includes various internal generation functions (not part of main API surface but available for advanced users).

---

## Available Phase Constants (from `src/utils/constants.js`)

```javascript
export const PHASES = {
  VORONOI: 'voronoi',
  HEIGHTMAP: 'heightmap',
  MARKUP_GRID: 'markupGrid',
  MAP_COORDINATES: 'mapCoordinates',
  TEMPERATURE: 'temperature',
  PRECIPITATION: 'precipitation',
  PACK_CREATION: 'packCreation',
  RIVERS: 'rivers',
  BIOMES: 'biomes',
  MARKUP_PACK: 'markupPack',
  FEATURES: 'features',
  CULTURES: 'cultures',
  BURGS: 'burgs',
  DUAL_GRID_STATES: 'dualGridStates',
  STATES: 'states',
  PROVINCES: 'provinces',
  RELIGIONS: 'religions',
  EMBLEMS: 'emblems',
};
```

**Note**: `PHASES.DUAL_GRID` does NOT exist (only `DUAL_GRID_STATES` exists).

---

## Rendering-Related Exports

### `renderPreviewSVG(options = {})`
- **Signature**: `renderPreviewSVG({ width, height, container })`
- **Supports**: SVG string output or container appending
- **Does NOT support**:
  - Canvas rendering (`renderToCanvas()` does not exist)
  - `includeInteractive` parameter (no interactive SVG elements)
  - Layer control (`renderConfig.layers` not supported)
  - `renderPreview()` alias (removed - see `generator.js:660`)

### Internal Rendering Functions (from `src/rendering/index.js`)
- `renderMapSVG(data, options)` - Internal function, not exported in main API
- `drawBiomesSVG(pack)` - Internal function
- `drawStatesSVG(pack)` - Internal function
- `drawBordersSVG(pack)` - Internal function
- `drawRiversSVG(pack)` - Internal function
- `drawBurgsSVG(pack)` - Internal function
- `drawFeaturesSVG(pack)` - Internal function

---

## Missing API Functions (Expected but Not Implemented)

Based on Iteration 5 rules, the following are expected but **NOT in current API**:

1. ❌ `generatePartial()` - Exists in `generator.js` but **NOT exported in `index.js`**
2. ❌ `generatePartial(phases, { cellId })` - `cellId` parameter not supported
3. ❌ `getMapData({ cellId })` - `cellId` parameter not supported
4. ❌ `renderToCanvas(canvas)` - Canvas rendering removed (SVG-only pipeline)
5. ❌ `renderToSVG({ includeInteractive })` - Different name (`renderPreviewSVG` exists, no `includeInteractive` param)
6. ❌ `registerCellClickHandler(callback)` - Not implemented
7. ❌ `renderPreview({ renderConfig })` - Different name (`renderPreviewSVG` exists, no `renderConfig` param)

---

## Summary

**Public API Surface** (as exported from `src/index.js`):
- ✅ `initGenerator({ container })`
- ✅ `loadOptions(curatedParams)`
- ✅ `generateMap(DelaunatorClass)`
- ❌ `generatePartial()` - **EXISTS but NOT EXPORTED**
- ✅ `getMapData()`
- ✅ `renderPreviewSVG({ width, height, container })`
- ✅ `loadMapData(jsonData)`
- ✅ `resetGeneratorState()`
- ✅ `getDefaultOptions()`
- ✅ `mergeOptions(curatedParams)`
- ✅ `RNG` (class)

**Total Public Functions**: 10 (plus RNG class)

**Rendering**: SVG-only pipeline, no canvas support.

---

**Documentation Status**: Complete as of 2026-01-18
