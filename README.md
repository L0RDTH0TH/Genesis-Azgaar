# Azgaar Genesis Fork

**Modular JavaScript library fork of Azgaar's Fantasy Map Generator for Genesis Mythos integration**

## 🎉 Production Ready - Modular Library Complete! 🎉

The library is now **production-ready** with a complete stateful API, SVG rendering, and distributable bundles. All core generation algorithms maintain 100% fidelity with the original Azgaar generator.

## Overview

This is a fork of [Azgaar's Fantasy Map Generator](https://github.com/Azgaar/Fantasy-Map-Generator) refactored into a modular, importable JavaScript library. The primary goal is seamless integration into Genesis Mythos' WebView-based world builder GUI (godot_wry + Alpine.js).

## Build

### Prerequisites

- Node.js 18+ and npm

### Installation

```bash
npm install
```

### Building

Build the library for production:

```bash
npm run build
```

This generates two bundle files in `dist/`:
- `azgaar-genesis.esm.js` - ES Module format for modern browsers/WebView
- `azgaar-genesis.min.js` - Minified ES Module for production

### Development

For development with hot reload:

```bash
npm run dev
```

Preview the built files:

```bash
npm run preview
```

## Current Status

✅ **Production Ready** - The library is fully functional and ready for integration into Genesis Mythos.

**Core Features:**
- ✅ Modular ES6 architecture with clean separation of concerns
- ✅ Complete map generation pipeline (100% fidelity with original Azgaar)
- ✅ Stateful public API with error handling
- ✅ SVG rendering with all layers (ocean, biomes, states, borders, rivers, burgs)
- ✅ Headless mode for data-only generation
- ✅ JSON export optimized for Godot import
- ✅ Production-ready bundles (ESM/UMD/minified)
- ✅ Comprehensive examples and documentation

**Validation:**
- ✅ **Data Fidelity**: 100% - All core algorithms produce identical results to original Azgaar
- ✅ **Performance**: Excellent - 1.3s average for 10k cells, 2.5s for 20k cells
- ✅ **Seed Reproducibility**: Perfect - Same seed + options = identical output
- ✅ **API Correctness**: Complete - All error cases handled, tests passing

See detailed reports in `docs/`:
- [`docs/validation-metrics.md`](docs/validation-metrics.md) - Data structure comparison
- [`docs/performance-report.md`](docs/performance-report.md) - Performance profiling results
- [`docs/api-spec.md`](docs/api-spec.md) - Complete API documentation

## Public API

The library provides a stateful API for map generation and rendering:

```javascript
import { 
  initGenerator, 
  loadOptions, 
  generateMap, 
  getMapData, 
  renderPreview,
  renderPreviewSVG,
  loadMapData
} from 'azgaar-genesis';

// 1. Initialize with optional canvas for previews or container for SVG
initGenerator({ 
  canvas: document.getElementById('map'),  // For canvas rendering
  container: document.getElementById('svgContainer')  // For SVG rendering (optional)
});

// 2. Load options from Genesis Mythos JSON with clamping
loadOptions({
  seed: '42',
  mapWidth: 1920,
  mapHeight: 1080,
  statesNumber: 20,
  cultures: 15
});

// 3. Generate map (requires Delaunator as peer dependency)
import Delaunator from 'delaunator';
const data = generateMap(Delaunator);

// 4. Render to canvas (if canvas provided)
renderPreview();

// 5. Render to SVG (returns SVG string or appends to container)
const svgString = renderPreviewSVG({ width: 1920, height: 1080 });
// Or if container provided: renderPreviewSVG() will append automatically

// 6. Get structured JSON data for Godot consumption
const json = getMapData();
console.log(JSON.stringify(json, null, 2));

// 7. Load map data from JSON (for data-driven regeneration/display)
loadMapData(json);
renderPreviewSVG();  // Render loaded data
```

### API Functions

#### `initGenerator({ canvas, container })`
Initializes the generator state. Stores optional canvas reference for canvas rendering or container for SVG rendering.

**Parameters:**
- `canvas` (HTMLCanvasElement | null): Optional canvas element for canvas rendering previews
- `container` (HTMLElement | null): Optional container element for SVG rendering

**Throws:** `InitializationError` if already initialized or invalid elements provided

#### `loadOptions(curatedParams)`
Merges provided params with defaults and updates internal options. Validates and clamps values.

**Parameters:**
- `curatedParams` (Partial<Options>): Partial options object (e.g., `{ seed: 42, mapWidth: 800 }`)

**Throws:** `InitializationError` if not initialized, `InvalidOptionError` for invalid values

#### `generateMap(DelaunatorClass)`
Generates map data using internal options and stores it in state.

**Parameters:**
- `DelaunatorClass` (Function): Delaunator class (required as peer dependency)

**Returns:** `{ grid, pack, seed }` - Reference to generated map data

**Throws:** `InitializationError` if not initialized, `GenerationError` if generation fails

#### `getMapData()`
Returns structured JSON from stored data. Format is optimized for Godot import (flat JSON, no circular references).

**Returns:** JSON object matching schema in `docs/api-spec.md`

**Throws:** `InitializationError` if not initialized, `NoDataError` if no data generated yet

#### `renderPreview()`
Renders stored data to the initialized canvas. No-op with warning if no canvas provided.

**Throws:** `InitializationError` if not initialized, `NoDataError` if no data generated yet

#### `renderPreviewSVG(options)`
Renders stored map data to SVG. Returns SVG string if no container provided, or appends to container if provided.

**Parameters:**
- `options` (Object, optional): Rendering options
  - `width` (number, optional): SVG width (defaults to map width or container width)
  - `height` (number, optional): SVG height (defaults to map height or container height)
  - `container` (HTMLElement, optional): Container element to append SVG to (overrides initGenerator container)

**Returns:** `string | null` - SVG string if no container, null if appended to container

**Throws:** `InitializationError` if not initialized, `NoDataError` if no data generated yet, `GenerationError` if rendering fails

**Note:** SVG rendering includes all layers: ocean, landmass, features (lakes/islands), biomes, states, borders, rivers, and burgs.

**Example - SVG Rendering:**

```javascript
// Initialize with container for SVG
const container = document.getElementById('mapContainer');
initGenerator({ container });

// Generate and render
loadOptions({ seed: '42', mapWidth: 1200, mapHeight: 800 });
generateMap(Delaunator);
renderPreviewSVG(); // Automatically appends to container

// Or get SVG string
const svgString = renderPreviewSVG({ width: 1200, height: 800 });
document.body.insertAdjacentHTML('beforeend', svgString);
```

#### `loadMapData(jsonData)`
Loads map data from JSON (matching `getMapData()` output structure). Allows data-driven regeneration/display without re-running generation.

**Parameters:**
- `jsonData` (Object): JSON object matching `getMapData()` output structure

**Throws:** `InitializationError` if not initialized, `InvalidOptionError` if JSON structure is invalid

**Note:** After loading, you can call `renderPreviewSVG()` or `renderPreview()` to display the loaded data, or use the seed from loaded data to regenerate.

**Example - Data-Driven Loading:**

```javascript
// Load previously exported JSON
const savedJson = JSON.parse(fs.readFileSync('map.json', 'utf8'));
loadMapData(savedJson);

// Render without regeneration
renderPreviewSVG();

// Or regenerate with same seed
loadOptions({ seed: savedJson.seed });
generateMap(Delaunator);
renderPreviewSVG();
```

### Error Types

- `InitializationError`: Generator not initialized or already initialized
- `InvalidOptionError`: Invalid option values provided
- `GenerationError`: Map generation failed
- `NoDataError`: No map data available (call `generateMap()` first)
- `NoCanvasError`: No canvas provided (only if rendering is explicitly required)

### Complete API Reference

See [`docs/api-spec.md`](docs/api-spec.md) for complete API documentation including:
- Detailed function signatures
- Parameter descriptions
- Return value specifications
- Error handling
- JSON schema for `getMapData()`
- Usage flow examples

### JSON Export Structure

The `getMapData()` function returns a structured JSON object optimized for Godot import. The structure is flat (no circular references) and uses standard JavaScript arrays (not TypedArrays) for JSON compatibility.

**Complete JSON Schema:**

```json
{
  "seed": "string",                    // Seed used for generation
  "options": {                         // Full merged options object
    "mapWidth": 960,
    "mapHeight": 540,
    "points": 4,
    "statesNumber": 18,
    "cultures": 12,
    // ... all other options
  },
  "grid": {                            // Grid-level data (Voronoi diagram)
    "cells": {
      "i": [0, 1, 2, ...],             // Cell indices
      "h": [20, 45, 67, ...],          // Heights (0-100, 20+ = land)
      "t": [0, 1, -1, ...],            // Cell types (0=land, 1=ocean, -1=coast)
      "temp": [15, 20, 25, ...],       // Temperatures (°C)
      "prec": [50, 100, 150, ...],     // Precipitation values
      "f": [0, 1, 0, ...],             // Feature IDs (0=none, >0=feature)
      "b": [3, 5, 7, ...]              // Biome IDs (0-12)
    },
    "points": [[x1, y1], [x2, y2], ...], // Voronoi cell center points
    "vertices": {                      // Voronoi vertices (for rendering)
      "p": [[x, y], ...],              // Vertex coordinates
      "v": [[v1, v2, v3], ...],        // Adjacent vertices per vertex
      "c": [[c1, c2, c3], ...]         // Adjacent cells per vertex
    },
    "features": [                      // Grid-level features
      { "i": 123, "type": "lake", ... }
    ]
  },
  "pack": {                            // Pack-level data (refined Voronoi)
    "cells": {
      "i": [0, 1, 2, ...],             // Pack cell indices
      "p": [[x, y], ...],              // Pack cell center points
      "h": [20, 45, 67, ...],          // Heights (interpolated from grid)
      "biome": [3, 5, 7, ...],         // Biome IDs per pack cell
      "state": [0, 1, 1, ...],         // State IDs (0=neutral)
      "culture": [0, 1, 2, ...],       // Culture IDs
      "province": [0, 1, 1, ...],      // Province IDs
      "v": [[v1, v2, ...], ...],      // Vertex indices per cell (for polygon rendering)
      "vCoords": [[[x,y], ...], ...],  // Polygon coordinates per cell
      "area": [1.5, 2.3, ...],         // Cell areas
      // ... other cell properties
    },
    "vertices": {                      // Pack vertices
      "p": [[x, y], ...],              // Vertex coordinates
      "v": [[v1, v2, v3], ...],        // Adjacent vertices
      "c": [[c1, c2, c3], ...]         // Adjacent cells
    },
    "features": [                      // Pack features (lakes, islands)
      {
        "i": 123,
        "type": "lake",
        "cells": [123, 124, 125],
        "freshwater": true,
        // ... feature properties
      }
    ],
    "burgs": [                        // Settlements
      {
        "i": 0,
        "cell": 123,
        "x": 456.7,
        "y": 234.5,
        "name": "Capital City",
        "capital": true,
        "population": 50000,
        "culture": 1,
        "state": 1,
        // ... burg properties
      }
    ],
    "states": [                        // Political entities
      {
        "i": 1,
        "name": "Kingdom of Example",
        "capital": 0,                  // Burg index
        "color": "#aabbcc",
        "area": 1234.5,
        "population": 100000,
        // ... state properties
      }
    ],
    "rivers": [                        // River paths
      {
        "i": 0,
        "cells": [123, 124, 125],
        "source": 123,
        "mouth": 125,
        "widthFactor": 1.5,
        "sourceWidth": 2,
        // ... river properties
      }
    ],
    "cultures": [                      // Culture data
      {
        "i": 1,
        "name": "Example Culture",
        "base": "european",
        "color": "#ff0000",
        // ... culture properties
      }
    ],
    "religions": [                     // Religion data
      {
        "i": 1,
        "name": "Example Religion",
        "type": "monotheistic",
        // ... religion properties
      }
    ],
    "provinces": [                     // Province data
      {
        "i": 1,
        "state": 1,
        "name": "Province Name",
        // ... province properties
      }
    ]
  }
}
```

**Key Objects/Arrays for Godot Import:**

1. **`grid.cells.h`** - Heightmap data (0-100, 20+ = land)
2. **`grid.cells.biome`** - Biome IDs per grid cell
3. **`pack.cells.state`** - State IDs per pack cell (0 = neutral/water)
4. **`pack.cells.biome`** - Biome IDs per pack cell
5. **`pack.burgs`** - All settlements with coordinates, names, populations
6. **`pack.states`** - All political entities with names, capitals, colors
7. **`pack.rivers`** - River paths with cell sequences
8. **`pack.features`** - Lakes and islands with cell lists
9. **`pack.cells.vCoords`** - Polygon coordinates for rendering (if `fullRendering: true`)

**Data Type Conversions:**
- TypedArrays (`Uint8Array`, `Int16Array`, etc.) → Standard JavaScript arrays
- Circular references resolved (e.g., `pack.cells.c` neighbor arrays)
- Internal temporary data excluded (e.g., `cells.s` suitability scores not exported)
- All numeric values preserved as-is (no rounding or truncation)

**Size Considerations:**
- 10K cells: ~3-4MB JSON
- 20K cells: ~6-8MB JSON
- 50K cells: ~15-20MB JSON

For large maps, consider compressing JSON or using binary formats in Godot.

### Default Options and Behavior

The library replicates original Azgaar default behavior exactly. Default options are defined in `src/options.js` and match the original generator's defaults:

**Key Defaults:**
- `mapWidth: 960, mapHeight: 540` - Standard map dimensions
- `points: 4` - Maps to 10,000 cells (via `CELLS_DENSITY_MAP`)
- `statesNumber: 18` - Number of political states
- `cultures: 12` - Number of cultures
- `landPercentage: 40` - Target land coverage (40% for continent template)
- `temperatureEquator: 27, temperatureNorthPole: -30, temperatureSouthPole: -15` - Climate defaults
- `prec: 100` - Precipitation percentage

**Option Loading Process:**
1. `loadOptions()` merges user-provided options with `DEFAULT_OPTIONS`
2. Each option is validated and clamped via `validateOption()`:
   - `mapWidth/mapHeight`: Clamped to 240-10000
   - `statesNumber`: Clamped to 0-100, rounded
   - `cultures`: Clamped to 1-100, rounded
   - `points`: Clamped to 1-13, rounded (maps to 1K-100K cells)
   - All numeric options have min/max bounds matching original Azgaar
3. Unknown options are included but warned (for forward compatibility)
4. `cellsDesired` is auto-calculated from `points` value

**Hardcoded Fallbacks:**
- If `seed` is `null`, generates seed from `Date.now()`
- If `template` is `null`, uses random template selection
- If `mapSize` is `null`, auto-calculated from template
- If `longitude` is `null`, auto-calculated from template
- If `manors` is `1000` or `'auto'`, uses auto-calculation based on map size

**Parameter Mapping to Original UI Controls:**

| Original UI Control | Options Parameter | Default | Range |
|-------------------|------------------|---------|-------|
| Map Width slider | `mapWidth` | 960 | 240-10000 |
| Map Height slider | `mapHeight` | 540 | 135-10000 |
| Points slider | `points` | 4 | 1-13 (maps to 1K-100K cells) |
| States slider | `statesNumber` | 18 | 0-100 |
| Cultures slider | `cultures` | 12 | 1-100 |
| Religions slider | `religionsNumber` | 6 | 0-50 |
| Temperature Equator | `temperatureEquator` | 27 | -50 to 50 |
| Temperature North Pole | `temperatureNorthPole` | -30 | -50 to 50 |
| Precipitation | `prec` | 100 | 0-500 |
| Land Percentage | `landPercentage` | 40 | 1-90 |
| Template dropdown | `template` | null (random) | null or template ID |

### Seed Reproducibility Guarantees

**Perfect Reproducibility:** The library guarantees that the same seed + same options = identical output.

**How It Works:**
1. **Seeded RNG**: Uses Alea PRNG (same algorithm as original Azgaar) initialized with seed string
2. **Deterministic Pipeline**: All random operations use the seeded RNG, not `Math.random()`
3. **Seed Format**: Accepts string or number, converted to string internally
4. **RNG Instance**: Created once per generation and passed to all generation phases

**Example:**
```javascript
// Same seed + same options = identical output
loadOptions({ seed: '42', mapWidth: 960, mapHeight: 540, statesNumber: 18 });
const data1 = generateMap(Delaunator);
const json1 = getMapData();

// Regenerate with same seed/options
loadOptions({ seed: '42', mapWidth: 960, mapHeight: 540, statesNumber: 18 });
const data2 = generateMap(Delaunator);
const json2 = getMapData();

// json1 and json2 are identical (deep equality)
```

**Seed Generation:**
- If `seed` is `null` or not provided, generates random seed: `String(Math.floor(Math.random() * 1e9))`
- Generated seed is stored in state and included in `getMapData()` output
- You can use the stored seed to regenerate identical maps

### Headless Mode vs. Preview Mode

**Headless Mode** (Data-Only Generation):
- No DOM dependencies
- No canvas or container required
- Fastest generation (no rendering overhead)
- Perfect for server-side or data-only use cases

```javascript
// Headless mode - no rendering
initGenerator({ container: null });
loadOptions({ seed: '42' });
const data = generateMap(Delaunator);
const json = getMapData(); // Export JSON only
// renderPreview() is a no-op in headless mode
```

**Preview Mode** (With Rendering):
- Requires container element for SVG rendering
- Can render to SVG string or append to DOM
- Full visual output with all layers

```javascript
// Preview mode - with rendering
const container = document.getElementById('mapContainer');
initGenerator({ container });
loadOptions({ seed: '42' });
const data = generateMap(Delaunator);
renderPreviewSVG(); // Renders to container
// Or: const svgString = renderPreviewSVG({ width: 1920, height: 1080 });
```

**Note:** Canvas rendering is deprecated. Use SVG rendering (`renderPreviewSVG()`) instead.

## Features

- **Modular Architecture**: ES6 modules with clean separation of concerns
- **Programmatic Control**: Set parameters directly in JS, generate maps on-demand
- **Canvas Rendering**: Render previews to a provided `<canvas>` element
- **Data Export**: Export structured JSON/SVG data compatible with Godot import
- **Headless Mode**: Optional data-only generation without DOM rendering
- **Fidelity Preserved**: Maintains original Azgaar output quality
- **Lightweight**: Vanilla JS, no heavy framework dependencies

## Project Structure

```
azgaar-genesis-fork/
├── src/                 # Refactored core library code (ES6 modules)
│   ├── core/            # Generation logic (heightmap, biomes, cultures, etc.)
│   ├── rendering/       # Canvas/SVG rendering functions
│   ├── utils/           # Shared utilities
│   ├── options.js       # Default options + validation/clamping
│   ├── generator.js     # Main entry: init(), generate(), getData(), renderToCanvas()
│   └── index.js         # Export all public API
├── original/            # Untouched copy of upstream files for reference/diff
├── ui/                  # Stripped/minimal UI components (only if needed)
├── dist/                # Built bundle(s) for Godot embedding
├── examples/            # Test HTML pages demonstrating library usage
├── tests/               # Unit tests (future)
└── ...
```

## License

MIT License - preserved from original Azgaar repository.

## Original Repository

Based on: https://github.com/Azgaar/Fantasy-Map-Generator

## Build Process

### How Bundles Are Created

The build process uses **Vite** to bundle the modular ES6 source code into distributable formats:

1. **Entry Point**: `src/index.js` exports all public API functions
2. **Bundling**: Vite bundles all `src/` modules into single files
3. **External Dependencies**: D3 and Delaunator are marked as external (not bundled)
4. **Output Formats**: ESM (ES Module) and UMD (Universal Module Definition)
5. **Minification**: Optional minification for production builds
6. **Source Maps**: Generated for non-minified builds (for debugging)

**Build Configuration** (`vite.config.js`):
- Library mode with entry point `src/index.js`
- External dependencies: `delaunator` (required), `d3` (optional)
- Output formats: `es` (ESM) and `umd` (UMD)
- Minification via esbuild (for minified builds)
- Source maps enabled for development builds

**Bundle Verification**:
After each build, `scripts/verify-bundle-exports.js` runs automatically to:
- Verify all exports are present and callable
- Validate default render config values
- Ensure bundle includes latest code changes

### Build Commands

```bash
# Build all variants (UMD, ESM, and minified)
npm run build

# Build development variants (UMD + ESM, no minification, with source maps)
npm run build:dev

# Build production variant (ESM only, minified)
npm run build:prod

# Build only minified UMD
npm run build:min
```

**Build Output:**
- `dist/azgaar-genesis.esm.js` - ES Module bundle (~400KB uncompressed)
- `dist/azgaar-genesis.umd.js` - UMD bundle (~400KB uncompressed)
- `dist/azgaar-genesis.min.js` - Minified ESM bundle (~200KB uncompressed)
- `dist/*.map` - Source maps (for debugging)

**Embedding in Godot WebView:**
1. Copy `dist/azgaar-genesis.esm.js` to `res://assets/ui_web/js/azgaar/`
2. Include Delaunator (peer dependency) via CDN or local file
3. Import in HTML: `import { ... } from './js/azgaar/azgaar-genesis.esm.js'`

### Output Files

After building, the `dist/` directory contains:

- **`azgaar-genesis.umd.js`** - UMD bundle (global variable `AzgaarGenesis`)
  - Use in browsers with `<script>` tag
  - Global variable: `window.AzgaarGenesis`
  - Requires D3 and Delaunator via CDN or separate script tags

- **`azgaar-genesis.esm.js`** - ES Module bundle
  - Use with `import` statements
  - Requires D3 and Delaunator as peer dependencies

- **`azgaar-genesis.min.js`** - Minified UMD bundle
  - Production-ready, optimized size
  - Same usage as UMD but minified

### Using the Bundles

**With UMD (Global Variable):**
```html
<!-- Load peer dependencies from CDN -->
<script src="https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/delaunator@5/dist/delaunator.min.js"></script>

<!-- Load library -->
<script src="./dist/azgaar-genesis.umd.js"></script>

<script>
  // Use global variable
  const { initGenerator, loadOptions, generateMap, renderPreview } = AzgaarGenesis;
  // ... rest of code
</script>
```

**With ES Modules:**
```html
<script type="module">
  import Delaunator from 'https://cdn.jsdelivr.net/npm/delaunator@5.0.1/+esm';
  import { 
    initGenerator, 
    loadOptions, 
    generateMap, 
    renderPreview 
  } from './dist/azgaar-genesis.esm.js';
  
  // ... rest of code
</script>
```

### Deployment to Godot

1. **Copy bundle files** to your Godot project:
   ```
   res://assets/ui_web/js/azgaar/
   ├── azgaar-genesis.esm.js    # ES module bundle (recommended)
   ├── azgaar-genesis.umd.js    # UMD bundle (alternative)
   └── azgaar-genesis.min.js    # Minified UMD (production)
   ```

2. **Include Delaunator** (peer dependency):
   - Copy from `node_modules/delaunator/dist/delaunator.min.js`
   - Or use CDN: `https://cdn.jsdelivr.net/npm/delaunator@5/dist/delaunator.min.js`

3. **D3 is optional** (only needed for advanced rendering features):
   - Use CDN: `https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js`
   - Or bundle separately if needed

4. **In your HTML file**, import the library:
   ```html
   <script type="module">
     import Delaunator from './js/azgaar/delaunator.min.js';
     import { initGenerator, loadOptions, generateMap, getMapData, renderPreview } 
       from './js/azgaar/azgaar-genesis.esm.js';
     // ... rest of integration code
   </script>
   ```

### Bundle Sizes

Expected sizes (approximate, may vary):
- `azgaar-genesis.umd.js`: ~400-500KB (uncompressed)
- `azgaar-genesis.esm.js`: ~400-500KB (uncompressed)
- `azgaar-genesis.min.js`: ~200-300KB (minified)

**Note:** D3 and Delaunator are external (not bundled) to keep the library lightweight. Users must load them separately.

## Installation & Usage

### Installation

```bash
npm install azgaar-genesis-fork
```

**Peer Dependencies:**
- `delaunator` (^5.0.0) - Required for Voronoi diagram generation
- `d3` (^7.0.0) - Optional, for advanced path generation in rendering

Install peer dependencies:
```bash
npm install delaunator d3
```

Or use via CDN:
```html
<script src="https://cdn.jsdelivr.net/npm/delaunator@5/dist/delaunator.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js"></script>
```

### Basic Usage

```javascript
import { 
  initGenerator, 
  loadOptions, 
  generateMap, 
  getMapData, 
  renderPreview 
} from 'azgaar-genesis';
import Delaunator from 'delaunator';

// Initialize
const canvas = document.getElementById('map');
initGenerator({ canvas });

// Configure
loadOptions({
  seed: '42',
  mapWidth: 960,
  mapHeight: 540,
  statesNumber: 18,
  cultures: 12
});

// Generate
const data = generateMap(Delaunator);

// Render
renderPreview();

// Export for Godot
const json = getMapData();
// Send json to Godot via WebView bridge
```

## Examples

The `examples/` directory contains comprehensive demonstrations of library usage:

### Available Examples

- **[`canvas-basic.html`](examples/canvas-basic.html)** - Basic rendering test with seed 42
  - Simple auto-generation on load
  - Demonstrates core rendering functionality

- **[`canvas-preview.html`](examples/canvas-preview.html)** - Full API demonstration
  - Step-by-step controls for each API function
  - Shows complete workflow: init → load → generate → render → export
  - Includes JSON output display

- **[`headless-json.html`](examples/headless-json.html)** - Headless JSON generation
  - No canvas required - fully headless operation
  - Generates map data and exports JSON
  - Includes download functionality and statistics
  - Perfect for server-side or data-only use cases

- **[`godot-demo.html`](examples/godot-demo.html)** - Godot WebView integration pattern
  - Minimal, clean implementation matching Godot usage
  - Fixed seed 42 for reproducible results
  - Includes comments explaining WebView integration pattern
  - Shows postMessage communication pattern

- **[`minimal-example.html`](examples/minimal-example.html)** - Smallest possible integration
  - Absolute minimal working example
  - Single script tag, auto-generates on load
  - Perfect for understanding the bare minimum needed

- **[`options-demo.html`](examples/options-demo.html)** - Options showcase
  - Interactive controls for common parameters
  - Live preview on option changes
  - Demonstrates `loadOptions()` flexibility
  - Shows validation and clamping in action

- **[`performance-test.html`](examples/performance-test.html)** - Performance benchmarking
  - Tests large map generation (10k, 20k, 50k cells)
  - Multiple runs with timing statistics
  - Performance metrics and comparison
  - Validates <5s target for 10k+ cells

### Running Examples

```bash
npm run dev
# Then open:
# http://localhost:5173/examples/canvas-preview.html
# http://localhost:5173/examples/headless-json.html
# etc.
```

### Common Patterns

**Minimal Integration:**
```javascript
import Delaunator from 'delaunator';
import { initGenerator, loadOptions, generateMap, renderPreview } from 'azgaar-genesis';

const canvas = document.getElementById('map');
initGenerator({ canvas });
loadOptions({ seed: '42', mapWidth: 960, mapHeight: 540 });
generateMap(Delaunator);
renderPreview();
```

**Headless (No Canvas):**
```javascript
import Delaunator from 'delaunator';
import { initGenerator, loadOptions, generateMap, getMapData } from 'azgaar-genesis';

initGenerator({ canvas: null }); // Headless mode
loadOptions({ seed: '42' });
generateMap(Delaunator);
const json = getMapData(); // Export JSON
```

**With Options:**
```javascript
loadOptions({
  seed: '42',
  mapWidth: 1920,
  mapHeight: 1080,
  cellsDesired: 20000,
  statesNumber: 25,
  cultures: 15,
  religionsNumber: 8,
  template: 'fantasy'
});
```

## Godot Integration

The library is designed for seamless integration into Genesis Mythos' WebView-based world builder GUI.

### File Placement

Copy the built bundle files to your Godot project:

```bash
# Copy ESM bundle (recommended for modern WebView)
cp dist/azgaar-genesis.esm.js /path/to/godot/project/res://assets/ui_web/js/azgaar/

# Or copy minified version for production
cp dist/azgaar-genesis.min.js /path/to/godot/project/res://assets/ui_web/js/azgaar/
```

**Recommended location:** `res://assets/ui_web/js/azgaar/azgaar-genesis.esm.js`

**Note:** Delaunator is a required peer dependency. Include it separately:

```
res://assets/ui_web/js/azgaar/
├── azgaar-genesis.esm.js    # ES module bundle
├── azgaar-genesis.umd.js    # UMD bundle (for global variable)
└── azgaar-genesis.min.js    # Minified UMD bundle
```

Also include Delaunator (peer dependency):
```
res://assets/ui_web/js/azgaar/
└── delaunator.esm.js        # From CDN or npm package
```

### Loading in WebView

In your Godot HTML file (e.g., `world_builder.html`):

```html
<!DOCTYPE html>
<html>
<head>
  <script type="module">
    import Delaunator from './js/azgaar/delaunator.esm.js';
    import { 
      initGenerator, 
      loadOptions, 
      generateMap, 
      getMapData, 
      renderPreview 
    } from './js/azgaar/azgaar-genesis.esm.js';

    const canvas = document.getElementById('map');
    initGenerator({ canvas });

    // Listen for messages from Godot
    window.addEventListener('message', async (event) => {
      if (event.data.type === 'generateMap') {
        try {
          loadOptions(event.data.options);
          const data = generateMap(Delaunator);
          renderPreview();
          const json = getMapData();
          
          // Send back to Godot
          window.parent.postMessage({
            type: 'mapGenerated',
            data: json,
            seed: data.seed
          }, '*');
        } catch (error) {
          window.parent.postMessage({
            type: 'mapError',
            error: error.message
          }, '*');
        }
      }
    });
  </script>
</head>
<body>
  <canvas id="map" width="1920" height="1080"></canvas>
</body>
</html>
```

### GDScript Integration

```gdscript
extends Control

var webview: WebView

func _ready():
    # Load WebView with world_builder.html
    webview = $WebView
    webview.load_url("res://assets/ui_web/world_builder.html")
    
    # Listen for messages from WebView
    webview.connect("message_received", self, "_on_webview_message")

func generate_map(seed: String = "42", width: int = 1920, height: int = 1080):
    var options = {
        "type": "generateMap",
        "options": {
            "seed": seed,
            "mapWidth": width,
            "mapHeight": height,
            "cellsDesired": 10000,
            "statesNumber": 18,
            "cultures": 12
        }
    }
    webview.post_message(JSON.print(options))

func _on_webview_message(message: Dictionary):
    match message.type:
        "mapGenerated":
            var map_data = message.data
            print("Map generated with seed: ", message.seed)
            # Process map_data in Godot
            # map_data contains grid, pack, seed, options
        "mapError":
            print("Error: ", message.error)
```

### WebView Setup

Ensure your Godot WebView (godot_wry) is configured to:
- Allow JavaScript modules (`<script type="module">`)
- Support ES6 imports
- Enable postMessage communication
- Allow local file access (for `res://` paths)

See [`examples/godot-demo.html`](examples/godot-demo.html) for a minimal working example.

## Godot Integration

The library is ready for integration into Genesis Mythos Godot project's WebView.

### Quick Integration

1. **Copy bundle files** to `res://assets/ui_web/js/azgaar/`
2. **Add canvas and status elements** to your HTML
3. **Include Alpine.js integration script**
4. **Connect GDScript message handler**

### Complete Guide

See **[`docs/godot-integration-guide.md`](docs/godot-integration-guide.md)** for:
- Step-by-step integration instructions
- Complete code examples
- PostMessage protocol documentation
- Troubleshooting guide

### Integration Examples

Ready-to-use integration examples are available in:
- **[`integration-examples/godot-webview/`](integration-examples/godot-webview/)**
  - `godot-webview-demo.html` - Complete working demo
  - `alpine-integration.js` - Alpine.js component (copy to project)
  - `postmessage-protocol.md` - Message format documentation
  - `gdscript-example.gd` - GDScript reference implementation

### Status

✅ **Phase 4 Preparation Complete** - All integration assets ready in fork repository  
⏳ **Awaiting Deployment** - Ready for manual deployment to Godot project

---

## Troubleshooting

### Common Errors

**`InitializationError: Generator not initialized`**
- **Cause:** Calling API functions before `initGenerator()`
- **Solution:** Always call `initGenerator()` first, even with `{ canvas: null }` for headless mode

**`GenerationError: Delaunator is required`**
- **Cause:** Not passing Delaunator to `generateMap()`
- **Solution:** Import Delaunator and pass it: `generateMap(Delaunator)`

**`InvalidOptionError: Invalid option value`**
- **Cause:** Option value out of valid range (e.g., negative width)
- **Solution:** Check option values are within valid ranges (see `docs/api-spec.md`)

**`NoDataError: No map data available`**
- **Cause:** Calling `getMapData()` or `renderPreview()` before `generateMap()`
- **Solution:** Ensure you call `generateMap()` first

**Canvas not rendering**
- **Cause:** No canvas provided or canvas not initialized
- **Solution:** Pass canvas to `initGenerator({ canvas })` or check canvas element exists

### Headless Mode

For headless operation (no canvas):

```javascript
initGenerator({ canvas: null }); // Initialize without canvas
loadOptions({ seed: '42' });
generateMap(Delaunator);
const json = getMapData(); // Works without canvas
renderPreview(); // No-op with warning (expected)
```

### Performance Issues

If generation is slow:
- Reduce `cellsDesired` (fewer cells = faster generation)
- Use smaller map dimensions
- Check browser console for errors
- Test with `examples/performance-test.html` to benchmark

Target performance: <5s for 10k cells on modern hardware (2020+ CPU).

### Debugging

Enable console logging:
```javascript
// All errors are logged to console
try {
  generateMap(Delaunator);
} catch (error) {
  console.error('Generation failed:', error);
  console.error('Stack:', error.stack);
}
```

Check generated data:
```javascript
const data = generateMap(Delaunator);
console.log('Map data:', {
  seed: data.seed,
  gridCells: data.grid.cells.i.length,
  packCells: data.pack.cells.i.length,
  features: data.pack.features?.length || 0
});
```

## Validation Summary

Phase 3 has been validated for data fidelity, performance, and API correctness:

- **Data Fidelity**: ✅ **100%** - All core algorithms produce identical results to original Azgaar
- **Performance**: ✅ **Excellent** - 1.3s average for 10k cells, 2.5s for 20k cells
- **API Correctness**: ✅ **Complete** - All error cases handled, tests passing
- **Bundle Quality**: ✅ **Production-ready** - All three variants build successfully

See detailed reports:
- [`docs/validation-metrics.md`](docs/validation-metrics.md) - Data structure comparison
- [`docs/performance-report.md`](docs/performance-report.md) - Performance profiling results

## Testing Recommendations

### Testing Partial Generation

The library supports partial generation through the `skipPhases` option and `generatePartial()` API. Test files are provided in `examples/` to verify fidelity and performance:

**Test Files:**
- `examples/full-gen.html` - Baseline full generation test
- `examples/partial-skip.html` - Test using `skipPhases` option (skips political phases)
- `examples/partial-run.html` - Test using `generatePartial()` API (runs only specific phases)

**Running Tests:**

1. **Build the library:**
   ```bash
   npm run build:dev
   ```

2. **Start dev server:**
   ```bash
   npm run dev
   ```

3. **Open test files in browser:**
   - Navigate to `http://localhost:5173/examples/full-gen.html`
   - Then open `http://localhost:5173/examples/partial-skip.html` in a new tab
   - Compare results visually and check console logs

**What to Verify:**

1. **Fidelity Testing:**
   - Same seed + same options should produce identical terrain data
   - Skipped phases should not affect terrain generation
   - Partial runs should preserve existing data correctly

2. **Performance Testing:**
   - Measure time saved by skipping phases
   - Verify cache is working (second run with same skip should be faster)
   - Compare full generation vs. partial generation times

3. **Data Consistency:**
   - Terrain data (heights, biomes, rivers) should match between full and partial runs
   - Political data (states, cultures, burgs) should be absent when skipped
   - Partial runs should merge correctly with existing data

**Example Test Workflow:**

```javascript
// 1. Generate full map
initGenerator({ container });
loadOptions({ seed: 'test-42', mapWidth: 960, mapHeight: 540 });
const fullData = generateMap(Delaunator);
const fullTime = performance.now() - startTime;

// 2. Generate partial (terrain only)
loadOptions({ 
  seed: 'test-42', 
  skipPhases: [PHASES.CULTURES, PHASES.BURGS, PHASES.STATES] 
});
const partialData = generateMap(Delaunator);
const partialTime = performance.now() - startTime;

// 3. Compare results
console.log('Time saved:', fullTime - partialTime);
console.log('Terrain match:', 
  JSON.stringify(fullData.grid.cells.h) === JSON.stringify(partialData.grid.cells.h)
);
```

**Visual Diff Utility:**

A simple SVG comparison utility is available in `examples/svg-diff.js`:

```javascript
import { compareSVG, compareMapData } from './examples/svg-diff.js';

// Compare SVG outputs
const svgDiff = compareSVG(fullSVG, partialSVG);
console.log('SVG identical:', svgDiff.identical);

// Compare map data
const dataDiff = compareMapData(fullData, partialData);
console.log('Terrain match:', dataDiff.gridCellsMatch);
```

**Expected Results:**

- **Terrain Fidelity:** 100% match for same seed (heights, biomes, rivers identical)
- **Performance Gain:** 30-50% time savings when skipping political phases
- **Data Integrity:** Skipped phases produce empty/default data as expected
- **Cache Efficiency:** Second run with same skips uses cache (near-instant)

## Testing Recommendations

### Testing Partial Generation

The library supports partial generation through the `skipPhases` option and `generatePartial()` API. Test files are provided in `examples/` to verify fidelity and performance:

**Test Files:**
- `examples/full-gen.html` - Baseline full generation test
- `examples/partial-skip.html` - Test using `skipPhases` option (skips political phases)
- `examples/partial-run.html` - Test using `generatePartial()` API (runs only specific phases)

**Running Tests:**

1. **Build the library:**
   ```bash
   npm run build:dev
   ```

2. **Start dev server:**
   ```bash
   npm run dev
   ```

3. **Open test files in browser:**
   - Navigate to `http://localhost:5173/examples/full-gen.html`
   - Then open `http://localhost:5173/examples/partial-skip.html` in a new tab
   - Compare results visually and check console logs

**What to Verify:**

1. **Fidelity Testing:**
   - Same seed + same options should produce identical terrain data
   - Skipped phases should not affect terrain generation
   - Partial runs should preserve existing data correctly

2. **Performance Testing:**
   - Measure time saved by skipping phases
   - Verify cache is working (second run with same skip should be faster)
   - Compare full generation vs. partial generation times

3. **Data Consistency:**
   - Terrain data (heights, biomes, rivers) should match between full and partial runs
   - Political data (states, cultures, burgs) should be absent when skipped
   - Partial runs should merge correctly with existing data

**Example Test Workflow:**

```javascript
// 1. Generate full map
initGenerator({ container });
loadOptions({ seed: 'test-42', mapWidth: 960, mapHeight: 540 });
const fullData = generateMap(Delaunator);
const fullTime = performance.now() - startTime;

// 2. Generate partial (terrain only)
loadOptions({ 
  seed: 'test-42', 
  skipPhases: [PHASES.CULTURES, PHASES.BURGS, PHASES.STATES] 
});
const partialData = generateMap(Delaunator);
const partialTime = performance.now() - startTime;

// 3. Compare results
console.log('Time saved:', fullTime - partialTime);
console.log('Terrain match:', 
  JSON.stringify(fullData.grid.cells.h) === JSON.stringify(partialData.grid.cells.h)
);
```

**Visual Diff Utility:**

A simple SVG comparison utility is available in `examples/svg-diff.js`:

```javascript
import { compareSVG, compareMapData } from './examples/svg-diff.js';

// Compare SVG outputs
const svgDiff = compareSVG(fullSVG, partialSVG);
console.log('SVG identical:', svgDiff.identical);

// Compare map data
const dataDiff = compareMapData(fullData, partialData);
console.log('Terrain match:', dataDiff.gridCellsMatch);
```

**Expected Results:**

- **Terrain Fidelity:** 100% match for same seed (heights, biomes, rivers identical)
- **Performance Gain:** 30-50% time savings when skipping political phases
- **Data Integrity:** Skipped phases produce empty/default data as expected
- **Cache Efficiency:** Second run with same skips uses cache (near-instant)

### Using Examples

The `examples/` directory contains HTML files for testing:

1. **`examples/canvas-preview.html`** - Full API demonstration with interactive controls
2. **`examples/headless-json.html`** - Headless JSON generation test
3. **`examples/godot-demo.html`** - Godot WebView integration pattern
4. **`examples/minimal-example.html`** - Minimal working example
5. **`examples/options-demo.html`** - Options showcase with live preview
6. **`examples/performance-test.html`** - Performance benchmarking

**Running Examples:**
```bash
npm run dev
# Then open http://localhost:5173/examples/canvas-preview.html
```

### Testing Seed Reproducibility

```javascript
// Test that same seed produces identical output
const seed = '42';
loadOptions({ seed, mapWidth: 960, mapHeight: 540 });
const data1 = generateMap(Delaunator);
const json1 = getMapData();

// Regenerate
loadOptions({ seed, mapWidth: 960, mapHeight: 540 });
const data2 = generateMap(Delaunator);
const json2 = getMapData();

// Compare (should be identical)
console.assert(JSON.stringify(json1) === JSON.stringify(json2), 'Reproducibility failed!');
```

### Unit Tests

```bash
npm test              # Run all tests
npm run test:watch   # Watch mode
npm run test:coverage # With coverage report
```

Tests are located in `tests/` and use Jest.

## Maintenance Notes

### Syncing with Upstream

The fork is based on [Azgaar's Fantasy-Map-Generator](https://github.com/Azgaar/Fantasy-Map-Generator). To sync with upstream:

1. **Add upstream remote** (if not already added):
   ```bash
   git remote add upstream https://github.com/Azgaar/Fantasy-Map-Generator.git
   ```

2. **Fetch upstream changes**:
   ```bash
   git fetch upstream
   ```

3. **Merge upstream master** (resolve conflicts in favor of our modular code):
   ```bash
   git merge upstream/master
   ```

4. **Test after merge**:
   - Generate map with seed 42 and default options
   - Compare data/SVG output to pre-merge
   - Verify no regressions

5. **Commit merge**:
   ```bash
   git commit -m "chore:sync-upstream - Merged latest Azgaar master (YYYY-MM-DD)"
   ```

**Current Upstream Sync Status:**
- Last checked: 2026-01-08
- Upstream repository: https://github.com/Azgaar/Fantasy-Map-Generator
- Latest upstream commit (as of Jan 2026): ~0feca43 from Jan 5, 2026
- Sync frequency: Monthly (recommended)

**Conflict Resolution Strategy:**
- Core generation algorithms: Preserve our modular ES6 implementations
- Options system: Keep our centralized validation/clamping
- Rendering: Prefer our SVG-first approach
- API: Maintain our stateful API design
- UI components: Upstream UI changes not applicable (we're headless)

### Archived Files

Vestigial files from the original upstream and early fork stages have been archived in `archive/` for cleanliness while preserving history/reference. See [`archive/README.md`](archive/README.md) for details.

**Archive Contents:**
- `archive/audits/` - Phase completion reports, investigation reports, audit documents
- `archive/tests/` - Test output files, test scripts, testing reports
- `archive/ui/` - Full upstream UI example (full-azgaar-ui)
- `archive/jsons/` - Sample JSON output files
- `archive/svgs/` - Sample SVG output files
- `archive/misc/` - Temporary files and artifacts

These files are no longer part of the active modular library but are preserved for reference.

## Known Limitations

### Rendering

- **Canvas rendering is deprecated** - Use SVG rendering (`renderPreviewSVG()`) instead
- **SVG rendering is production-ready** - Includes all layers: ocean, biomes, states, borders, rivers, burgs

### Data Generation

- **100% fidelity** with original Azgaar algorithms
- **Perfect seed reproducibility** - Same seed + options = identical output
- **All core features implemented** - Heightmap, biomes, cultures, states, burgs, rivers, religions, provinces

## License

MIT License - preserved from original Azgaar repository.

## Original Repository

Based on: https://github.com/Azgaar/Fantasy-Map-Generator
