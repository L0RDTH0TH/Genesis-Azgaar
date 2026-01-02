/**
 * =============================================================================
 * regraph.js
 * Desc: Create pack (refined Voronoi) from grid
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

import { createTypedArray } from '../utils/array.js';
import * as d3 from 'd3';
import { Voronoi } from './voronoi.js';

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
  const delaunayObj = d3.Delaunay.from(allPoints);
  const voronoiDiagram = delaunayObj.voronoi([0, 0, options.mapWidth, options.mapHeight]);
  
  // Build full Voronoi vertex graph using Voronoi class
  // Note: Voronoi class expects Delaunator instance (from DelaunatorClass), not d3.Delaunay
  // The Voronoi class indexes cells by the original point index in allPoints
  // Since allPoints = [newCells.p (pack points), boundary], pack cell index i maps to allPoints index i
  const voronoiGraph = new Voronoi(delaunay, allPoints, newCells.p.length);
  
  // Create pack cells structure
  const packCells = {
    i: createTypedArray({ maxValue: newCells.p.length, length: newCells.p.length }).map((_, i) => i),
    p: newCells.p,
    g: createTypedArray({ maxValue: grid.points.length, length: newCells.g.length }),
    h: createTypedArray({ maxValue: 100, length: newCells.h.length }),
    c: [], // Neighbors (will be populated from voronoiGraph)
    v: [], // Vertex indices (for isoline rendering)
    vCoords: new Array(newCells.p.length), // Polygon coordinates (for canvas rendering) - pre-allocate array
    b: new Uint8Array(newCells.p.length), // Border cells
    area: new Float32Array(newCells.p.length),
  };

  // Copy data
  for (let i = 0; i < newCells.g.length; i++) {
    packCells.g[i] = newCells.g[i];
    packCells.h[i] = newCells.h[i];
  }

  // Populate cells from voronoiGraph (vertex indices and neighbors)
  // IMPORTANT: voronoiGraph.cells.v[i] is indexed by the point index in allPoints
  // Since allPoints = [newCells.p (0..newCells.p.length-1), boundary], 
  // pack cell index i directly maps to voronoiGraph.cells.v[i] for i < newCells.p.length
  let vCoordsPopulated = 0;
  let vPopulated = 0;
  for (let i = 0; i < newCells.p.length; i++) {
    // Get vertex indices for this cell (from voronoiGraph)
    // voronoiGraph.cells.v[i] should exist for pack cells (i < newCells.p.length)
    const cellVertices = voronoiGraph.cells.v[i];
    if (cellVertices && Array.isArray(cellVertices) && cellVertices.length > 0) {
      packCells.v[i] = cellVertices;
      vPopulated++;
    } else {
      packCells.v[i] = [];
    }
    
    // Get adjacent cells (from voronoiGraph)
    // Map adjacent cell indices: if neighbor index < newCells.p.length, it's a pack cell
    // Otherwise it's a boundary cell (skip it)
    const cellNeighbors = voronoiGraph.cells.c[i];
    if (cellNeighbors && Array.isArray(cellNeighbors)) {
      packCells.c[i] = cellNeighbors.filter(neibIdx => neibIdx < newCells.p.length);
    } else {
      packCells.c[i] = [];
    }
    
    // Get polygon coordinates for canvas rendering
    try {
      const cellPolygon = voronoiDiagram.renderCell(i);
      if (cellPolygon && cellPolygon.length > 0) {
        // Store polygon coordinates separately for canvas rendering
        packCells.vCoords[i] = Array.from(cellPolygon).map(([x, y]) => [x, y]);
        vCoordsPopulated++;
        
        // Calculate area from polygon
        packCells.area[i] = Math.abs(d3.polygonArea(cellPolygon));
      } else {
        // Fallback: convert vertex indices to coordinates if renderCell fails
        if (packCells.v[i] && packCells.v[i].length > 0 && voronoiGraph.vertices.p) {
          packCells.vCoords[i] = packCells.v[i]
            .map(vId => {
              const vertex = voronoiGraph.vertices.p[vId];
              return vertex && Array.isArray(vertex) ? [Math.round(vertex[0]), Math.round(vertex[1])] : null;
            })
            .filter(v => v !== null);
          if (packCells.vCoords[i].length > 0) {
            vCoordsPopulated++;
            packCells.area[i] = Math.abs(d3.polygonArea(packCells.vCoords[i]));
          } else {
            packCells.vCoords[i] = [];
            packCells.area[i] = 1.0;
          }
        } else {
          packCells.vCoords[i] = [];
          packCells.area[i] = 1.0;
        }
      }
    } catch (error) {
      // If renderCell throws, try fallback conversion
      if (packCells.v[i] && packCells.v[i].length > 0 && voronoiGraph.vertices.p) {
        packCells.vCoords[i] = packCells.v[i]
          .map(vId => {
            const vertex = voronoiGraph.vertices.p[vId];
            return vertex && Array.isArray(vertex) ? [Math.round(vertex[0]), Math.round(vertex[1])] : null;
          })
          .filter(v => v !== null);
        if (packCells.vCoords[i].length > 0) {
          vCoordsPopulated++;
          packCells.area[i] = Math.abs(d3.polygonArea(packCells.vCoords[i]));
        } else {
          packCells.vCoords[i] = [];
          packCells.area[i] = 1.0;
        }
      } else {
        packCells.vCoords[i] = [];
        packCells.area[i] = 1.0;
      }
    }
  }
  
  // Debug logging
  if (typeof console !== 'undefined' && console.log) {
    console.log('[regraph] Pack cells populated:', {
      totalCells: newCells.p.length,
      vCoordsPopulated,
      vPopulated,
      vCoordsPercent: ((vCoordsPopulated / newCells.p.length) * 100).toFixed(1) + '%',
      vPercent: ((vPopulated / newCells.p.length) * 100).toFixed(1) + '%',
    });
  }

  // Mark border cells
  for (let i = 0; i < newCells.p.length; i++) {
    const [x, y] = newCells.p[i];
    if (x <= 0 || x >= options.mapWidth || y <= 0 || y >= options.mapHeight) {
      packCells.b[i] = 1;
    }
  }

  // Create vertices structure from voronoiGraph
  // Round coordinates for optimization
  // Ensure all arrays are dense (no undefined entries)
  // Find the maximum vertex index that exists
  let maxVertexIndex = -1;
  for (let i = 0; i < voronoiGraph.vertices.p.length; i++) {
    if (voronoiGraph.vertices.p[i] !== undefined) {
      maxVertexIndex = Math.max(maxVertexIndex, i);
    }
  }
  
  const vertices = {
    p: [], // Vertex coordinates (rounded)
    v: [], // Adjacent vertices
    c: [], // Adjacent cells
  };
  
  // Populate vertices arrays, ensuring all indices are defined
  for (let i = 0; i <= maxVertexIndex; i++) {
    vertices.p[i] = voronoiGraph.vertices.p[i] 
      ? [Math.round(voronoiGraph.vertices.p[i][0]), Math.round(voronoiGraph.vertices.p[i][1])]
      : [0, 0]; // Fallback for missing entries
    vertices.v[i] = voronoiGraph.vertices.v[i] || []; // Adjacent vertices
    vertices.c[i] = voronoiGraph.vertices.c[i] || []; // Adjacent cells
  }

  const pack = {
    cells: packCells,
    vertices,
  };

  return pack;
}
