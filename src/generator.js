/**
 * =============================================================================
 * generator.js
 * Desc: Main map generation entry point - orchestrates full generation pipeline
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

import { RNG } from './utils/rng.js';
import { getDefaultOptions, mergeOptions } from './options.js';
import { createTypedArray } from './utils/array.js';
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
 * Generate a complete fantasy map
 * @param {Object} userOptions - User-provided options (will be merged with defaults)
 * @param {Function} DelaunatorClass - Delaunator class (required as peer dependency)
 * @returns {Object} Generated map data {grid, pack, options, seed}
 */
export function generateMap(userOptions = {}, DelaunatorClass = null) {
  // Merge user options with defaults
  const options = mergeOptions(userOptions);

  // Initialize RNG with seed
  const seed = options.seed || String(Date.now());
  const rng = new RNG(seed);

  // Phase 1: Voronoi diagram generation
  // Delaunator is required as a peer dependency
  if (!DelaunatorClass) {
    throw new Error(
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
