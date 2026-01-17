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
  NoCanvasError,
} from './utils/errors.js';
import {
  createVoronoiDiagram,
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
} from './core/index.js';
import { getDefaultBiomes as getBiomesData } from './core/biomes.js';
import { PHASES } from './utils/constants.js';
import { createPackFromGrid } from './core/regraph.js';
import { renderMap } from './rendering/canvas.js';
import { renderMapSVG } from './rendering/svg.js';
import { Canvas2DRenderer } from './rendering/canvas2d.js';
import { PixiRenderer } from './rendering/webgl.js';
import {
  validateSkipPhases,
  validatePhaseNames,
  validatePhaseDependencies,
  resolvePhaseDependencies,
  executePhaseWithWrapper,
  PHASE_DEPENDENCIES,
} from './partials.js';

/**
 * Singleton state for the generator
 */
let state = {
  canvas: null,
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
    validateSkipPhases(skipPhases);
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
  const phaseOrder = [
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
  };
}

/**
 * Get phase function for a given phase
 * @param {string} phase - Phase name
 * @returns {Function} Phase function
 */
function getPhaseFunction(phase) {
  switch (phase) {
    case PHASES.VORONOI:
      return ({ stateData, rng, DelaunatorClass }) => {
  const grid = createVoronoiDiagram(
    {
            mapWidth: stateData.options.mapWidth,
            mapHeight: stateData.options.mapHeight,
            cellsDesired: stateData.options.cellsDesired,
    },
    rng,
    DelaunatorClass
  );
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
        const useFullPack = stateData.options.fullRendering === true || state.canvas !== null;
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
 * Initialize the generator with optional canvas or container for rendering
 * @param {Object} params - Initialization parameters
 * @param {HTMLCanvasElement|null} params.canvas - Optional canvas element for canvas rendering
 * @param {HTMLElement|null} params.container - Optional container element for SVG rendering
 * @throws {InitializationError} If already initialized or invalid elements provided
 */
export function initGenerator({ canvas = null, container = null } = {}) {
  if (state.initialized) {
    throw new InitializationError(
      'Generator already initialized. Cannot initialize multiple times.'
    );
  }

  // Validate canvas if provided
  if (canvas !== null && !(canvas instanceof HTMLCanvasElement)) {
    throw new InitializationError(
      `Invalid canvas element. Expected HTMLCanvasElement, got ${typeof canvas}`
    );
  }

  // Validate container if provided
  if (container !== null && !(container instanceof HTMLElement)) {
    throw new InitializationError(
      `Invalid container element. Expected HTMLElement, got ${typeof container}`
    );
  }

  state.canvas = canvas;
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

/**
 * Render stored map data to the initialized canvas
 * @throws {InitializationError} If generator not initialized
 * @throws {NoDataError} If no data generated yet
 * @throws {NoCanvasError} If no canvas provided (only if rendering is explicitly required)
 */
export function renderPreview() {
  requireInitialized();

  if (!state.data) {
    throw new NoDataError();
  }

  if (!state.canvas) {
    // No-op with warning if no canvas
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('renderPreview() called but no canvas was provided during initialization. Skipping render.');
    }
    return;
  }

  try {
    renderMap(state.canvas, state.data);
  } catch (error) {
    throw new GenerationError(`Rendering failed: ${error.message}`);
  }
}

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

/**
 * Export rendering data for Canvas-only migration (Option 1 & 3)
 * Returns Canvas 2D path-based JSON or WebGL mesh data
 * @param {Object} options - Export options { mode: 'canvas2d'|'webgl', ... }
 * @returns {Object} Rendering data (paths for Canvas 2D or meshes for WebGL)
 * @throws {InitializationError} If generator not initialized
 * @throws {NoDataError} If no data generated yet
 */
export function exportRenderData(options = {}) {
  requireInitialized();

  if (!state.data) {
    throw new NoDataError();
  }

  const mode = options.mode || 'canvas2d';
  
  if (mode === 'canvas2d') {
    return exportCanvas2DData(state.data, options);
  } else if (mode === 'webgl') {
    return exportWebGLData(state.data, options);
  } else {
    throw new InvalidOptionError('options.mode', mode, `Invalid mode: ${mode}. Must be 'canvas2d' or 'webgl'`);
  }
}

/**
 * Export Canvas 2D rendering data (paths, fills, strokes, patterns, gradients)
 * @param {Object} data - Map data { grid, pack, options }
 * @param {Object} options - Export options { layers: ['terrain','biomes','states',...] }
 * @returns {Object} Canvas 2D rendering data
 */
function exportCanvas2DData(data, options) {
  const { pack, grid, options: genOptions } = data;
  const cells = pack.cells || {};
  const vertices = pack.vertices || {};
  const activeLayers = options.layers || ['terrain', 'biomes']; // Default visible layers
  
  // Get biome data for colors
  const biomesData = getBiomesData();
  const biomeColors = biomesData.color || [];

  // Style constants from rendering modules
  const STYLE_CONSTANTS = {
    oceanBase: '#b4d2f3',
    landBase: '#c9b491',
    stateBorderStroke: '#56566d',
    stateBorderWidth: 1,
    stateBorderDashArray: [2],
    provinceBorderStroke: '#56566d',
    provinceBorderWidth: 0.5,
    provinceBorderDashArray: [0, 2],
    riverStroke: '#6b93d6',
    riverFill: '#a8c8e0',
    burgCapitalSize: 12,
    burgTownSize: 8,
    burgCapitalColor: '#333',
    burgTownColor: '#666',
  };

  const MIN_LAND_HEIGHT = 20;
  const cellData = [];
  const heights = cells.h || [];
  const biomes = cells.biome || [];
  const states = cells.state || [];
  const provinces = cells.province || [];

  // Collect all cells with paths
  if (cells.v && cells.v.length > 0) {
    for (let i = 0; i < cells.v.length; i++) {
      const cellVertices = cells.v[i];
      
      // pack.cells.v[i] contains either:
      // 1. Array of [x,y] coordinates directly (for full rendering)
      // 2. Array of vertex indices (need to map to vertices.p[vi])
      // Check first element to determine format
      let path;
      if (Array.isArray(cellVertices) && cellVertices.length > 0) {
        const firstElement = cellVertices[0];
        if (Array.isArray(firstElement) && firstElement.length === 2) {
          // Already coordinates [x,y]
          path = cellVertices.filter(p => Array.isArray(p) && p.length === 2 && isFinite(p[0]) && isFinite(p[1]));
        } else if (typeof firstElement === 'number' && vertices.p) {
          // Vertex indices - map to coordinates
          path = cellVertices.map(vi => {
            const vertex = vertices.p[vi];
            return (vertex && Array.isArray(vertex) && vertex.length >= 2) ? [vertex[0], vertex[1]] : null;
          }).filter(p => p !== null && isFinite(p[0]) && isFinite(p[1]));
        } else {
          continue; // Invalid format
        }
      } else {
        continue; // No vertices
      }

      if (!path || path.length < 3) continue;

      const height = heights[i] || 0;
      const isWater = height < MIN_LAND_HEIGHT;
      const biomeId = biomes[i];
      const stateId = states[i];
      const provinceId = provinces ? provinces[i] : undefined;

      // Determine active layer (default to terrain if no layer specified)
      const layer = activeLayers.includes('biomes') && !isWater && biomeId !== undefined ? 'biomes' :
                    activeLayers.includes('states') && !isWater && stateId !== undefined ? 'states' :
                    'terrain';

      // Extract fill style based on layer
      const fill = getCellFill({
        cellId: i,
        height,
        biomeId,
        stateId,
        isWater,
        layer,
        biomeColors,
        STYLE_CONSTANTS,
      });

      // Extract stroke style (borders, coastlines)
      const stroke = getCellStroke({
        cellId: i,
        stateId,
        provinceId,
        isWater,
        cells,
        STYLE_CONSTANTS,
      });

      // Extract labels (burgs, state names)
      const labels = getCellLabels({
        cellId: i,
        pack,
        isWater,
        STYLE_CONSTANTS,
      });

      cellData.push({
        i,
        path,
        fill,
        stroke,
        labels,
        layer,
        bounds: calculateCellBounds(path),
      });
    }
  }

  // Collect global patterns/gradients (stub for now - full implementation may add pattern definitions)
  const patterns = {};
  const gradients = {};

  return {
    mode: 'canvas2d',
    cells: cellData,
    patterns,
    gradients,
  };
}

/**
 * Get cell fill style (color, pattern, or gradient)
 * @param {Object} params - { cellId, height, biomeId, stateId, isWater, layer, biomeColors, STYLE_CONSTANTS }
 * @returns {Object} Fill style { type: 'color'|'pattern'|'gradient', ... }
 */
function getCellFill({ cellId, height, biomeId, stateId, isWater, layer, biomeColors, STYLE_CONSTANTS }) {
  if (isWater) {
    return {
      type: 'color',
      color: STYLE_CONSTANTS.oceanBase,
    };
  }

  if (layer === 'biomes' && biomeId !== undefined && biomeId >= 0 && biomeId < biomeColors.length) {
    const baseColor = biomeColors[biomeId];
    
    // Add patterns for certain biomes (forests, deserts)
    // Biome IDs: 1=hot desert, 2=cold desert, 5-9=forests, 12=wetland
    if (biomeId === 1 || biomeId === 2) {
      // Desert patterns (sand dunes / sparse vegetation)
      return {
        type: 'pattern',
        pattern: {
          type: 'desert',
          baseColor: baseColor,
          density: biomeId === 1 ? 0.3 : 0.2, // Hot desert sparser
        },
        color: baseColor, // Fallback color
      };
    } else if (biomeId >= 5 && biomeId <= 9) {
      // Forest patterns (tree canopy texture)
      // 5=tropical seasonal, 6=temperate deciduous, 7=tropical rainforest, 8=temperate rainforest, 9=taiga
      const patternType = biomeId === 9 ? 'conifer' : (biomeId >= 7 ? 'rainforest' : 'deciduous');
      return {
        type: 'pattern',
        pattern: {
          type: patternType,
          baseColor: baseColor,
          density: biomeId === 7 ? 0.8 : (biomeId === 8 ? 0.7 : 0.6), // Rainforest denser
        },
        color: baseColor, // Fallback color
      };
    } else if (biomeId === 12) {
      // Wetland pattern (swamp/marsh texture)
      return {
        type: 'pattern',
        pattern: {
          type: 'wetland',
          baseColor: baseColor,
          density: 0.4,
        },
        color: baseColor, // Fallback color
      };
    }
    
    // Default: solid color for other biomes (savanna, grassland, tundra, etc.)
    return {
      type: 'color',
      color: baseColor,
    };
  }

  if (layer === 'states' && stateId !== undefined) {
    // State colors - can be customized later
    // For now, use a hash-based color for state differentiation
    const stateColor = getStateColor(stateId);
    return {
      type: 'color',
      color: stateColor,
    };
  }

  // Default: terrain/land base color
  return {
    type: 'color',
    color: STYLE_CONSTANTS.landBase,
  };
}

/**
 * Get cell stroke style (borders, coastlines)
 * @param {Object} params - { cellId, stateId, provinceId, isWater, cells, STYLE_CONSTANTS }
 * @returns {Object} Stroke style { color, width, dashArray }
 */
function getCellStroke({ cellId, stateId, provinceId, isWater, cells, STYLE_CONSTANTS }) {
  // Default: no stroke (borders handled separately if needed)
  // Can add stroke for borders/coastlines here
  return {
    color: null, // No stroke by default
    width: 1,
    dashArray: null,
  };
}

/**
 * Get cell labels (burgs, state names)
 * @param {Object} params - { cellId, pack, isWater, STYLE_CONSTANTS }
 * @returns {Array} Labels [{ text, x, y, fontSize, color }]
 */
function getCellLabels({ cellId, pack, isWater, STYLE_CONSTANTS }) {
  const labels = [];

  // Check for burg in this cell
  if (pack.burgs && Array.isArray(pack.burgs)) {
    for (const burg of pack.burgs) {
      if (!burg || burg.removed) continue;
      if (burg.cell !== cellId) continue;
      if (!burg.x || !burg.y || !isFinite(burg.x) || !isFinite(burg.y)) continue;
      
      const isCapital = burg.capital === true || burg.capital === 1;
      labels.push({
        text: burg.name || 'Burg',
        x: burg.x,
        y: burg.y,
        fontSize: isCapital ? STYLE_CONSTANTS.burgCapitalSize : STYLE_CONSTANTS.burgTownSize,
        color: isCapital ? STYLE_CONSTANTS.burgCapitalColor : STYLE_CONSTANTS.burgTownColor,
      });
    }
  }

  // Can add state names, province names, etc. here

  return labels;
}

/**
 * Get state color (hash-based for differentiation)
 * @param {number} stateId - State ID
 * @returns {string} Color hex string
 */
function getStateColor(stateId) {
  // Simple hash-based color generation for state differentiation
  // Can be replaced with actual state colors if stored in pack.states
  const hue = (stateId * 137.508) % 360; // Golden angle for color distribution
  const saturation = 60 + (stateId % 20); // 60-80%
  const lightness = 50 + (stateId % 15); // 50-65%
  
  // Convert HSL to hex (simplified)
  const h = hue / 360;
  const s = saturation / 100;
  const l = lightness / 100;
  
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h * 6) % 2 - 1));
  const m = l - c / 2;
  
  let r, g, b;
  if (h < 1/6) {
    r = c; g = x; b = 0;
  } else if (h < 2/6) {
    r = x; g = c; b = 0;
  } else if (h < 3/6) {
    r = 0; g = c; b = x;
  } else if (h < 4/6) {
    r = 0; g = x; b = c;
  } else if (h < 5/6) {
    r = x; g = 0; b = c;
  } else {
    r = c; g = 0; b = x;
  }
  
  r = Math.round((r + m) * 255);
  g = Math.round((g + m) * 255);
  b = Math.round((b + m) * 255);
  
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Export WebGL rendering data (meshes, triangles, shader uniforms)
 * @param {Object} data - Map data { grid, pack, options }
 * @param {Object} options - Export options
 * @returns {Object} WebGL rendering data
 */
/**
 * Export WebGL rendering data (meshes/triangles for GPU rendering)
 * @param {Object} data - Map data { grid, pack, options }
 * @param {Object} options - Export options { layers: ['terrain','biomes','states',...] }
 * @returns {Object} WebGL rendering data (mesh format for Option 3)
 */
function exportWebGLData(data, options) {
  const { pack, grid, options: genOptions } = data;
  const cells = pack.cells || {};
  const vertices = pack.vertices || {};
  const activeLayers = options.layers || ['terrain', 'biomes'];

  // TODO: Triangulate cell polygons using earcut or similar library
  // For now, return stub mesh data structure
  
  // Basic mesh structure for WebGL:
  // - vertices: Float32Array of [x, y, r, g, b, a] per vertex (interleaved)
  // - indices: Uint16Array of triangle indices
  // - cells: Array of { cellId, triangleOffset, triangleCount, color }
  
  console.warn('[exportWebGLData] WebGL export is stubbed - mesh triangulation not yet implemented');
  console.log('[exportWebGLData] Would triangulate', cells.v?.length || 0, 'cells for WebGL rendering');
  
  return {
    mode: 'webgl',
    vertices: new Float32Array(0), // Stub: empty vertex buffer
    indices: new Uint16Array(0), // Stub: empty index buffer
    cells: [], // Stub: cell metadata (cellId, color, triangle ranges)
    uniforms: {
      // Transformation matrices would go here (model, view, projection)
      scale: 1.0,
      offsetX: 0,
      offsetY: 0,
    },
    message: 'WebGL export is stubbed - triangulation requires polygon-to-triangle conversion (e.g., earcut library)',
  };
  
  // Stub: Return empty mesh data
  // Full implementation in Phase 3 (if needed)
  return {
    mode: 'webgl',
    vertices: new Float32Array(0),
    indices: new Uint16Array(0),
    triangles: [],
    uniforms: {},
  };
}

/**
 * Helper: Get biome color (stub - full implementation in Phase 1)
 * @param {number} biomeId - Biome ID
 * @returns {string} Color hex string
 */
function getBiomeColor(biomeId) {
  try {
    const biomesData = getBiomesData();
    const colors = biomesData.color || [];
    if (biomeId >= 0 && biomeId < colors.length) {
      return colors[biomeId];
    }
  } catch (error) {
    // Fallback if biomes not available
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[getBiomeColor] Biome data not available, using default color');
    }
  }
  return '#4CAF50'; // Default green
}

