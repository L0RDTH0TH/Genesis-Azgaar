/**
 * =============================================================================
 * generator.js
 * Desc: Main map generation entry point with stateful API for Genesis Mythos
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

import { RNG } from './utils/rng.js';
import { getDefaultOptions, mergeOptions } from './options.js';
import { createTypedArray } from './utils/array.js';
import { deepCopy } from './utils/array.js';
import {
  InitializationError,
  InvalidOptionError,
  GenerationError,
  NoDataError,
} from './utils/errors.js';
import {
  createVoronoiDiagram,
  createVoronoiFromPoints,
  generateHeightmap,
  calculateMapCoordinates,
  generatePrecipitation,
  generateRivers,
  calculateTemperatures,
  assignBiomes,
  getDefaultBiomes,
  markupGrid,
  markupPack,
  specifyFeatures,
  generateCultures,
  expandCultures,
  generateBurgs,
  generateStates,
  generateProvinces,
  generateReligions,
  generateEmblems,
  buildStalbergQuadGrid,
  snapBurgsToDualGrid,
  assignPatternsToQuads,
  assignVariantsToQuads,
  mapDualGridStatesToPack,
  adaptDualGridToVoronoiInput,
} from './core/index.js';
import { PHASES } from './utils/constants.js';
import { createPackFromGrid } from './core/regraph.js';
import { renderMapSVG } from './rendering/svg.js';
import {
  validateSkipPhases,
  validatePhaseDependencies,
  resolvePhaseDependencies,
  executePhaseWithWrapper,
  PHASE_DEPENDENCIES,
} from './partials.js';

/**
 * Singleton state for the generator
 */
let state = {
  container: null, // SVG container element (optional)
  options: getDefaultOptions(),
  data: null, // { grid, pack, seed }
  cached: {}, // Phase cache for partial generation
  initialized: false,
};

/**
 * Create simplified pack structure from grid (mirrors grid structure)
 * This is a fast pack creation for headless/data-only use cases
 * @param {Object} grid - Grid object
 * @param {Object} options - Generation options
 * @returns {Object} Pack object
 */
function createSimplifiedPack(grid, options) {
  const { cells: gridCells, points, vertices } = grid;
  
  // Create pack cells structure (simplified - mirrors grid for now)
  const packCells = {
    i: createTypedArray({ maxValue: gridCells.i.length, length: gridCells.i.length }).map((_, i) => i),
    p: points.slice(),
    g: createTypedArray({ maxValue: gridCells.i.length, length: gridCells.i.length }).map((_, i) => i),
    h: new Uint8Array(gridCells.h.length),
    c: gridCells.c ? gridCells.c.slice() : [],
    b: gridCells.b ? new Uint8Array(gridCells.b.length) : new Uint8Array(gridCells.i.length),
    t: gridCells.t ? new Int8Array(gridCells.t.length) : new Int8Array(gridCells.i.length),
    f: gridCells.f ? new Uint16Array(gridCells.f.length) : new Uint16Array(gridCells.i.length),
    area: new Float32Array(gridCells.i.length),
  };

  // Copy height data
  packCells.h.set(gridCells.h);
  
  // Copy feature and type data if available
  if (gridCells.t) packCells.t.set(gridCells.t);
  if (gridCells.f) packCells.f.set(gridCells.f);
  if (gridCells.b) packCells.b.set(gridCells.b);

  // Calculate basic area (simplified)
  for (let i = 0; i < gridCells.i.length; i++) {
    packCells.area[i] = 1.0; // Placeholder - would calculate from Voronoi polygon
  }

  const pack = {
    cells: packCells,
    vertices: vertices || {},
    features: grid.features || [],
  };

  return pack;
}

/**
 * Internal function: Generate map data using provided options
 * @param {Object} options - Generation options
 * @param {Function} DelaunatorClass - Delaunator class (required as peer dependency)
 * @param {Array<string>} phasesToRun - Optional: specific phases to run (for partial generation)
 * @returns {Object} Generated map data {grid, pack, options, seed}
 */
