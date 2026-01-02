/**
 * =============================================================================
 * regraph.js
 * Desc: Create pack (refined Voronoi) from grid
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

import { createTypedArray } from '../utils/array.js';
import * as d3 from 'd3';

/**
 * Create pack (refined Voronoi diagram) from grid
 * This creates a refined Voronoi diagram with only land and coastal cells
 * @param {Object} params - Generation parameters
 * @param {Object} params.grid - Grid object
 * @param {Object} params.options - Generation options
 * @param {Function} params.DelaunatorClass - Delaunator class (required)
 * @returns {Object} Pack object
 */
export function createPackFromGrid({ grid, options, DelaunatorClass }) {
  if (!DelaunatorClass) {
    throw new Error('Delaunator is required as a peer dependency for pack creation');
  }

  const { cells: gridCells, points, features, boundary } = grid;
  const newCells = { p: [], g: [], h: [] }; // Store new data
  const spacing2 = grid.spacing ** 2;

  // Filter cells: include land and coastal cells only
  for (const i of gridCells.i) {
    const height = gridCells.h[i];
    const type = gridCells.t[i];

    // Exclude deep ocean points
    if (height < 20 && type !== -1 && type !== -2) continue;
    // Exclude some deep ocean points
    if (type === -2 && (i % 4 === 0 || (features && features[gridCells.f[i]] && features[gridCells.f[i]].type === 'lake'))) continue;

    const [x, y] = points[i];
    addNewPoint(i, x, y, height);

    // Add additional points for cells along coast
    if ((type === 1 || type === -1) && !gridCells.b[i]) {
      if (gridCells.c[i]) {
        gridCells.c[i].forEach((e) => {
          if (i > e) return;
          if (gridCells.t[e] === type) {
            const dist2 = (points[i][1] - points[e][1]) ** 2 + (points[i][0] - points[e][0]) ** 2;
            if (dist2 < spacing2) return; // Too close
            const x1 = (points[i][0] + points[e][0]) / 2;
            const y1 = (points[i][1] + points[e][1]) / 2;
            addNewPoint(i, x1, y1, height);
          }
        });
      }
    }
  }

  function addNewPoint(i, x, y, height) {
    newCells.p.push([x, y]);
    newCells.g.push(i);
    newCells.h.push(height);
  }

  // Calculate Voronoi for pack cells
  const allPoints = newCells.p.concat(boundary);
  const delaunay = DelaunatorClass.from(allPoints);
  const Voronoi = d3.Delaunay.from(allPoints).voronoi([0, 0, options.mapWidth, options.mapHeight]);
  
  // Create pack cells structure
  const packCells = {
    i: createTypedArray({ maxValue: newCells.p.length, length: newCells.p.length }).map((_, i) => i),
    p: newCells.p,
    g: createTypedArray({ maxValue: grid.points.length, length: newCells.g.length }),
    h: createTypedArray({ maxValue: 100, length: newCells.h.length }),
    c: [], // Neighbors (will be populated)
    v: [], // Vertices (will be populated)
    b: new Uint8Array(newCells.p.length), // Border cells
    area: new Float32Array(newCells.p.length),
  };

  // Copy data
  for (let i = 0; i < newCells.g.length; i++) {
    packCells.g[i] = newCells.g[i];
    packCells.h[i] = newCells.h[i];
  }

  // Calculate cell neighbors and vertices from Voronoi
  const delaunayObj = d3.Delaunay.from(allPoints);
  for (let i = 0; i < newCells.p.length; i++) {
    const neighbors = delaunayObj.neighbors(i).filter((n) => n < newCells.p.length);
    packCells.c[i] = neighbors;
    
    // Get polygon vertices for this cell from Voronoi diagram
    const cellPolygon = Voronoi.renderCell(i);
    if (cellPolygon && cellPolygon.length > 0) {
      // Store polygon coordinates directly (array of [x, y] pairs)
      // This can be used directly for Canvas rendering
      packCells.v[i] = Array.from(cellPolygon).map(([x, y]) => [x, y]);
      
      // Calculate area from polygon
      packCells.area[i] = Math.abs(d3.polygonArea(cellPolygon));
    } else {
      // Fallback: no polygon (shouldn't happen, but handle gracefully)
      packCells.v[i] = [];
      packCells.area[i] = 1.0;
    }
  }

  // Mark border cells
  for (let i = 0; i < newCells.p.length; i++) {
    const [x, y] = newCells.p[i];
    if (x <= 0 || x >= options.mapWidth || y <= 0 || y >= options.mapHeight) {
      packCells.b[i] = 1;
    }
  }

  // Create vertices structure
  // For full rendering, polygon coordinates are stored directly in pack.cells.v[i]
  // This vertices structure is kept for compatibility with existing code
  // Note: For rendering, use pack.cells.v[i] directly instead of vertices
  const vertices = {
    p: allPoints.slice(0, newCells.p.length), // Keep for compatibility
    c: [], // Cells for each vertex (not fully populated, kept for compatibility)
  };

  const pack = {
    cells: packCells,
    vertices,
  };

  return pack;
}
