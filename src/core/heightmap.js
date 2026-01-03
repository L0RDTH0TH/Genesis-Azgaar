/**
 * =============================================================================
 * heightmap.js
 * Desc: Heightmap generation for map cells
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

import { rn, lim, minmax } from '../utils/math.js';
import { createTypedArray } from '../utils/array.js';
import { findGridCell } from './voronoi.js';

/**
 * Get blob power based on cell count
 * @param {number} cells - Number of cells
 * @returns {number} Blob power value
 */
function getBlobPower(cells) {
  const blobPowerMap = {
    1000: 0.93,
    2000: 0.95,
    5000: 0.97,
    10000: 0.98,
    20000: 0.99,
    30000: 0.991,
    40000: 0.993,
    50000: 0.994,
    60000: 0.995,
    70000: 0.9955,
    80000: 0.996,
    90000: 0.9964,
    100000: 0.9973,
  };
  return blobPowerMap[cells] || 0.98;
}

/**
 * Get line power based on cell count
 * @param {number} cells - Number of cells
 * @returns {number} Line power value
 */
function getLinePower(cells) {
  const linePowerMap = {
    1000: 0.75,
    2000: 0.77,
    5000: 0.79,
    10000: 0.81,
    20000: 0.82,
    30000: 0.83,
    40000: 0.84,
    50000: 0.86,
    60000: 0.87,
    70000: 0.88,
    80000: 0.91,
    90000: 0.92,
    100000: 0.93,
  };
  return linePowerMap[cells] || 0.81;
}

/**
 * Parse number from range string (e.g., "1-3" or "2")
 * @param {string} r - Range string
 * @param {Object} rng - RNG instance
 * @returns {number} Parsed number
 */
function getNumberInRange(r, rng) {
  if (typeof r !== 'string') {
    throw new Error('Range value should be a string');
  }
  if (!isNaN(+r)) return ~~r + (rng.probability(r - ~~r) ? 1 : 0);
  const sign = r[0] === '-' ? -1 : 1;
  if (isNaN(+r[0])) r = r.slice(1);
  const range = r.includes('-') ? r.split('-') : null;
  if (!range) {
    throw new Error('Cannot parse the number. Check the format: ' + r);
  }
  const count = rng.randInt(range[0] * sign, +range[1]);
  if (isNaN(count) || count < 0) {
    throw new Error('Cannot parse number. Check the format: ' + r);
  }
  return count;
}

/**
 * Get point in range
 * @param {string} range - Range string (e.g., "10-90")
 * @param {number} length - Maximum length
 * @param {Object} rng - RNG instance
 * @returns {number} Point value
 */
function getPointInRange(range, length, rng) {
  if (typeof range !== 'string') {
    throw new Error('Range should be a string');
  }
  const parts = range.split('-');
  const min = (parts[0] / 100 || 0) * length;
  const max = (parts[1] / 100 || min) * length;
  return rng.randFloat(min, max);
}

/**
 * Generate basic heightmap using simple noise/random approach
 * This is a simplified version - full template support will be added later
 * @param {Object} grid - Grid object with cells, points, etc.
 * @param {Object} options - Generation options
 * @param {Object} rng - RNG instance
 * @returns {Uint8Array} Height array
 */
function generateBasicHeightmap(grid, options, rng) {
  const { points, cellsDesired } = grid;
  const heights = createTypedArray({ maxValue: 100, length: points.length });
  const template = options.template || null;
  const landPercentage = options.landPercentage || (template === 'continent' ? 40 : 30);

  // Generate cohesive landmasses based on template preference
  // For 'continent' template, create 1-3 large landmasses with ~45% land coverage
  // For other templates, use more fragmented approach with ~30% land coverage
  
  // Initialize all as ocean
  for (let i = 0; i < heights.length; i++) {
    heights[i] = 10; // Start with shallow ocean
  }

  if (template === 'continent') {
    // Create 1-5 large continental landmasses (target: 1-3 for seed 42)
    const numContinents = rng.randInt(1, 5);
    const targetLandCells = Math.floor(points.length * (landPercentage / 100));
    
    // Ensure minimum continent size to avoid tiny fragments
    const minContinentSize = Math.max(100, targetLandCells / 10);
    
    for (let c = 0; c < numContinents; c++) {
      // Pick a random center point, but avoid edges
      const margin = Math.min(options.mapWidth, options.mapHeight) * 0.15;
      const centerX = rng.randFloat(margin, options.mapWidth - margin);
      const centerY = rng.randFloat(margin, options.mapHeight - margin);
      
      // Find closest point to this center
      let centerIdx = 0;
      let minDist = Infinity;
      for (let i = 0; i < points.length; i++) {
        const [x, y] = points[i];
        const dist = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
        if (dist < minDist) {
          minDist = dist;
          centerIdx = i;
        }
      }
      
      // Create a large blob of land around this center
      const continentSize = Math.max(minContinentSize, targetLandCells / numContinents);
      // Calculate radius based on desired area coverage
      const areaPerCell = (options.mapWidth * options.mapHeight) / points.length;
      const targetArea = continentSize * areaPerCell;
      const radius = Math.sqrt(targetArea / Math.PI) * 1.2; // 1.2x for better coverage
      
      for (let i = 0; i < points.length; i++) {
        const [x, y] = points[i];
        const dx = x - centerX;
        const dy = y - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Use exponential falloff for natural blob shape
        const normalizedDist = distance / radius;
        if (normalizedDist < 2.0) { // Increased from 1.5 for larger continents
          const falloff = Math.exp(-normalizedDist * 1.5); // Gentler falloff
          const baseHeight = 20 + falloff * 80; // 20-100 height range
          const height = rn(baseHeight + rng.randFloat(-5, 5)); // Reduced noise for smoother continents
          heights[i] = Math.max(heights[i], lim(height)); // Take max to allow overlapping continents
        }
      }
    }
  } else {
    // Default: More fragmented approach with smaller islands
    const targetLandCells = Math.floor(points.length * (landPercentage / 100));
    const numIslands = Math.floor(targetLandCells / 50); // ~50 cells per island
    
    for (let i = 0; i < numIslands; i++) {
      const centerIdx = rng.randInt(0, points.length - 1);
      const [centerX, centerY] = points[centerIdx];
      const radius = rng.randFloat(20, 60);
      
      for (let j = 0; j < points.length; j++) {
        const [x, y] = points[j];
        const dx = x - centerX;
        const dy = y - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < radius) {
          const normalizedDist = distance / radius;
          const falloff = Math.exp(-normalizedDist * 3);
          const baseHeight = 20 + falloff * 80;
          const height = rn(baseHeight + rng.randFloat(-15, 15));
          heights[j] = Math.max(heights[j], lim(height));
        }
      }
    }
  }

  return heights;
}