/**
 * Helper: Calculate cell bounds from path
 * @param {Array<Array<number>>} path - Array of [x, y] points
 * @returns {Object} Bounds { x, y, width, height }
 */
function calculateCellBounds(path) {
  if (!path || path.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of path) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Get renderer instance (factory for Canvas 2D or WebGL renderer)
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @param {Object} options - Renderer options { mode: 'canvas2d'|'webgl', fallbackTo2D: true, ... }
 * @returns {Renderer} Renderer instance (Canvas2DRenderer or PixiRenderer)
 * @throws {InvalidOptionError} If mode is invalid or WebGL unavailable
 */
export function getRenderer(canvas, options = {}) {
  const mode = options.mode || 'canvas2d';
  const fallbackTo2D = options.fallbackTo2D !== false;

  if (mode === 'canvas2d') {
    return new Canvas2DRenderer(canvas, options);
  } else if (mode === 'webgl') {
    try {
      return new PixiRenderer(canvas, options);
    } catch (error) {
      if (fallbackTo2D) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[getRenderer] WebGL not available, falling back to Canvas 2D');
        }
        return new Canvas2DRenderer(canvas, options);
      }
      throw new InvalidOptionError('options.mode', mode, `WebGL not available: ${error.message}`);
    }
  } else {
    throw new InvalidOptionError('options.mode', mode, `Invalid mode: ${mode}. Must be 'canvas2d' or 'webgl'`);
  }
}
