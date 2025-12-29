/**
 * =============================================================================
 * temperature.js
 * Desc: Temperature calculation based on latitude and altitude
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

import { rn, minmax } from '../utils/math.js';
import { createTypedArray } from '../utils/array.js';

/**
 * Calculate sea level temperature for a given latitude
 * @param {number} latitude - Latitude in degrees [-90, 90]
 * @param {Object} options - Generation options
 * @returns {number} Sea level temperature in Celsius
 */
function calculateSeaLevelTemp(latitude, options) {
  const { temperatureEquator, temperatureNorthPole, temperatureSouthPole } = options;
  const tropics = [16, -20]; // tropics zone
  const tropicalGradient = 0.15;

  const tempNorthTropic = temperatureEquator - tropics[0] * tropicalGradient;
  const northernGradient = (tempNorthTropic - temperatureNorthPole) / (90 - tropics[0]);

  const tempSouthTropic = temperatureEquator + tropics[1] * tropicalGradient;
  const southernGradient = (tempSouthTropic - temperatureSouthPole) / (90 + tropics[1]);

  const isTropical = latitude <= 16 && latitude >= -20;
  if (isTropical) return temperatureEquator - Math.abs(latitude) * tropicalGradient;

  return latitude > 0
    ? tempNorthTropic - (latitude - tropics[0]) * northernGradient
    : tempSouthTropic + (latitude - tropics[1]) * southernGradient;
}

/**
 * Get temperature drop due to altitude
 * Temperature drops by 6.5°C per 1km of altitude
 * @param {number} height - Cell height (0-100)
 * @param {number} heightExponent - Height exponent for calculation
 * @returns {number} Temperature drop in Celsius
 */
function getAltitudeTemperatureDrop(height, heightExponent) {
  if (height < 20) return 0; // Water cells have no altitude drop
  const heightInMeters = Math.pow(height - 18, heightExponent);
  return rn((heightInMeters / 1000) * 6.5);
}

/**
 * Calculate temperatures for all grid cells
 * @param {Object} params - Generation parameters
 * @param {Object} params.grid - Grid object with cells, points, cellsX
 * @param {Object} params.options - Generation options
 * @param {Object} params.mapCoordinates - Map coordinates (optional, will be calculated if not provided)
 * @returns {Int8Array} Temperature array
 */
export function calculateTemperatures({ grid, options, mapCoordinates: providedMapCoords = null }) {
  if (!grid || !grid.cells) {
    throw new Error('Grid object with cells is required');
  }

  const cells = grid.cells;
  const temp = new Int8Array(cells.i.length); // temperature array (Int8Array for signed values)

  // Calculate or use provided map coordinates
  let mapCoordinates = providedMapCoords;
  if (!mapCoordinates) {
    // Calculate basic map coordinates from options
    const sizeFraction = (options.mapSize || 50) / 100;
    const latShift = options.latitude / 100;
    const latT = rn(sizeFraction * 180, 1);
    const latN = rn(90 - (180 - latT) * latShift, 1);
    mapCoordinates = { latT, latN };
  }

  const { temperatureEquator, temperatureNorthPole, temperatureSouthPole } = options;
  const heightExponent = options.heightExponent || 1.8;
  const height = options.mapHeight || 540;

  const tropics = [16, -20]; // tropics zone
  const tropicalGradient = 0.15;

  const tempNorthTropic = temperatureEquator - tropics[0] * tropicalGradient;
  const northernGradient = (tempNorthTropic - temperatureNorthPole) / (90 - tropics[0]);

  const tempSouthTropic = temperatureEquator + tropics[1] * tropicalGradient;
  const southernGradient = (tempSouthTropic - temperatureSouthPole) / (90 + tropics[1]);

  // Calculate temperature for each row (same latitude)
  for (let rowCellId = 0; rowCellId < cells.i.length; rowCellId += grid.cellsX) {
    const [, y] = grid.points[rowCellId];
    const rowLatitude = mapCoordinates.latN - (y / height) * mapCoordinates.latT; // [90; -90]
    const tempSeaLevel = calculateSeaLevelTemp(rowLatitude, options);

    // Calculate temperature for each cell in the row
    for (let cellId = rowCellId; cellId < rowCellId + grid.cellsX && cellId < cells.i.length; cellId++) {
      const tempAltitudeDrop = getAltitudeTemperatureDrop(cells.h[cellId], heightExponent);
      temp[cellId] = minmax(tempSeaLevel - tempAltitudeDrop, -128, 127);
    }
  }

  return temp;
}
