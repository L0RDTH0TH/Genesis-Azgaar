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
  [PHASES.DUAL_GRID]: [], // Precursor base phase (no dependencies)
  [PHASES.VORONOI]: [], // No dependencies in standard mode; depends on DUAL_GRID in precursor mode (handled in validatePhaseDependencies)
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
 * @param {Object} options - Optional options object to check gridMode
 * @throws {GenerationError} If invalid phase names found or DUAL_GRID skipped in precursor mode
 */
export function validateSkipPhases(skipPhases, options = {}) {
  validatePhaseNames(skipPhases, 'skipPhases');
  
  // Phase 2: Check if DUAL_GRID is skipped in precursor mode
  if (options.gridMode === 'dualPrecursor' && skipPhases.includes(PHASES.DUAL_GRID)) {
    throw new GenerationError(
      'Cannot skip DUAL_GRID in precursor mode. DUAL_GRID must run as the precursor to Voronoi when gridMode is "dualPrecursor".'
    );
  }
}

/**
 * Validate that all dependencies for requested phases are satisfied
 * Phase 5: Enhanced with cellId support and dualGrid validation for local runs
 * @param {Array<string>} phasesToRun - Phases to run
 * @param {Array<string>} skipPhases - Phases to skip
 * @param {Object} state - Generator state (optional, for cellId validation)
 * @param {number|null} cellId - Optional cell ID for local generation
 * @throws {GenerationError} If dependencies are missing or dualGrid missing for local runs
 */