function generateMapInternal(options, DelaunatorClass, phasesToRun = null) {
  // Initialize RNG with seed
  const seed = options.seed || String(Date.now());
  
  // Validate skipPhases if provided
  const skipPhases = options.skipPhases || [];
  if (skipPhases.length > 0) {
    validateSkipPhases(skipPhases, options);
  }
  
  // Determine which phases to run
  let phases;
  if (phasesToRun) {
    // Partial generation: resolve dependencies and validate
    phases = resolvePhaseDependencies(phasesToRun, skipPhases);
    validatePhaseDependencies(phases, skipPhases);
  } else {
    // Full generation: all phases except skipped ones
    phases = Object.values(PHASES).filter(p => !skipPhases.includes(p));
  }
  
  // Initialize state data
  let stateData = {
    grid: null,
    pack: null,
    options,
    seed,
    mapCoordinates: null,
  };

  // Delaunator is required as a peer dependency for Voronoi phase
  if (!DelaunatorClass && phases.includes(PHASES.VORONOI)) {
    throw new GenerationError(
      'Delaunator is required as a peer dependency. Install: npm install delaunator, then pass Delaunator as the second parameter to generateMap()'
    );
  }
  
  // Execute phases in order
  // Conditionally add DUAL_GRID as first phase if gridMode is 'dualPrecursor'
  const phaseOrder = [];
  
  // If gridMode is 'dualPrecursor', add DUAL_GRID first as precursor
  if (options.gridMode === 'dualPrecursor') {
    phaseOrder.push(PHASES.DUAL_GRID);
  }
  
  // Then add remaining phases in order
  phaseOrder.push(
    PHASES.VORONOI,
    PHASES.HEIGHTMAP,
    PHASES.MARKUP_GRID,
    PHASES.MAP_COORDINATES,
    PHASES.TEMPERATURE,
    PHASES.PRECIPITATION,
    PHASES.PACK_CREATION,
    PHASES.RIVERS,
    PHASES.BIOMES,
    PHASES.MARKUP_PACK,
    PHASES.FEATURES,
    PHASES.CULTURES,
    PHASES.BURGS,
    PHASES.DUAL_GRID_STATES,
    PHASES.STATES,
    PHASES.PROVINCES,
    PHASES.RELIGIONS,
    PHASES.EMBLEMS,
  ];
  
  for (const phase of phaseOrder) {
    if (!phases.includes(phase)) {
      continue; // Skip phases not in phasesToRun
    }
    
    // Execute phase with wrapper
    stateData = executePhaseWithWrapper({
      phase,
      phaseFunction: getPhaseFunction(phase),
      state,
      stateData,
      skipPhases,
      DelaunatorClass,
    });
  }
  
  return {
    grid: stateData.grid,
    pack: stateData.pack,
    options: stateData.options,
    seed: stateData.seed,
    dualGrid: stateData.dualGrid || null, // Include dual grid if generated (Phase 2)
  };
}

/**
 * Get phase function for a given phase
 * @param {string} phase - Phase name
 * @returns {Function} Phase function
 */
