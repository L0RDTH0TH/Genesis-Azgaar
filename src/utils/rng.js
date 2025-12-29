/**
 * =============================================================================
 * rng.js
 * Desc: Alea PRNG wrapper for seeded random number generation
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

/**
 * Alea PRNG implementation (minified version from original)
 * Based on: https://github.com/macmcmeans/aleaPRNG
 * ©2010 Johannes Baagøe, MIT license; Derivative ©2017-2020 W. Mac" McMeans, BSD license.
 */
function aleaPRNG(...args) {
  var r, t, e, o, a, u = new Uint32Array(3), i = "";
  function c(n) {
    var a = function () {
      var n = 4022871197,
        r = function (r) {
          r = r.toString();
          for (var t = 0, e = r.length; t < e; t++) {
            var o = 0.02519603282416938 * (n += r.charCodeAt(t));
            o -= n = o >>> 0;
            n = (o *= n) >>> 0;
            n += 4294967296 * (o - n);
          }
          return 2.3283064365386963e-10 * (n >>> 0);
        };
      return (r.version = "Mash 0.9"), r;
    }();
    r = a(" ");
    t = a(" ");
    e = a(" ");
    o = 1;
    for (var u = 0; u < n.length; u++) {
      (r -= a(n[u])) < 0 && (r += 1);
      (t -= a(n[u])) < 0 && (t += 1);
      (e -= a(n[u])) < 0 && (e += 1);
    }
    i = a.version;
    a = null;
  }
  function f(n) {
    return parseInt(n, 10) === n;
  }
  var l = function () {
    var n = 2091639 * r + 2.3283064365386963e-10 * o;
    return (r = t), (t = e), (e = n - (o = 0 | n));
  };
  l.fract53 = function () {
    return l() + 1.1102230246251565e-16 * (2097152 * l() | 0);
  };
  l.int32 = function () {
    return 4294967296 * l();
  };
  l.cycle = function (n) {
    (n = void 0 === n ? 1 : +n) < 1 && (n = 1);
    for (var r = 0; r < n; r++) l();
  };
  l.range = function () {
    var n, r;
    return 1 === arguments.length
      ? ((n = 0), (r = arguments[0]))
      : ((n = arguments[0]), (r = arguments[1])),
      arguments[0] > arguments[1] && ((n = arguments[1]), (r = arguments[0])),
      f(n) && f(r)
        ? Math.floor(l() * (r - n + 1)) + n
        : l() * (r - n) + n;
  };
  l.restart = function () {
    c(a);
  };
  l.seed = function () {
    c(Array.prototype.slice.call(arguments));
  };
  l.version = function () {
    return "aleaPRNG 1.1.0";
  };
  l.versions = function () {
    return "aleaPRNG 1.1.0, " + i;
  };
  0 === args.length &&
    (typeof window !== "undefined" &&
      window.crypto &&
      window.crypto.getRandomValues &&
      window.crypto.getRandomValues(u),
      (args = [u[0], u[1], u[2]]));
  a = args;
  c(args);
  return l;
}

/**
 * RNG wrapper class for managing seeded random number generation
 * Provides a clean interface that replaces Math.random with seeded PRNG
 */
export class RNG {
  /**
   * Create a new RNG instance with optional seed
   * @param {string|number} seed - Seed for the PRNG (string or number)
   */
  constructor(seed = null) {
    this._seed = seed;
    this._prng = null;
    if (seed !== null) {
      this.setSeed(seed);
    }
  }

  /**
   * Set the seed and initialize PRNG
   * @param {string|number} seed - Seed for the PRNG
   */
  setSeed(seed) {
    this._seed = String(seed);
    this._prng = aleaPRNG(this._seed);
  }

  /**
   * Get current seed
   * @returns {string} Current seed
   */
  getSeed() {
    return this._seed;
  }

  /**
   * Generate a random number between 0 and 1 (inclusive of 0, exclusive of 1)
   * Compatible with Math.random() interface
   * @returns {number} Random number in [0, 1)
   */
  random() {
    if (!this._prng) {
      throw new Error("RNG not initialized. Call setSeed() first.");
    }
    return this._prng();
  }

  /**
   * Generate a random integer in range [min, max] (inclusive)
   * @param {number} min - Minimum value (default: 0)
   * @param {number} max - Maximum value
   * @returns {number} Random integer
   */
  randInt(min, max) {
    if (min === undefined && max === undefined) {
      return Math.floor(this.random() * Number.MAX_SAFE_INTEGER);
    }
    if (max === undefined) {
      max = min;
      min = 0;
    }
    return Math.floor(this.random() * (max - min + 1)) + min;
  }

  /**
   * Generate a random float in range [min, max)
   * @param {number} min - Minimum value (default: 0)
   * @param {number} max - Maximum value
   * @returns {number} Random float
   */
  randFloat(min, max) {
    if (min === undefined && max === undefined) {
      return this.random();
    }
    if (max === undefined) {
      max = min;
      min = 0;
    }
    return this.random() * (max - min) + min;
  }

  /**
   * Test probability (returns true with given probability)
   * @param {number} probability - Probability in [0, 1]
   * @returns {boolean} True if random value < probability
   */
  probability(prob) {
    if (prob >= 1) return true;
    if (prob <= 0) return false;
    return this.random() < prob;
  }

  /**
   * Pick a random element from an array
   * @param {Array} array - Array to pick from
   * @returns {*} Random element
   */
  pick(array) {
    if (!array || array.length === 0) {
      throw new Error("Cannot pick from empty array");
    }
    return array[this.randInt(0, array.length - 1)];
  }

  /**
   * Pick a random element from a weighted object {key: weight}
   * @param {Object} weights - Object with key-value pairs (key: weight)
   * @returns {string} Random key based on weights
   */
  pickWeighted(weights) {
    const array = [];
    for (const key in weights) {
      for (let i = 0; i < weights[key]; i++) {
        array.push(key);
      }
    }
    return this.pick(array);
  }

  /**
   * Generate a random number with bias towards one end
   * @param {number} min - Minimum value
   * @param {number} max - Maximum value
   * @param {number} exponent - Bias exponent (higher = more bias towards min)
   * @returns {number} Biased random number
   */
  biased(min, max, exponent) {
    return Math.round(min + (max - min) * Math.pow(this.random(), exponent));
  }

  /**
   * Replace Math.random globally with this RNG instance
   * @returns {Function} Original Math.random function (for restoration)
   */
  replaceMathRandom() {
    const original = Math.random;
    Math.random = () => this.random();
    return original;
  }

  /**
   * Restore original Math.random
   * @param {Function} original - Original Math.random function
   */
  restoreMathRandom(original) {
    Math.random = original;
  }
}

/**
 * Generate a random seed string
 * @returns {string} Random seed (9-digit number as string)
 */
export function generateSeed() {
  return String(Math.floor(Math.random() * 1e9));
}

/**
 * Create and configure an RNG instance, replacing Math.random
 * @param {string|number} seed - Seed for the PRNG
 * @returns {RNG} Configured RNG instance
 */
export function createRNG(seed) {
  const rng = new RNG(seed);
  rng.replaceMathRandom();
  return rng;
}