/**
 * Generate heightmap from template string
 * @param {Object} grid - Grid object
 * @param {string} templateString - Template steps (newline-separated)
 * @param {Object} options - Generation options
 * @param {Object} rng - RNG instance
 * @returns {Uint8Array} Height array
 */
function generateFromTemplate(grid, templateString, options, rng) {
  const { points, cellsDesired } = grid;
  const heights = createTypedArray({ maxValue: 100, length: points.length });
  
  // Initialize with base height (ocean level)
  for (let i = 0; i < heights.length; i++) {
    heights[i] = 10; // Start with shallow ocean
  }

  const steps = templateString.split('\n');
  const blobPower = getBlobPower(cellsDesired);
  const linePower = getLinePower(cellsDesired);
  const width = options.mapWidth;
  const height = options.mapHeight;

  for (const step of steps) {
    const elements = step.trim().split(' ');
    if (elements.length < 2) continue;
    
    const tool = elements[0];
    const args = elements.slice(1);
    
    // For now, implement basic tools - full implementation in later phases
    if (tool === 'Smooth') {
      smoothHeights(heights, grid, +args[0] || 2, rng);
    } else if (tool === 'Mask') {
      maskHeights(heights, grid, width, height, +args[0] || 1);
    }
    // More tools (Hill, Pit, Range, etc.) will be added as needed
  }

  return heights;
}

/**
 * Smooth heights
 * @param {Uint8Array} heights - Height array
 * @param {Object} grid - Grid object
 * @param {number} factor - Smoothing factor
 * @param {Object} rng - RNG instance
 */
function smoothHeights(heights, grid, factor = 2, rng) {
  const newHeights = new Uint8Array(heights.length);
  
  for (let i = 0; i < heights.length; i++) {
    const neighbors = [heights[i]];
    if (grid.cells.c[i]) {
      grid.cells.c[i].forEach((c) => neighbors.push(heights[c]));
    }
    const avg = neighbors.reduce((a, b) => a + b, 0) / neighbors.length;
    newHeights[i] = lim((heights[i] * (factor - 1) + avg) / factor);
  }
  
  heights.set(newHeights);
}

/**
 * Apply mask to heights
 * @param {Uint8Array} heights - Height array
 * @param {Object} grid - Grid object
 * @param {number} width - Map width
 * @param {number} height - Map height
 * @param {number} power - Mask power
 */
function maskHeights(heights, grid, width, height, power = 1) {
  const fr = Math.abs(power) || 1;
  
  for (let i = 0; i < heights.length; i++) {
    const [x, y] = grid.points[i];
    const nx = (2 * x) / width - 1; // [-1, 1], 0 is center
    const ny = (2 * y) / height - 1; // [-1, 1], 0 is center
    let distance = (1 - nx ** 2) * (1 - ny ** 2); // 1 is center, 0 is edge
    if (power < 0) distance = 1 - distance; // inverted
    const masked = heights[i] * distance;
    heights[i] = lim((heights[i] * (fr - 1) + masked) / fr);
  }
}

/**
 * Generate heightmap for grid
 * @param {Object} params - Generation parameters
 * @param {Object} params.grid - Grid object from Voronoi generation
 * @param {Object} params.options - Generation options
 * @param {Object} params.rng - RNG instance
 * @param {string} params.template - Template ID (optional, for future template support)
 * @returns {Uint8Array} Height array
 */
export function generateHeightmap({ grid, options, rng, template = null }) {
  if (!grid || !grid.points) {
    throw new Error('Grid object with points is required');
  }
  if (!rng) {
    throw new Error('RNG instance is required');
  }

  // For Phase 2.4, use basic generation
  // Template support will be added in later phases
  const heights = generateBasicHeightmap(grid, options, rng);
  
  // Apply basic smoothing
  smoothHeights(heights, grid, 2, rng);
  
  // Apply edge mask to create more natural boundaries
  maskHeights(heights, grid, options.mapWidth, options.mapHeight, 1);

  return heights;
}
