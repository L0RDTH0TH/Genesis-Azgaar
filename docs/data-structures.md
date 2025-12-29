# Data Structures Documentation

This document describes the core data structures used in the Azgaar Genesis Fork map generator.

## Overview

The map generation process uses two main data structures:
- **`grid`**: Initial Voronoi graph with base heightmap and climate data
- **`pack`**: Packed graph with all generated features (cultures, states, burgs, etc.)

## Grid Structure

The `grid` object represents the initial Voronoi diagram and base map data.

```javascript
{
  seed: string,                    // Generation seed
  spacing: number,                 // Grid spacing
  cellsDesired: number,            // Target number of cells
  cellsX: number,                  // Number of cells in X direction
  cellsY: number,                  // Number of cells in Y direction
  boundary: Array<[number, number]>, // Boundary polygon points
  points: Array<[number, number]>, // Voronoi cell center points
  features: Array<Feature>,        // Geographic features (oceans, continents)
  cells: {
    i: Uint32Array,                // Cell indices
    v: Array<Array<number>>,       // Cell vertices (polygon points)
    c: Array<Array<number>>,      // Cell centers
    b: Array<number>,              // Cell boundaries
    f: Uint16Array,                // Feature IDs
    t: Uint8Array,                 // Cell types
    h: Uint8Array,                 // Heights (0-100)
    temp: Int8Array,                // Temperature (-128 to 127)
    prec: Uint8Array               // Precipitation (0-255)
  },
  vertices: {
    i: Uint32Array,                // Vertex indices
    p: Array<[number, number]>,   // Vertex positions
    v: Array<Array<number>>,       // Vertices connected to this vertex
    c: Array<Array<number>>        // Cells connected to this vertex
  }
}
```

## Pack Structure

The `pack` object contains the packed graph with all generated features.

```javascript
{
  cells: {
    i: Uint32Array,                // Cell indices
    v: Array<Array<number>>,       // Cell vertices
    c: Array<Array<number>>,       // Cell centers
    p: Array<[number, number]>,   // Cell positions
    g: Uint8Array,                 // Cell groups
    h: Uint8Array,                 // Heights
    area: Float32Array,            // Cell areas
    f: Uint16Array,                // Feature IDs
    t: Uint8Array,                 // Cell types
    haven: Uint8Array,             // Harbor flags
    harbor: Uint8Array,            // Harbor types
    fl: Uint16Array,               // Flux values
    r: Uint16Array,                // River IDs
    conf: Uint8Array,              // Confinement values
    biome: Uint8Array,             // Biome IDs
    s: Uint16Array,                // State IDs
    pop: Float32Array,             // Population
    culture: Uint16Array,           // Culture IDs
    burg: Uint16Array,             // Burg IDs
    routes: Object,                // Route data (keyed by cell ID)
    state: Uint16Array,            // State assignments
    province: Uint16Array,         // Province assignments
    religion: Uint16Array          // Religion assignments
  },
  vertices: {
    i: Uint32Array,                // Vertex indices
    p: Array<[number, number]>,   // Vertex positions
    v: Array<Array<number>>,       // Connected vertices
    c: Array<Array<number>>        // Connected cells
  },
  features: Array<Feature>,         // Geographic features
  cultures: Array<Culture>,         // Generated cultures
  burgs: Array<Burg>,              // Settlements
  states: Array<State>,            // Political states
  provinces: Array<Province>,       // Administrative provinces
  religions: Array<Religion>,       // Religions
  rivers: Array<River>,             // River systems
  routes: Array<Route>,            // Trade routes
  zones: Array<Zone>                // Special zones
}
```

## Feature Structure

Geographic features (oceans, continents, islands, etc.)

```javascript
{
  i: number,                       // Feature ID
  land: boolean,                   // Is land feature
  border: boolean,                 // Is border feature
  type: string,                    // Feature type
  cells: Array<number>,            // Cell IDs in this feature
  area: number,                    // Feature area
  // ... additional properties
}
```

## Culture Structure

```javascript
{
  i: number,                       // Culture ID
  name: string,                    // Culture name
  base: number,                     // Namebase ID
  expansionism: number,            // Expansion tendency
  color: string,                   // Display color
  // ... additional properties
}
```

## Burg Structure

Settlements (towns, cities, villages)

```javascript
{
  i: number,                       // Burg ID
  name: string,                    // Burg name
  cell: number,                    // Cell ID
  x: number,                       // X coordinate
  y: number,                        // Y coordinate
  population: number,              // Population
  type: string,                    // Burg type (town, city, etc.)
  capital: number,                 // State ID if capital
  port: boolean,                   // Is port
  // ... additional properties
}
```

## State Structure

Political states/kingdoms

```javascript
{
  i: number,                       // State ID
  name: string,                    // State name
  fullName: string,                // Full formal name
  capital: number,                 // Capital burg ID
  culture: number,                 // Primary culture ID
  type: string,                    // Government type
  area: number,                    // State area
  population: number,              // Total population
  // ... additional properties
}
```

## Province Structure

Administrative provinces

```javascript
{
  i: number,                       // Province ID
  name: string,                    // Province name
  state: number,                   // Parent state ID
  center: number,                  // Center cell ID
  // ... additional properties
}
```

## River Structure

```javascript
{
  i: number,                       // River ID
  source: number,                  // Source cell ID
  mouth: number,                   // Mouth cell ID
  cells: Array<number>,            // Cell IDs along river
  length: number,                  // River length
  width: number,                   // River width
  // ... additional properties
}
```

## Notes

- All arrays indexed by cell/vertex ID use TypedArrays for memory efficiency
- IDs start at 1 (0 is reserved for "no assignment")
- Coordinates are in pixel space (0 to graphWidth/Height)
- Heights are normalized 0-100 (20 is sea level)
- Temperature is in Celsius (-128 to 127)
- Population is stored as float for precision

## Export Format

When exporting to JSON for Godot consumption, TypedArrays are converted to regular arrays:

```javascript
{
  grid: {
    // ... grid data with arrays instead of TypedArrays
  },
  pack: {
    // ... pack data with arrays instead of TypedArrays
  },
  seed: string,
  options: Object,                 // Generation options used
  metadata: {
    version: string,
    timestamp: string
  }
}
```
