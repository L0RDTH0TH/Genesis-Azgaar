/**
 * =============================================================================
 * partials.js
 * Desc: Partial generation support with caching, fallbacks, RNG consistency, and dependency handling
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

import { PHASES } from './utils/constants.js';
import { RNG } from './utils/rng.js';
import { createTypedArray } from './utils/array.js';
import { GenerationError } from './utils/errors.js';
import { getDefaultBiomes } from './core/index.js';

/**
 * Phase dependency graph
 * Defines which phases must run before a given phase
 */
export const PHASE_DEPENDENCIES = {
  [PHASES.VORONOI]: [],
  [PHASES.HEIGHTMAP]: [PHASES.VORONOI],
  [PHASES.MARKUP_GRID]: [PHASES.HEIGHTMAP],
  [PHASES.MAP_COORDINATES]: [],
  [PHASES.TEMPERATURE]: [PHASES.HEIGHTMAP, PHASES.MAP_COORDINATES],
  [PHASES.PRECIPITATION]: [PHASES.HEIGHTMAP, PHASES.MAP_COORDINATES, PHASES.TEMPERATURE],
  [PHASES.PACK_CREATION]: [PHASES.HEIGHTMAP],
  [PHASES.RIVERS]: [PHASES.PACK_CREATION, PHASES.PRECIPITATION],
  [PHASES.BIOMES]: [PHASES.PACK_CREATION, PHASES.TEMPERATURE, PHASES.PRECIPITATION],
  [PHASES.MARKUP_PACK]: [PHASES.PACK_CREATION],
  [PHASES.FEATURES]: [PHASES.MARKUP_PACK],
  [PHASES.CULTURES]: [PHASES.BIOMES, PHASES.FEATURES],
  [PHASES.BURGS]: [PHASES.CULTURES],
  [PHASES.DUAL_GRID_STATES]: [PHASES.BURGS],
  [PHASES.STATES]: [PHASES.BURGS],
  [PHASES.PROVINCES]: [PHASES.STATES],
  [PHASES.RELIGIONS]: [PHASES.STATES],
  [PHASES.EMBLEMS]: [PHASES.STATES],
};

/**
 * Validate that phase names array contains valid phase names
 * @param {Array<string>} phases - Array of phase names
 * @param {string} context - Context for error message (e.g., 'skipPhases', 'phasesToRun')
 * @throws {GenerationError} If invalid phase names found
 */
export function validatePhaseNames(phases, context = 'phases') {
  if (!Array.isArray(phases)) {
    throw new GenerationError(`${context} must be an array`);
  }
  
  const validPhases = Object.values(PHASES);
  const invalid = phases.filter(phase => !validPhases.includes(phase));
  
  if (invalid.length > 0) {
    throw new GenerationError(`Invalid phase names in ${context}: ${invalid.join(', ')}`);
  }
}

/**
 * Validate that skipPhases array contains valid phase names
 * @param {Array<string>} skipPhases - Array of phase names to skip
 * @throws {GenerationError} If invalid phase names found
 */
export function validateSkipPhases(skipPhases) {
  validatePhaseNames(skipPhases, 'skipPhases');
}

/**
 * Validate that all dependencies for requested phases are satisfied
 * @param {Array<string>} phasesToRun - Phases to run
 * @param {Array<string>} skipPhases - Phases to skip
 * @throws {GenerationError} If dependencies are missing
 */
export function validatePhaseDependencies(phasesToRun, skipPhases = []) {
  const missing = new Set();
  
  for (const phase of phasesToRun) {
    const deps = PHASE_DEPENDENCIES[phase] || [];
    for (const dep of deps) {
      // If dependency is skipped or not in phasesToRun, it's missing
      if (skipPhases.includes(dep) || !phasesToRun.includes(dep)) {
        missing.add(dep);
      }
    }
  }
  
  if (missing.size > 0) {
    const missingArray = Array.from(missing);
    throw new GenerationError(
      `Missing required dependencies for phases: ${missingArray.join(', ')}. ` +
      `Either include these phases or ensure they are cached/available.`
    );
  }
}

/**
 * Auto-resolve dependencies by adding missing phases to phasesToRun
 * @param {Array<string>} phasesToRun - Initial phases to run
 * @param {Array<string>} skipPhases - Phases to skip
 * @returns {Array<string>} Expanded phasesToRun with dependencies
 */
export function resolvePhaseDependencies(phasesToRun, skipPhases = []) {
  const resolved = new Set(phasesToRun);
  let changed = true;
  
  // Iteratively add dependencies until no new ones are found
  while (changed) {
    changed = false;
    for (const phase of Array.from(resolved)) {
      const deps = PHASE_DEPENDENCIES[phase] || [];
      for (const dep of deps) {
        if (!skipPhases.includes(dep) && !resolved.has(dep)) {
          resolved.add(dep);
          changed = true;
        }
      }
    }
  }
  
  return Array.from(resolved);
}

/**
 * Get phase-specific seed from main seed
 * Ensures RNG consistency across partial runs
 * @param {string|number} mainSeed - Main generation seed
 * @param {string} phase - Phase name
 * @returns {string} Phase-specific seed
 */
