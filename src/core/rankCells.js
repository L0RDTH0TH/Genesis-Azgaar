/**
 * =============================================================================
 * rankCells.js
 * Desc: Calculate cell suitability and population scores for culture/burg placement
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

import { createTypedArray } from '../utils/array.js';
import { normalize } from '../utils/math.js';
import * as d3 from 'd3';

/**
 * Calculate cell suitability and population scores
 * This is critical for culture center placement, burg placement, and state expansion
 * @param {Object} params - Generation parameters
 * @param {Object} params.pack - Pack object (will be modified)
 * @param {Object} params.grid - Grid object (optional, for reference)
 * @param {Object} params.options - Generation options (optional)
 * @param {Object} params.biomesData - Biome data with habitability scores
 * @returns {Object} {s: Int16Array, pop: Float32Array} Suitability and population arrays
 */
export function rankCells({ pack, grid = null, options = null, biomesData }) {
  if (!pack || !pack.cells) {
    throw new Error('Pack object with cells is required');
  }
  if (!biomesData || !biomesData.habitability) {
    throw new Error('Biomes data with habitability scores is required');
  }

  const { cells, features } = pack;
  
  // Initialize suitability and population arrays
  cells.s = new Int16Array(cells.i.length); // cell suitability array
  cells.pop = new Float32Array(cells.i.length); // cell population array

  // Calculate statistics for normalization
  // Filter out zero values for flux median calculation
  const fluxValues = cells.fl ? Array.from(cells.fl).filter(f => f > 0) : [];
  const flMean = fluxValues.length > 0 ? d3.median(fluxValues) || 0 : 0;
  const flMax = cells.fl && cells.conf 
    ? (Math.max(...cells.fl) + Math.max(...cells.conf)) 
    : 0;
  
  // Calculate mean area for population normalization
  const areaValues = cells.area ? Array.from(cells.area) : [];
  const areaMean = areaValues.length > 0 ? d3.mean(areaValues) || 1 : 1; // Avoid division by zero

  // Calculate suitability and population for each cell
  for (const i of cells.i) {
    // Skip water cells (no population in water)
    if (cells.h[i] < 20) continue;
    
    // Base suitability from biome habitability
    const biomeId = cells.biome && cells.biome[i] !== undefined ? cells.biome[i] : 0;
    let s = +biomesData.habitability[biomeId] || 0;
    
    // Skip uninhabitable biomes (habitability = 0)
    if (!s) continue;
    
    // Add river flux and confluence bonus (big rivers and confluences are valued)
    if (flMean > 0 && cells.fl && cells.conf) {
      const flux = (cells.fl[i] || 0) + (cells.conf[i] || 0);
      if (flux > 0) {
        s += normalize(flux, flMean, flMax) * 250;
      }
    }
    
    // Elevation penalty (low elevation is valued, high is not)
    s -= (cells.h[i] - 50) / 5;
    
    // Coastline bonuses
    if (cells.t && cells.t[i] === 1) {
      // Estuary bonus (river meets coast)
      if (cells.r && cells.r[i]) {
        s += 15;
      }
      
      // Feature-based bonuses/penalties
      if (cells.haven && cells.haven[i] !== undefined && cells.f && features) {
        const havenCell = cells.haven[i];
        const featureId = cells.f[havenCell];
        const feature = features[featureId];
        
        if (feature && feature.type === 'lake') {
          // Lake type bonuses/penalties
          if (feature.group === 'freshwater') {
            s += 30;
          } else if (feature.group === 'salt') {
            s += 10;
          } else if (feature.group === 'frozen') {
            s += 1;
          } else if (feature.group === 'dry') {
            s -= 5;
          } else if (feature.group === 'sinkhole') {
            s -= 5;
          } else if (feature.group === 'lava') {
            s -= 30;
          }
        } else {
          // Ocean coast bonus
          s += 5;
          
          // Safe sea harbor bonus
          if (cells.harbor && cells.harbor[i] === 1) {
            s += 20;
          }
        }
      }
    }
    
    // Store suitability (divide by 5 for general population rate)
    cells.s[i] = Math.round(s / 5);
    
    // Calculate population: suitability adjusted by cell area
    if (cells.s[i] > 0 && cells.area && cells.area[i]) {
      cells.pop[i] = (cells.s[i] * cells.area[i]) / areaMean;
    } else {
      cells.pop[i] = 0;
    }
  }

  // Log statistics for debugging
  if (typeof console !== 'undefined' && console.log) {
    const populatedCells = Array.from(cells.s).filter(s => s > 0).length;
    const maxSuitability = cells.s.length > 0 ? Math.max(...cells.s) : 0;
    const avgSuitability = populatedCells > 0 
      ? (Array.from(cells.s).reduce((a, b) => a + b, 0) / populatedCells).toFixed(2)
      : 0;
    const maxPopulation = cells.pop.length > 0 ? Math.max(...cells.pop) : 0;
    const avgPopulation = populatedCells > 0
      ? (Array.from(cells.pop).reduce((a, b) => a + b, 0) / populatedCells).toFixed(2)
      : 0;
    
    console.log('[rankCells] Suitability and population calculated:', {
      totalCells: cells.i.length,
      populatedCells,
      populatedPercent: ((populatedCells / cells.i.length) * 100).toFixed(1) + '%',
      maxSuitability,
      avgSuitability,
      maxPopulation,
      avgPopulation,
      flMean: flMean.toFixed(2),
      flMax: flMax.toFixed(2),
      areaMean: areaMean.toFixed(2),
    });
  }

  return {
    s: cells.s,
    pop: cells.pop,
  };
}
