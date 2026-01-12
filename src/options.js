/**
 * =============================================================================
 * options.js
 * Desc: Default options and validation/clamping for Genesis Mythos fork
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

import { deepCopy, minmax } from './utils/index.js';
import { PHASES } from './utils/constants.js';
import { InvalidOptionError } from './utils/errors.js';

/**
 * Default options matching original Azgaar generator behavior
 * All values are based on original defaults from main.js, options.js, and index.html
 */
const DEFAULT_OPTIONS = {
  // Map dimensions (canvas size)
  mapWidth: 960,
  mapHeight: 540,

  // Generation parameters
  seed: null, // Will be generated if not provided
  points: 4, // Maps to 10000 cells via cellsDensityMap (1=1K, 2=2K, 3=5K, 4=10K, etc.)
  template: null, // Heightmap template ID (null = random)

  // Political/Administrative
  statesNumber: 18,
  provincesRatio: 20,
  manors: 1000, // 1000 = "auto"

  // Cultural/Religious
  cultures: 12,
  culturesSet: 'world', // Options: world, european, oriental, english, antique, highFantasy, darkFantasy, random
  religionsNumber: 6,

  // World configuration
  temperatureEquator: 27,
  temperatureNorthPole: -30,
  temperatureSouthPole: -15,
  prec: 100, // Precipitation percentage
  winds: [225, 45, 225, 315, 135, 315], // Wind directions
  mapSize: null, // Percentage (null = auto-calculated from template)
  latitude: 50,
  longitude: null, // null = auto-calculated from template

  // Heightmap generation
  heightExponent: 1.8,
  lakeElevationLimit: 20,
  resolveDepressionsSteps: 250,
  landPercentage: 40, // Percentage of map that should be land (default 40% for continent template)

  // Population/Economy
  populationRate: 1000, // People per population point
  urbanization: 1, // Burgs population relative to all population
  urbanDensity: 10, // Average population per building
  growthRate: 1.5, // State growth rate
  sizeVariety: 4, // Size variety factor

  // Display/UI options (for future rendering)
  stateLabelsMode: 'auto', // 'auto', 'always', 'never'
  showBurgPreview: true,
  villageMaxPopulation: 2000,
  pinNotes: false,
  
  // Rendering options (Phase 5)
  fullRendering: false, // Use full Voronoi pack for polygon rendering (slower but better quality)

  // Units (for display/export)
  distanceScale: 3, // Scale factor for distance calculations
  distanceUnit: 'km', // 'km' or 'mi'
  heightUnit: 'm', // 'm' or 'ft'
  temperatureScale: '°C', // '°C' or '°F'
  areaUnit: 'square', // Area unit type

  // Era/World settings
  year: null, // Current year (null = random 100-2000)
  era: null, // Era name (null = auto-generated)
  eraShort: null, // Short era name (null = auto-generated)

  // Partial generation support (Iteration 2)
  skipPhases: [], // Array of phase names to skip (e.g., ['terrain', 'politics'])
};

/**
 * Cells density mapping (points slider value -> actual cell count)
 * Based on cellsDensityMap from original options.js
 */
const CELLS_DENSITY_MAP = {
  1: 1000,
  2: 2000,
  3: 5000,
  4: 10000,
  5: 20000,
  6: 30000,
  7: 40000,
  8: 50000,
  9: 60000,
  10: 70000,
  11: 80000,
  12: 90000,
  13: 100000,
};

/**
 * Get the actual cell count for a given points value
 * @param {number} points - Points slider value (1-13)
 * @returns {number} Actual number of cells
 */
export function getCellsFromPoints(points) {
  return CELLS_DENSITY_MAP[points] || CELLS_DENSITY_MAP[4];
}

/**
 * Validate and clamp a single option value
 * @param {string} key - Option key
 * @param {*} value - Value to validate
 * @returns {*} Clamped/validated value
 */
