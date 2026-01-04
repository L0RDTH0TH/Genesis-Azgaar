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
  // NoCanvasError, // DEPRECATED: Canvas rendering is deprecated
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
import { rankCells } from './core/rankCells.js';
import { createPackFromGrid } from './core/regraph.js';
// Canvas rendering is deprecated - use SVG instead
// import { renderMap } from './rendering/canvas.js'; // DEPRECATED
import { renderMapSVG } from './rendering/svg.js';

/**
 * Singleton state for the generator
 */
let state = {
  // canvas: null, // DEPRECATED: Canvas rendering is deprecated, use container for SVG instead
  container: null, // SVG container element (optional)
  options: getDefaultOptions(),
  data: null, // { grid, pack, seed }
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
  // Copy cells.c properly - it's an object with numeric keys, not a regular array
  const packCellsC = [];
  if (gridCells.c) {
    for (let i = 0; i < gridCells.i.length; i++) {
      packCellsC[i] = gridCells.c[i] ? (Array.isArray(gridCells.c[i]) ? gridCells.c[i].slice() : Array.from(gridCells.c[i])) : [];
    }
  }
  
  const packCells = {
    i: createTypedArray({ maxValue: gridCells.i.length, length: gridCells.i.length }).map((_, i) => i),
    p: points.slice(),
    g: createTypedArray({ maxValue: gridCells.i.length, length: gridCells.i.length }).map((_, i) => i),
    h: new Uint8Array(gridCells.h.length),
    c: packCellsC,
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

  // Phase 7: Create pack from grid
  // Use full Voronoi pack if fullRendering is enabled or container (SVG) is provided
  // Full pack is required for SVG rendering (needs vCoords/v data for isoline rendering)
  // ALWAYS use full pack for now to ensure cell data is populated
  const useFullPack = true; // Force full pack creation for all cases
  
  // Debug: Log decision
  if (typeof console !== 'undefined' && console.log) {
    console.log('[generator] Pack creation decision:', {
      useFullPack,
      fullRendering: options.fullRendering,
      hasContainer: state.container !== null,
      forcedFullPack: true,
    });
  }
  
  let pack;
  
  if (useFullPack) {
    // Full Voronoi pack with polygon vertices (for rendering)
    pack = createPackFromGrid({ grid, options, DelaunatorClass });
    // Ensure pack has height data from grid (pack may have fewer cells than grid)
    // Height data will be mapped via pack.cells.g (grid cell index)
    
    // Debug: Log pack structure immediately after creation
    if (typeof console !== 'undefined' && console.log) {
      console.log('[generator:lifecycle] Post-creation (immediately after createPackFromGrid):', {
        cellsCount: pack.cells.i.length,
        hasVCoords: Array.isArray(pack.cells.vCoords),
        vCoordsLength: pack.cells.vCoords?.length || 0,
        hasV: Array.isArray(pack.cells.v),
        vLength: pack.cells.v?.length || 0,
        vCoordsSample: pack.cells.vCoords?.[0]?.length || 0,
        vSample: pack.cells.v?.[0]?.length || 0,
        verticesPLength: pack.vertices?.p?.length || 0,
        v0Exists: pack.cells.v?.[0] !== undefined,
        vCoords0Exists: pack.cells.vCoords?.[0] !== undefined,
        v0Sample: pack.cells.v?.[0] ? JSON.stringify(pack.cells.v[0].slice(0, 3)) : 'undefined',
        vCoords0Sample: pack.cells.vCoords?.[0] ? JSON.stringify(pack.cells.vCoords[0].slice(0, 2)) : 'undefined',
        packCellsKeys: pack.cells ? Object.keys(pack.cells) : [],
      });
    }
  } else {
    // Simplified pack (faster, for headless/data-only use)
    pack = createSimplifiedPack(grid, options);
    // Ensure pack has data from grid
    pack.cells.h = grid.cells.h;
    // Ensure pack.cells.g maps pack cells to grid cells (for simplified version, 1:1 mapping)
    for (let i = 0; i < pack.cells.i.length; i++) {
      pack.cells.g[i] = i;
    }
    
    // Debug: Log simplified pack
    if (typeof console !== 'undefined' && console.log) {
      console.log('[generator] Pack created (simplified):', {
        cellsCount: pack.cells.i.length,
        hasVCoords: Array.isArray(pack.cells.vCoords),
        hasV: Array.isArray(pack.cells.v),
      });
    }
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

  // Phase 10.5: Calculate suitability and population scores (CRITICAL for cultures/burgs/states)
  rankCells({ pack, grid, options, biomesData });

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

  // Diagnostic logging after generation
  if (typeof console !== 'undefined' && console.log) {
    const landCells = pack.cells.i.filter(i => pack.cells.h[i] >= 20);
    const landPercentage = ((landCells.length / pack.cells.i.length) * 100).toFixed(1);
    const features = pack.features || [];
    const landFeatures = features.filter(f => f && f.land);
    const landClusters = landFeatures.length;
    
    // Get blobPower/linePower from template lookup
    const cellsDesired = grid.cellsDesired || 10000;
    const blobPowerMap = {
      1000: 0.93, 2000: 0.95, 5000: 0.97, 10000: 0.98,
      20000: 0.99, 30000: 0.991, 40000: 0.993, 50000: 0.994,
      60000: 0.995, 70000: 0.9955, 80000: 0.996, 90000: 0.9964, 100000: 0.9973
    };
    const linePowerMap = {
      1000: 0.75, 2000: 0.77, 5000: 0.79, 10000: 0.81,
      20000: 0.82, 30000: 0.83, 40000: 0.84, 50000: 0.86,
      60000: 0.87, 70000: 0.88, 80000: 0.91, 90000: 0.92, 100000: 0.93
    };
    const blobPower = blobPowerMap[cellsDesired] || 0.98;
    const linePower = linePowerMap[cellsDesired] || 0.81;
    
    console.log('[diagnostics] Generation complete:', {
      packCells: pack.cells.i.length,
      landCells: landCells.length,
      landPercentage: `${landPercentage}%`,
      targetLandPercentage: options.landPercentage || 40,
      landClusters: landClusters,
      features: features.length,
      verticesCount: pack.vertices?.p?.length || 0,
      verticesVSample: pack.vertices?.v?.[0]?.length || 0,
      verticesCSample: pack.vertices?.c?.[0]?.length || 0,
      heightMin: pack.cells.h ? Math.min(...Array.from(pack.cells.h).filter(h => h !== undefined)) : 'N/A',
      heightMax: pack.cells.h ? Math.max(...Array.from(pack.cells.h).filter(h => h !== undefined)) : 'N/A',
      heightMean: pack.cells.h ? (Array.from(pack.cells.h).reduce((a, b) => (a || 0) + (b || 0), 0) / pack.cells.h.length).toFixed(1) : 'N/A',
      blobPower: blobPower,
      linePower: linePower,
      cellsDesired: cellsDesired,
    });
  }

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
 * Initialize the generator with optional container for SVG rendering
 * 
 * ⚠️ NOTE: Canvas rendering is deprecated. Use container for SVG rendering instead.
 * 
 * @param {Object} params - Initialization parameters
 * @param {HTMLElement|null} params.container - Optional container element for SVG rendering
 * @param {HTMLCanvasElement|null} params.canvas - DEPRECATED: Canvas rendering is deprecated. Use container for SVG instead.
 * @throws {InitializationError} If already initialized or invalid elements provided
 */
export function initGenerator({ canvas = null, container = null } = {}) {
  if (state.initialized) {
    throw new InitializationError(
      'Generator already initialized. Cannot initialize multiple times.'
    );
  }

  // Warn if canvas is provided (deprecated)
  if (canvas !== null) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn(
        '⚠️ DEPRECATED: Canvas rendering is deprecated. ' +
        'Use container parameter for SVG rendering instead. ' +
        'Canvas parameter will be ignored.'
      );
    }
  }

  // Validate container if provided
  if (container !== null && !(container instanceof HTMLElement)) {
    throw new InitializationError(
      `Invalid container element. Expected HTMLElement, got ${typeof container}`
    );
  }

  // state.canvas = canvas; // DEPRECATED: Canvas rendering is deprecated
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
    
    // Check pack structure after generateMapInternal returns
    if (typeof console !== 'undefined' && console.log) {
      console.log('[generator:lifecycle] After generateMapInternal, before storing in state:', {
        dataHasPack: 'pack' in data,
        packHasCells: data.pack && 'cells' in data.pack,
        packCellsHasV: data.pack?.cells && 'v' in data.pack.cells,
        packCellsHasVCoords: data.pack?.cells && 'vCoords' in data.pack.cells,
        packCellsVLength: data.pack?.cells?.v?.length,
        packCellsVCoordsLength: data.pack?.cells?.vCoords?.length,
        packCellsKeys: data.pack?.cells ? Object.keys(data.pack.cells) : [],
      });
    }
    
    state.data = data;
    
    // Check pack structure after storing in state
    if (typeof console !== 'undefined' && console.log) {
      console.log('[generator:lifecycle] After storing in state.data:', {
        stateDataHasPack: state.data && 'pack' in state.data,
        packHasCells: state.data?.pack && 'cells' in state.data.pack,
        packCellsHasV: state.data?.pack?.cells && 'v' in state.data.pack.cells,
        packCellsHasVCoords: state.data?.pack?.cells && 'vCoords' in state.data.pack.cells,
        packCellsVLength: state.data?.pack?.cells?.v?.length,
        packCellsVCoordsLength: state.data?.pack?.cells?.vCoords?.length,
      });
    }
    
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
    },
  };

  return json;
}

