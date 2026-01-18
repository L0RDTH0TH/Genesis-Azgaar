/**
 * =============================================================================
 * localVoronoi.js
 * Desc: Local Voronoi generation constrained to dual grid cell shapes for Genesis Mythos fork
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

import { createVoronoiFromPoints } from './voronoi.js';
import { createTypedArray } from '../utils/array.js';
import { RNG } from '../utils/rng.js';

/**
 * Check if a point is inside a polygon using ray casting algorithm
 * @param {Array<number>} point - Point [x, y]
 * @param {Array<Array<number>>} polygon - Polygon vertices [[x, y], ...]
 * @returns {boolean} True if point is inside polygon
 */
function pointInPolygon(point, polygon) {
  if (!polygon || polygon.length < 3) return false;
  
  const [x, y] = point;
  let inside = false;
  
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    
    const intersect = ((yi > y) !== (yj > y)) && 
                      (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  
  return inside;
}

/**
 * Get bounding box for a polygon
 * @param {Array<Array<number>>} polygon - Polygon vertices [[x, y], ...]
 * @returns {Object} {minX, minY, maxX, maxY}
 */
function getPolygonBounds(polygon) {
  if (!polygon || polygon.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  
  for (const [x, y] of polygon) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  
  return { minX, minY, maxX, maxY };
}

/**
 * Generate constrained Voronoi points inside a quad polygon using rejection sampling
 * @param {Array<Array<number>>} quadPolygon - Quad vertices [[x, y], ...]
 * @param {number} cellsDesired - Desired number of cells
 * @param {Object} rng - RNG instance
 * @returns {Array<Array<number>>} Points [[x, y], ...] inside the polygon
 */
function generateConstrainedPoints(quadPolygon, cellsDesired, rng) {
  if (!quadPolygon || quadPolygon.length < 3) {
    return [];
  }
  
  const bounds = getPolygonBounds(quadPolygon);
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const area = width * height;
  
  // Estimate required attempts (account for polygon shape - use area ratio)
  // Rough estimate: about 70% of bounding box area for a typical quad
  const areaRatio = 0.7;
  const attempts = Math.ceil((cellsDesired / areaRatio) * 1.5); // Add 50% margin for rejection
  
  const points = [];
  let generated = 0;
  let attemptsUsed = 0;
  const maxAttempts = attempts * 2; // Safety limit
  
  while (generated < cellsDesired && attemptsUsed < maxAttempts) {
    attemptsUsed++;
    
    // Generate random point in bounding box
    const x = bounds.minX + rng.random() * width;
    const y = bounds.minY + rng.random() * height;
    const point = [x, y];
    
    // Check if inside polygon
    if (pointInPolygon(point, quadPolygon)) {
      points.push(point);
      generated++;
    }
  }
  
  return points;
}

/**
 * Generate local Voronoi subdivision within a dual grid quad/cell
 * @param {number} cellId - Cell/quad ID from dualGrid.level0Quads
 * @param {Array<string>} phasesToRun - Phases to run on local sub-grid (default: ['voronoi', 'heightmap', 'biomes'])
 * @param {Object} options - Generation options (seed, mapWidth, mapHeight, etc.)
 * @param {Object} globalData - Global state data {dualGrid, grid, pack, seed}
 * @param {Function} DelaunatorClass - Delaunator class (required)
 * @returns {Object} {localGrid, localPack, localData}
 */
export function generateLocalVoronoi(cellId, phasesToRun = ['voronoi', 'heightmap', 'biomes'], options, globalData, DelaunatorClass) {
  const { dualGrid } = globalData;
  
  if (!dualGrid || !dualGrid.level0Quads) {
    throw new Error('Dual grid is required for local Voronoi generation');
  }
  
  const quad = dualGrid.level0Quads[cellId];
  if (!quad) {
    throw new Error(`Quad with cellId ${cellId} not found in dualGrid.level0Quads`);
  }
  
  // Get quad vertices as polygon
  const quadPolygon = [];
  if (quad.verts && dualGrid.points) {
    for (const vertId of quad.verts) {
      const point = dualGrid.points[vertId];
      if (point) {
        const x = point.x !== undefined ? point.x : point[0];
        const y = point.y !== undefined ? point.y : point[1];
        quadPolygon.push([x, y]);
      }
    }
  }
  
  if (quadPolygon.length < 3) {
    throw new Error(`Quad ${cellId} has invalid vertices (need at least 3)`);
  }
  
  // Calculate local bounds
  const bounds = getPolygonBounds(quadPolygon);
  const localWidth = bounds.maxX - bounds.minX;
  const localHeight = bounds.maxY - bounds.minY;
  
  // Estimate desired cells (scale based on quad area relative to map)
  const mapArea = (options.mapWidth || 1000) * (options.mapHeight || 600);
  const quadArea = localWidth * localHeight;
  const areaRatio = quadArea / mapArea;
  const cellsDesired = Math.max(20, Math.min(100, Math.floor((options.cellsDesired || 5000) * areaRatio)));
  
  // Generate RNG with cellId-specific seed (for reproducibility)
  const cellSeed = `${options.seed || globalData.seed}_cell${cellId}`;
  const rng = new RNG(cellSeed);
  
  // Generate constrained points inside quad
  const localPoints = generateConstrainedPoints(quadPolygon, cellsDesired, rng);
  
  if (localPoints.length < 3) {
    throw new Error(`Failed to generate enough points for quad ${cellId} (got ${localPoints.length}, need at least 3)`);
  }
  
  // Create local Voronoi diagram from constrained points
  // Use quad vertices as boundary points
  const boundary = quadPolygon; // Use quad edges as boundary
  
  const localOptions = {
    ...options,
    mapWidth: localWidth,
    mapHeight: localHeight,
    cellsDesired: localPoints.length,
    seed: cellSeed,
  };
  
  const localGrid = createVoronoiFromPoints(localPoints, boundary, localOptions, DelaunatorClass);
  
  // Mark as local grid
  localGrid.localCellId = cellId;
  localGrid.localBounds = bounds;
  localGrid.parentQuad = quad;
  
  // Create simplified local pack structure
  const localPack = {
    cells: {
      i: createTypedArray({ maxValue: localPoints.length, length: localPoints.length }).map((_, i) => i),
      p: localPoints.map(p => [...p]),
      g: createTypedArray({ maxValue: localPoints.length, length: localPoints.length }).map((_, i) => i),
      h: new Uint8Array(localPoints.length),
      c: localGrid.cells.c || [],
      v: localGrid.cells.v || [],
      b: new Uint8Array(localPoints.length),
    },
    vertices: localGrid.vertices || { p: [], v: [], c: [] },
    features: [],
    burgs: [],
    states: [],
    rivers: [],
    cultures: [],
    religions: [],
    provinces: [],
  };
  
  // Build local data structure
  const localData = {
    grid: localGrid,
    pack: localPack,
    options: localOptions,
    seed: cellSeed,
    cellId,
    bounds,
  };
  
  // Run requested phases on local sub-grid (if phasesToRun includes them)
  // Note: Phase execution will be handled by generateLocal() in generator.js
  // This function just creates the base local grid
  
  return {
    localGrid,
    localPack,
    localData,
  };
}
