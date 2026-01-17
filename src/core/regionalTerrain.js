/**
 * =============================================================================
 * regionalTerrain.js
 * Desc: Regional/on-demand terrain generation for dual-grid quads
 * Author: Lordthoth
 * =============================================================================
 */

import { RNG } from '../utils/rng.js';
import { lim, rn } from '../utils/math.js';
import { pointInQuad } from './dualGridStates.js';
import { getDefaultBiomes } from './biomes.js';

// Local copy of getBiomeId for regional use (not exported from biomes.js)
function getBiomeId(moisture, temperature, height, hasRiver, biomesData) {
  const MIN_LAND_HEIGHT = 20;
  
  if (height < MIN_LAND_HEIGHT) return 0; // all water cells: marine biome
  if (temperature < -5) return 11; // too cold: permafrost biome
  if (temperature >= 25 && !hasRiver && moisture < 8) return 1; // too hot and dry: hot desert biome
  
  // Check for wetland
  const isWetland = (temperature > -2 && ((moisture > 40 && height < 25) || (moisture > 24 && height > 24 && height < 60)));
  if (isWetland) return 12;
  
  // Use biome matrix
  const moistureBand = Math.min((moisture / 5) | 0, 4); // [0-4]
  const temperatureBand = Math.min(Math.max(20 - temperature, 0), 25); // [0-25]
  return biomesData.biomesMatrix[moistureBand][temperatureBand];
}

/**
 * Simple 2D noise function for regional terrain generation
 * Uses seeded random values for deterministic results
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {number} scale - Noise scale (higher = smoother)
 * @param {Object} rng - RNG instance
 * @returns {number} Noise value [0, 1]
 */
function noise2D(x, y, scale, rng) {
  // Use seeded hash for deterministic noise
  // Simple approach: combine coordinates, scale, and seed
  const nx = Math.floor(x * scale);
  const ny = Math.floor(y * scale);
  const hash = (nx * 73856093) ^ (ny * 19349663);
  
  // Use RNG with hash as seed offset
  // Get seed from RNG using getSeed() method
  const seedStr = rng.getSeed ? rng.getSeed() : (rng._seed || 'default');
  const noiseRng = new RNG(seedStr + '_' + hash);
  return noiseRng.random();
}

/**
 * Fractal noise (multiple octaves)
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {number} octaves - Number of octaves
 * @param {number} persistence - Persistence (amplitude decay)
 * @param {number} scale - Base scale
 * @param {Object} rng - RNG instance
 * @returns {number} Fractal noise value [0, 1]
 */
function fractalNoise(x, y, octaves = 4, persistence = 0.5, scale = 0.01, rng) {
  let value = 0;
  let amplitude = 1;
  let frequency = scale;
  let maxValue = 0;
  
  for (let i = 0; i < octaves; i++) {
    value += noise2D(x, y, frequency, rng) * amplitude;
    maxValue += amplitude;
    amplitude *= persistence;
    frequency *= 2;
  }
  
  return value / maxValue; // Normalize to [0, 1]
}

/**
 * Generate regional heightmap for a rectangular region
 * Creates a simple grid of height values using fractal noise
 * @param {Object} params - Generation parameters
 * @param {Object} params.center - Center point {x, y}
 * @param {number} params.width - Region width in world units
 * @param {number} params.height - Region height in world units
 * @param {number} params.cellSize - Size of each terrain cell (default: 10)
 * @param {Object} params.rng - RNG instance (must have .seed property)
 * @param {Object} params.globalGuidance - Optional global guidance map (low-res height, for continuity)
 * @returns {Object} Terrain data with:
 *   - cells: Array of {x, y, height} objects
 *   - width: Number of cells horizontally
 *   - height: Number of cells vertically
 */
