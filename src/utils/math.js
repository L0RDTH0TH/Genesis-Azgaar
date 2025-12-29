/**
 * =============================================================================
 * math.js
 * Desc: Mathematical utility functions for map generation
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

/**
 * Round value to d decimals
 * @param {number} v - Value to round
 * @param {number} d - Number of decimal places (default: 0)
 * @returns {number} Rounded value
 */
export function rn(v, d = 0) {
  const m = Math.pow(10, d);
  return Math.round(v * m) / m;
}

/**
 * Clamp value between min and max
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 */
export function minmax(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Clamp value to range [0, 100]
 * @param {number} v - Value to clamp
 * @returns {number} Clamped value in [0, 100]
 */
export function lim(v) {
  return minmax(v, 0, 100);
}

/**
 * Normalize value from [min, max] to [0, 1]
 * @param {number} val - Value to normalize
 * @param {number} min - Minimum value of range
 * @param {number} max - Maximum value of range
 * @returns {number} Normalized value in [0, 1]
 */
export function normalize(val, min, max) {
  return minmax((val - min) / (max - min), 0, 1);
}

/**
 * Linear interpolation between two values
 * @param {number} a - Start value
 * @param {number} b - End value
 * @param {number} t - Interpolation factor [0, 1]
 * @returns {number} Interpolated value
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Calculate squared distance between two points
 * @param {Array<number>} p1 - First point [x, y]
 * @param {Array<number>} p2 - Second point [x, y]
 * @returns {number} Squared distance
 */
export function dist2(p1, p2) {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  return dx * dx + dy * dy;
}

/**
 * Calculate distance between two points
 * @param {Array<number>} p1 - First point [x, y]
 * @param {Array<number>} p2 - Second point [x, y]
 * @returns {number} Distance
 */
export function dist(p1, p2) {
  return Math.sqrt(dist2(p1, p2));
}

/**
 * Generate a random Gaussian (normal) distribution number
 * Note: Requires d3.randomNormal - will be available when D3 is added as peer dependency
 * @param {number} expected - Expected value (mean)
 * @param {number} deviation - Standard deviation
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @param {number} round - Round to n decimals
 * @param {Function} randomNormal - d3.randomNormal function (optional, uses Math.random if not provided)
 * @returns {number} Random Gaussian number
 */
export function gauss(expected = 100, deviation = 30, min = 0, max = 300, round = 0, randomNormal = null) {
  let value;
  if (randomNormal) {
    value = randomNormal(expected, deviation)();
  } else {
    // Simple Box-Muller transform approximation if d3 not available
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    value = expected + deviation * z0;
  }
  return rn(minmax(value, min, max), round);
}
