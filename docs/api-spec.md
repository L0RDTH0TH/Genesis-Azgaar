# API Specification

## Public API Functions

### `initGenerator({ canvas })`

Initializes the generator state. Stores optional canvas reference for rendering. Throws `InitializationError` if already initialized.

**Parameters:**
- `canvas` (HTMLCanvasElement | null): Optional canvas element for rendering previews

**Returns:** `void`

**Throws:** `InitializationError` if generator is already initialized

**Example:**
```javascript
import { initGenerator } from 'azgaar-genesis';

initGenerator({ canvas: document.getElementById('map') });
```

---

### `loadOptions(curatedParams)`

Merges provided params with defaults and updates internal options. Validates and clamps values to acceptable ranges.

**Parameters:**
- `curatedParams` (Partial<Options>): Partial options object (e.g., `{ seed: 42, mapWidth: 800 }`)

**Returns:** `void`

**Throws:** `InvalidOptionError` for invalid values (e.g., negative width, invalid template ID)

**Example:**
```javascript
import { loadOptions } from 'azgaar-genesis';

loadOptions({ 
  seed: 42,
  mapWidth: 1920,
  mapHeight: 1080,
  template: 'fantasy'
});
```

---

### `generateMap()`

Generates map data using internal options and stores it in state. Returns reference to generated data.

**Parameters:** None (uses internal options from `loadOptions()`)

**Returns:** `{ grid, pack, seed }` - Reference to generated map data

**Throws:** 
- `InitializationError` if `initGenerator()` not called
- `GenerationError` if generation fails (e.g., invalid options)

**Example:**
```javascript
import { generateMap } from 'azgaar-genesis';

const data = generateMap();
console.log(`Generated map with seed: ${data.seed}`);
```

---

### `getMapData()`

Returns structured JSON from stored data. Format is optimized for Godot import (flat JSON, no circular references).

**Parameters:** None

**Returns:** JSON object (see schema below)

**Throws:** 
- `InitializationError` if `initGenerator()` not called
- `NoDataError` if `generateMap()` not called yet

**Example:**
```javascript
import { getMapData } from 'azgaar-genesis';

const json = getMapData();
console.log(JSON.stringify(json, null, 2));
// Send to Godot via WebView bridge
```

---

### `renderPreview()`

Renders stored data to the initialized canvas. No-op if no canvas was provided during initialization.

**Parameters:** None

**Returns:** `void`

**Throws:** 
- `InitializationError` if `initGenerator()` not called
- `NoDataError` if `generateMap()` not called yet
- `NoCanvasError` if no canvas provided (only if rendering is explicitly required)

**Example:**
```javascript
import { renderPreview } from 'azgaar-genesis';

renderPreview();
// Map is now rendered to the canvas element
```

---

## getMapData() JSON Schema