/**
 * Render stored map data to SVG (default rendering method)
 * 
 * ⚠️ DEPRECATED: renderPreview() (Canvas) is deprecated. Use renderPreviewSVG() instead.
 * This function now delegates to renderPreviewSVG() for backward compatibility.
 * 
 * @deprecated Use renderPreviewSVG() instead
 * @throws {InitializationError} If generator not initialized
 * @throws {NoDataError} If no data generated yet
 */
export function renderPreview() {
    if (typeof console !== 'undefined' && console.warn) {
    console.warn(
      '⚠️ DEPRECATED: renderPreview() is deprecated. ' +
      'Use renderPreviewSVG() instead for production-quality SVG rendering.'
    );
    }
  
  // Delegate to SVG rendering for backward compatibility
  return renderPreviewSVG();
}

/**
 * Render stored map data to SVG (returns SVG string or appends to container)
 * This is the primary rendering method - SVG provides isoline-based, smooth, high-quality output.
 * 
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
      console.error('Error stack:', error.stack);
    }
    // Defensive: Try to render with minimal layers if full rendering fails
    // This allows the map to still render even if some layers fail
    try {
      // Create a minimal SVG with just the base layers
      const { pack, options: genOptions } = state.data;
      const mapWidth = width || genOptions.mapWidth || 1000;
      const mapHeight = height || genOptions.mapHeight || 600;
      
      const minimalLayers = [
        `<rect x="0" y="0" width="${mapWidth}" height="${mapHeight}" fill="#d4d4aa" />`,
        `<text x="${mapWidth/2}" y="${mapHeight/2}" text-anchor="middle" fill="#666" font-size="16">Map rendered with errors - some layers may be missing</text>`
      ];
      
      const minimalSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${mapWidth}" height="${mapHeight}" viewBox="0 0 ${mapWidth} ${mapHeight}">
${minimalLayers.join('\n')}
</svg>`;
      
      if (container) {
        container.innerHTML = minimalSVG;
        console.warn('SVG rendered with minimal fallback due to error');
        return null;
      }
      return minimalSVG;
    } catch (fallbackError) {
      // If even minimal rendering fails, throw original error
      throw new GenerationError(`SVG rendering failed: ${error.message}`);
    }
  }
}

/**
 * Render map data to SVG string (alias for renderPreviewSVG without container)
 * Convenience function for generating SVG string without container
 * 
 * @param {Object} options - Rendering options {width, height}
 * @returns {string} SVG string
 * @throws {InitializationError} If generator not initialized
 * @throws {NoDataError} If no data generated yet
 */
export function renderToSVG(options = {}) {
  // Ensure no container is set so we always return SVG string
  return renderPreviewSVG({ ...options, container: null });
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
