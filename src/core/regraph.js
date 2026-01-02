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
  
  // Create pack cells structure
  // IMPORTANT: Initialize v and vCoords as arrays with proper length to ensure they're dense arrays
  const packCells = {
    i: createTypedArray({ maxValue: newCells.p.length, length: newCells.p.length }).map((_, i) => i),
    p: newCells.p,
    g: createTypedArray({ maxValue: grid.points.length, length: newCells.g.length }),
    h: createTypedArray({ maxValue: 100, length: newCells.h.length }),
    c: new Array(newCells.p.length), // Neighbors (will be populated from Voronoi class)
    v: new Array(newCells.p.length), // Vertex indices (for isoline rendering) - will be populated from polygons
    vCoords: new Array(newCells.p.length), // Polygon coordinates (for canvas rendering)
    b: new Uint8Array(newCells.p.length), // Border cells
    area: new Float32Array(newCells.p.length),
  };

  // Copy data
  for (let i = 0; i < newCells.g.length; i++) {
    packCells.g[i] = newCells.g[i];
    packCells.h[i] = newCells.h[i];
  }

  // STEP 1: Collect all unique vertices from all cell polygons
  // This creates a dense vertex array indexed sequentially (0, 1, 2, ...)
  const uniqueVertices = new Map(); // key: "x,y" -> value: [x, y]
  
  for (let i = 0; i < newCells.p.length; i++) {
    try {
      const cellPolygon = voronoiDiagram.renderCell(i);
      if (cellPolygon && cellPolygon.length > 0) {
        // Round coordinates and collect unique vertices
        cellPolygon.forEach(([x, y]) => {
          const rx = Math.round(x);
          const ry = Math.round(y);
          const key = `${rx},${ry}`;
          if (!uniqueVertices.has(key)) {
            uniqueVertices.set(key, [rx, ry]);
          }
        });
      }
    } catch (error) {
      // Skip cells that fail to render
      continue;
    }
  }
  
  // STEP 2: Create dense vertex array and index mapping
  const verticesP = Array.from(uniqueVertices.values());
  const verticesIndexMap = new Map();
  verticesP.forEach((vertex, index) => {
    verticesIndexMap.set(`${vertex[0]},${vertex[1]}`, index);
  });
  
  // STEP 3: Populate cell data (vCoords and v) from polygons
  let vCoordsPopulated = 0;
  let vPopulated = 0;
  
  for (let i = 0; i < newCells.p.length; i++) {
    try {
      const cellPolygon = voronoiDiagram.renderCell(i);
      if (cellPolygon && cellPolygon.length > 0) {
        // Round polygon coordinates
        const roundedPoly = Array.from(cellPolygon).map(([x, y]) => [Math.round(x), Math.round(y)]);
        
        // Store polygon coordinates for canvas rendering
        packCells.vCoords[i] = roundedPoly;
        vCoordsPopulated++;
        
        // Map polygon coordinates to vertex indices for isoline rendering
        packCells.v[i] = roundedPoly.map(p => {
          const key = `${p[0]},${p[1]}`;
          return verticesIndexMap.get(key);
        }).filter(idx => idx !== undefined);
        
        if (packCells.v[i].length > 0) {
          vPopulated++;
        }
        
        // Calculate area from polygon
        packCells.area[i] = Math.abs(d3.polygonArea(roundedPoly));
      } else {
        // Degenerate cell - no polygon
        packCells.vCoords[i] = [];
        packCells.v[i] = [];
        packCells.area[i] = 1.0;
      }
    } catch (error) {
      // Cell failed to render - set empty data
      packCells.vCoords[i] = [];
      packCells.v[i] = [];
      packCells.area[i] = 1.0;
      if (typeof console !== 'undefined' && console.warn) {
        console.warn(`[regraph] Cell ${i} failed to render:`, error.message);
      }
    }
  }
  
  // Ensure arrays have proper length (for sparse arrays, length might not reflect actual content)
  // This ensures the arrays are properly recognized as arrays with the correct length
  if (packCells.v.length !== newCells.p.length) {
    packCells.v.length = newCells.p.length;
  }
  if (packCells.vCoords.length !== newCells.p.length) {
    packCells.vCoords.length = newCells.p.length;
  }
  
  // STEP 4: Build vertex adjacency graph (vertices.v and vertices.c)
  // For each vertex, find which cells use it and which vertices share edges with it
  const verticesV = new Array(verticesP.length).fill(null).map(() => []);
  const verticesC = new Array(verticesP.length).fill(null).map(() => []);
  
  // Build cell-to-vertex mapping (reverse lookup)
  const cellVertexMap = new Map(); // vertex index -> set of cell indices
  for (let i = 0; i < newCells.p.length; i++) {
    if (packCells.v[i] && packCells.v[i].length > 0) {
      packCells.v[i].forEach(vIdx => {
        if (!cellVertexMap.has(vIdx)) {
          cellVertexMap.set(vIdx, new Set());
        }
        cellVertexMap.get(vIdx).add(i);
      });
    }
  }
  
  // For each vertex, find adjacent vertices (vertices that share an edge in a cell)
  for (let i = 0; i < newCells.p.length; i++) {
    if (packCells.v[i] && packCells.v[i].length > 0) {
      const cellVertices = packCells.v[i];
      // Each consecutive pair of vertices in the polygon shares an edge
      for (let j = 0; j < cellVertices.length; j++) {
        const v1 = cellVertices[j];
        const v2 = cellVertices[(j + 1) % cellVertices.length];
        
        if (v1 !== undefined && v2 !== undefined && v1 !== v2) {
          // Add v2 to v1's adjacent vertices (if not already present)
          if (!verticesV[v1].includes(v2)) {
            verticesV[v1].push(v2);
          }
          // Add v1 to v2's adjacent vertices (if not already present)
          if (!verticesV[v2].includes(v1)) {
            verticesV[v2].push(v1);
          }
        }
      }
      
      // Add this cell to all its vertices' adjacent cells
      cellVertices.forEach(vIdx => {
        if (vIdx !== undefined && !verticesC[vIdx].includes(i)) {
          verticesC[vIdx].push(i);
        }
      });
    }
  }
  
  // STEP 5: Get cell neighbors from Voronoi class (for packCells.c)
  // Build Voronoi graph for neighbor information
  const voronoiGraph = new Voronoi(delaunay, allPoints, newCells.p.length);
  
  for (let i = 0; i < newCells.p.length; i++) {
    const cellNeighbors = voronoiGraph.cells.c[i];
    if (cellNeighbors && Array.isArray(cellNeighbors)) {
      // Filter to only include pack cells (exclude boundary cells)
      packCells.c[i] = cellNeighbors.filter(neibIdx => neibIdx < newCells.p.length);
    } else {
      packCells.c[i] = [];
    }
  }
  
  // Debug logging
  if (typeof console !== 'undefined' && console.log) {
    console.log('[regraph] Pack cells populated (polygon-based):', {
      totalCells: newCells.p.length,
      uniqueVertices: verticesP.length,
      vCoordsPopulated,
      vPopulated,
      vCoordsPercent: ((vCoordsPopulated / newCells.p.length) * 100).toFixed(1) + '%',
      vPercent: ((vPopulated / newCells.p.length) * 100).toFixed(1) + '%',
      sampleVCoords: packCells.vCoords[0]?.length || 0,
      sampleV: packCells.v[0]?.length || 0,
    });
  }

  // Mark border cells
  for (let i = 0; i < newCells.p.length; i++) {
    const [x, y] = newCells.p[i];
    if (x <= 0 || x >= options.mapWidth || y <= 0 || y >= options.mapHeight) {
      packCells.b[i] = 1;
    }
  }

  // Create vertices structure from collected unique vertices
  // verticesP is already dense and indexed sequentially (0, 1, 2, ...)
  const vertices = {
    p: verticesP, // Vertex coordinates (already rounded)
    v: verticesV, // Adjacent vertices (built from polygon edges)
    c: verticesC, // Adjacent cells (built from cell-to-vertex mapping)
  };

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