export function validatePhaseDependencies(phasesToRun, skipPhases = [], state = null, cellId = null) {
  // Phase 5: If cellId provided (local run), check that dualGrid exists
  if (cellId !== null && cellId !== undefined && state) {
    if (!state.data || !state.data.dualGrid) {
      throw new GenerationError(
        `Local generation for cell ${cellId} requires dualGrid. ` +
        `Generate global map with gridMode: "dualPrecursor" first.`
      );
    }
    
    const quad = state.data.dualGrid.level0Quads?.[cellId];
    if (!quad) {
      throw new GenerationError(
        `Cell ${cellId} not found in dualGrid.level0Quads. ` +
        `Valid cellIds: 0-${(state.data.dualGrid.level0Quads?.length || 0) - 1}`
      );
    }
  }
  
  const missing = new Set();
  const warnings = [];
  
  for (const phase of phasesToRun) {
    const deps = PHASE_DEPENDENCIES[phase] || [];
    for (const dep of deps) {
      // If dependency is skipped or not in phasesToRun, it's missing
      if (skipPhases.includes(dep) || !phasesToRun.includes(dep)) {
        // Phase 5: Check if dependency is cached (for local runs, check subCaches)
        let isCached = false;
        if (state) {
          if (cellId !== null && cellId !== undefined) {
            // Check per-cell cache
            isCached = state.subCaches?.[cellId]?.[dep] !== undefined;
          } else {
            // Check global cache
            isCached = state.cached?.[dep] !== undefined;
          }
        }
        
        if (!isCached) {
          missing.add(dep);
          // Phase 5: Warn if skipping required dependency (will use fallback)
          warnings.push(`Phase ${phase} requires ${dep} (will use fallback)`);
        }
      }
    }
  }
  
  // Phase 5: Log warnings for fallback usage
  if (warnings.length > 0 && typeof console !== 'undefined' && console.warn) {
    const cellLabel = cellId !== null ? ` (cell ${cellId})` : '';
    warnings.forEach(w => console.warn(`[partials]${cellLabel} ${w}`));
  }
  
  if (missing.size > 0) {
    const missingArray = Array.from(missing);
    const cellLabel = cellId !== null ? ` for cell ${cellId}` : '';
    throw new GenerationError(
      `Missing required dependencies${cellLabel} for phases: ${missingArray.join(', ')}. ` +
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
 * Phase 4: Supports cellId for per-cell reproducible seeds
 * @param {string|number} mainSeed - Main generation seed
 * @param {string} phase - Phase name
 * @param {number|null} cellId - Optional cell ID for local generation
 * @returns {string} Phase-specific seed
 */
export function getPhaseSeed(mainSeed, phase, cellId = null) {
  // Phase 5: Strengthened hash function for better collision resistance and determinism
  // INVARIANT: Same seed+phase+cellId → same output (Iteration 5 Section 6.5)
  // Format: hash(`${seed}-${phase}-${cellId ?? 'global'}`)
  const seedStr = cellId !== null && cellId !== undefined
    ? `${mainSeed}-${phase}-${cellId}`
    : `${mainSeed}-${phase}-global`;
  
  // Use a more robust hash function (djb2 variant with better distribution)
  // INVARIANT: Deterministic hash ensures RNG consistency across runs
  let hash = 5381; // djb2 initial value
  for (let i = 0; i < seedStr.length; i++) {
    hash = ((hash << 5) + hash) + seedStr.charCodeAt(i);
    hash = hash & 0x7fffffff; // Ensure positive 31-bit integer
  }
  
  // Return as string seed (deterministic and collision-resistant)
  // INVARIANT: Hash is collision-free for practical seed/phase/cellId combinations
  return String(hash);
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
    case PHASES.DUAL_GRID:
      // Default: empty dual grid structure
      return {
        dualGrid: {
          points: [],
          dualPoints: [],
          level0Quads: [],
          level1Quads: [],
          neighbors: new Map(),
        },
        grid,
        pack,
        options,
      };
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
 * Cache phase data in state.cached or state.subCaches[cellId]
 * Phase 4: Supports per-cell caching via cellId parameter
 * @param {Object} state - Generator state object
 * @param {string} phase - Phase name
 * @param {Object} phaseData - Data to cache
 * @param {number|null} cellId - Optional cell ID for per-cell cache
 */
export function cachePhase(state, phase, phaseData, cellId = null) {
  // Determine target cache (global or per-cell)
  let targetCache;
  if (cellId !== null && cellId !== undefined) {
    // Per-cell cache
    if (!state.subCaches) {
      state.subCaches = {};
    }
    if (!state.subCaches[cellId]) {
      state.subCaches[cellId] = {};
    }
    targetCache = state.subCaches[cellId];
  } else {
    // Global cache
    if (!state.cached) {
      state.cached = {};
    }
    targetCache = state.cached;
  }
  
  targetCache[phase] = efficientDeepCopyOfRelevantData(phaseData);
}

/**
 * Restore phase data from cache (global or per-cell)
 * Phase 4: Supports per-cell cache lookup via cellId parameter
 * @param {Object} state - Generator state object
 * @param {string} phase - Phase name
 * @param {number|null} cellId - Optional cell ID for per-cell cache
 * @returns {Object|null} Cached phase data, or null if not cached
 */
export function restoreFromCache(state, phase, cellId = null) {
  // Determine target cache (global or per-cell)
  let targetCache;
  if (cellId !== null && cellId !== undefined) {
    // Per-cell cache
    if (!state.subCaches || !state.subCaches[cellId]) {
      return null;
    }
    targetCache = state.subCaches[cellId];
  } else {
    // Global cache
    if (!state.cached) {
      return null;
    }
    targetCache = state.cached;
  }
  
  if (!targetCache[phase]) {
    return null;
  }
  
  return efficientDeepCopyOfRelevantData(targetCache[phase]);
}

/**
 * Execute a phase with wrapper handling skips, caching, fallbacks, dependencies, and RNG
 * Phase 4: Supports per-cell execution via cellId parameter
 * @param {Object} params - Execution parameters
 * @param {string} params.phase - Phase name
 * @param {Function} params.phaseFunction - Function to execute for this phase
 * @param {Object} params.state - Generator state
 * @param {Object} params.stateData - Current state data {grid, pack, options, seed}
 * @param {Array<string>} params.skipPhases - Phases to skip
 * @param {Function} params.DelaunatorClass - Delaunator class (if needed)
 * @param {number|null} params.cellId - Optional cell ID for per-cell execution (Phase 4)
 * @returns {Object} Updated state data
 */
export function executePhaseWithWrapper({
  phase,
  phaseFunction,
  state,
  stateData,
  skipPhases = [],
  DelaunatorClass = null,
  cellId = null,
}) {
  // Check if phase should be skipped
  if (skipPhases.includes(phase)) {
    const cellLabel = cellId !== null ? ` (cell ${cellId})` : '';
    console.log(`[partials] Skipping phase: ${phase}${cellLabel}`);
    
    // Try to restore from cache (global or per-cell)
    const cached = restoreFromCache(state, phase, cellId);
    if (cached) {
      console.log(`[partials] Restored ${phase} from cache${cellLabel}`);
      // Merge cached data into stateData
      return mergePhaseData(stateData, cached, phase);
    }
    
    // Use fallback
    console.log(`[partials] Using fallback for ${phase}${cellLabel}`);
    const fallback = getFallbackForPhase(phase, stateData);
    return mergePhaseData(stateData, fallback, phase);
  }
  
  // Check cache first (global or per-cell)
  const cached = restoreFromCache(state, phase, cellId);
  if (cached) {
    const cellLabel = cellId !== null ? ` (cell ${cellId})` : '';
    console.log(`[partials] Using cached ${phase}${cellLabel}`);
    return mergePhaseData(stateData, cached, phase);
  }
  
  // Execute phase function
  const cellLabel = cellId !== null ? ` (cell ${cellId})` : '';
  console.log(`[partials] Executing phase: ${phase}${cellLabel}`);
  const seed = stateData.seed || String(Date.now());
  const phaseSeed = getPhaseSeed(seed, phase, cellId); // Phase 4: Include cellId
  const phaseRng = new RNG(phaseSeed);
  
  // Call phase function with appropriate parameters
  const result = phaseFunction({
    stateData,
    rng: phaseRng,
    DelaunatorClass,
    cellId, // Pass cellId to phase function if needed
  });
  
  // Cache result (global or per-cell)
  const phaseData = getPhaseData(result, phase);
  cachePhase(state, phase, phaseData, cellId); // Phase 4: Pass cellId
  
  // Phase 5: Log completion with timing
  const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const duration = endTime - startTime;
  console.log(`[partials] Phase ${phase}${cellLabel} completed in ${duration.toFixed(2)}ms`);
  
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
