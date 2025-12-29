/**
 * =============================================================================
 * features.js
 * Desc: Natural feature detection (coasts, lakes, islands)
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

import { createTypedArray } from '../utils/array.js';
import { dist2 } from '../utils/math.js';

// Distance field constants
const DEEPER_LAND = 3;
const LANDLOCKED = 2;
const LAND_COAST = 1;
const UNMARKED = 0;
const WATER_COAST = -1;
const DEEP_WATER = -2;
const INT8_MAX = 127;

/**
 * Check if a cell is land
 * @param {number} cellId - Cell ID
 * @param {Object} pack - Pack object
 * @returns {boolean} True if land
 */
function isLand(cellId, pack) {
  return pack.cells.h[cellId] >= 20;
}

/**
 * Check if a cell is water
 * @param {number} cellId - Cell ID
 * @param {Object} pack - Pack object
 * @returns {boolean} True if water
 */
function isWater(cellId, pack) {
  return pack.cells.h[cellId] < 20;
}

/**
 * Calculate distance to coast for every cell
 * @param {Object} params - Parameters
 * @param {Int8Array} params.distanceField - Distance field array (modified in place)
 * @param {Array<Array<number>>} params.neighbors - Neighbors array
 * @param {number} params.start - Starting distance value
 * @param {number} params.increment - Distance increment
 * @param {number} params.limit - Limit value (optional)
 */
function markupDistance({ distanceField, neighbors, start, increment, limit = INT8_MAX }) {
  for (let distance = start, marked = Infinity; marked > 0 && distance !== limit; distance += increment) {
    marked = 0;
    const prevDistance = distance - increment;
    for (let cellId = 0; cellId < neighbors.length; cellId++) {
      if (distanceField[cellId] !== prevDistance) continue;

      for (const neighborId of neighbors[cellId]) {
        if (distanceField[neighborId] !== UNMARKED) continue;
        distanceField[neighborId] = distance;
        marked++;
      }
    }
  }
}

/**
 * Mark grid features (ocean, lakes, islands) and calculate distance field
 * @param {Object} params - Generation parameters
 * @param {Object} params.grid - Grid object (will be modified)
 * @returns {Array} Features array
 */
export function markupGrid({ grid }) {
  if (!grid || !grid.cells) {
    throw new Error('Grid object with cells is required');
  }

  const { h: heights, c: neighbors, b: borderCells, i } = grid.cells;
  const cellsNumber = i.length;
  const distanceField = new Int8Array(cellsNumber); // grid.cells.t
  const featureIds = new Uint16Array(cellsNumber); // grid.cells.f
  const features = [null]; // Index 0 is null, features start at 1

  const queue = [0];
  for (let featureId = 1; queue[0] !== -1; featureId++) {
    const firstCell = queue[0];
    featureIds[firstCell] = featureId;

    const land = heights[firstCell] >= 20;
    let border = false; // set true if feature touches map edge

    while (queue.length) {
      const cellId = queue.pop();
      if (!border && borderCells[cellId]) border = true;

      if (!neighbors[cellId]) continue;
      for (const neighborId of neighbors[cellId]) {
        if (neighborId < 0 || neighborId >= cellsNumber) continue;
        const isNeibLand = heights[neighborId] >= 20;

        if (land === isNeibLand && featureIds[neighborId] === UNMARKED) {
          featureIds[neighborId] = featureId;
          queue.push(neighborId);
        } else if (land && !isNeibLand) {
          distanceField[cellId] = LAND_COAST;
          distanceField[neighborId] = WATER_COAST;
        }
      }
    }

    const type = land ? 'island' : border ? 'ocean' : 'lake';
    features.push({ i: featureId, land, border, type });

    queue[0] = featureIds.findIndex((f) => f === UNMARKED); // find unmarked cell
  }

  // Markup deep ocean cells
  markupDistance({ distanceField, neighbors, start: DEEP_WATER, increment: -1, limit: -10 });

  grid.cells.t = distanceField;
  grid.cells.f = featureIds;
  grid.features = features;

  return features;
}

/**
 * Mark pack features (ocean, lakes, islands), calculate distance field and add properties
 * @param {Object} params - Generation parameters
 * @param {Object} params.pack - Pack object (will be modified)
 * @returns {Array} Features array
 */
