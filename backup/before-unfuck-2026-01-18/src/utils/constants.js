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
  MARKUP_GRID: 'markupGrid',
  MAP_COORDINATES: 'mapCoordinates',
  TEMPERATURE: 'temperature',
  PRECIPITATION: 'precipitation',
  PACK_CREATION: 'packCreation',
  RIVERS: 'rivers',
  BIOMES: 'biomes',
  MARKUP_PACK: 'markupPack',
  FEATURES: 'features',
  CULTURES: 'cultures',
  BURGS: 'burgs',
  DUAL_GRID_STATES: 'dualGridStates',
  STATES: 'states',
  PROVINCES: 'provinces',
  RELIGIONS: 'religions',
  EMBLEMS: 'emblems',
};