export function generateRegionalHeightmap({ center, width, height, cellSize = 10, rng, globalGuidance = null }) {
  const numCellsX = Math.ceil(width / cellSize);
  const numCellsY = Math.ceil(height / cellSize);
  const cells = [];
  
  // Adjust region bounds to align with cell grid
  const regionMinX = center.x - width / 2;
  const regionMinY = center.y - height / 2;
  
  // Generate height for each cell
  for (let cy = 0; cy < numCellsY; cy++) {
    for (let cx = 0; cx < numCellsX; cx++) {
      const cellX = regionMinX + (cx + 0.5) * cellSize;
      const cellY = regionMinY + (cy + 0.5) * cellSize;
      
      // Generate height using fractal noise
      let heightValue = fractalNoise(cellX, cellY, 4, 0.5, 0.02, rng);
      
      // Apply ocean bias (60% ocean, 40% land)
      if (rng.probability(0.6)) {
        heightValue = heightValue * 0.4; // Ocean: 0-40
      } else {
        heightValue = 20 + heightValue * 80; // Land: 20-100
      }
      
      // Apply local smoothing/masking (distance from center)
      const dx = (cx / numCellsX - 0.5) * 2; // [-1, 1]
      const dy = (cy / numCellsY - 0.5) * 2;
      const distFromCenter = Math.sqrt(dx * dx + dy * dy);
      const edgeFactor = 1 - Math.min(distFromCenter, 1); // 1 at center, 0 at edge
      
      // Blend with global guidance if provided (for continuity)
      if (globalGuidance) {
        const guidanceHeight = getGlobalGuidanceHeight(cellX, cellY, globalGuidance);
        if (guidanceHeight !== null) {
          // Blend local noise with global guidance (70% local, 30% global)
          heightValue = heightValue * 0.7 + guidanceHeight * 0.3;
        }
      }
      
      // Apply edge masking (lower heights near edges)
      heightValue *= (0.5 + 0.5 * edgeFactor);
      
      cells.push({
        x: cellX,
        y: cellY,
        height: lim(Math.round(heightValue)),
      });
    }
  }
  
  // Apply simple smoothing pass
  smoothRegionalHeights(cells, numCellsX, numCellsY);
  
  return {
    cells,
    width: numCellsX,
    height: numCellsY,
    cellSize,
    bounds: {
      minX: regionMinX,
      minY: regionMinY,
      maxX: regionMinX + width,
      maxY: regionMinY + height,
    },
  };
}

/**
 * Smooth heights in a regional grid (simple average of neighbors)
 * @param {Array} cells - Array of {x, y, height} objects
 * @param {number} width - Grid width in cells
 * @param {number} height - Grid height in cells
 */
function smoothRegionalHeights(cells, width, height) {
  const smoothed = new Array(cells.length);
  
  for (let cy = 0; cy < height; cy++) {
    for (let cx = 0; cx < width; cx++) {
      const idx = cy * width + cx;
      const cell = cells[idx];
      
      // Collect neighbor heights (including self)
      const neighbors = [cell.height];
      
      // 4-connected neighbors
      if (cx > 0) neighbors.push(cells[cy * width + (cx - 1)].height);
      if (cx < width - 1) neighbors.push(cells[cy * width + (cx + 1)].height);
      if (cy > 0) neighbors.push(cells[(cy - 1) * width + cx].height);
      if (cy < height - 1) neighbors.push(cells[(cy + 1) * width + cx].height);
      
      // Average
      const avg = neighbors.reduce((a, b) => a + b, 0) / neighbors.length;
      smoothed[idx] = {
        ...cell,
        height: lim(Math.round(avg)),
      };
    }
  }
  
  // Copy smoothed values back
  for (let i = 0; i < cells.length; i++) {
    cells[i].height = smoothed[i].height;
  }
}

/**
 * Get height from global guidance map (low-res height for continuity)
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @param {Object} globalGuidance - Global guidance map {width, height, cells: [{x, y, height}]}
 * @returns {number|null} Guidance height or null if not available
 */
