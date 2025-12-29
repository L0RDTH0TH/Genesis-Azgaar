/**
 * =============================================================================
 * flux.js
 * Desc: Precipitation and flux calculation for hydrological systems
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

import { rn, minmax } from '../utils/math.js';
import { createTypedArray } from '../utils/array.js';

/**
 * Calculate map coordinates from options
 * @param {Object} options - Generation options
 * @param {number} width - Map width
 * @param {number} height - Map height
 * @returns {Object} Map coordinates {latT, latN, latS, lonT, lonW, lonE}
 */
function calculateMapCoordinates(options, width, height) {
  const sizeFraction = (options.mapSize || 50) / 100;
  const latShift = options.latitude / 100;
  const lonShift = (options.longitude || 50) / 100;

  const latT = rn(sizeFraction * 180, 1);
  const latN = rn(90 - (180 - latT) * latShift, 1);
  const latS = rn(latN - latT, 1);

  const lonT = rn(Math.min((width / height) * latT, 360), 1);
  const lonE = rn(180 - (360 - lonT) * lonShift, 1);
  const lonW = rn(lonE - lonT, 1);

  return { latT, latN, latS, lonT, lonW, lonE };
}

/**
 * Get wind directions based on wind tier
 * @param {number} tier - Wind tier (0-5)
 * @param {Array<number>} winds - Wind directions array (6 elements)
 * @returns {Object} Wind direction flags
 */
function getWindDirections(tier, winds) {
  const angle = winds[tier] || winds[0];
  const isWest = angle > 40 && angle < 140;
  const isEast = angle > 220 && angle < 320;
  const isNorth = angle > 100 && angle < 260;
  const isSouth = angle > 280 || angle < 80;
  return { isWest, isEast, isNorth, isSouth };
}

/**
 * Calculate precipitation for a single cell based on humidity and elevation
 * @param {number} humidity - Current humidity
 * @param {number} currentHeight - Current cell height
 * @param {number} nextHeight - Next cell height
 * @param {number} modifier - Precipitation modifier
 * @returns {number} Precipitation amount
 */
function getPrecipitation(humidity, currentHeight, nextHeight, modifier) {
  const normalLoss = Math.max(humidity / (10 * modifier), 1); // precipitation in normal conditions
  const diff = Math.max(nextHeight - currentHeight, 0); // difference in height
  const mod = (nextHeight / 70) ** 2; // 50 stands for hills, 70 for mountains
  return minmax(normalLoss + diff * mod, 1, humidity);
}

/**
 * Pass wind across cells and distribute precipitation
 * @param {Array} source - Source cells array
 * @param {number} maxPrec - Maximum precipitation
 * @param {number} next - Step increment
 * @param {number} steps - Number of steps
 * @param {Object} grid - Grid object with cells
 * @param {Uint8Array} prec - Precipitation array to modify
 * @param {number} modifier - Precipitation modifier
 * @param {Object} rng - RNG instance
 */
function passWind(source, maxPrec, next, steps, grid, prec, modifier, rng) {
  const MAX_PASSABLE_ELEVATION = 85;
  const maxPrecInit = maxPrec;

  for (let first of source) {
    if (Array.isArray(first) && first[0] !== undefined) {
      maxPrec = Math.min(maxPrecInit * first[1], 255);
      first = first[0];
    }

    let humidity = maxPrec - grid.cells.h[first]; // initial water amount
    if (humidity <= 0) continue; // if first cell in row is too elevated consider wind dry

    for (let s = 0, current = first; s < steps && current >= 0 && current < grid.cells.i.length; s++, current += next) {
      if (grid.cells.temp && grid.cells.temp[current] < -5) continue; // no flux in permafrost

      if (grid.cells.h[current] < 20) {
        // water cell
        const nextCell = current + next;
        if (nextCell >= 0 && nextCell < grid.cells.i.length && grid.cells.h[nextCell] >= 20) {
          prec[nextCell] += Math.max(humidity / rng.randInt(10, 20), 1); // coastal precipitation
        } else {
          humidity = Math.min(humidity + 5 * modifier, maxPrec); // wind gets more humidity passing water cell
          prec[current] += 5 * modifier; // water cells precipitation
        }
        continue;
      }

      // land cell
      const nextCell = current + next;
      if (nextCell < 0 || nextCell >= grid.cells.i.length) continue;
      
      const isPassable = grid.cells.h[nextCell] <= MAX_PASSABLE_ELEVATION;
      const precipitation = isPassable
        ? getPrecipitation(humidity, grid.cells.h[current], grid.cells.h[nextCell], modifier)
        : humidity;
      prec[current] += precipitation;
      const evaporation = precipitation > 1.5 ? 1 : 0; // some humidity evaporates back to the atmosphere
      humidity = isPassable ? minmax(humidity - precipitation + evaporation, 0, maxPrec) : 0;
    }
  }
}

