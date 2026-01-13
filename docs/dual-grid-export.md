# Exporting Dual-Grid Maps

## Overview

When `useDualGridPolitics` is enabled, the dual-grid data is automatically included in the exported JSON from `getMapData()`. This document explains the structure and usage.

## Enabling Dual-Grid Export

To generate a map with dual-grid politics:

```javascript
import { initGenerator, loadOptions, generateMap, getMapData } from 'azgaar-genesis';

// Initialize
initGenerator({ canvas: null });

// Load options with dual-grid enabled
loadOptions({
  seed: 'my-seed',
  useDualGridPolitics: true,
  politicsMode: {
    hexLayers: 20,
    relaxationIterations: 200,
    dampingFactor: 0.3,
    dissolveProbability: 0.5,
  },
});

// Generate map
const data = generateMap();

// Export JSON (includes dual-grid data)
const json = getMapData();
```

## Export Structure

The exported JSON includes a top-level flag and dual-grid data in `pack.dualGrid`:

```javascript
{
  seed: "my-seed",
  options: { ... },
  dualGridEnabled: true,  // Top-level flag
  pack: {
    // ... standard pack data ...
    dualGrid: {
      points: [
        { x: 100.5, y: 200.3 },
        // ... array of point objects
      ],
      level0Quads: [
        {
          i: 0,
          level: 0,
          verts: [0, 1, 2, 3],  // Point indices
          center: { x: 150.0, y: 250.0 },
          parentQuadId: null,
          childQuadIds: [0, 1, 2, 3],
          stateId: 1,
          provinceId: -1,
          patternId: "single",
          variantId: "basic",
        },
        // ... more quads
      ],
      level1Quads: [
        {
          i: 0,
          level: 1,
          verts: [4, 5, 6, 7],
          center: { x: 140.0, y: 240.0 },
          parentQuadId: 0,
          childQuadIds: null,
          stateId: 1,
          provinceId: -1,
          patternId: "single",
          variantId: "basic",
        },
        // ... more quads
      ],
      stateAssignments: {
        states: [
          {
            i: 1,
            name: "Capital1",
            capital: 1,
            center: 5,
            quads: [0, 1, 2],
          },
          // ... more states
        ],
        quadToState: [
          [0, 1],  // [quadId, stateId]
          [1, 1],
          // ... more mappings
        ],
      },
    },
  },
}
```

## Key Fields

### `dualGridEnabled` (top-level)
- **Type**: `boolean`
- **Description**: Indicates if dual-grid politics was used for this map
- **Usage**: Check this flag before accessing `pack.dualGrid`

### `pack.dualGrid.points`
- **Type**: `Array<{x: number, y: number}>`
- **Description**: All points in the dual-grid (vertices of quads)
- **Usage**: Render quad boundaries, calculate distances

### `pack.dualGrid.level0Quads`
- **Type**: `Array<QuadObject>`
- **Description**: Coarse-level quads (states level, ~100-150 quads)
- **Usage**: State boundaries, political regions

### `pack.dualGrid.level1Quads`
- **Type**: `Array<QuadObject>`
- **Description**: Fine-level quads (provinces level, ~400-600 quads)
- **Usage**: Province boundaries, detailed regions

### Quad Object Structure
```typescript
{
  i: number,              // Quad index
  level: number,          // 0 (states) or 1 (provinces)
  verts: number[],        // Point indices (4 for quads)
  center: {x, y},        // Quad center point
  parentQuadId: number | null,  // Parent quad (Level 1 → Level 0)
  childQuadIds: number[] | null, // Child quads (Level 0 → Level 1)
  stateId: number,        // Assigned state ID (-1 if unassigned)
  provinceId: number,     // Assigned province ID (-1 if unassigned)
  patternId: string | null,     // Pattern type (e.g., "single", "block_2x2")
  variantId: string | null,      // Visual variant (e.g., "basic", "fortified")
}
```

### `pack.dualGrid.stateAssignments`
- **Type**: `{states: Array, quadToState: Array}`
- **Description**: State assignment data
- **Usage**: Map quads to states, get state properties

## Usage in Godot

### Loading Dual-Grid Data

```gdscript
# Load JSON
var json = JSON.parse_string(json_string)
var dual_grid = json.pack.dual_grid

# Check if dual-grid is enabled
if json.dual_grid_enabled:
    print("Dual-grid politics enabled")
    
    # Access points
    var points = dual_grid.points
    print("Total points: ", points.size())
    
    # Access Level 0 quads (states)
    var level0_quads = dual_grid.level0_quads
    print("Level 0 quads (states): ", level0_quads.size())
    
    # Access Level 1 quads (provinces)
    var level1_quads = dual_grid.level1_quads
    print("Level 1 quads (provinces): ", level1_quads.size())
    
    # Get state assignments
    var states = dual_grid.state_assignments.states
    for state in states:
        print("State ", state.i, ": ", state.name, " (", state.quads.size(), " quads)")
```

### Rendering Quads

```gdscript
# Render Level 0 quads (state boundaries)
func render_state_quads(dual_grid):
    var level0_quads = dual_grid.level0_quads
    var points = dual_grid.points
    
    for quad in level0_quads:
        var verts = quad.verts
        var quad_points = []
        
        # Get actual point coordinates
        for vert_idx in verts:
            var point = points[vert_idx]
            quad_points.append(Vector2(point.x, point.y))
        
        # Draw quad (example with Line2D or Polygon2D)
        draw_quad(quad_points, quad.state_id)
```

### Accessing Variants

```gdscript
# Get variant for a quad
func get_quad_variant(quad):
    var pattern = quad.pattern_id
    var variant = quad.variant_id
    return {"pattern": pattern, "variant": variant}
```

## Sample Export

A complete sample export is available at:
- `samples/dual-grid-export.json` (generated by test script)

## Notes

- **Serialization**: All circular references are removed, TypedArrays are converted to regular arrays
- **Burg Mappings**: Burg dual-grid mappings (`dualGridPointId`, `dualQuadId`) are stored in `pack.burgs` array
- **Compatibility**: When `dualGridEnabled: false`, `pack.dualGrid` will be `null`
- **Size**: Dual-grid exports are larger than Voronoi-only exports (~20-30% more data)

## Future Enhancements

- Province mapping from Level 1 quads
- Pattern matching visualization data
- Relaxation statistics export
- Performance metrics