export function getPhaseSeed(mainSeed, phase) {
  return `${mainSeed}_${phase}`;
}

/**
 * Efficient deep copy of relevant data for a phase
 * Uses structuredClone if available, falls back to JSON serialization
 * @param {Object} data - Data to copy
 * @returns {Object} Deep copy of data
 */
export function efficientDeepCopyOfRelevantData(data) {
  if (typeof structuredClone !== 'undefined') {
    try {
      return structuredClone(data);
    } catch (e) {
      // structuredClone may fail for some objects (e.g., functions, symbols)
      // Fall back to JSON method
    }
  }
  
  // Fallback: JSON serialization (loses functions, undefined, symbols)
  try {
    return JSON.parse(JSON.stringify(data));
  } catch (e) {
    throw new GenerationError(`Failed to deep copy data: ${e.message}`);
  }
}

/**
 * Extract phase-specific data subset from full state
 * @param {Object} stateData - Full state data {grid, pack, options, seed}
 * @param {string} phase - Phase name
 * @returns {Object} Phase-specific data subset
 */
export function getPhaseData(stateData, phase) {
  if (!stateData) return null;
  
  const { grid, pack, options, seed } = stateData;
  
  switch (phase) {
    case PHASES.VORONOI:
      return { grid, options, seed };
    case PHASES.HEIGHTMAP:
      return { grid: { cells: { h: grid?.cells?.h } }, options, seed };
    case PHASES.MARKUP_GRID:
      return { grid, options, seed };
    case PHASES.MAP_COORDINATES:
      return { mapCoordinates: null, options, seed }; // Will be recalculated
    case PHASES.TEMPERATURE:
      return { grid: { cells: { temp: grid?.cells?.temp } }, options, seed };
    case PHASES.PRECIPITATION:
      return { grid: { cells: { prec: grid?.cells?.prec } }, options, seed };
    case PHASES.PACK_CREATION:
      return { grid, pack, options, seed };
    case PHASES.RIVERS:
      return { grid, pack, options, seed };
    case PHASES.BIOMES:
      return { pack, grid, options, seed };
    case PHASES.MARKUP_PACK:
      return { pack, options, seed };
    case PHASES.FEATURES:
      return { pack, grid, options, seed };
    case PHASES.CULTURES:
      return { pack, grid, options, seed };
    case PHASES.BURGS:
      return { pack, grid, options, seed };
    case PHASES.DUAL_GRID_STATES:
      return { pack, grid, options, seed };
    case PHASES.STATES:
      return { pack, grid, options, seed };
    case PHASES.PROVINCES:
      return { pack, options, seed };
    case PHASES.RELIGIONS:
      return { pack, options, seed };
    case PHASES.EMBLEMS:
      return { pack, options, seed };
    default:
      return { grid, pack, options, seed };
  }
}

/**
 * Get fallback data for a phase when it's skipped
 * @param {string} phase - Phase name
 * @param {Object} stateData - Current state data
 * @returns {Object} Fallback data for the phase
 */
export function getFallbackForPhase(phase, stateData) {
  const { grid, pack, options } = stateData || {};
  const numCells = pack?.cells?.i?.length || grid?.cells?.i?.length || 0;
  
  switch (phase) {
    case PHASES.HEIGHTMAP:
      // Default: flat heightmap (all zeros or low values)
      if (grid && grid.cells) {
        if (!grid.cells.h) {
          grid.cells.h = new Uint8Array(numCells);
        }
      }
      return { grid, options };
      
    case PHASES.TEMPERATURE:
      // Default: moderate temperature (50% of range)
      if (grid && grid.cells) {
        if (!grid.cells.temp) {
          const defaultTemp = Math.floor((options?.temperatureEquator || 30) + (options?.temperaturePole || -20)) / 2;
          grid.cells.temp = new Int8Array(numCells).fill(defaultTemp);
        }
      }
      return { grid, options };
      
    case PHASES.PRECIPITATION:
      // Default: moderate precipitation (50% of range)
      if (grid && grid.cells) {
        if (!grid.cells.prec) {
          const defaultPrec = Math.floor((options?.precipitationMax || 100) * 0.5);
          grid.cells.prec = new Uint8Array(numCells).fill(defaultPrec);
        }
      }
      return { grid, options };
      
    case PHASES.BIOMES:
      // Default: use default biomes with basic assignment
      if (pack && pack.cells) {
        if (!pack.cells.biome) {
          const biomesData = getDefaultBiomes();
          const defaultBiome = biomesData.find(b => b.name === 'Ocean') || biomesData[0];
          pack.cells.biome = new Uint8Array(numCells).fill(defaultBiome.i || 0);
        }
      }
      return { pack, grid, options };
      
    case PHASES.RIVERS:
      // Default: no rivers
      if (pack) {
        pack.rivers = [];
      }
      return { grid, pack, options };
      
    case PHASES.CULTURES:
      // Default: single default culture
      if (pack) {
        pack.cultures = [{ name: 'Default Culture', i: 0, color: '#888888' }];
        if (pack.cells && !pack.cells.culture) {
          pack.cells.culture = createTypedArray({ maxValue: 65535, length: numCells });
        }
      }
      return { pack, grid, options };
      
    case PHASES.BURGS:
      // Default: no burgs
      if (pack) {
        pack.burgs = [];
      }
      return { pack, grid, options };
      
    case PHASES.STATES:
      // Default: single state covering all cells
      if (pack) {
        pack.states = [{ name: 'Default State', i: 0, color: '#cccccc' }];
        if (pack.cells && !pack.cells.state) {
          pack.cells.state = createTypedArray({ maxValue: 65535, length: numCells });
        }
      }
      return { pack, grid, options };
      
    case PHASES.PROVINCES:
      // Default: no provinces
      if (pack) {
        pack.provinces = [];
      }
      return { pack, grid, options };
      
    case PHASES.RELIGIONS:
      // Default: no religion
      if (pack) {
        pack.religions = [{ name: 'No religion', i: 0 }];
        if (pack.cells && !pack.cells.religion) {
          pack.cells.religion = createTypedArray({ maxValue: 65535, length: numCells });
        }
      }
      return { pack, grid, options };
      
    case PHASES.EMBLEMS:
      // Default: no emblems
      if (pack) {
        pack.emblems = [];
      }
      return { pack, grid, options };
      
    case PHASES.DUAL_GRID_STATES:
      // Default: no dual grid
      if (pack) {
        pack.dualGrid = null;
      }
      return { pack, grid, options };
      
    default:
      return { grid, pack, options };
  }
}