```json
{
  "type": "object",
  "properties": {
    "seed": { 
      "type": "string",
      "description": "Seed used for generation (reproducible)"
    },
    "options": { 
      "type": "object",
      "description": "Full merged options object (all parameters used)"
    },
    "grid": {
      "type": "object",
      "description": "Grid-level data (Voronoi cells, heights, temperatures, etc.)",
      "properties": {
        "cells": {
          "type": "object",
          "description": "Cell data arrays",
          "properties": {
            "i": { "type": "array", "items": { "type": "number" } },
            "h": { "type": "array", "items": { "type": "number" }, "description": "Heights (0-100)" },
            "t": { "type": "array", "items": { "type": "number" }, "description": "Cell types (-1=ocean, 0=land, 1=coast)" },
            "temp": { "type": "array", "items": { "type": "number" }, "description": "Temperatures" },
            "prec": { "type": "array", "items": { "type": "number" }, "description": "Precipitation" },
            "f": { "type": "array", "items": { "type": "number" }, "description": "Feature IDs" },
            "b": { "type": "array", "items": { "type": "number" }, "description": "Biome IDs" }
          }
        },
        "points": { "type": "array", "description": "Cell center points [x, y]" },
        "vertices": { "type": "object", "description": "Voronoi vertices" },
        "features": { "type": "array", "description": "Grid-level features (oceans, islands)" }
      }
    },
    "pack": {
      "type": "object",
      "description": "Pack-level data (refined cells, political entities, etc.)",
      "properties": {
        "cells": {
          "type": "object",
          "description": "Pack cell data (similar structure to grid.cells)"
        },
        "burgs": { 
          "type": "array",
          "description": "Settlement data",
          "items": {
            "type": "object",
            "properties": {
              "i": { "type": "number" },
              "name": { "type": "string" },
              "x": { "type": "number" },
              "y": { "type": "number" },
              "cell": { "type": "number" },
              "state": { "type": "number" },
              "culture": { "type": "number" },
              "population": { "type": "number" }
            }
          }
        },
        "states": { 
          "type": "array",
          "description": "State/political entity data",
          "items": {
            "type": "object",
            "properties": {
              "i": { "type": "number" },
              "name": { "type": "string" },
              "color": { "type": "string" },
              "cells": { "type": "array", "items": { "type": "number" } },
              "capital": { "type": "number" }
            }
          }
        },
        "rivers": { 
          "type": "array",
          "description": "River paths",
          "items": {
            "type": "object",
            "properties": {
              "i": { "type": "number" },
              "cells": { "type": "array", "items": { "type": "number" } },
              "width": { "type": "number" }
            }
          }
        },
        "features": { 
          "type": "array",
          "description": "Pack-level features (lakes, islands, etc.)",
          "items": {
            "type": "object",
            "properties": {
              "i": { "type": "number" },
              "type": { "type": "string" },
              "vertices": { "type": "array", "items": { "type": "number" } }
            }
          }
        },
        "cultures": { "type": "array", "description": "Culture data" },
        "religions": { "type": "array", "description": "Religion data" },
        "provinces": { "type": "array", "description": "Province data" }
      }
    }
  },
  "required": ["seed", "grid", "pack"]
}
```

**Notes:**
- All arrays use TypedArrays where possible for efficiency
- Circular references are resolved (e.g., state.capital references burg index, not object)
- Internal temporary data (e.g., generation intermediates) is excluded
- Coordinates are in pixel space (0 to mapWidth/mapHeight)
- Heights are 0-100 (0-19 = ocean, 20+ = land)

---

## Error Types

### `InitializationError`
Thrown when API methods are called before `initGenerator()`, or when `initGenerator()` is called multiple times.

### `InvalidOptionError`
Thrown when `loadOptions()` receives invalid parameter values (e.g., negative dimensions, invalid template ID).

### `GenerationError`
Thrown when map generation fails (e.g., invalid internal state, generation algorithm error).

### `NoDataError`
Thrown when `getMapData()` or `renderPreview()` is called before `generateMap()`.

### `NoCanvasError`
Thrown when `renderPreview()` is called but no canvas was provided during initialization (only if rendering is explicitly required).

---

## Usage Flow

```javascript
import { 
  initGenerator, 
  loadOptions, 
  generateMap, 
  getMapData, 
  renderPreview 
} from 'azgaar-genesis';

// 1. Initialize (optional canvas for previews)
initGenerator({ canvas: document.getElementById('map') });

// 2. Load options (from Genesis Mythos JSON + clamping)
loadOptions({
  seed: 42,
  mapWidth: 1920,
  mapHeight: 1080,
  statesNumber: 20,
  cultures: 15
});

// 3. Generate map
const data = generateMap();

// 4. Get JSON for Godot
const json = getMapData();
// Send to Godot via WebView bridge...

// 5. Render preview (if canvas provided)
renderPreview();
```

---

## State Management

The generator uses a singleton pattern for internal state:

```javascript
{
  initialized: boolean,
  canvas: HTMLCanvasElement | null,
  options: Options,
  data: {
    grid: Grid,
    pack: Pack,
    seed: string
  } | null
}
```

- State is initialized by `initGenerator()`
- Options are updated by `loadOptions()`
- Data is generated and stored by `generateMap()`
- Multiple generators are not supported initially (singleton pattern)