function getPhaseFunction(phase) {
  switch (phase) {
    case PHASES.DUAL_GRID:
      return ({ stateData, rng, DelaunatorClass }) => {
        // Build dual grid as precursor (organic quads)
        const hexLayers = stateData.options.politicsMode?.hexLayers ?? stateData.options.politicsMode?.baseHexRings ?? 20;
        const dualGridOptions = {
          ...stateData.options,
          DelaunatorClass,
        };
        const dualGrid = buildStalbergQuadGrid(hexLayers, rng, dualGridOptions);
        
        // Store dual grid in state data
        stateData.dualGrid = dualGrid;
        
        // Log quad count
        const quadCount = (dualGrid.level0Quads?.length || 0) + (dualGrid.level1Quads?.length || 0);
        if (typeof console !== 'undefined' && console.log) {
          console.log(`Running precursor dual grid: ${quadCount} quads generated`);
        }
        
        return stateData;
      };
      
    case PHASES.VORONOI:
      return ({ stateData, rng, DelaunatorClass }) => {
        // Phase 3: If dualGrid exists (precursor mode), adapt it to Voronoi input
        let grid;
        
        if (stateData.dualGrid && stateData.options.gridMode === 'dualPrecursor') {
          // Adapt dual grid to Voronoi input (extract quad centroids as points)
          const adaptedInput = adaptDualGridToVoronoiInput(stateData.dualGrid, stateData.options);
          
          // Create Voronoi from adapted points (bypass point placement)
          if (!DelaunatorClass) {
            throw new Error('Delaunator is required for Voronoi generation in precursor mode');
          }
          
          const { points, boundary } = adaptedInput;
          
          // Create Voronoi from adapted points using helper function
          grid = createVoronoiFromPoints(points, boundary, stateData.options, DelaunatorClass);
          
          // Keep reference to dual grid for later phases
          grid.dualGridSource = stateData.dualGrid;
          grid.adaptedFrom = 'dualGrid';
          
          // Log adaptation
          if (typeof console !== 'undefined' && console.log) {
            console.log(`Adapted dual grid to ${points.length} points for Voronoi`);
          }
        } else {
          // Standard mode: create Voronoi normally
          grid = createVoronoiDiagram(
            {
              mapWidth: stateData.options.mapWidth,
              mapHeight: stateData.options.mapHeight,
              cellsDesired: stateData.options.cellsDesired,
            },
            rng,
            DelaunatorClass
          );
        }
        
        return { ...stateData, grid };
      };
      
    case PHASES.HEIGHTMAP:
      return ({ stateData, rng }) => {
        const heights = generateHeightmap({
          grid: stateData.grid,
          options: stateData.options,
          rng,
          template: stateData.options.template,
        });
        stateData.grid.cells.h = heights;
        return stateData;
      };
      
    case PHASES.MARKUP_GRID:
      return ({ stateData }) => {
        markupGrid({ grid: stateData.grid });
        return stateData;
      };
      
    case PHASES.MAP_COORDINATES:
      return ({ stateData }) => {
        const mapCoordinates = calculateMapCoordinates(
          stateData.options,
          stateData.options.mapWidth,
          stateData.options.mapHeight
        );
        return { ...stateData, mapCoordinates };
      };
      
    case PHASES.TEMPERATURE:
      return ({ stateData }) => {
        const temperatures = calculateTemperatures({
          grid: stateData.grid,
          options: stateData.options,
          mapCoordinates: stateData.mapCoordinates,
        });
        stateData.grid.cells.temp = temperatures;
        return stateData;
      };
      
    case PHASES.PRECIPITATION:
      return ({ stateData, rng }) => {
        const precipitation = generatePrecipitation({
          grid: stateData.grid,
          options: stateData.options,
          rng,
          mapCoordinates: stateData.mapCoordinates,
        });
        stateData.grid.cells.prec = precipitation;
        return stateData;
      };
      
    case PHASES.PACK_CREATION:
      return ({ stateData, DelaunatorClass }) => {
        const useFullPack = stateData.options.fullRendering === true;
        let pack;
        
        if (useFullPack) {
          pack = createPackFromGrid({ grid: stateData.grid, options: stateData.options, DelaunatorClass });
        } else {
          pack = createSimplifiedPack(stateData.grid, stateData.options);
          pack.cells.h = stateData.grid.cells.h;
          for (let i = 0; i < pack.cells.i.length; i++) {
            pack.cells.g[i] = i;
          }
        }
        return { ...stateData, pack };
      };
      
    case PHASES.RIVERS:
      return ({ stateData, rng }) => {
        generateRivers({
          grid: stateData.grid,
          pack: stateData.pack,
          options: stateData.options,
          rng,
          precipitation: stateData.grid.cells.prec,
          allowErosion: stateData.options.allowErosion !== false,
        });
        return stateData;
      };
      
    case PHASES.BIOMES:
      return ({ stateData }) => {
        const biomesData = getDefaultBiomes();
        assignBiomes({ pack: stateData.pack, grid: stateData.grid, options: stateData.options, biomesData });
        return stateData;
      };
      
    case PHASES.MARKUP_PACK:
      return ({ stateData }) => {
        markupPack({ pack: stateData.pack });
        return stateData;
      };
      
    case PHASES.FEATURES:
      return ({ stateData }) => {
        specifyFeatures({ pack: stateData.pack, grid: stateData.grid, options: stateData.options });
        return stateData;
      };
      
    case PHASES.CULTURES:
      return ({ stateData, rng }) => {
        const biomesData = getDefaultBiomes();
        generateCultures({ pack: stateData.pack, grid: stateData.grid, options: stateData.options, rng, biomesData });
        expandCultures({ pack: stateData.pack, options: stateData.options, biomesData });
        return stateData;
      };
      
    case PHASES.BURGS:
      return ({ stateData, rng }) => {
        generateBurgs({ pack: stateData.pack, grid: stateData.grid, options: stateData.options, rng });
        return stateData;
      };
      
    case PHASES.DUAL_GRID_STATES:
      return ({ stateData, rng }) => {
        if (stateData.options.useDualGridPolitics) {
          const dualGridRng = new RNG(stateData.seed + PHASES.DUAL_GRID_STATES);
          const hexLayers = stateData.options.politicsMode?.baseHexRings ?? stateData.options.politicsMode?.hexLayers ?? 7;
          stateData.pack.dualGrid = buildStalbergQuadGrid(hexLayers, dualGridRng, stateData.options);
          snapBurgsToDualGrid(stateData.pack, stateData.pack.dualGrid, stateData.options);
          assignPatternsToQuads(stateData.pack.dualGrid, stateData.pack, stateData.options);
          assignVariantsToQuads(stateData.pack.dualGrid, stateData.options);
          mapDualGridStatesToPack(stateData.pack.dualGrid, stateData.pack, stateData.grid, stateData.options, rng);
        }
        return stateData;
      };
      
    case PHASES.STATES:
      return ({ stateData, rng }) => {
        generateStates({ pack: stateData.pack, options: stateData.options, rng, grid: stateData.grid });
        return stateData;
      };
      
    case PHASES.PROVINCES:
      return ({ stateData, rng }) => {
        generateProvinces({ pack: stateData.pack, options: stateData.options, rng });
        return stateData;
      };
      
    case PHASES.RELIGIONS:
      return ({ stateData, rng }) => {
        if (stateData.options.religionsNumber > 0) {
          generateReligions({ pack: stateData.pack, options: stateData.options, rng });
        } else {
          stateData.pack.religions = [{ name: 'No religion', i: 0 }];
          if (!stateData.pack.cells.religion) {
            stateData.pack.cells.religion = createTypedArray({ maxValue: 65535, length: stateData.pack.cells.i.length });
          }
        }
        return stateData;
      };
      
    case PHASES.EMBLEMS:
      return ({ stateData, rng }) => {
        generateEmblems({ pack: stateData.pack, options: stateData.options, rng });
        return stateData;
      };
      
    default:
      return ({ stateData }) => stateData;
  }
}