function getGlobalGuidanceHeight(x, y, globalGuidance) {
  if (!globalGuidance || !globalGuidance.cells || globalGuidance.cells.length === 0) {
    return null;
  }
  
  // Simple nearest-neighbor lookup (can be improved with bilinear interpolation)
  let nearest = null;
  let minDist = Infinity;
  
  for (const cell of globalGuidance.cells) {
    const dist = Math.hypot(cell.x - x, cell.y - y);
    if (dist < minDist) {
      minDist = dist;
      nearest = cell;
    }
  }
  
  // Only use if within reasonable distance (within 2x cell size)
  const maxDist = globalGuidance.cellSize * 2;
  return minDist < maxDist ? nearest.height : null;
}

/**
 * Calculate temperature for a region (simplified, based on latitude/y position)
 * @param {number} y - Y coordinate (0 = top, mapHeight = bottom)
 * @param {number} mapHeight - Total map height (for latitude calculation)
 * @returns {number} Temperature in Celsius
 */
function calculateRegionalTemperature(y, mapHeight) {
  // Simplified: latitude effect (top = cold, bottom = hot)
  // Map y [0, mapHeight] to latitude [-90, 90] then to temperature [-30, 30]
  const normalizedY = y / mapHeight; // [0, 1]
  const latitude = 90 * (1 - normalizedY * 2); // [-90, 90]
  const temperature = 30 * (1 - Math.abs(latitude) / 90) - 10; // [-10, 20] roughly
  
  return Math.round(temperature);
}

/**
 * Calculate moisture for a cell (simplified, based on height and distance from coast)
 * @param {Object} cell - Cell with {x, y, height}
 * @param {Array} neighbors - Neighboring cells
 * @param {Object} rng - RNG instance for deterministic variation
 * @returns {number} Moisture value [0, 40]
 */
function calculateRegionalMoisture(cell, neighbors, rng) {
  const MIN_LAND_HEIGHT = 20;
  
  if (cell.height < MIN_LAND_HEIGHT) {
    return 0; // Ocean
  }
  
  // Base moisture from height (higher = drier, but with variation)
  let moisture = 20 - (cell.height - MIN_LAND_HEIGHT) / 4;
  
  // Add variation from neighbors (coastal effect)
  const landNeighbors = neighbors.filter(n => n.height >= MIN_LAND_HEIGHT);
  if (landNeighbors.length < neighbors.length) {
    moisture += 10; // Near coast/ocean
  }
  
  // Add seeded random variation (0-5) for determinism
  if (rng) {
    moisture += rng.randFloat(0, 5);
  }
  
  return rn(Math.max(0, Math.min(40, moisture)));
}

/**
 * Generate regional biomes based on height, temperature, and moisture
 * @param {Object} terrainData - Terrain data from generateRegionalHeightmap
 * @param {number} mapHeight - Total map height (for temperature calculation)
 * @param {Object} rng - RNG instance for deterministic moisture variation
 * @param {Object} biomesData - Biome data (optional, uses default if not provided)
 * @returns {Object} Updated terrain data with biome assignments
 */
export function assignRegionalBiomes(terrainData, mapHeight, rng, biomesData = null) {
  if (!biomesData) {
    biomesData = getDefaultBiomes();
  }
  
  const { cells, width, height } = terrainData;
  
  // Assign biomes to each cell
  for (let cy = 0; cy < height; cy++) {
    for (let cx = 0; cx < width; cx++) {
      const idx = cy * width + cx;
      const cell = cells[idx];
      
      // Calculate temperature
      const temperature = calculateRegionalTemperature(cell.y, mapHeight);
      
      // Calculate moisture (simplified, using neighbors)
      const neighbors = [];
      if (cx > 0) neighbors.push(cells[cy * width + (cx - 1)]);
      if (cx < width - 1) neighbors.push(cells[cy * width + (cx + 1)]);
      if (cy > 0) neighbors.push(cells[(cy - 1) * width + cx]);
      if (cy < height - 1) neighbors.push(cells[(cy + 1) * width + cx]);
      
      const moisture = calculateRegionalMoisture(cell, neighbors, rng);
      
      // Get biome ID
      const biomeId = getBiomeId(moisture, temperature, cell.height, false, biomesData);
      cell.biomeId = biomeId;
      cell.temperature = temperature;
      cell.moisture = moisture;
    }
  }
  
  return terrainData;
}

