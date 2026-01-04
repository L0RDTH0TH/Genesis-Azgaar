/**
 * =============================================================================
 * ocean-layers.js
 * Desc: Ocean layer/fog rendering (ported from original/modules/ocean-layers.js)
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

import { rn } from '../utils/math.js';

/**
 * Draw ocean layers (fog/atmosphere layers) for visual polish
 * Ported from original/modules/ocean-layers.js
 * @param {Object} pack - Pack object with cells and vertices
 * @param {Object} options - Rendering options
 * @returns {string} SVG string for ocean layers
 */
export function drawOceanLayersSVG(pack, options = {}) {
  const { cells, vertices } = pack;
  if (!cells || !vertices || !cells.t || !cells.b) {
    return ''; // No ocean layers if data missing
  }

  const layers = options.oceanLayers || 'random'; // 'none', 'random', or comma-separated depth values
  if (layers === 'none') return '';

  const pointsN = cells.i.length;
  const limits = layers === 'random' ? randomizeOutline() : layers.split(',').map(s => +s);
  if (limits.length === 0) return '';

  const opacity = rn(0.4 / limits.length, 2);
  const used = new Uint8Array(pointsN);
  const chains = [];

  // Process each cell to find ocean layer boundaries
  for (const i of cells.i) {
    const t = cells.t[i];
    if (t > 0) continue; // Only process water cells (t <= 0)
    if (used[i] || !limits.includes(t)) continue;

    const start = findStart(i, t, cells, vertices, pointsN);
    if (!start) continue;

    used[i] = 1;
    const chain = connectVertices(start, t, cells, vertices, used, pointsN);
    if (chain.length < 4) continue;

    // Relax chain (select only n-th point for smoother paths)
    const relax = 1 + t * -2; // select only n-th point
    const relaxed = chain.filter((v, idx) => !(idx % relax) || vertices.c[v].some(c => c >= pointsN));
    if (relaxed.length < 4) continue;

    // Convert to points
    const points = relaxed.map(v => vertices.p[v]);
    chains.push([t, points]);
  }

  // Generate SVG paths for each layer
  const svgPaths = [];
  for (const t of limits) {
    const layer = chains.filter(c => c[0] === t);
    if (layer.length === 0) continue;

    // Generate path string from points (simplified - using straight lines for now)
    // In original, uses d3.curveBasisClosed for smooth curves
    const pathStrings = layer.map(([_, points]) => {
      if (points.length < 3) return '';
      let path = `M ${points[0][0]},${points[0][1]}`;
      for (let i = 1; i < points.length; i++) {
        path += ` L ${points[i][0]},${points[i][1]}`;
      }
      path += ' Z'; // Close path
      return path;
    });

    const pathStr = pathStrings.filter(p => p).join(' ');
    if (pathStr) {
      svgPaths.push(`<path d="${pathStr}" fill="#ecf2f9" fill-opacity="${opacity}" />`);
    }
  }

  return svgPaths.join('');
}

/**
 * Find eligible cell vertex to start path detection
 */
function findStart(i, t, cells, vertices, pointsN) {
  // If cell is on border, find vertex on map border
  if (cells.b && cells.b[i]) {
    const cellVertices = cells.v[i];
    if (cellVertices) {
      for (const v of cellVertices) {
        if (vertices.c[v] && vertices.c[v].some(c => c >= pointsN)) {
          return v;
        }
      }
    }
  }

  // Otherwise, find vertex adjacent to cell with different depth
  const cellNeighbors = cells.c[i];
  if (cellNeighbors && cells.v[i]) {
    for (let idx = 0; idx < cellNeighbors.length; idx++) {
      const neighborId = cellNeighbors[idx];
      if (neighborId < 0 || neighborId >= pointsN) continue;
      const neighborT = cells.t[neighborId];
      if (neighborT < t || !neighborT) {
        return cells.v[i][idx];
      }
    }
  }

  return null;
}

/**
 * Connect vertices to form a chain (ported from original)
 */
function connectVertices(start, t, cells, vertices, used, pointsN) {
  const chain = [];
  let current = start;
  let iterations = 0;
  const maxIterations = 10000;

  while (iterations < maxIterations) {
    const prev = chain.length > 0 ? chain[chain.length - 1] : null;
    chain.push(current);

    // Mark cells adjacent to this vertex as used
    const vertexCells = vertices.c[current];
    if (vertexCells) {
      vertexCells.forEach(c => {
        if (c >= 0 && c < pointsN && cells.t[c] === t) {
          used[c] = 1;
        }
      });
    }

    // Find next vertex
    const vertexNeighbors = vertices.v[current];
    if (!vertexNeighbors || vertexNeighbors.length < 3) break;

    const c = vertices.c[current];
    if (!c || c.length < 3) break;

    const c0 = !cells.t[c[0]] || cells.t[c[0]] === t - 1;
    const c1 = !cells.t[c[1]] || cells.t[c[1]] === t - 1;
    const c2 = !cells.t[c[2]] || cells.t[c[2]] === t - 1;

    let next = null;
    if (vertexNeighbors[0] !== undefined && vertexNeighbors[0] !== prev && c0 !== c1) {
      next = vertexNeighbors[0];
    } else if (vertexNeighbors[1] !== undefined && vertexNeighbors[1] !== prev && c1 !== c2) {
      next = vertexNeighbors[1];
    } else if (vertexNeighbors[2] !== undefined && vertexNeighbors[2] !== prev && c0 !== c2) {
      next = vertexNeighbors[2];
    }

    if (!next || next === current) {
      break; // No next vertex found or loop detected
    }

    current = next;
    iterations++;

    // Check if we've looped back to start
    if (current === start && chain.length > 3) {
      break;
    }
  }

  // Close the chain
  if (chain.length > 0 && chain[0] !== chain[chain.length - 1]) {
    chain.push(chain[0]);
  }

  return chain;
}

/**
 * Randomize outline depths (ported from original)
 */
function randomizeOutline() {
  const limits = [];
  let odd = 0.2;
  for (let l = -9; l < 0; l++) {
    if (Math.random() < odd) {
      odd = 0.2;
      limits.push(l);
    } else {
      odd *= 2;
    }
  }
  return limits;
}
