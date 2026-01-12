/**
 * =============================================================================
 * ocean-layers.js
 * Desc: Ocean layer/fog rendering (ported from original/modules/ocean-layers.js)
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

import { rn } from '../utils/math.js';
import { line, curveBasisClosed } from 'd3-shape';
import { clipPoly } from './utils.js';
import { getOceanColor } from './colors.js';

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

    // Convert to points and clip to map boundaries (Phase 2 fix)
    const rawPoints = relaxed.map(v => vertices.p[v]);
    const graphWidth = options.width || 1000;
    const graphHeight = options.height || 600;
    const points = clipPoly(rawPoints, graphWidth, graphHeight, 1);
    if (points.length < 3) continue; // Skip if clipping removed too many points
    chains.push([t, points]);
  }

  // Generate SVG paths for each layer using D3 curve smoothing
  const lineGen = line()
    .x(d => d[0])
    .y(d => d[1])
    .curve(curveBasisClosed);
  
  // Phase 3: Generate ocean depth gradients
  const colorScheme = options.colorScheme || null;
  const gradientDefs = generateOceanGradients(limits, colorScheme);
  
  const svgPaths = [];
  for (const t of limits) {
    const layer = chains.filter(c => c[0] === t);
    if (layer.length === 0) continue;

    // Generate smooth curved paths using D3 curveBasisClosed (matches original)
    const pathStrings = layer.map(([_, points]) => {
      if (points.length < 3) return '';
      // Use D3 line generator with curveBasisClosed for smooth curves
      const path = lineGen(points);
      return path || '';
    }).filter(p => p); // Filter out empty paths

    const pathStr = pathStrings.join(' ');
    if (pathStr) {
      // Phase 3: Use gradient for depth-based coloring, or fallback to opacity
      const gradientId = `oceanGradient-${Math.abs(t)}`;
      const fillColor = colorScheme && options.width && options.height
        ? `url(#${gradientId})`
        : '#ecf2f9';
      const fillOpacity = colorScheme ? (opacity * 1.2) : opacity; // Slightly more opaque with gradients
      
      svgPaths.push(`<path d="${pathStr}" fill="${fillColor}" fill-opacity="${fillOpacity}" />`);
    }
  }

  return gradientDefs + svgPaths.join('');
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

/**
 * Generate SVG gradient definitions for ocean depth (Phase 3)
 * @param {Array<number>} limits - Depth limits (negative values)
 * @param {Function|string|null} colorScheme - Optional color scheme
 * @returns {string} SVG <defs> with gradients
 */
function generateOceanGradients(limits, colorScheme) {
  if (!colorScheme || limits.length === 0) return '';
  
  const gradients = [];
  
  for (const t of limits) {
    if (t >= 0) continue; // Only process ocean depths (negative)
    
    const depth = Math.abs(t); // 1-9 (shallow to deep)
    const gradientId = `oceanGradient-${depth}`;
    
    // Create gradient from light blue (top) to deep blue (bottom)
    const topColor = getOceanColor(-depth + 1, colorScheme) || '#b4d2f3';
    const bottomColor = getOceanColor(-depth, colorScheme) || '#4a7fb0';
    
    gradients.push(
      `<linearGradient id="${gradientId}" x1="0%" y1="0%" x2="0%" y2="100%">`,
      `  <stop offset="0%" stop-color="${topColor}" stop-opacity="0.6" />`,
      `  <stop offset="100%" stop-color="${bottomColor}" stop-opacity="0.8" />`,
      `</linearGradient>`
    );
  }
  
  if (gradients.length === 0) return '';
  
  return `<defs>${gradients.join('')}</defs>`;
}
