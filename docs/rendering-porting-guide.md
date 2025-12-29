# Rendering Porting Guide

This guide maps original Azgaar SVG-based rendering code to the new Canvas 2D implementation.

## Original to New Mapping

### Layer Order (Critical - Must Match Original)

The original Azgaar rendering order (from `main.js` lines 40-57) is:

1. **Ocean layers** (`#oceanLayers`) - Ocean base fill + depth layers
2. **Lakes** (`#lakes`) - Lake polygons
3. **Landmass** (`#landmass`) - Base land fill
4. **Texture** (`#texture`) - Optional texture overlay (masked to land)
5. **Terrain** (`#terrs`) - Heightmap shading (ocean + land heights)
6. **Biomes** (`#biomes`) - Biome color fills (masked to land)
7. **Cells** (`#cells`) - Grid overlay (optional)
8. **Features** (`#coastline`) - Coastline/island outlines
9. **Borders** (`#stateBorders`, `#provinceBorders`) - Political boundaries
10. **Burg icons** (`#burgIcons`) - Settlement markers
11. **Burg labels** (`#burgLabels`) - Settlement names
12. **State labels** (`#stateLabels`) - State names
13. **Markers** (`#markers`) - Custom markers

---

## Original Renderer Files → Canvas Functions

### Ocean Layers
**Original:** `modules/ocean-layers.js`, `main.js` (ocean base fill)

**Canvas Implementation:** `drawOceans(ctx, data)`

**Strategy:**
- Fill entire canvas with ocean base color (`#b4d2f3` from default.json)
- Draw ocean depth layers as paths (from `grid.cells` where `cells.t[i] < 0`)
- Use opacity for depth layers (0.4 / layer count)
- Path generation: Use D3 curveBasisClosed or reimplement in Canvas

**Key Code References:**
- `original/modules/ocean-layers.js` lines 1-65
- `original/main.js` lines 217-228 (ocean base)
- `original/styles/default.json` line 292 (`#oceanBase` fill)

---

### Lakes
**Original:** `modules/renderers/draw-features.js` (lake features)

**Canvas Implementation:** `drawLakes(ctx, data)`

**Strategy:**
- Iterate `pack.features` where `feature.type === "lake"`
- Draw polygon paths from `feature.vertices` (map to `pack.vertices.p`)
- Fill with lake color (freshwater vs saltwater groups)
- Use `getFeaturePath()` logic from original (simplify + clip)

**Key Code References:**
- `original/modules/renderers/draw-features.js` lines 19-24
- `original/modules/renderers/draw-features.js` lines 52-66 (`getFeaturePath`)

---

### Landmass
**Original:** `main.js` line 216 (landmass rect)

**Canvas Implementation:** `drawLandmass(ctx, data)`

**Strategy:**
- Fill entire canvas with land base color (`#eef6fb` from default.json)
- This is the base layer; ocean/lakes will be drawn on top

**Key Code References:**
- `original/main.js` line 216
- `original/styles/default.json` line 94 (`#landmass` fill)

---

### Texture
**Original:** `#texture` layer with mask

**Canvas Implementation:** `drawTexture(ctx, data)` (optional)

**Strategy:**
- Load texture image (e.g., `./images/textures/plaster.jpg`)
- Apply as overlay with opacity (0.2 default)
- Mask to land only (use `globalCompositeOperation = 'destination-in'` with land mask)
- Can be simplified or skipped initially

**Key Code References:**
- `original/styles/default.json` lines 270-277 (`#texture`)

---

### Terrain/Heightmap
**Original:** `modules/renderers/draw-heightmap.js`

**Canvas Implementation:** `drawHeightmap(ctx, data)`

**Strategy:**
- Draw ocean height layers (0-19) with color gradients
- Draw land height layers (20-100) with color gradients
- Use color scheme from style (e.g., `getColorScheme()`)
- Path generation: Connect vertices at same height level
- Use `connectVertices()` logic from original

**Key Code References:**
- `original/modules/renderers/draw-heightmap.js` (full file)
- `original/utils/graphUtils.js` lines 314-336 (`drawHeights`)

---

### Biomes
**Original:** Biome fills (masked to land)

**Canvas Implementation:** `drawBiomes(ctx, data)`

**Strategy:**
- Iterate `pack.cells` and fill each cell polygon with biome color
- Use `pack.cells.b[i]` for biome ID, lookup color from biome data
- Apply land mask (only draw cells where `cells.t[i] >= 0`)

**Key Code References:**
- Biome colors from `core/biomes.js` (getDefaultBiomes)

---

### Features/Coastline
**Original:** `modules/renderers/draw-features.js` (coastline groups)

**Canvas Implementation:** `drawCoastline(ctx, data)`

**Strategy:**
- Draw coastline paths from `pack.features` (islands, sea islands)
- Stroke paths (no fill)
- Use `getFeaturePath()` for path generation

