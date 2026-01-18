/**
 * =============================================================================
 * gridAdapters.js
 * Desc: Adapters to map dual grid/sub-grids to Azgaar data formats for Genesis Mythos fork
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

import { createTypedArray } from '../utils/array.js';

/**
 * Adapt dual grid quads to Voronoi input format
 * Extracts quad centroids as points for Voronoi diagram generation
 * @param {Object} dualGrid - Dual grid structure {points, level0Quads, level1Quads, ...}
 * @param {Object} options - Generation options {mapWidth, mapHeight, cellsDesired}
 * @returns {Object} Adapted grid object compatible with Voronoi input
 *   {points: [[x, y], ...], mapWidth, mapHeight, cellsDesired, ...}
 */
export function adaptDualGridToVoronoiInput(dualGrid, options) {
  if (!dualGrid || !dualGrid.level0Quads) {
    throw new Error('Dual grid with level0Quads is required for adaptation');
  }

  const { level0Quads } = dualGrid;
  const { mapWidth, mapHeight, cellsDesired } = options;

  // Extract quad centroids as points for Voronoi
  // Use quad.center if available, otherwise calculate from quad.verts
  const points = [];
  const quadToPointIndex = new Map(); // Map quad index to point index

  for (const quad of level0Quads) {
    let centerPoint;
    
    if (quad.center && quad.center.x !== undefined && quad.center.y !== undefined) {
      // Use pre-calculated center
      centerPoint = [quad.center.x, quad.center.y];
    } else if (quad.verts && quad.verts.length > 0 && dualGrid.points) {
      // Calculate center from quad vertices
      const verts = quad.verts;
      let sumX = 0, sumY = 0;
      let validVerts = 0;
      
      for (const vertId of verts) {
        const point = dualGrid.points[vertId];
        if (point && (point.x !== undefined || point[0] !== undefined)) {
          const x = point.x !== undefined ? point.x : point[0];
          const y = point.y !== undefined ? point.y : point[1];
          sumX += x;
          sumY += y;
          validVerts++;
        }
      }
      
      if (validVerts > 0) {
        centerPoint = [sumX / validVerts, sumY / validVerts];
      }
    }
    
    if (centerPoint && centerPoint.length === 2) {
      const pointIndex = points.length;
      points.push(centerPoint);
      quadToPointIndex.set(quad.i, pointIndex);
    }
  }

  // Calculate spacing (approximate, based on desired cell count)
  const estimatedSpacing = Math.sqrt((mapWidth * mapHeight) / (points.length || cellsDesired));

  // Get boundary points (for Voronoi edge handling)
  // Use map bounds as boundary points
  const boundary = [
    [0, 0],
    [mapWidth, 0],
    [mapWidth, mapHeight],
    [0, mapHeight],
  ];

  return {
    points, // Quad centroids as Voronoi input points
    boundary, // Boundary points for Voronoi edge handling
    mapWidth,
    mapHeight,
    cellsDesired: points.length || cellsDesired, // Use actual point count
    spacing: estimatedSpacing,
    quadToPointIndex, // Mapping from quad index to point index (for later reference)
    dualGrid, // Keep reference to original dual grid
  };
}

/**
 * Adapt Voronoi grid to pack format
 * Merges adapted grid data into pack structure, preserving dual grid reference
 * @param {Object} adaptedGrid - Grid from adaptDualGridToVoronoiInput or Voronoi output
 * @param {Object} originalPack - Original pack object (may be null for initial creation)
 * @param {Object} options - Generation options
 * @returns {Object} Pack object with adapted data
 */
export function adaptToPackFormat(adaptedGrid, originalPack, options = {}) {
  if (!adaptedGrid || !adaptedGrid.cells) {
    // If adaptedGrid is not a Voronoi output yet, return original pack or empty structure
    return originalPack || {
      cells: { i: [], p: [], g: [], h: [] },
      vertices: { p: [], v: [], c: [] },
      features: [],
      burgs: [],
      states: [],
      rivers: [],
      cultures: [],
      religions: [],
      provinces: [],
    };
  }

  // adaptedGrid is already in Voronoi format (has cells, vertices)
  // Just ensure pack structure is compatible
  
  const pack = originalPack || {
    cells: { i: [], p: [], g: [], h: [], c: [], v: [], b: [] },
    vertices: { p: [], v: [], c: [] },
    features: [],
    burgs: [],
    states: [],
    rivers: [],
    cultures: [],
    religions: [],
    provinces: [],
  };

  // Ensure pack.cells has required arrays matching grid.cells
  const gridCells = adaptedGrid.cells;
  
  if (gridCells && gridCells.i) {
    // Copy cell indices if not already set
    if (!pack.cells.i || pack.cells.i.length !== gridCells.i.length) {
      pack.cells.i = Array.from(gridCells.i);
    }
    
    // Copy cell points if available
    if (adaptedGrid.points) {
      if (!pack.cells.p || pack.cells.p.length !== adaptedGrid.points.length) {
        pack.cells.p = adaptedGrid.points.map(p => Array.isArray(p) ? [...p] : [p.x, p.y]);
      }
    }
    
    // Copy neighbors if available
    if (gridCells.c) {
      if (!pack.cells.c || pack.cells.c.length !== gridCells.c.length) {
        pack.cells.c = gridCells.c.map(c => Array.isArray(c) ? [...c] : c);
      }
    }
    
    // Copy vertices if available
    if (gridCells.v) {
      if (!pack.cells.v || pack.cells.v.length !== gridCells.v.length) {
        pack.cells.v = gridCells.v.map(v => Array.isArray(v) ? [...v] : v);
      }
    }
    
    // Initialize height array if needed
    if (!pack.cells.h || pack.cells.h.length !== gridCells.i.length) {
      pack.cells.h = new Uint8Array(gridCells.i.length);
    }
  }

  // Copy vertices structure if available
  if (adaptedGrid.vertices) {
    pack.vertices = {
      p: adaptedGrid.vertices.p ? adaptedGrid.vertices.p.map(p => Array.isArray(p) ? [...p] : [p.x, p.y]) : [],
      v: adaptedGrid.vertices.v || [],
      c: adaptedGrid.vertices.c || [],
    };
  }

  // Preserve dual grid reference if present in adaptedGrid
  if (adaptedGrid.dualGrid) {
    // Store dual grid metadata in pack (for later use in rendering/phases)
    // Note: This is a reference, not a deep copy (for performance)
    pack.dualGridSource = adaptedGrid.dualGrid;
  }

  return pack;
}
