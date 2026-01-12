# Full UI Port - Step 1: Core Structure

This directory contains the initial port of the Azgaar Fantasy Map Generator UI to the Azgaar Genesis fork.

## Overview

This is **Step 1** of the full UI port, focusing on core structure and basic functionality:

- ✅ Basic HTML structure with SVG container and UI panel placeholders
- ✅ Core initialization and map generation
- ✅ Layer presets and toggling (adapted to use fork's `renderConfig` API)
- ✅ Style presets (adapted to use fork's `renderConfig` API)
- ✅ Basic controls: "New Map" and "Reset Zoom"

## Files

- `index.html` - Main HTML file with sidebar UI and map container
- `full-ui.js` - Main application script with initialization and controls
- `ui/layers.js` - Layer presets and toggling module (ported and adapted)
- `ui/styles.js` - Style presets module (ported and adapted)
- `styles/*.json` - Style preset JSON files (copied from original)

## Usage

1. Make sure the bundle is built:
   ```bash
   cd azgaar-genesis-fork
   npm run build
   ```

2. Start a local web server:
   ```bash
   python3 -m http.server 8000
   # or
   npx serve
   ```

3. Open in browser:
   ```
   http://localhost:8000/examples/full-ui/
   ```

4. Click "Generate & Render" or wait for automatic generation on load

## Key Adaptations

### Layers Module (`ui/layers.js`)

**Original behavior**: Directly manipulated DOM SVG elements (e.g., `biomes.selectAll("path").remove()`)

**Fork adaptation**: Uses `renderConfig` API to toggle layers:
- `layers.biomes.enabled = true/false`
- `layers.states.enabled = true/false`
- `layers.rivers.enabled = true/false`
- etc.

When a layer is toggled, the entire map is re-rendered with the updated `renderConfig`.

### Styles Module (`ui/styles.js`)

**Original behavior**: Applied style JSON directly to DOM SVG elements via selectors (e.g., `#biomes`, `#statesBody`)

**Fork adaptation**: Converts original style JSON format to `renderConfig` format:
- Color mappings: `#oceanBase.fill` → `colors.oceanBase`
- Opacity mappings: `#biomes.opacity` → `layers.biomes.opacity`
- Effect mappings: `#texture.data-href` → `effects.parchment.textureUrl`

When a style preset is applied, the map is re-rendered with the new `renderConfig`.

## Layer Presets

Available presets:
- **Political**: Borders, burg icons, labels, rivers, routes, states, scale bar
- **Cultural**: Cultures layer plus political elements
- **Religions**: Religions layer plus political elements
- **Provinces**: Provinces layer plus borders
- **Biomes**: Biomes, ice, rivers, scale bar
- **Heightmap**: Height layer, rivers, vignette
- **Physical**: Coordinates, height, ice, rivers
- **POI**: Point of interest layers (borders, markers, etc.)
- **Military**: Military units plus political elements
- **Emblems**: State/province emblems
- **Landmass**: Basic landmass only

## Style Presets

Available presets (from original):
- **default**: Standard vibrant colors
- **ancient**: Parchment-style with sepia tones (like parchment-rendering.html)
- **gloom**: Dark, muted colors
- **pale**: Light, pastel colors
- **light**: Bright, clean colors
- **watercolor**: Soft, artistic colors
- **clean**: Minimal, clean aesthetic
- **atlas**: Map-like appearance
- **darkSeas**: Dark ocean colors
- **cyberpunk**: Neon, futuristic colors
- **night**: Dark mode
- **monochrome**: Grayscale

## Testing

### Basic Functionality

1. **Map Generation**:
   - On load, map should generate automatically with seed 42
   - "New Map" button should generate a new random map

2. **Layer Toggling**:
   - Select a layer preset (e.g., "Political")
   - Click individual layer buttons to toggle them
   - Map should re-render with updated layers

3. **Style Presets**:
   - Select a style preset (e.g., "Ancient")
   - Map should re-render with parchment-like appearance
   - Colors should change to sepia tones

4. **Reset Zoom**:
   - Zoom/pan the map
   - Click "Reset Zoom" to fit viewBox

## Known Limitations (Step 1)

- **Options panel**: Placeholder only (coming in Step 2)
- **Tools panel**: Placeholder only (coming in Step 2)
- **Layer mapping**: Some layers (ice, cultures, religions, provinces, markers, military, emblems) may not be fully mapped in renderConfig yet
- **Style conversion**: Not all style JSON attributes are converted to renderConfig (only core colors, opacities, and effects)

## Next Steps (Step 2)

- Port Options panel
- Port Tools panel
- Complete layer mapping for all layers
- Complete style conversion for all style attributes
- Add zoom/pan controls
- Add export functionality

## Differences from Original

1. **No DOM manipulation**: Fork uses `renderConfig` API instead of directly manipulating SVG DOM elements
2. **Full re-render**: Each layer/style change triggers a complete re-render (instead of incremental DOM updates)
3. **Modular structure**: UI modules are separate ES6 modules (instead of global functions)
4. **No D3.js dependency**: Fork doesn't rely on D3 for DOM manipulation (uses vanilla JS)

## API Usage

The port demonstrates how to use the fork's API:

```javascript
// Initialize
initGenerator({ container: document.getElementById('map') });

// Load options
loadOptions({ seed: '42', mapWidth: 1200, mapHeight: 800 });

// Generate map
const data = generateMap(Delaunator);

// Get render config
const config = getDefaultRenderConfig();

// Modify config
config.layers.biomes.enabled = false;
config.colors.oceanBase = '#d2b48c';

// Render
renderPreviewSVG({ 
  width: 1200, 
  height: 800, 
  container: mapContainer,
  renderConfig: config 
});
```
