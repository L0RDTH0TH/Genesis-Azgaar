/**
 * =============================================================================
 * array.js
 * Desc: Array utility functions for map generation
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

/**
 * Get the last element of an array
 * @param {Array} array - Input array
 * @returns {*} Last element
 */
export function last(array) {
  return array[array.length - 1];
}

/**
 * Get unique elements from an array
 * @param {Array} array - Input array
 * @returns {Array} Array with unique elements
 */
export function unique(array) {
  return [...new Set(array)];
}

/**
 * Deep copy for arrays and objects (including TypedArrays)
 * @param {*} obj - Object to deep copy
 * @returns {*} Deep copy of the object
 */
export function deepCopy(obj) {
  const id = (x) => x;
  // Properly copy TypedArrays by using slice() which creates a new array
  const dcTArray = (a) => a.slice();
  const dcObject = (x) =>
    Object.fromEntries(Object.entries(x).map(([k, d]) => [k, dcAny(d)]));
  // Check if it's a TypedArray first (more reliable than constructor lookup)
  const isTypedArray = (x) =>
    x instanceof Int8Array ||
    x instanceof Uint8Array ||
    x instanceof Uint8ClampedArray ||
    x instanceof Int16Array ||
    x instanceof Uint16Array ||
    x instanceof Int32Array ||
    x instanceof Uint32Array ||
    x instanceof Float32Array ||
    x instanceof Float64Array;
  const dcAny = (x) => {
    if (!(x instanceof Object)) return x;
    if (isTypedArray(x)) return dcTArray(x);
    return cf.get(x.constructor) ? cf.get(x.constructor)(x) : id(x);
  };
  // don't map keys, probably this is what we would expect
  const dcMapCore = (m) => [...m.entries()].map(([k, v]) => [k, dcAny(v)]);

  const cf = new Map([
    [Int8Array, dcTArray],
    [Uint8Array, dcTArray],
    [Uint8ClampedArray, dcTArray],
    [Int16Array, dcTArray],
    [Uint16Array, dcTArray],
    [Int32Array, dcTArray],
    [Uint32Array, dcTArray],
    [Float32Array, dcTArray],
    [Float64Array, dcTArray],
    [BigInt64Array, dcTArray],
    [BigUint64Array, dcTArray],
    [Map, (m) => new Map(dcMapCore(m))],
    [WeakMap, (m) => new WeakMap(dcMapCore(m))],
    [Array, (a) => a.map(dcAny)],
    [Set, (s) => [...s.values()].map(dcAny)],
    [Date, (d) => new Date(d.getTime())],
    [Object, dcObject],
    // ... extend here to implement their custom deep copy
  ]);

  return dcAny(obj);
}

/**
 * Determine appropriate TypedArray constructor based on max value
 * @param {number} maxValue - Maximum value that will be stored
 * @returns {TypedArrayConstructor} TypedArray constructor
 */
export function getTypedArray(maxValue) {
  const UINT8_MAX = 255;
  const UINT16_MAX = 65535;
  const UINT32_MAX = 4294967295;

  if (!Number.isInteger(maxValue) || maxValue < 0 || maxValue > UINT32_MAX) {
    throw new Error(
      `Array maxValue must be an integer between 0 and ${UINT32_MAX}, got ${maxValue}`
    );
  }

  if (maxValue <= UINT8_MAX) return Uint8Array;
  if (maxValue <= UINT16_MAX) return Uint16Array;
  if (maxValue <= UINT32_MAX) return Uint32Array;
  return Uint32Array;
}

/**
 * Create a TypedArray with appropriate type based on max value
 * @param {Object} options - Options object
 * @param {number} options.maxValue - Maximum value that will be stored
 * @param {number} options.length - Length of the array
 * @param {Array|TypedArray} options.from - Source array to copy from (optional)
 * @returns {TypedArray} New TypedArray instance
 */
export function createTypedArray({ maxValue, length, from }) {
  const TypedArray = getTypedArray(maxValue);
  if (!from) return new TypedArray(length);
  return TypedArray.from(from);
}

/**
 * Check if a value is a vowel (for name generation)
 * @param {string} char - Character to check
 * @returns {boolean} True if character is a vowel
 */
export function vowel(char) {
  return /[aeiouyAEIOUY]/.test(char);
}