/**
 * Validate that generator is initialized
 * @throws {InitializationError} If not initialized
 */
function requireInitialized() {
  if (!state.initialized) {
    throw new InitializationError();
  }
}

/**
 * Reset generator state (for multiple map generations)
 * Clears generated data to allow new generation without reinitializing
 * @throws {InitializationError} If generator not initialized
 */
export function resetGeneratorState() {
  requireInitialized();
  state.data = null; // Clear generated data to allow new generation
}

/**
 * Initialize the generator with optional container for SVG rendering
 * @param {Object} params - Initialization parameters
 * @param {HTMLElement|null} params.container - Optional container element for SVG rendering
 * @throws {InitializationError} If already initialized or invalid container provided
 */
export function initGenerator({ container = null } = {}) {
  if (state.initialized) {
    throw new InitializationError(
      'Generator already initialized. Cannot initialize multiple times.'
    );
  }

  // Validate container if provided
  if (container !== null && !(container instanceof HTMLElement)) {
    throw new InitializationError(
      `Invalid container element. Expected HTMLElement, got ${typeof container}`
    );
  }

  state.container = container;
  state.initialized = true;
}

/**
 * Load and merge options with defaults, performing validation and clamping
 * @param {Object} curatedParams - Partial options object (e.g., { seed: 42, mapWidth: 800 })
 * @throws {InitializationError} If generator not initialized
 * @throws {InvalidOptionError} For invalid option values
 */
export function loadOptions(curatedParams = {}) {
  requireInitialized();

  try {
    // Merge with defaults and validate
    const merged = mergeOptions(curatedParams);
    
    // Validate key options that might cause issues
    if (merged.mapWidth <= 0 || merged.mapHeight <= 0) {
      throw new InvalidOptionError(
        'mapWidth/mapHeight',
        `${merged.mapWidth}x${merged.mapHeight}`,
        'Map dimensions must be positive'
      );
    }

    state.options = merged;
  } catch (error) {
    if (error instanceof InvalidOptionError || error instanceof InitializationError) {
      throw error;
    }
    // Wrap other errors
    throw new InvalidOptionError(
      'options',
      curatedParams,
      `Failed to load options: ${error.message}`
    );
  }
}

/**
 * Generate map data using current options and store in state
 * @param {Function} DelaunatorClass - Delaunator class (required as peer dependency)
 * @returns {Object} Reference to generated data {grid, pack, seed}
 * @throws {InitializationError} If generator not initialized
 * @throws {GenerationError} If generation fails
 */
export function generateMap(DelaunatorClass = null) {
  requireInitialized();

  try {
    const data = generateMapInternal(state.options, DelaunatorClass);
    state.data = data;
    return data;
  } catch (error) {
    if (error instanceof GenerationError || error instanceof InitializationError) {
      throw error;
    }
    // Wrap other errors
    throw new GenerationError(`Map generation failed: ${error.message}`);
  }
}

/**
 * Generate partial map data by running only specified phases
 * Dependencies are automatically resolved and validated
 * @param {Array<string>} phasesToRun - Array of phase names to run (from PHASES constant)
 * @param {Function} DelaunatorClass - Delaunator class (required if VORONOI phase is included)
 * @returns {Object} Reference to generated data {grid, pack, seed}
 * @throws {InitializationError} If generator not initialized
 * @throws {GenerationError} If generation fails or dependencies are missing
 */
export function generatePartial(phasesToRun, DelaunatorClass = null) {
  requireInitialized();
  
  if (!Array.isArray(phasesToRun) || phasesToRun.length === 0) {
    throw new GenerationError('phasesToRun must be a non-empty array of phase names');
  }
  
  // Validate phase names
  validatePhaseNames(phasesToRun, 'phasesToRun');
  
  try {
    const data = generateMapInternal(state.options, DelaunatorClass, phasesToRun);
    state.data = data;
    return data;
  } catch (error) {
    if (error instanceof GenerationError || error instanceof InitializationError) {
      throw error;
    }
    // Wrap other errors
    throw new GenerationError(`Partial map generation failed: ${error.message}`);
  }
}