export function markupPack({ pack }) {
  if (!pack || !pack.cells) {
    throw new Error('Pack object with cells is required');
  }

  const { cells } = pack;
  const { c: neighbors, b: borderCells, i } = cells;
  const packCellsNumber = i.length;
  if (!packCellsNumber) return []; // no cells -> there is nothing to do

  const distanceField = new Int8Array(packCellsNumber); // pack.cells.t
  const featureIds = new Uint16Array(packCellsNumber); // pack.cells.f
  const haven = createTypedArray({ maxValue: packCellsNumber, length: packCellsNumber }); // haven: opposite water cell
  const harbor = new Uint8Array(packCellsNumber); // harbor: number of adjacent water cells
  const features = [null]; // Index 0 is null, features start at 1

  const queue = [0];
  for (let featureId = 1; queue[0] !== -1; featureId++) {
    const firstCell = queue[0];
    featureIds[firstCell] = featureId;

    const land = isLand(firstCell, pack);
    let border = Boolean(borderCells[firstCell]); // true if feature touches map border
    let totalCells = 1; // count cells in a feature

    while (queue.length) {
      const cellId = queue.pop();
      if (borderCells[cellId]) border = true;

      if (!neighbors[cellId]) continue;
      for (const neighborId of neighbors[cellId]) {
        if (neighborId < 0 || neighborId >= packCellsNumber) continue;
        const isNeibLand = isLand(neighborId, pack);

        if (land && !isNeibLand) {
          distanceField[cellId] = LAND_COAST;
          distanceField[neighborId] = WATER_COAST;
          if (!haven[cellId]) defineHaven(cellId);
        } else if (land && isNeibLand) {
          if (distanceField[neighborId] === UNMARKED && distanceField[cellId] === LAND_COAST)
            distanceField[neighborId] = LANDLOCKED;
          else if (distanceField[cellId] === UNMARKED && distanceField[neighborId] === LAND_COAST)
            distanceField[cellId] = LANDLOCKED;
        }

        if (!featureIds[neighborId] && land === isNeibLand) {
          queue.push(neighborId);
          featureIds[neighborId] = featureId;
          totalCells++;
        }
      }
    }

    features.push(addFeature({ firstCell, land, border, featureId, totalCells }));
    queue[0] = featureIds.findIndex((f) => f === UNMARKED); // find unmarked cell
  }

  // Markup pack land and water distances
  markupDistance({ distanceField, neighbors, start: DEEPER_LAND, increment: 1 }); // markup pack land
  markupDistance({ distanceField, neighbors, start: DEEP_WATER, increment: -1, limit: -10 }); // markup pack water

  pack.cells.t = distanceField;
  pack.cells.f = featureIds;
  pack.cells.haven = haven;
  pack.cells.harbor = harbor;
  pack.features = features;

  return features;

  function defineHaven(cellId) {
    const waterCells = neighbors[cellId].filter((neibCellId) => isWater(neibCellId, pack));
    if (waterCells.length === 0) return;

    const distances = waterCells.map((neibCellId) => dist2(cells.p[cellId], cells.p[neibCellId]));
    const closest = distances.indexOf(Math.min(...distances));

    haven[cellId] = waterCells[closest];
    harbor[cellId] = waterCells.length;
  }

  function addFeature({ firstCell, land, border, featureId, totalCells }) {
    const type = land ? 'island' : border ? 'ocean' : 'lake';

    const feature = {
      i: featureId,
      type,
      land,
      border,
      cells: totalCells,
      firstCell,
    };

    // For lakes, add additional properties (simplified for Phase 2.6)
    if (type === 'lake') {
      // Lake height calculation will be added when lakes module is integrated
      feature.height = 0; // Placeholder
      feature.shoreline = []; // Placeholder - will be populated later
    }

    return feature;
  }
}

/**
 * Specify feature properties (groups, names, etc.)
 * @param {Object} params - Generation parameters
 * @param {Object} params.pack - Pack object
 * @param {Object} params.grid - Grid object
 * @param {Object} params.options - Generation options
 */
export function specifyFeatures({ pack, grid, options }) {
  if (!pack || !pack.features) {
    throw new Error('Pack object with features is required');
  }

  const gridCellsNumber = grid.cells.i.length;
  const OCEAN_MIN_SIZE = gridCellsNumber / 25;
  const SEA_MIN_SIZE = gridCellsNumber / 1000;
  const CONTINENT_MIN_SIZE = gridCellsNumber / 10;
  const ISLAND_MIN_SIZE = gridCellsNumber / 1000;

  for (const feature of pack.features) {
    if (!feature || feature.type === 'ocean') continue;

    feature.group = defineGroup(feature);
  }

  function defineGroup(feature) {
    if (feature.type === 'island') return defineIslandGroup(feature);
    if (feature.type === 'ocean') return defineOceanGroup(feature);
    if (feature.type === 'lake') return defineLakeGroup(feature);
    return 'unknown';
  }

  function defineOceanGroup(feature) {
    if (feature.cells > OCEAN_MIN_SIZE) return 'ocean';
    if (feature.cells > SEA_MIN_SIZE) return 'sea';
    return 'gulf';
  }

  function defineIslandGroup(feature) {
    const prevFeature = pack.features[pack.cells.f[feature.firstCell - 1]];
    if (prevFeature && prevFeature.type === 'lake') return 'lake_island';
    if (feature.cells > CONTINENT_MIN_SIZE) return 'continent';
    if (feature.cells > ISLAND_MIN_SIZE) return 'island';
    return 'isle';
  }

  function defineLakeGroup(feature) {
    // Simplified lake grouping for Phase 2.6
    // Full implementation will be added when lakes module is integrated
    if (feature.temp < -3) return 'frozen';
    if (!feature.outlet && feature.evaporation > feature.flux) return 'salt';
    return 'freshwater';
  }
}