/**
 * Cache phase data in state.cached
 * @param {Object} state - Generator state object
 * @param {string} phase - Phase name
 * @param {Object} phaseData - Data to cache
 */
export function cachePhase(state, phase, phaseData) {
  if (!state.cached) {
    state.cached = {};
  }
  state.cached[phase] = efficientDeepCopyOfRelevantData(phaseData);
}

/**
 * Restore phase data from cache
 * @param {Object} state - Generator state object
 * @param {string} phase - Phase name
 * @returns {Object|null} Cached phase data, or null if not cached
 */
export function restoreFromCache(state, phase) {
  if (!state.cached || !state.cached[phase]) {
    return null;
  }
  return efficientDeepCopyOfRelevantData(state.cached[phase]);
}

/**
 * Execute a phase with wrapper handling skips, caching, fallbacks, dependencies, and RNG
 * @param {Object} params - Execution parameters
 * @param {string} params.phase - Phase name
 * @param {Function} params.phaseFunction - Function to execute for this phase
 * @param {Object} params.state - Generator state
 * @param {Object} params.stateData - Current state data {grid, pack, options, seed}
 * @param {Array<string>} params.skipPhases - Phases to skip
 * @param {Function} params.DelaunatorClass - Delaunator class (if needed)
 * @returns {Object} Updated state data
 */
export function executePhaseWithWrapper({
  phase,
  phaseFunction,
  state,
  stateData,
  skipPhases = [],
  DelaunatorClass = null,
}) {
  // Check if phase should be skipped
  if (skipPhases.includes(phase)) {
    console.log(`[partials] Skipping phase: ${phase}`);
    
    // Try to restore from cache
    const cached = restoreFromCache(state, phase);
    if (cached) {
      console.log(`[partials] Restored ${phase} from cache`);
      // Merge cached data into stateData
      return mergePhaseData(stateData, cached, phase);
    }
    
    // Use fallback
    console.log(`[partials] Using fallback for ${phase}`);
    const fallback = getFallbackForPhase(phase, stateData);
    return mergePhaseData(stateData, fallback, phase);
  }
  
  // Check cache first
  const cached = restoreFromCache(state, phase);
  if (cached) {
    console.log(`[partials] Using cached ${phase}`);
    return mergePhaseData(stateData, cached, phase);
  }
  
  // Execute phase function
  console.log(`[partials] Executing phase: ${phase}`);
  const seed = stateData.seed || String(Date.now());
  const phaseSeed = getPhaseSeed(seed, phase);
  const phaseRng = new RNG(phaseSeed);
  
  // Call phase function with appropriate parameters
  const result = phaseFunction({
    stateData,
    rng: phaseRng,
    DelaunatorClass,
  });
  
  // Cache result
  const phaseData = getPhaseData(result, phase);
  cachePhase(state, phase, phaseData);
  
  return result;
}

/**
 * Merge phase data into state data
 * @param {Object} stateData - Current state data
 * @param {Object} phaseData - Phase-specific data to merge
 * @param {string} phase - Phase name
 * @returns {Object} Merged state data
 */
function mergePhaseData(stateData, phaseData, phase) {
  const merged = {
    grid: phaseData.grid || stateData.grid,
    pack: phaseData.pack || stateData.pack,
    options: phaseData.options || stateData.options,
    seed: phaseData.seed || stateData.seed,
  };
  
  // Phase-specific merging
  if (phase === PHASES.MAP_COORDINATES && phaseData.mapCoordinates) {
    merged.mapCoordinates = phaseData.mapCoordinates;
  }
  
  return merged;
}
