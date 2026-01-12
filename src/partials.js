/**
 * =============================================================================
 * partials.js
 * Desc: Helpers for phase caching, fallbacks, and dependency checks for partial generation
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

import { PHASES } from './utils/constants.js';
import { DependencyError } from './utils/errors.js';
import { createTypedArray } from './utils/array.js';

/**
 * Get phase-specific seed from main seed and phase name.
 * Ensures same seed + phase name always produces same RNG sequence.
 * Formula: phaseSeed = hash(mainSeed + phaseName)
 * 
 * @param {string|number} mainSeed - Main generation seed
 * @param {string} phaseName - Phase name from PHASES constant
 * @returns {string} Phase-specific seed string
 */
export function getPhaseSeed(mainSeed, phaseName) {
  // Convert seed to string for consistent hashing
  const seedStr = String(mainSeed);
  
  // Simple hash: combine seed and phase name
  let hash = 0;
  const combined = seedStr + phaseName;
  
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Return as string for RNG compatibility
  return String(Math.abs(hash));
}

/**
 * Efficient deep copy of phase-relevant data for caching.
 * Uses structuredClone for modern browsers, falls back to JSON for compatibility.
 * Preserves typed arrays (e.g., Uint8Array for heights).
 * 
 * @param {string} phaseName - Phase name from PHASES constant
 * @param {Object} fullData - Full data object (grid, pack, etc.)
 * @returns {Object} Deep copy of phase-relevant data subset
 */
export function efficientDeepCopyOfRelevantData(phaseName, fullData) {
  const phaseData = getPhaseData(phaseName, fullData);
  
  // Use structuredClone if available (faster, handles more types including typed arrays)
  if (typeof structuredClone !== 'undefined') {
    try {
      return structuredClone(phaseData);
    } catch (e) {
      // Fallback if structuredClone fails (e.g., for functions)
      console.warn(`structuredClone failed for ${phaseName}, using fallback:`, e);
      return fallbackDeepCopy(phaseData);
    }
  }
  
  // Fallback: JSON round-trip (slower, but compatible)
  return fallbackDeepCopy(phaseData);
}

/**
 * Fallback deep copy using JSON round-trip.
 * Handles typed arrays by converting to regular arrays.
 * 
 * @param {Object} obj - Object to deep copy
 * @returns {Object} Deep copy
 */
function fallbackDeepCopy(obj) {
  // Handle typed arrays specially
  if (obj instanceof Uint8Array || obj instanceof Uint16Array || 
      obj instanceof Int8Array || obj instanceof Float32Array) {
    return obj.slice(); // Typed arrays have slice() that preserves type
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => fallbackDeepCopy(item));
  }
  
  if (obj && typeof obj === 'object') {
    const copy = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        copy[key] = fallbackDeepCopy(obj[key]);
      }
    }
    return copy;
  }
  
  return obj;
}

/**
 * Extract phase-specific data subset for caching.
 * Minimizes memory footprint by only storing what's needed.
 * 
 * @param {string} phaseName - Phase name from PHASES constant
 * @param {Object} fullData - Full data object (grid, pack, etc.)
 * @returns {Object} Phase-specific data subset
 */