/**
 * Get structured JSON data from generated map (deep cloned, excludes internal fields)
 * @returns {Object} JSON object matching schema in docs/api-spec.md
 * @throws {InitializationError} If generator not initialized
 * @throws {NoDataError} If no data generated yet
 */
export function getMapData() {
  requireInitialized();

  if (!state.data) {
    throw new NoDataError();
  }

  const { grid, pack, seed, options } = state.data;

  // Deep clone to avoid exposing internal references
  // Structure matches schema in docs/api-spec.md
  const json = {
    seed: String(seed),
    options: deepCopy(options),
    grid: {
      cells: {
        i: Array.from(grid.cells.i),
        h: Array.from(grid.cells.h),
        t: grid.cells.t ? Array.from(grid.cells.t) : [],
        temp: grid.cells.temp ? Array.from(grid.cells.temp) : [],
        prec: grid.cells.prec ? Array.from(grid.cells.prec) : [],
        f: grid.cells.f ? Array.from(grid.cells.f) : [],
        b: grid.cells.b ? Array.from(grid.cells.b) : [],
      },
      points: grid.points ? grid.points.map(p => [...p]) : [],
      vertices: grid.vertices ? {
        p: grid.vertices.p ? grid.vertices.p.map(v => [...v]) : [],
        v: grid.vertices.v ? deepCopy(grid.vertices.v) : [],
        c: grid.vertices.c ? deepCopy(grid.vertices.c) : [],
      } : {},
      features: grid.features ? deepCopy(grid.features) : [],
    },
    pack: {
      cells: {
        i: Array.from(pack.cells.i),
        h: Array.from(pack.cells.h),
        t: pack.cells.t ? Array.from(pack.cells.t) : [],
        f: pack.cells.f ? Array.from(pack.cells.f) : [],
        b: pack.cells.b ? Array.from(pack.cells.b) : [],
        g: pack.cells.g ? Array.from(pack.cells.g) : [],
        area: pack.cells.area ? Array.from(pack.cells.area) : [],
        // Additional fields for SVG rendering
        p: pack.cells.p ? pack.cells.p.map(p => [...p]) : [],
        c: pack.cells.c ? pack.cells.c.map(c => Array.isArray(c) ? [...c] : c) : [],
        v: pack.cells.v ? pack.cells.v.map(v => Array.isArray(v) ? [...v] : v) : [],
        state: pack.cells.state ? Array.from(pack.cells.state) : [],
        province: pack.cells.province ? Array.from(pack.cells.province) : [],
        biome: pack.cells.biome ? Array.from(pack.cells.biome) : [],
        culture: pack.cells.culture ? Array.from(pack.cells.culture) : [],
        religion: pack.cells.religion ? Array.from(pack.cells.religion) : [],
      },
      vertices: pack.vertices ? {
        p: pack.vertices.p ? pack.vertices.p.map(v => [...v]) : [],
        v: pack.vertices.v ? deepCopy(pack.vertices.v) : [],
        c: pack.vertices.c ? deepCopy(pack.vertices.c) : [],
      } : {},
      features: pack.features ? deepCopy(pack.features) : [],
      burgs: pack.burgs ? deepCopy(pack.burgs) : [],
      states: pack.states ? deepCopy(pack.states) : [],
      rivers: pack.rivers ? deepCopy(pack.rivers) : [],
      cultures: pack.cultures ? deepCopy(pack.cultures) : [],
      religions: pack.religions ? deepCopy(pack.religions) : [],
      provinces: pack.provinces ? deepCopy(pack.provinces) : [],
      // Dual-grid data (when useDualGridPolitics is enabled)
      dualGrid: pack.dualGrid ? serializeDualGrid(pack.dualGrid) : null,
    },
    // Top-level flag for dual-grid
    dualGridEnabled: options.useDualGridPolitics === true,
  };

  return json;
}

/**
 * Serialize dual-grid data for JSON export (removes circular refs, flattens structures)
 * @param {Object} dualGrid - Dual grid structure
 * @returns {Object} Serialized dual-grid data
 */
