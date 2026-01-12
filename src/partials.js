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
 * Phase dependency graph (defines what phases require which others).
 * Used for validation and automatic dependency resolution.
 */
const PHASE_DEPENDENCIES = {
  [PHASES.HEIGHTMAP]: [PHASES.VORONOI],
  [PHASES.GRID_MARKUP]: [PHASES.HEIGHTMAP],
  [PHASES.MAP_COORDINATES]: [], // No dependencies
  [PHASES.TEMPERATURES]: [PHASES.HEIGHTMAP, PHASES.MAP_COORDINATES],
  [PHASES.PRECIPITATION]: [PHASES.HEIGHTMAP, PHASES.MAP_COORDINATES],
  [PHASES.PACK_CREATION]: [PHASES.VORONOI, PHASES.HEIGHTMAP],
  [PHASES.RIVERS]: [PHASES.PACK_CREATION, PHASES.PRECIPITATION],
  [PHASES.BIOMES]: [PHASES.PACK_CREATION, PHASES.TEMPERATURES, PHASES.PRECIPITATION],
  [PHASES.PACK_MARKUP]: [PHASES.PACK_CREATION],
  [PHASES.CLUSTER_MERGE]: [PHASES.PACK_MARKUP],
  [PHASES.RANK_CELLS]: [PHASES.BIOMES, PHASES.PACK_MARKUP],
  [PHASES.CULTURES]: [PHASES.RANK_CELLS, PHASES.BIOMES],
  [PHASES.BURGS]: [PHASES.CULTURES, PHASES.RIVERS],
  [PHASES.STATES]: [PHASES.BURGS],
  [PHASES.PROVINCES]: [PHASES.STATES],
  [PHASES.RELIGIONS]: [PHASES.STATES],
  [PHASES.EMBLEMS]: [PHASES.STATES, PHASES.CULTURES],
};

/**
 * Check if all dependencies for a phase are available (either executed or cached).
 * 
 * @param {string} phaseName - Phase name from PHASES constant
 * @param {Array<string>} skipPhases - Array of phases to skip
 * @param {Object} cached - Cached phases object (state.cached)
 * @throws {DependencyError} If required dependencies are missing
 */