function getPhaseData(phaseName, fullData) {
  const { grid, pack } = fullData || {};
  
  switch (phaseName) {
    case PHASES.VORONOI:
      // Store grid structure (cells, points, vertices)
      return {
        grid: {
          cells: {
            i: grid?.cells?.i ? Array.from(grid.cells.i) : [],
            c: grid?.cells?.c ? deepCopyArrayOfArrays(grid.cells.c) : [],
          },
          points: grid?.points ? grid.points.map(p => [...p]) : [],
          vertices: grid?.vertices ? {
            p: grid.vertices.p ? grid.vertices.p.map(v => [...v]) : [],
            v: grid.vertices.v ? deepCopyArrayOfArrays(grid.vertices.v) : [],
            c: grid.vertices.c ? deepCopyArrayOfArrays(grid.vertices.c) : [],
          } : {},
        }
      };
      
    case PHASES.HEIGHTMAP:
      // Store heightmap as array (will be converted back to Uint8Array on restore)
      return {
        grid: {
          cells: {
            h: grid?.cells?.h ? Array.from(grid.cells.h) : [],
          }
        }
      };
      
    case PHASES.GRID_MARKUP:
      // Store grid markup data (features, boundaries, etc.)
      return {
        grid: {
          cells: {
            f: grid?.cells?.f ? Array.from(grid.cells.f) : [],
            b: grid?.cells?.b ? Array.from(grid.cells.b) : [],
            t: grid?.cells?.t ? Array.from(grid.cells.t) : [],
          },
          features: grid?.features ? deepCopyArray(grid.features) : [],
        }
      };
      
    case PHASES.MAP_COORDINATES:
      // Map coordinates are typically recalculated, but cache for consistency
      return {
        mapCoordinates: fullData?.mapCoordinates ? deepCopyArray(fullData.mapCoordinates) : null,
      };
      
    case PHASES.TEMPERATURES:
      // Store temperature data
      return {
        grid: {
          cells: {
            temp: grid?.cells?.temp ? Array.from(grid.cells.temp) : [],
          }
        }
      };
      
    case PHASES.PRECIPITATION:
      // Store precipitation data
      return {
        grid: {
          cells: {
            prec: grid?.cells?.prec ? Array.from(grid.cells.prec) : [],
          }
        }
      };
      
    default:
      // Full copy if phase-specific extraction not defined
      return fullData;
  }
}

/**
 * Deep copy array of arrays (for vertices, etc.)
 * @param {Array} arr - Array of arrays
 * @returns {Array} Deep copy
 */
function deepCopyArrayOfArrays(arr) {
  if (!Array.isArray(arr)) return arr;
  return arr.map(item => Array.isArray(item) ? [...item] : item);
}

/**
 * Deep copy array of objects
 * @param {Array} arr - Array of objects
 * @returns {Array} Deep copy
 */
function deepCopyArray(arr) {
  if (!Array.isArray(arr)) return arr;
  return arr.map(item => {
    if (Array.isArray(item)) return [...item];
    if (item && typeof item === 'object') {
      const copy = {};
      for (const key in item) {
        if (item.hasOwnProperty(key)) {
          copy[key] = deepCopyArray(item[key]);
        }
      }
      return copy;
    }
    return item;
  });
}

/**
 * Get fallback data for a skipped phase when cache is unavailable.
 * Ensures generation can continue without crashing, but may produce incomplete maps.
 * 
 * @param {string} phaseName - Phase name from PHASES constant
 * @param {Object} context - Context data (grid, pack, options, etc.)
 * @returns {Object|null} Fallback data or null if no fallback available
 */
export function getFallbackForPhase(phaseName, context) {
  const { grid, pack, options } = context || {};
  
  switch (phaseName) {
    case PHASES.HEIGHTMAP:
      // Default: Flat ocean (height = 0)
      if (grid?.cells?.i) {
        const length = grid.cells.i.length;
        return {
          grid: {
            cells: {
              h: new Uint8Array(length).fill(0), // All ocean
            }
          }
        };
      }
      return null;
      
    case PHASES.GRID_MARKUP:
      // Default: No features, no boundaries
      if (grid?.cells?.i) {
        const length = grid.cells.i.length;
        return {
          grid: {
            cells: {
              f: new Uint16Array(length).fill(0),
              b: new Uint8Array(length).fill(0),
              t: new Int8Array(length).fill(0),
            },
            features: [],
          }
        };
      }
      return null;
      
    case PHASES.MAP_COORDINATES:
      // Default: Simple coordinates (can be recalculated)
      return {
        mapCoordinates: null, // Will be recalculated
      };
      
    case PHASES.TEMPERATURES:
      // Default: Uniform temperature (equator temp)
      if (grid?.cells?.i) {
        const length = grid.cells.i.length;
        const defaultTemp = options?.temperatureEquator || 27;
        return {
          grid: {
            cells: {
              temp: new Float32Array(length).fill(defaultTemp),
            }
          }
        };
      }
      return null;
      
    case PHASES.PRECIPITATION:
      // Default: Uniform precipitation (50%)
      if (grid?.cells?.i) {
        const length = grid.cells.i.length;
        return {
          grid: {
            cells: {
              prec: new Float32Array(length).fill(50.0),
            }
          }
        };
      }
      return null;
      
    default:
      // No fallback for most phases
      return null;
  }
}