function serializeDualGrid(dualGrid) {
  if (!dualGrid) return null;
  
  // Serialize points (flatten to array of {x, y})
  const points = dualGrid.points ? dualGrid.points.map(p => ({ x: p.x, y: p.y })) : [];
  
  // Serialize Level 0 quads
  const level0Quads = dualGrid.level0Quads ? dualGrid.level0Quads.map(q => ({
    i: q.i,
    level: q.level,
    verts: q.verts ? [...q.verts] : [],
    center: q.center ? { x: q.center.x, y: q.center.y } : null,
    parentQuadId: q.parentQuadId,
    childQuadIds: q.childQuadIds ? [...q.childQuadIds] : [],
    stateId: q.stateId !== undefined ? q.stateId : -1,
    provinceId: q.provinceId !== undefined ? q.provinceId : -1,
    patternId: q.patternId || null,
    variantId: q.variantId || null,
  })) : [];
  
  // Serialize Level 1 quads
  const level1Quads = dualGrid.level1Quads ? dualGrid.level1Quads.map(q => ({
    i: q.i,
    level: q.level,
    verts: q.verts ? [...q.verts] : [],
    center: q.center ? { x: q.center.x, y: q.center.y } : null,
    parentQuadId: q.parentQuadId !== undefined ? q.parentQuadId : null,
    childQuadIds: q.childQuadIds,
    stateId: q.stateId !== undefined ? q.stateId : -1,
    provinceId: q.provinceId !== undefined ? q.provinceId : -1,
    patternId: q.patternId || null,
    variantId: q.variantId || null,
  })) : [];
  
  // Serialize state assignments
  const stateAssignments = dualGrid.stateAssignments ? {
    states: dualGrid.stateAssignments.states ? dualGrid.stateAssignments.states.map(s => ({
      i: s.i,
      name: s.name || null,
      capital: s.capital || null,
      center: s.center !== undefined ? s.center : null,
      quads: s.quads ? [...s.quads] : [],
    })) : [],
    quadToState: dualGrid.stateAssignments.quadToState ? 
      Array.from(dualGrid.stateAssignments.quadToState).map(([quadId, stateId]) => [quadId, stateId]) : [],
  } : null;
  
  return {
    points,
    level0Quads,
    level1Quads,
    stateAssignments,
  };
}

// Canvas rendering support restored in Phase 1

/**
 * Render stored map data to SVG (returns SVG string or appends to container)
 * @param {Object} options - Rendering options {width, height, container}
 * @returns {string|null} SVG string if no container provided, null if appended to container
 * @throws {InitializationError} If generator not initialized
 * @throws {NoDataError} If no data generated yet
 */
export function renderPreviewSVG(options = {}) {
  requireInitialized();

  if (!state.data) {
    throw new NoDataError();
  }

  try {
    // Determine dimensions from container, options, or data
    let width = options.width;
    let height = options.height;
    const container = options.container || state.container;

    if (container) {
      // Get dimensions from container if not provided
      if (!width || !height) {
        const rect = container.getBoundingClientRect();
        width = width || rect.width || state.data.options.mapWidth || 1000;
        height = height || rect.height || state.data.options.mapHeight || 600;
      }
    } else {
      // Use data dimensions if no container
      width = width || state.data.options.mapWidth || 1000;
      height = height || state.data.options.mapHeight || 600;
    }

    const svgString = renderMapSVG(state.data, { width, height });

    if (container) {
      // Append or replace SVG in container
      container.innerHTML = svgString;
      return null;
    } else {
      // Return SVG string
      return svgString;
    }
  } catch (error) {
    if (typeof console !== 'undefined' && console.error) {
      console.error('SVG rendering failed:', error);
    }
    throw new GenerationError(`SVG rendering failed: ${error.message}`);
  }
}

/**
 * Render stored map data to canvas element
 * @param {HTMLCanvasElement} canvas - Canvas element to render to
 * @param {Object} options - Rendering options {width, height, renderConfig}
 * @param {Object} options.renderConfig - Layer configuration { layers: { biomes: true, states: true, ... } }
 * @returns {void}
 * @throws {InitializationError} If generator not initialized
 * @throws {NoDataError} If no data generated yet
 * @throws {GenerationError} If canvas rendering fails
 */
export function renderToCanvas(canvas, options = {}) {
  requireInitialized();

  if (!state.data) {
    throw new NoDataError();
  }

  if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
    throw new GenerationError('Invalid canvas element provided');
  }

  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new GenerationError('Could not get 2D rendering context from canvas');
    }

    // Determine dimensions from canvas, options, or data
    const width = options.width || canvas.width || state.data.options.mapWidth || 1000;
    const height = options.height || canvas.height || state.data.options.mapHeight || 600;

    // Set canvas dimensions if not set
    if (!canvas.width || !canvas.height) {
      canvas.width = width;
      canvas.height = height;
    }

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Get SVG string and render to canvas via Image (simple approach for Phase 1)
    // This ensures exact fidelity with SVG rendering
    const svgString = renderMapSVG(state.data, {
      width: canvas.width,
      height: canvas.height,
      renderConfig: options.renderConfig,
      includeInteractive: false, // Canvas doesn't support interactive attributes
    });

    // Convert SVG to data URL and draw to canvas synchronously
    // Note: For full async support with error handling, consider using Promise-based approach
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    
    // Create image and draw (sync for Phase 1 - may need async handling for production)
    const img = new Image();
    img.src = url;
    
    // For Phase 1: Use onload callback (async in browser, but function completes)
    // Note: Image loading is async - for true sync, would need direct canvas drawing
    if (img.complete || img.width > 0) {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
    } else {
      // Fallback: queue async render (best effort)
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        if (typeof console !== 'undefined' && console.log) {
          console.log('Canvas rendered successfully');
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('Canvas rendering via Image failed - consider using SVG rendering instead');
        }
      };
    }
  } catch (error) {
    if (typeof console !== 'undefined' && console.error) {
      console.error('Canvas rendering failed:', error);
    }
    throw new GenerationError(`Canvas rendering failed: ${error.message}`);
  }
}

