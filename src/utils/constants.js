/**
 * =============================================================================
 * constants.js
 * Desc: Phase constants for Genesis Mythos fork
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

/**
 * Phase constants for generation pipeline
 * Used for phase identification, skip validation, and caching
 */
export const PHASES = {
  VORONOI: 'voronoi',
  HEIGHTMAP: 'heightmap',
  BIOMES: 'biomes',
  RIVERS: 'rivers',
  CULTURES: 'cultures',
  BURGS: 'burgs',
  STATES: 'states',
  PROVINCES: 'provinces',
  RELIGIONS: 'religions',
  DUAL_GRID_STATES: 'dualGridStates',
};