/**
 * Generate precipitation for grid cells
 * @param {Object} params - Generation parameters
 * @param {Object} params.grid - Grid object with cells, points, cellsX, cellsY
 * @param {Object} params.options - Generation options
 * @param {Object} params.rng - RNG instance
 * @param {Object} params.mapCoordinates - Map coordinates (optional, will be calculated if not provided)
 * @returns {Uint8Array} Precipitation array
 */
export function generatePrecipitation({ grid, options, rng, mapCoordinates: providedMapCoords = null }) {
  if (!grid || !grid.cells) {
    throw new Error('Grid object with cells is required');
  }
  if (!rng) {
    throw new Error('RNG instance is required');
  }

  const { cells, cellsX, cellsY } = grid;
  const prec = new Uint8Array(cells.i.length); // precipitation array

  const cellsNumberModifier = (options.cellsDesired / 10000) ** 0.25;
  const precInputModifier = (options.prec || 100) / 100;
  const modifier = cellsNumberModifier * precInputModifier;

  // Calculate or use provided map coordinates
  const mapCoordinates = providedMapCoords || calculateMapCoordinates(options, options.mapWidth, options.mapHeight);

  const westerly = [];
  const easterly = [];
  let southerly = 0;
  let northerly = 0;

  // precipitation modifier per latitude band
  // x4 = 0-5 latitude: wet through the year (rising zone)
  // x2 = 5-20 latitude: wet summer (rising zone), dry winter (sinking zone)
  // x1 = 20-30 latitude: dry all year (sinking zone)
  // x2 = 30-50 latitude: wet winter (rising zone), dry summer (sinking zone)
  // x3 = 50-60 latitude: wet all year (rising zone)
  // x2 = 60-70 latitude: wet summer (rising zone), dry winter (sinking zone)
  // x1 = 70-85 latitude: dry all year (sinking zone)
  // x0.5 = 85-90 latitude: dry all year (sinking zone)
  const latitudeModifier = [4, 2, 2, 2, 1, 1, 2, 2, 2, 2, 3, 3, 2, 2, 1, 1, 1, 0.5];

  // define wind directions based on cells latitude and prevailing winds there
  for (let i = 0; i < cellsY; i++) {
    const c = i * cellsX;
    const lat = mapCoordinates.latN - (i / cellsY) * mapCoordinates.latT;
    const latBand = ((Math.abs(lat) - 1) / 5) | 0;
    const latMod = latitudeModifier[Math.min(latBand, latitudeModifier.length - 1)] || 1;
    const windTier = (Math.abs(lat - 89) / 30) | 0; // 30d tiers from 0 to 5 from N to S
    const { isWest, isEast, isNorth, isSouth } = getWindDirections(windTier, options.winds);

    if (isWest) westerly.push([c, latMod, windTier]);
    if (isEast) easterly.push([c + cellsX - 1, latMod, windTier]);
    if (isNorth) northerly++;
    if (isSouth) southerly++;
  }

  // distribute winds by direction
  if (westerly.length) passWind(westerly, 120 * modifier, 1, cellsX, grid, prec, modifier, rng);
  if (easterly.length) passWind(easterly, 120 * modifier, -1, cellsX, grid, prec, modifier, rng);

  const vertT = southerly + northerly;
  if (northerly) {
    const bandN = ((Math.abs(mapCoordinates.latN) - 1) / 5) | 0;
    const latModN =
      mapCoordinates.latT > 60
        ? latitudeModifier.reduce((a, b) => a + b, 0) / latitudeModifier.length
        : latitudeModifier[Math.min(bandN, latitudeModifier.length - 1)] || 1;
    const maxPrecN = (northerly / vertT) * 60 * modifier * latModN;
    const northSource = [];
    for (let i = 0; i < cellsX; i++) {
      northSource.push(i);
    }
    passWind(northSource, maxPrecN, cellsX, cellsY, grid, prec, modifier, rng);
  }

  if (southerly) {
    const bandS = ((Math.abs(mapCoordinates.latS) - 1) / 5) | 0;
    const latModS =
      mapCoordinates.latT > 60
        ? latitudeModifier.reduce((a, b) => a + b, 0) / latitudeModifier.length
        : latitudeModifier[Math.min(bandS, latitudeModifier.length - 1)] || 1;
    const maxPrecS = (southerly / vertT) * 60 * modifier * latModS;
    const southSource = [];
    for (let i = cells.i.length - cellsX; i < cells.i.length; i++) {
      southSource.push(i);
    }
    passWind(southSource, maxPrecS, -cellsX, cellsY, grid, prec, modifier, rng);
  }

  return prec;
}