/**
 * Render stored map data to SVG string (enhanced version with interactive/layers support)
 * @param {Object} options - Rendering options
 * @param {boolean} options.includeInteractive - If true, add data-cell-id attributes to paths
 * @param {Object} options.renderConfig - Layer configuration { layers: { biomes: true, states: true, ... } }
 * @param {number} options.width - SVG width (optional)
 * @param {number} options.height - SVG height (optional)
 * @param {HTMLElement} options.container - Container element for SVG (optional)
 * @returns {string|null} SVG string if no container provided, null if appended to container
 * @throws {InitializationError} If generator not initialized
 * @throws {NoDataError} If no data generated yet
 */
export function renderToSVG(options = {}) {
  requireInitialized();

  if (!state.data) {
    throw new NoDataError();
  }

  try {
    // Determine dimensions from container, options, or data
    let width = options.width;
    let height = options.height;
    const container = options.container || state.container;
    const includeInteractive = options.includeInteractive === true;
    const renderConfig = options.renderConfig || { layers: {} };

    if (container) {
      // Get dimensions from container if not provided
      if (!width || !height) {
        const rect = container.getBoundingClientRect();
        width = width || rect.width || state.data.options.mapWidth || 1000;
        height = height || rect.height || state.data.options.mapHeight || 600;
      }
    } else {
      // Use data dimensions if no container
      width = width || state.data.options.mapWidth || 1000;
      height = height || state.data.options.mapHeight || 600;
    }

    const svgString = renderMapSVG(state.data, {
      width,
      height,
      renderConfig,
      includeInteractive,
    });

    if (container) {
      // Append or replace SVG in container
      container.innerHTML = svgString;
      return null;
    } else {
      // Return SVG string
      return svgString;
    }
  } catch (error) {
    if (typeof console !== 'undefined' && console.error) {
      console.error('SVG rendering failed:', error);
    }
    throw new GenerationError(`SVG rendering failed: ${error.message}`);
  }
}

/**
 * Unified render preview function (supports both SVG and canvas)
 * @param {Object} options - Rendering options
 * @param {string} options.target - Render target: 'svg' (default) or 'canvas'
 * @param {HTMLCanvasElement} options.canvas - Canvas element (required if target === 'canvas')
 * @param {boolean} options.includeInteractive - If true, add data-cell-id attributes (SVG only)
 * @param {Object} options.renderConfig - Layer configuration { layers: { biomes: true, states: true, ... } }
 * @param {number} options.width - Width (optional)
 * @param {number} options.height - Height (optional)
 * @param {HTMLElement} options.container - Container element (optional, for SVG)
 * @returns {string|null|void} SVG string (if target === 'svg' and no container), null (if appended to container), or void (canvas)
 * @throws {InitializationError} If generator not initialized
 * @throws {NoDataError} If no data generated yet
 * @throws {GenerationError} If rendering fails
 */
export function renderPreview(options = {}) {
  requireInitialized();

  const target = options.target || 'svg';

  if (target === 'canvas') {
    if (!options.canvas) {
      throw new GenerationError('Canvas element required when target === "canvas"');
    }
    return renderToCanvas(options.canvas, options);
  } else {
    // SVG rendering
    return renderToSVG(options);
  }
}

/**
 * Load map data from JSON (for data-driven regeneration/display)
 * @param {Object} jsonData - JSON data matching getMapData() output structure
 * @throws {InitializationError} If generator not initialized
 * @throws {InvalidOptionError} If JSON structure is invalid
 */
