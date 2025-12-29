# Azgaar Genesis Fork

**Modular JavaScript library fork of Azgaar's Fantasy Map Generator for Genesis Mythos integration**

## Overview

This is a fork of [Azgaar's Fantasy Map Generator](https://github.com/Azgaar/Fantasy-Map-Generator) refactored into a modular, importable JavaScript library. The primary goal is seamless integration into Genesis Mythos' WebView-based world builder GUI (godot_wry + Alpine.js).

## Current Status

**Phase 1: Setup & Initial Fork** ✅ Complete

- Fork structure created
- Upstream repository cloned into `original/` for reference
- Target directory structure established
- Build configuration initialized

## Target Public API

```javascript
import { initGenerator, generateMap, renderPreview, getMapData, loadOptions } from 'azgaar-library';

// Initialize with optional canvas for previews
initGenerator({ canvas: myCanvasElement });

// Load options from Genesis Mythos JSON with clamping
loadOptions(curatedParams);

// Generate map (sync or async)
generateMap();

// Get structured data for Godot consumption
const mapData = getMapData();

// Render preview if canvas provided
renderPreview();
```

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

## Next Steps

- **Phase 2**: Modularization - Extract core generation to `src/core/`
- **Phase 3**: Rendering Control - Allow passing canvas for previews
- **Phase 4**: Integration Testing - Build bundle and test in Genesis Mythos