export function validatePhaseDependencies(phaseName, skipPhases, cached) {
  const deps = PHASE_DEPENDENCIES[phaseName] || [];
  
  for (const dep of deps) {
    // Check if dependency was skipped
    if (skipPhases.includes(dep)) {
      // Check if cached version exists
      if (!cached[dep]) {
        throw new DependencyError(
          phaseName,
          dep,
          `Cannot execute ${phaseName}: dependency ${dep} is skipped but not cached. ` +
          `Either run ${dep} first or provide cached data.`
        );
      }
    }
  }
}

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
      
    case PHASES.PACK_CREATION:
      // Store pack structure (cells, vertices, features)
      return {
        pack: {
          cells: {
            i: pack?.cells?.i ? Array.from(pack.cells.i) : [],
            h: pack?.cells?.h ? Array.from(pack.cells.h) : [],
            g: pack?.cells?.g ? Array.from(pack.cells.g) : [],
            p: pack?.cells?.p ? pack.cells.p.map(p => [...p]) : [],
            c: pack?.cells?.c ? deepCopyArrayOfArrays(pack.cells.c) : [],
            v: pack?.cells?.v ? deepCopyArrayOfArrays(pack.cells.v) : [],
            area: pack?.cells?.area ? Array.from(pack.cells.area) : [],
          },
          vertices: pack?.vertices ? {
            p: pack.vertices.p ? pack.vertices.p.map(v => [...v]) : [],
            v: pack.vertices.v ? deepCopyArrayOfArrays(pack.vertices.v) : [],
            c: pack.vertices.c ? deepCopyArrayOfArrays(pack.vertices.c) : [],
          } : {},
          features: pack?.features ? deepCopyArray(pack.features) : [],
        }
      };
      
    case PHASES.RIVERS:
      // Store rivers data
      return {
        pack: {
          rivers: pack?.rivers ? deepCopyArray(pack.rivers) : [],
        }
      };
      
    case PHASES.BIOMES:
      // Store biome assignments
      return {
        pack: {
          cells: {
            biome: pack?.cells?.biome ? Array.from(pack.cells.biome) : [],
          }
        }
      };
      
    case PHASES.PACK_MARKUP:
      // Store pack markup (features after markupPack)
      return {
        pack: {
          features: pack?.features ? deepCopyArray(pack.features) : [],
        }
      };
      
    case PHASES.CLUSTER_MERGE:
      // Cluster merge modifies features, cache updated features
      return {
        pack: {
          features: pack?.features ? deepCopyArray(pack.features) : [],
        }
      };
      
    case PHASES.RANK_CELLS:
      // Rank cells data (suitability scores)
      return {
        pack: {
          cells: {
            // Rank cells modifies pack.cells but doesn't add new arrays typically
            // Cache is mainly for dependency tracking
          }
        }
      };
      
    case PHASES.CULTURES:
      // Store cultures data
      return {
        pack: {
          cultures: pack?.cultures ? deepCopyArray(pack.cultures) : [],
          cells: {
            culture: pack?.cells?.culture ? Array.from(pack.cells.culture) : [],
          }
        }
      };
      
    case PHASES.BURGS:
      // Store burgs (settlements) data
      return {
        pack: {
          burgs: pack?.burgs ? deepCopyArray(pack.burgs) : [],
        }
      };
      
    case PHASES.STATES:
      // Store states data
      return {
        pack: {
          states: pack?.states ? deepCopyArray(pack.states) : [],
          cells: {
            state: pack?.cells?.state ? Array.from(pack.cells.state) : [],
          }
        }
      };
      
    case PHASES.PROVINCES:
      // Store provinces data
      return {
        pack: {
          provinces: pack?.provinces ? deepCopyArray(pack.provinces) : [],
          cells: {
            province: pack?.cells?.province ? Array.from(pack.cells.province) : [],
          }
        }
      };
      
    case PHASES.RELIGIONS:
      // Store religions data
      return {
        pack: {
          religions: pack?.religions ? deepCopyArray(pack.religions) : [],
          cells: {
            religion: pack?.cells?.religion ? Array.from(pack.cells.religion) : [],
          }
        }
      };
      
    case PHASES.EMBLEMS:
      // Store emblems data (typically stored in states/cultures)
      return {
        pack: {
          // Emblems are typically attached to states/cultures, so we cache those
          states: pack?.states ? deepCopyArray(pack.states) : [],
          cultures: pack?.cultures ? deepCopyArray(pack.cultures) : [],
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
      
    case PHASES.PACK_CREATION:
      // No fallback - pack creation is required
      return null;
      
    case PHASES.RIVERS:
      // Default: Empty rivers array
      return {
        pack: {
          rivers: [],
        }
      };
      
    case PHASES.BIOMES:
      // Default: Ocean biome for all cells
      if (pack?.cells?.i) {
        const length = pack.cells.i.length;
        return {
          pack: {
            cells: {
              biome: new Uint8Array(length).fill(0), // Ocean biome
            }
          }
        };
      }
      return null;
      
    case PHASES.PACK_MARKUP:
    case PHASES.CLUSTER_MERGE:
      // Default: Empty features array
      return {
        pack: {
          features: [],
        }
      };
      
    case PHASES.RANK_CELLS:
      // No fallback - rank cells is required for cultures/burgs/states
      return null;
      
    case PHASES.CULTURES:
      // Default: Empty cultures array
      if (pack?.cells?.i) {
        const length = pack.cells.i.length;
        return {
          pack: {
            cultures: [],
            cells: {
              culture: new Uint16Array(length).fill(0),
            }
          }
        };
      }
      return null;
      
    case PHASES.BURGS:
      // Default: Empty burgs array
      return {
        pack: {
          burgs: [],
        }
      };
      
    case PHASES.STATES:
      // Default: Single state covering entire map
      if (pack?.cells?.i) {
        const length = pack.cells.i.length;
        return {
          pack: {
            states: [{ i: 0, name: 'Default State', cells: Array.from({ length }, (_, i) => i) }],
            cells: {
              state: new Uint16Array(length).fill(0),
            }
          }
        };
      }
      return null;
      
    case PHASES.PROVINCES:
      // Default: Empty provinces array
      if (pack?.cells?.i) {
        const length = pack.cells.i.length;
        return {
          pack: {
            provinces: [],
            cells: {
              province: new Uint16Array(length).fill(0),
            }
          }
        };
      }
      return null;
      
    case PHASES.RELIGIONS:
      // Default: Single "No religion" entry if religionsNumber > 0, otherwise empty
      if (pack?.cells?.i) {
        const length = pack.cells.i.length;
        const religions = options?.religionsNumber > 0 
          ? [{ name: 'No religion', i: 0 }]
          : [];
        return {
          pack: {
            religions: religions,
            cells: {
              religion: new Uint16Array(length).fill(0),
            }
          }
        };
      }
      return null;
      
    case PHASES.EMBLEMS:
      // Default: No emblems (empty)
      return {
        pack: {
          // Emblems are attached to states/cultures, so no separate fallback needed
        }
      };
      
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
      
    case PHASES.PACK_CREATION:
      // Restore pack structure
      if (cachedData.pack && pack) {
        if (cachedData.pack.cells) {
          if (cachedData.pack.cells.i) {
            pack.cells.i = createTypedArray({ maxValue: 65535, length: cachedData.pack.cells.i.length });
            pack.cells.i.set(cachedData.pack.cells.i);
          }
          if (cachedData.pack.cells.h) {
            pack.cells.h = new Uint8Array(cachedData.pack.cells.h.length);
            pack.cells.h.set(cachedData.pack.cells.h);
          }
          if (cachedData.pack.cells.g) {
            pack.cells.g = createTypedArray({ maxValue: 65535, length: cachedData.pack.cells.g.length });
            pack.cells.g.set(cachedData.pack.cells.g);
          }
          if (cachedData.pack.cells.p) pack.cells.p = cachedData.pack.cells.p;
          if (cachedData.pack.cells.c) pack.cells.c = cachedData.pack.cells.c;
          if (cachedData.pack.cells.v) pack.cells.v = cachedData.pack.cells.v;
          if (cachedData.pack.cells.area) {
            pack.cells.area = new Float32Array(cachedData.pack.cells.area.length);
            pack.cells.area.set(cachedData.pack.cells.area);
          }
        }
        if (cachedData.pack.vertices) pack.vertices = cachedData.pack.vertices;
        if (cachedData.pack.features) pack.features = cachedData.pack.features;
      }
      break;
      
    case PHASES.RIVERS:
      // Restore rivers
      if (cachedData.pack?.rivers && pack) {
        pack.rivers = cachedData.pack.rivers;
      } else if (pack) {
        pack.rivers = [];
      }
      break;
      
    case PHASES.BIOMES:
      // Restore biomes
      if (cachedData.pack?.cells?.biome && pack?.cells) {
        const biomes = new Uint8Array(cachedData.pack.cells.biome.length);
        biomes.set(cachedData.pack.cells.biome);
        pack.cells.biome = biomes;
      } else if (pack?.cells?.i) {
        pack.cells.biome = new Uint8Array(pack.cells.i.length).fill(0);
      }
      break;
      
    case PHASES.PACK_MARKUP:
    case PHASES.CLUSTER_MERGE:
      // Restore pack features
      if (cachedData.pack?.features && pack) {
        pack.features = cachedData.pack.features;
      } else if (pack) {
        pack.features = [];
      }
      break;
      
    case PHASES.RANK_CELLS:
      // Rank cells doesn't add new data structures, just modifies existing ones
      // No restoration needed, but mark as processed
      break;
      
    case PHASES.CULTURES:
      // Restore cultures
      if (cachedData.pack && pack) {
        if (cachedData.pack.cultures) pack.cultures = cachedData.pack.cultures;
        if (cachedData.pack.cells?.culture) {
          pack.cells.culture = createTypedArray({ maxValue: 65535, length: cachedData.pack.cells.culture.length });
          pack.cells.culture.set(cachedData.pack.cells.culture);
        }
      }
      break;
      
    case PHASES.BURGS:
      // Restore burgs
      if (cachedData.pack?.burgs && pack) {
        pack.burgs = cachedData.pack.burgs;
      } else if (pack) {
        pack.burgs = [];
      }
      break;
      
    case PHASES.STATES:
      // Restore states
      if (cachedData.pack && pack) {
        if (cachedData.pack.states) pack.states = cachedData.pack.states;
        if (cachedData.pack.cells?.state) {
          pack.cells.state = createTypedArray({ maxValue: 65535, length: cachedData.pack.cells.state.length });
          pack.cells.state.set(cachedData.pack.cells.state);
        }
      }
      break;
      
    case PHASES.PROVINCES:
      // Restore provinces
      if (cachedData.pack && pack) {
        if (cachedData.pack.provinces) pack.provinces = cachedData.pack.provinces;
        if (cachedData.pack.cells?.province) {
          pack.cells.province = createTypedArray({ maxValue: 65535, length: cachedData.pack.cells.province.length });
          pack.cells.province.set(cachedData.pack.cells.province);
        }
      }
      break;
      
    case PHASES.RELIGIONS:
      // Restore religions
      if (cachedData.pack && pack) {
        if (cachedData.pack.religions) pack.religions = cachedData.pack.religions;
        if (cachedData.pack.cells?.religion) {
          pack.cells.religion = createTypedArray({ maxValue: 65535, length: cachedData.pack.cells.religion.length });
          pack.cells.religion.set(cachedData.pack.cells.religion);
        }
      }
      break;
      
    case PHASES.EMBLEMS:
      // Restore emblems (stored in states/cultures)
      if (cachedData.pack && pack) {
        if (cachedData.pack.states) pack.states = cachedData.pack.states;
        if (cachedData.pack.cultures) pack.cultures = cachedData.pack.cultures;
      }
      break;
      
    default:
      console.warn(`No restore logic defined for phase: ${phaseName}`);
  }
}