export function loadMapData(jsonData) {
  requireInitialized();

  if (!jsonData || typeof jsonData !== 'object') {
    throw new InvalidOptionError('jsonData', jsonData, 'JSON data must be an object');
  }

  try {
    // Validate basic structure
    if (!jsonData.pack || !jsonData.grid) {
      throw new InvalidOptionError(
        'jsonData',
        jsonData,
        'JSON data must contain pack and grid objects'
      );
    }

    // Validate required pack fields for rendering
    const requiredPackFields = ['cells', 'states', 'burgs', 'rivers'];
    const missingFields = requiredPackFields.filter(field => !jsonData.pack[field]);
    
    if (missingFields.length > 0) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn(`loadMapData: Missing pack fields: ${missingFields.join(', ')}. Rendering may be incomplete.`);
      }
    }

    // Validate critical cell arrays
    if (!jsonData.pack.cells || !Array.isArray(jsonData.pack.cells.i)) {
      throw new InvalidOptionError(
        'jsonData',
        jsonData,
        'JSON data must contain pack.cells.i array'
      );
    }

    // Warn about missing rendering fields
    const renderingFields = ['state', 'biome', 'culture', 'religion', 'province', 'p', 'c', 'v'];
    const missingRenderingFields = renderingFields.filter(field => !jsonData.pack.cells[field]);
    
    if (missingRenderingFields.length > 0 && typeof console !== 'undefined' && console.warn) {
      console.warn(`loadMapData: Missing rendering fields in pack.cells: ${missingRenderingFields.join(', ')}. Some layers may not render.`);
    }

    // Validate vertices for border rendering
    if (!jsonData.pack.vertices || !jsonData.pack.vertices.p) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('loadMapData: Missing pack.vertices.p. Border rendering may fail.');
      }
    }

    // Reconstruct typed arrays from JSON arrays
    const reconstructTypedArray = (arr, TypedArray, maxValue) => {
      if (!arr || !Array.isArray(arr)) return null;
      const typed = createTypedArray({ maxValue, length: arr.length });
      typed.set(arr);
      return typed;
    };

    // Reconstruct grid
    const grid = {
      cells: {
        i: reconstructTypedArray(jsonData.grid.cells.i, Uint16Array, 65535) || new Uint16Array(0),
        h: reconstructTypedArray(jsonData.grid.cells.h, Uint8Array, 255) || new Uint8Array(0),
        t: reconstructTypedArray(jsonData.grid.cells.t, Int8Array, 127) || new Int8Array(0),
        temp: jsonData.grid.cells.temp ? new Float32Array(jsonData.grid.cells.temp) : null,
        prec: jsonData.grid.cells.prec ? new Float32Array(jsonData.grid.cells.prec) : null,
        f: reconstructTypedArray(jsonData.grid.cells.f, Uint16Array, 65535) || new Uint16Array(0),
        b: reconstructTypedArray(jsonData.grid.cells.b, Uint8Array, 255) || new Uint8Array(0),
      },
      points: jsonData.grid.points || [],
      vertices: jsonData.grid.vertices || {},
      features: jsonData.grid.features || [],
    };

    // Reconstruct pack
    const pack = {
      cells: {
        i: reconstructTypedArray(jsonData.pack.cells.i, Uint16Array, 65535) || new Uint16Array(0),
        h: reconstructTypedArray(jsonData.pack.cells.h, Uint8Array, 255) || new Uint8Array(0),
        t: reconstructTypedArray(jsonData.pack.cells.t, Int8Array, 127) || new Int8Array(0),
        f: reconstructTypedArray(jsonData.pack.cells.f, Uint16Array, 65535) || new Uint16Array(0),
        b: reconstructTypedArray(jsonData.pack.cells.b, Uint8Array, 255) || new Uint8Array(0),
        g: reconstructTypedArray(jsonData.pack.cells.g, Uint16Array, 65535) || new Uint16Array(0),
        area: jsonData.pack.cells.area ? new Float32Array(jsonData.pack.cells.area) : new Float32Array(0),
        p: jsonData.pack.cells.p || [],
        // Add cell arrays that may be needed for rendering
        state: jsonData.pack.cells.state ? reconstructTypedArray(jsonData.pack.cells.state, Uint16Array, 65535) : null,
        province: jsonData.pack.cells.province ? reconstructTypedArray(jsonData.pack.cells.province, Uint16Array, 65535) : null,
        biome: jsonData.pack.cells.biome ? reconstructTypedArray(jsonData.pack.cells.biome, Uint8Array, 255) : null,
        culture: jsonData.pack.cells.culture ? reconstructTypedArray(jsonData.pack.cells.culture, Uint16Array, 65535) : null,
        religion: jsonData.pack.cells.religion ? reconstructTypedArray(jsonData.pack.cells.religion, Uint16Array, 65535) : null,
        c: jsonData.pack.cells.c || [],
        v: jsonData.pack.cells.v || [],
      },
      vertices: jsonData.pack.vertices || {},
      features: jsonData.pack.features || [],
      burgs: jsonData.pack.burgs || [],
      states: jsonData.pack.states || [],
      rivers: jsonData.pack.rivers || [],
      cultures: jsonData.pack.cultures || [],
      religions: jsonData.pack.religions || [],
      provinces: jsonData.pack.provinces || [],
    };

    // Reconstruct options
    const options = jsonData.options || getDefaultOptions();

    // Store loaded data
    state.data = {
      grid,
      pack,
      options,
      seed: jsonData.seed || String(Date.now()),
    };

    // Update options in state
    state.options = options;
  } catch (error) {
    if (error instanceof InvalidOptionError || error instanceof InitializationError) {
      throw error;
    }
    throw new InvalidOptionError('jsonData', jsonData, `Failed to load map data: ${error.message}`);
  }
}
