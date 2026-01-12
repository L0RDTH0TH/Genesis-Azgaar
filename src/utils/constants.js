/**
 * =============================================================================
 * constants.js
 * Desc: Shared constants for Genesis Mythos fork
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

/**
 * Phase constants for partial generation support.
 * Defines all generation phases that can be skipped or re-run independently.
 * 
 * @type {Object<string, string>}
 */
export const PHASES = {
  VORONOI: 'voronoi',                    // Phase 1: Voronoi diagram generation (required for all)
  HEIGHTMAP: 'heightmap',                // Phase 2: Heightmap generation
  GRID_MARKUP: 'gridMarkup',             // Phase 3: Grid-level feature detection
  MAP_COORDINATES: 'mapCoordinates',      // Phase 4: Calculate map coordinates
  TEMPERATURES: 'temperatures',          // Phase 5: Temperature calculation
  PRECIPITATION: 'precipitation',        // Phase 6: Precipitation generation
  PACK_CREATION: 'packCreation',         // Phase 7: Create pack from grid
  RIVERS: 'rivers',                      // Phase 8: River generation
  BIOMES: 'biomes',                      // Phase 9: Biome assignment
  PACK_MARKUP: 'packMarkup',             // Phase 10: Pack-level feature detection
  CLUSTER_MERGE: 'clusterMerge',         // Phase 10.25: Post-processing cluster merging
  RANK_CELLS: 'rankCells',               // Phase 10.5: Calculate suitability and population scores
  CULTURES: 'cultures',                  // Phase 11: Culture generation
  BURGS: 'burgs',                        // Phase 12: Burg (settlement) generation
  STATES: 'states',                      // Phase 13: State generation
  PROVINCES: 'provinces',                 // Phase 14: Province generation
  RELIGIONS: 'religions',                // Phase 15: Religion generation (optional)
  EMBLEMS: 'emblems',                    // Phase 16: Emblem generation
};
