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

  // Calculate Voronoi for pack cells (matches original calculateVoronoi)
  const allPoints = newCells.p.concat(boundary);
  const delaunay = DelaunatorClass.from(allPoints);
  const voronoiGraph = new Voronoi(delaunay, allPoints, newCells.p.length);
  
  // Create pack cells structure
  const packCells = {
    i: createTypedArray({ maxValue: newCells.p.length, length: newCells.p.length }).map((_, i) => i),
    p: newCells.p,
    g: createTypedArray({ maxValue: grid.points.length, length: newCells.g.length }),
    h: createTypedArray({ maxValue: 100, length: newCells.h.length }),
    c: new Array(newCells.p.length), // Neighbors (from Voronoi class)
    v: new Array(newCells.p.length), // Vertex indices (from Voronoi class - for isoline rendering)
    vCoords: new Array(newCells.p.length), // Polygon coordinates (for canvas rendering)
    b: new Uint8Array(newCells.p.length), // Border cells
    area: new Float32Array(newCells.p.length),
  };

  // Copy data
  for (let i = 0; i < newCells.g.length; i++) {
    packCells.g[i] = newCells.g[i];
    packCells.h[i] = newCells.h[i];
  }
  
  // Use Voronoi diagram for polygon coordinates (for canvas rendering)
  const delaunayObj = d3.Delaunay.from(allPoints);
  const voronoiDiagram = delaunayObj.voronoi([0, 0, options.mapWidth, options.mapHeight]);

  // STEP 1: Use Voronoi class vertices directly (matches original calculateVoronoi approach)
  // voronoiGraph.vertices contains vertices with exactly 3 adjacent vertices each (triangle centers)
  // voronoiGraph.cells.v[i] contains vertex indices (triangle IDs) for cell i
  
  // Populate packCells.v and packCells.c from Voronoi graph (for isoline rendering)
  for (let i = 0; i < newCells.p.length; i++) {
    // Use Voronoi cell vertices directly (these are triangle indices into vertices)
    packCells.v[i] = voronoiGraph.cells.v[i] || [];
    
    // Use Voronoi cell neighbors
    const cellNeighbors = voronoiGraph.cells.c[i];
    if (cellNeighbors && Array.isArray(cellNeighbors)) {
      packCells.c[i] = cellNeighbors.filter(neibIdx => neibIdx < newCells.p.length);
    } else {
      packCells.c[i] = [];
    }
  }
  
  // STEP 2: Populate vCoords from polygons (for canvas rendering)
  let vCoordsPopulated = 0;
  for (let i = 0; i < newCells.p.length; i++) {
    try {
      const cellPolygon = voronoiDiagram.cellPolygon(i);
      if (cellPolygon && cellPolygon.length > 0) {
        const roundedPoly = cellPolygon.map((point) => {
          if (Array.isArray(point) && point.length >= 2) {
            return [Math.round(point[0]), Math.round(point[1])];
          }
          return null;
        }).filter(p => p !== null);
        
        if (roundedPoly.length > 0) {
          packCells.vCoords[i] = roundedPoly;
          packCells.area[i] = Math.abs(d3.polygonArea(roundedPoly));
          vCoordsPopulated++;
        } else {
          packCells.vCoords[i] = [];
          packCells.area[i] = 1.0;
        }
      } else {
        packCells.vCoords[i] = [];
        packCells.area[i] = 1.0;
      }
    } catch (error) {
      packCells.vCoords[i] = [];
      packCells.area[i] = 1.0;
      if (typeof console !== 'undefined' && console.warn) {
        console.warn(`[regraph] Cell ${i} failed to render polygon:`, error.message);
      }
    }
  }
  
  // STEP 3: Mark border cells
  for (let i = 0; i < newCells.p.length; i++) {
    const [x, y] = newCells.p[i];
    if (x <= 0 || x >= options.mapWidth || y <= 0 || y >= options.mapHeight) {
      packCells.b[i] = 1;
    }
  }
  
  // STEP 4: Use Voronoi vertices directly (guarantees exactly 3 adjacent vertices)
  const vertices = voronoiGraph.vertices;
  
  // Debug logging
  if (typeof console !== 'undefined' && console.log) {
    console.log('[regraph] Pack cells populated (Voronoi vertices):', {
      totalCells: newCells.p.length,
      verticesCount: vertices.p.length,
      vCoordsPopulated,
      vCoordsPercent: ((vCoordsPopulated / newCells.p.length) * 100).toFixed(1) + '%',
      sampleVCoords: packCells.vCoords[0]?.length || 0,
      sampleV: packCells.v[0]?.length || 0,
      sampleVerticesV: vertices.v[0]?.length || 0,
    });
  }

  // Final verification before returning pack
  if (typeof console !== 'undefined' && console.log) {
    console.log('[regraph:lifecycle] Before pack creation:', {
      packCellsHasV: 'v' in packCells,
      packCellsHasVCoords: 'vCoords' in packCells,
      packCellsVType: typeof packCells.v,
      packCellsVIsArray: Array.isArray(packCells.v),
      packCellsVLength: packCells.v?.length,
      packCellsVCoordsType: typeof packCells.vCoords,
      packCellsVCoordsIsArray: Array.isArray(packCells.vCoords),
      packCellsVCoordsLength: packCells.vCoords?.length,
      packCellsKeys: Object.keys(packCells),
      v0Exists: packCells.v?.[0] !== undefined,
      vCoords0Exists: packCells.vCoords?.[0] !== undefined,
      v0Sample: packCells.v?.[0] ? JSON.stringify(packCells.v[0].slice(0, 3)) : 'undefined',
      vCoords0Sample: packCells.vCoords?.[0] ? JSON.stringify(packCells.vCoords[0].slice(0, 2)) : 'undefined',
    });
  }

  const pack = {
    cells: packCells,
    vertices,
  };

  // Verify pack structure after creation
  if (typeof console !== 'undefined' && console.log) {
    console.log('[regraph:lifecycle] After pack creation, before return:', {
      packHasCells: 'cells' in pack,
      packCellsHasV: pack.cells && 'v' in pack.cells,
      packCellsHasVCoords: pack.cells && 'vCoords' in pack.cells,
      packCellsVType: typeof pack.cells?.v,
      packCellsVIsArray: Array.isArray(pack.cells?.v),
      packCellsVLength: pack.cells?.v?.length,
      packCellsVCoordsLength: pack.cells?.vCoords?.length,
      packCellsV0Sample: pack.cells?.v?.[0] ? JSON.stringify(pack.cells.v[0].slice(0, 3)) : 'undefined',
      packCellsVCoords0Sample: pack.cells?.vCoords?.[0] ? JSON.stringify(pack.cells.vCoords[0].slice(0, 2)) : 'undefined',
    });
  }

  return pack;
}