/**
 * Map regional terrain to dual-grid quads using point-in-polygon
 * Assigns terrain values (height, biome) to quads based on which terrain cells they contain
 * @param {Object} terrainData - Terrain data with cells array
 * @param {Array} quads - Array of quads with verts property
 * @param {Array} points - Points array for quad vertices
 * @returns {Object} Mapping result with:
 *   - quadTerrain: Map<quadIndex, {avgHeight, biomeId, cellCount}>
 *   - unmappedQuads: Array of quad indices that don't contain any terrain cells
 */
export function mapTerrainToQuads(terrainData, quads, points) {
  const quadTerrain = new Map();
  const unmappedQuads = [];
  
  const { cells } = terrainData;
  
  // For each quad, find which terrain cells it contains
  for (let quadIdx = 0; quadIdx < quads.length; quadIdx++) {
    const quad = quads[quadIdx];
    if (!quad || !quad.verts) continue;
    
    const containedCells = [];
    
    // Check each terrain cell to see if it's inside this quad
    for (const cell of cells) {
      if (pointInQuad({ x: cell.x, y: cell.y }, quad, points)) {
        containedCells.push(cell);
      }
    }
    
    if (containedCells.length > 0) {
      // Calculate average height and most common biome
      const avgHeight = containedCells.reduce((sum, c) => sum + c.height, 0) / containedCells.length;
      
      // Find most common biome
      const biomeCounts = new Map();
      for (const cell of containedCells) {
        const biomeId = cell.biomeId || 0;
        biomeCounts.set(biomeId, (biomeCounts.get(biomeId) || 0) + 1);
      }
      let mostCommonBiome = 0;
      let maxCount = 0;
      for (const [biomeId, count] of biomeCounts) {
        if (count > maxCount) {
          maxCount = count;
          mostCommonBiome = biomeId;
        }
      }
      
      quadTerrain.set(quadIdx, {
        avgHeight: lim(Math.round(avgHeight)),
        biomeId: mostCommonBiome,
        cellCount: containedCells.length,
      });
    } else {
      unmappedQuads.push(quadIdx);
    }
  }
  
  return {
    quadTerrain,
    unmappedQuads,
    mappedQuads: quadTerrain.size,
    totalQuads: quads.length,
  };
}

/**
 * Generate regional terrain for a dual-grid quad region
 * This is the main entry point for on-demand terrain generation
 * @param {Object} params - Generation parameters
 * @param {Object} params.center - Center point {x, y}
 * @param {number} params.radius - Radius in world units (default: 100)
 * @param {Object} params.rng - RNG instance (must have .seed property)
 * @param {number} params.mapHeight - Total map height (for temperature calculation)
 * @param {Object} params.globalGuidance - Optional global guidance map
 * @param {number} params.cellSize - Size of each terrain cell (default: 10)
 * @returns {Object} Complete terrain data with cells, biomes, and metadata
 */
export function generateRegionalTerrain({ center, radius = 100, rng, mapHeight = 540, globalGuidance = null, cellSize = 10 }) {
  const width = radius * 2;
  const height = radius * 2;
  
  // Generate heightmap
  const terrainData = generateRegionalHeightmap({
    center,
    width,
    height,
    cellSize,
    rng,
    globalGuidance,
  });
  
  // Assign biomes (pass rng for deterministic moisture variation)
  assignRegionalBiomes(terrainData, mapHeight, rng);
  
  return terrainData;
}