**Key Code References:**
- `original/modules/renderers/draw-features.js` lines 29-32

---

### Borders
**Original:** `modules/renderers/draw-borders.js`

**Canvas Implementation:** `drawBorders(ctx, data)`

**Strategy:**
- Draw state borders (stroke paths)
- Draw province borders (stroke paths, thinner)
- Use border color from style (`#56566d` default)

**Key Code References:**
- `original/styles/default.json` lines 20-35 (border styles)

---

### Burg Icons
**Original:** `modules/renderers/draw-burg-icons.js`

**Canvas Implementation:** `drawBurgIcons(ctx, data)`

**Strategy:**
- Iterate `pack.burgs`
- Draw circle/icon at `burg.x, burg.y`
- Size based on population or type
- Use icon color from style

**Key Code References:**
- `original/modules/renderers/draw-burg-icons.js`

---

### Burg Labels
**Original:** `modules/renderers/draw-burg-labels.js`

**Canvas Implementation:** `drawBurgLabels(ctx, data)`

**Strategy:**
- Draw text labels at burg positions
- Font size based on population
- Use label style from config

**Key Code References:**
- `original/modules/renderers/draw-burg-labels.js`

---

### State Labels
**Original:** `modules/renderers/draw-state-labels.js`

**Canvas Implementation:** `drawStateLabels(ctx, data)`

**Strategy:**
- Draw state names at state center positions
- Use state label style

**Key Code References:**
- `original/modules/renderers/draw-state-labels.js`

---

## D3 Path Generation Strategy

The original code uses D3 for path generation (e.g., `d3.line().curve(d3.curveBasisClosed)`).

**Options:**
1. **Use D3 as peer dependency** (recommended for complex curves):
   - Import D3 in rendering module
   - Generate path string with D3
   - Use `ctx.path(new Path2D(d3PathString))` to draw

2. **Reimplement in Canvas** (for lightweight bundle):
   - Implement basic curve algorithms (Bézier curves)
   - More work but smaller bundle

**Recommendation:** Start with D3 as peer dep, document reimplementation as future optimization.

---

## Style Constants Extraction

Extract color/style constants from original:

**From `original/styles/default.json`:**
- Ocean base: `#b4d2f3`
- Land base: `#eef6fb`
- State borders: `#56566d`, stroke-width 1, dasharray 2
- Province borders: `#56566d`, stroke-width 0.5, dasharray "0 2"
- Grid overlay: `#808080`, stroke-width 0.1

**From `original/modules/renderers/draw-heightmap.js`:**
- Height color schemes (getColorScheme function)
- Terracing logic

**Implementation:**
- Create `src/rendering/styles.js` with constants
- Or import from original style JSON files

---

## Canvas Drawing Techniques

### Polygon Drawing
```javascript
// Draw cell polygon
ctx.beginPath();
const vertices = cell.vertices.map(v => pack.vertices.p[v]);
ctx.moveTo(vertices[0][0], vertices[0][1]);
for (let i = 1; i < vertices.length; i++) {
  ctx.lineTo(vertices[i][0], vertices[i][1]);
}
ctx.closePath();
ctx.fill();
```

### Path from D3
```javascript
// If using D3
const d3Path = d3.line().curve(d3.curveBasisClosed)(points);
const path2d = new Path2D(d3Path);
ctx.fill(path2d);
```

### Masking
```javascript
// Mask to land only
ctx.save();
ctx.globalCompositeOperation = 'destination-in';
// Draw land mask
ctx.restore();
```

### Layering
```javascript
// Draw layers in order (bottom to top)
drawOceans(ctx, data);
drawLakes(ctx, data);
drawLandmass(ctx, data);
drawHeightmap(ctx, data);
drawBiomes(ctx, data);
// ... etc
```

---

## Performance Considerations

1. **Batch operations**: Group similar draws (e.g., all biome fills in one loop)
2. **Path caching**: Cache Path2D objects for repeated draws
3. **Simplification**: Use `simplifyLine()` from original for path reduction
4. **Clipping**: Use `clipPoly()` from original to clip paths to canvas bounds
5. **TypedArrays**: Use TypedArrays for cell iteration (faster than regular arrays)

---

## Testing Strategy

1. **Incremental testing**: Test each layer separately with fixed seed 42
2. **Visual comparison**: Compare canvas output to original Azgaar SVG output
3. **Data validation**: Ensure rendered cells match data (e.g., biome colors match biome IDs)
4. **Performance profiling**: Use Chrome DevTools to profile rendering time

---

## Implementation Order (Phase 3.1)

1. **Ocean layers** (base fill + depth layers)
2. **Lakes** (feature polygons)
3. **Landmass** (base fill)
4. **Texture** (optional, can skip initially)

Subsequent layers (heightmap, biomes, borders, etc.) will be added in later iterations.
