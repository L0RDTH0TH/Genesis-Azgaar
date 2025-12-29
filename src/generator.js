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
} from './core/index.js';
import { renderMap } from './rendering/canvas.js';

/**
 * Singleton state for the generator
 */
let state = {
  canvas: null,
  options: getDefaultOptions(),
  data: null, // { grid, pack, seed }
  initialized: false,
};

/**
 * Create basic pack structure from grid (simplified reGraph)
 * For Phase 2.10, this creates a basic pack that mirrors grid structure
 * Full reGraph with refined Voronoi will be implemented in later phases
 * @param {Object} grid - Grid object
 * @param {Object} options - Generation options
 * @returns {Object} Pack object
 */
function createBasicPack(grid, options) {
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
 * @returns {Object} Generated map data {grid, pack, options, seed}
 */
function generateMapInternal(options, DelaunatorClass) {
  // Initialize RNG with seed
  const seed = options.seed || String(Date.now());
  const rng = new RNG(seed);

  // Phase 1: Voronoi diagram generation
  // Delaunator is required as a peer dependency
  if (!DelaunatorClass) {
    throw new GenerationError(
      'Delaunator is required as a peer dependency. Install: npm install delaunator, then pass Delaunator as the second parameter to generateMap()'
    );
  }
  
  const grid = createVoronoiDiagram(
    {
      mapWidth: options.mapWidth,
      mapHeight: options.mapHeight,
      cellsDesired: options.cellsDesired,
    },
    rng,
    DelaunatorClass
  );

  // Phase 2: Heightmap generation
  const heights = generateHeightmap({ grid, options, rng, template: options.template });
  grid.cells.h = heights;

  // Phase 3: Grid-level feature detection
  markupGrid({ grid });

  // Phase 4: Calculate map coordinates
  const mapCoordinates = calculateMapCoordinates(options, options.mapWidth, options.mapHeight);

  // Phase 5: Temperature calculation
  const temperatures = calculateTemperatures({ grid, options, mapCoordinates });
  grid.cells.temp = temperatures;

  // Phase 6: Precipitation generation
  const precipitation = generatePrecipitation({ grid, options, rng, mapCoordinates });
  grid.cells.prec = precipitation;

  // Phase 7: Create pack from grid (simplified reGraph)
  // Note: Full reGraph with refined Voronoi will be implemented in later phases
  let pack = createBasicPack(grid, options);
  
  // Ensure pack has data from grid
  pack.cells.h = grid.cells.h;
  // Ensure pack.cells.g maps pack cells to grid cells (for simplified version, 1:1 mapping)
  for (let i = 0; i < pack.cells.i.length; i++) {
    pack.cells.g[i] = i;
  }

  // Phase 8: River generation
  generateRivers({
    grid,
    pack,
    options,
    rng,
    precipitation: grid.cells.prec,
    allowErosion: options.allowErosion !== false,
  });

  // Phase 9: Biome assignment
  const biomesData = getDefaultBiomes();
  assignBiomes({ pack, grid, options, biomesData });

  // Phase 10: Pack-level feature detection
  markupPack({ pack });
  specifyFeatures({ pack, grid, options });

  // Phase 11: Culture generation
  generateCultures({ pack, grid, options, rng, biomesData });
  expandCultures({ pack, options, biomesData });

  // Phase 12: Burg (settlement) generation
  generateBurgs({ pack, grid, options, rng });

  // Phase 13: State generation
  generateStates({ pack, options, rng });

  // Phase 14: Province generation
  generateProvinces({ pack, options, rng });

  // Phase 15: Religion generation (optional)
  if (options.religionsNumber > 0) {
    generateReligions({ pack, options, rng });
  } else {
    pack.religions = [{ name: 'No religion', i: 0 }];
    if (!pack.cells.religion) {
      pack.cells.religion = createTypedArray({ maxValue: 65535, length: pack.cells.i.length });
    }
  }

  // Phase 16: Emblem generation
  generateEmblems({ pack, options, rng });

  return {
    grid,
    pack,
    options,
    seed,
  };
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
 * Initialize the generator with optional canvas for rendering
 * @param {Object} params - Initialization parameters
 * @param {HTMLCanvasElement|null} params.canvas - Optional canvas element for rendering previews
 * @throws {InitializationError} If already initialized or invalid canvas provided
 */
export function initGenerator({ canvas = null } = {}) {
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

  state.canvas = canvas;
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
      },
      vertices: pack.vertices ? {
        p: pack.vertices.p ? pack.vertices.p.map(v => [...v]) : [],
      } : {},
      features: pack.features ? deepCopy(pack.features) : [],
      burgs: pack.burgs ? deepCopy(pack.burgs) : [],
      states: pack.states ? deepCopy(pack.states) : [],
      rivers: pack.rivers ? deepCopy(pack.rivers) : [],
      cultures: pack.cultures ? deepCopy(pack.cultures) : [],
      religions: pack.religions ? deepCopy(pack.religions) : [],
      provinces: pack.provinces ? deepCopy(pack.provinces) : [],
    },
  };

  return json;
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