/**
 * Restore phase data from cache and merge into current state.
 * 
 * @param {string} phaseName - Phase name from PHASES constant
 * @param {Object} cachedData - Cached data from state.cached
 * @param {Object} currentData - Current data object (grid, pack, etc.)
 */
export function restorePhaseData(phaseName, cachedData, currentData) {
  if (!cachedData) {
    throw new DependencyError(
      phaseName,
      phaseName,
      `No cache available for phase: ${phaseName}`
    );
  }
  
  const { grid, pack } = currentData || {};
  
  // Ensure grid structure exists
  if (!grid) {
    throw new DependencyError(
      phaseName,
      phaseName,
      `Cannot restore ${phaseName}: grid structure not initialized`
    );
  }
  
  // Ensure grid.cells exists
  if (!grid.cells) {
    grid.cells = {};
  }
  
  switch (phaseName) {
    case PHASES.VORONOI:
      // Restore grid structure
      if (cachedData.grid) {
        if (cachedData.grid.cells?.i) {
          grid.cells.i = createTypedArray({ maxValue: 65535, length: cachedData.grid.cells.i.length });
          grid.cells.i.set(cachedData.grid.cells.i);
        }
        if (cachedData.grid.cells?.c) {
          grid.cells.c = cachedData.grid.cells.c;
        }
        if (cachedData.grid.points) {
          grid.points = cachedData.grid.points;
        }
        if (cachedData.grid.vertices) {
          grid.vertices = cachedData.grid.vertices;
        }
      }
      break;
      
    case PHASES.HEIGHTMAP:
      // Restore heightmap (convert array back to Uint8Array)
      if (cachedData.grid?.cells?.h) {
        const heights = new Uint8Array(cachedData.grid.cells.h.length);
        heights.set(cachedData.grid.cells.h);
        grid.cells.h = heights;
      } else if (grid.cells.i && grid.cells.i.length > 0) {
        // Initialize empty heightmap if cache missing but grid exists
        grid.cells.h = new Uint8Array(grid.cells.i.length).fill(0);
      }
      break;
      
    case PHASES.GRID_MARKUP:
      // Restore grid markup
      if (cachedData.grid?.cells) {
        if (cachedData.grid.cells.f) {
          grid.cells.f = createTypedArray({ maxValue: 65535, length: cachedData.grid.cells.f.length });
          grid.cells.f.set(cachedData.grid.cells.f);
        }
        if (cachedData.grid.cells.b) {
          grid.cells.b = new Uint8Array(cachedData.grid.cells.b.length);
          grid.cells.b.set(cachedData.grid.cells.b);
        }
        if (cachedData.grid.cells.t) {
          grid.cells.t = new Int8Array(cachedData.grid.cells.t.length);
          grid.cells.t.set(cachedData.grid.cells.t);
        }
        if (cachedData.grid.features) {
          grid.features = cachedData.grid.features;
        }
      }
      break;
      
    case PHASES.MAP_COORDINATES:
      // Map coordinates are typically recalculated, but restore if cached
      if (cachedData.mapCoordinates) {
        currentData.mapCoordinates = cachedData.mapCoordinates;
      }
      break;
      
    case PHASES.TEMPERATURES:
      // Restore temperatures (convert array back to Float32Array)
      if (cachedData.grid?.cells?.temp) {
        const temps = new Float32Array(cachedData.grid.cells.temp.length);
        temps.set(cachedData.grid.cells.temp);
        grid.cells.temp = temps;
      } else if (grid.cells.i && grid.cells.i.length > 0) {
        // Initialize default temperatures if cache missing but grid exists
        const defaultTemp = 27; // Default equator temperature
        grid.cells.temp = new Float32Array(grid.cells.i.length).fill(defaultTemp);
      }
      break;
      
    case PHASES.PRECIPITATION:
      // Restore precipitation (convert array back to Float32Array)
      if (cachedData.grid?.cells?.prec) {
        const prec = new Float32Array(cachedData.grid.cells.prec.length);
        prec.set(cachedData.grid.cells.prec);
        grid.cells.prec = prec;
      } else if (grid.cells.i && grid.cells.i.length > 0) {
        // Initialize default precipitation if cache missing but grid exists
        grid.cells.prec = new Float32Array(grid.cells.i.length).fill(50.0);
      }
      break;
      
    default:
      console.warn(`No restore logic defined for phase: ${phaseName}`);
  }
}