function validateOption(key, value) {
  if (value === null || value === undefined) {
    return DEFAULT_OPTIONS[key];
  }

  switch (key) {
    case 'mapWidth':
      return minmax(value, 240, 10000);
    case 'mapHeight':
      return minmax(value, 135, 10000);
    case 'points':
      return minmax(Math.round(value), 1, 13);
    case 'statesNumber':
      return minmax(Math.round(value), 0, 100);
    case 'provincesRatio':
      return minmax(value, 0, 100);
    case 'manors':
      return value === 'auto' || value === 1000 ? 1000 : minmax(Math.round(value), 0, 1000);
    case 'cultures':
      return minmax(Math.round(value), 1, 100);
    case 'religionsNumber':
      return minmax(Math.round(value), 0, 50);
    case 'temperatureEquator':
      return minmax(value, -50, 50);
    case 'temperatureNorthPole':
      return minmax(value, -50, 50);
    case 'temperatureSouthPole':
      return minmax(value, -50, 50);
    case 'prec':
      return minmax(value, 0, 500);
    case 'heightExponent':
      return minmax(value, 0.1, 10);
    case 'lakeElevationLimit':
      return minmax(Math.round(value), 0, 100);
    case 'resolveDepressionsSteps':
      return minmax(Math.round(value), 1, 1000);
    case 'landPercentage':
      return minmax(value, 1, 90);
    case 'populationRate':
      return minmax(value, 10, 10000);
    case 'urbanization':
      return minmax(value, 0.01, 5);
    case 'urbanDensity':
      return minmax(Math.round(value), 1, 200);
    case 'growthRate':
      return minmax(value, 0.1, 10);
    case 'sizeVariety':
      return minmax(value, 0, 10);
    case 'distanceScale':
      return minmax(value, 1, 5);
    case 'mapSize':
      return value === null ? null : minmax(value, 1, 100);
    case 'latitude':
      return minmax(value, 0, 100);
    case 'longitude':
      return value === null ? null : minmax(value, 0, 100);
    case 'winds':
      // Validate winds array (should be 6 numbers)
      if (!Array.isArray(value) || value.length !== 6) {
        return DEFAULT_OPTIONS.winds;
      }
      return value.map((w) => minmax(w, 0, 360));
    case 'culturesSet':
      const validSets = [
        'world',
        'european',
        'oriental',
        'english',
        'antique',
        'highFantasy',
        'darkFantasy',
        'random',
      ];
      return validSets.includes(value) ? value : DEFAULT_OPTIONS.culturesSet;
    case 'stateLabelsMode':
      const validModes = ['auto', 'always', 'never'];
      return validModes.includes(value) ? value : DEFAULT_OPTIONS.stateLabelsMode;
    case 'distanceUnit':
      return value === 'km' || value === 'mi' ? value : DEFAULT_OPTIONS.distanceUnit;
    case 'heightUnit':
      return value === 'm' || value === 'ft' ? value : DEFAULT_OPTIONS.heightUnit;
    case 'temperatureScale':
      return value === '°C' || value === '°F' ? value : DEFAULT_OPTIONS.temperatureScale;
    case 'fullRendering':
      return value === true || value === false ? value : DEFAULT_OPTIONS.fullRendering;
    default:
      return value;
  }
}

/**
 * Get default options object
 * @returns {Object} Deep copy of default options
 */
export function getDefaultOptions() {
  return deepCopy(DEFAULT_OPTIONS);
}

/**
 * Validate skipPhases array
 * @param {Array<string>} skipPhases - Array of phase names to skip
 * @returns {Array<string>} Validated and normalized skipPhases array
 * @throws {InvalidOptionError} If invalid phase names are provided
 */
function validateSkipPhases(skipPhases) {
  // Default to empty array if not provided
  if (!skipPhases) {
    return [];
  }

  // Ensure it's an array
  if (!Array.isArray(skipPhases)) {
    throw new InvalidOptionError(
      'skipPhases',
      skipPhases,
      'skipPhases must be an array of phase names'
    );
  }

  // Get all valid phase values
  const validPhases = Object.values(PHASES);

  // Validate each phase name
  const invalidPhases = skipPhases.filter(phase => !validPhases.includes(phase));
  if (invalidPhases.length > 0) {
    throw new InvalidOptionError(
      'skipPhases',
      skipPhases,
      `Invalid phase names: ${invalidPhases.join(', ')}. Valid phases: ${validPhases.join(', ')}`
    );
  }

  // Remove duplicates and return
  return [...new Set(skipPhases)];
}

/**
 * Merge user options with defaults, performing validation and clamping
 * @param {Object} userOptions - User-provided options (partial or complete)
 * @returns {Object} Merged and validated options object
 * @throws {InvalidOptionError} If skipPhases contains invalid phase names
 */
export function mergeOptions(userOptions = {}) {
  const defaults = getDefaultOptions();
  const merged = deepCopy(defaults);

  // Validate skipPhases separately (before merging other options)
  if (userOptions.hasOwnProperty('skipPhases')) {
    merged.skipPhases = validateSkipPhases(userOptions.skipPhases);
  }

  // Deep merge user options
  for (const key in userOptions) {
    if (userOptions.hasOwnProperty(key)) {
      // Skip skipPhases as it's already handled above
      if (key === 'skipPhases') {
        continue;
      }

      if (key in DEFAULT_OPTIONS) {
        merged[key] = validateOption(key, userOptions[key]);
      } else {
        // Unknown option - include it but warn in development
        if (typeof console !== 'undefined' && console.warn) {
          console.warn(`Unknown option key: ${key}`);
        }
        merged[key] = userOptions[key];
      }
    }
  }

  // Ensure cellsDesired is calculated from points
  if (merged.points !== undefined) {
    merged.cellsDesired = getCellsFromPoints(merged.points);
  }

  return merged;
}

/**
 * Get cells desired count from options
 * @param {Object} options - Options object
 * @returns {number} Number of cells desired
 */
export function getCellsDesired(options) {
  if (options.cellsDesired) {
    return options.cellsDesired;
  }
  if (options.points) {
    return getCellsFromPoints(options.points);
  }
  return getCellsFromPoints(DEFAULT_OPTIONS.points);
}
