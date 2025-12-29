/**
 * =============================================================================
 * index.js
 * Desc: Public API exports for Azgaar Genesis Mythos fork
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

export { generateMap } from './generator.js';
export { getDefaultOptions, mergeOptions } from './options.js';
export { RNG } from './utils/rng.js';

// Re-export core modules for advanced usage
export * from './core/index.js';
