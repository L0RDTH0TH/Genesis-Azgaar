/**
 * =============================================================================
 * states.js
 * Desc: State generation and expansion
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

import { rn, minmax } from '../utils/math.js';
import { createTypedArray } from '../utils/array.js';
import { getDefaultBiomes } from './biomes.js';

/**
 * Simple priority queue for Dijkstra-like expansion
 */
class SimplePriorityQueue {
  constructor() {
    this.items = [];
  }

  push(item, priority) {
    this.items.push({ item, priority });
    this.items.sort((a, b) => a.priority - b.priority);
  }

  pop() {
    return this.items.shift()?.item;
  }

  get length() {
    return this.items.length;
  }
}

/**
 * Generate random color
 * @param {Object} rng - RNG instance
 * @returns {string} Color in hex format
 */
function getRandomColor(rng) {
  const colors = ['#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854', '#ffd92f'];
  return rng.pick(colors);
}

/**
 * Get mixed color (lighter/darker variant)
 * @param {string} baseColor - Base color
 * @param {Object} rng - RNG instance
 * @returns {string} Mixed color
 */
function getMixedColor(baseColor, rng) {
  // Simplified - just return a slightly modified color
  // Full implementation would parse HSL and adjust
  return baseColor;
}

/**
 * Create states from capitals
 * @param {Object} params - Generation parameters
 * @param {Object} params.pack - Pack object
 * @param {Object} params.options - Generation options
 * @param {Object} params.rng - RNG instance
 * @returns {Array} States array
 */
function createStates({ pack, options, rng }) {
  const { cells, burgs, cultures } = pack;
  const states = [{ i: 0, name: 'Neutrals' }];
  const colors = ['#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854', '#ffd92f'];

  // Get capitals (burgs with capital=1)
  const capitals = burgs.filter((b) => b && b.capital);

  capitals.forEach((b, i) => {
    const stateId = i + 1;
    const culture = cells.culture[b.cell];
    const cultureData = cultures[culture];

    // State properties
    const sizeVariety = options.sizeVariety || 1;
    const expansionism = rn(rng.random() * sizeVariety + 1, 1);
    const type = cultureData ? cultureData.type : 'Generic';

    // Simplified name generation - will be enhanced when names module is fully integrated
    const name = `State${stateId}`;

    states.push({
      i: stateId,
      color: colors[(stateId - 1) % colors.length],
      name,
      expansionism,
      capital: b.i,
      type,
      center: b.cell,
      culture: culture || 0,
      coa: null, // Placeholder for coat of arms
      form: 'Monarchy', // Default form
    });

    // Assign state to burg
    b.state = stateId;
  });

  return states;
}

/**
 * Expand states across the map (Dijkstra-like algorithm)
 * @param {Object} params - Generation parameters
 * @param {Object} params.pack - Pack object (will be modified)
 * @param {Object} params.options - Generation options
 * @param {Object} params.biomesData - Biome data (optional)
 */
export function expandStates({ pack, options, biomesData: providedBiomesData = null }) {
  if (!pack || !pack.cells || !pack.states) {
    throw new Error('Pack object with cells and states is required');
  }

  const biomesData = providedBiomesData || getDefaultBiomes();
  const { cells, states, cultures, burgs } = pack;

  cells.state = cells.state || createTypedArray({ maxValue: 65535, length: cells.i.length });

  const queue = new SimplePriorityQueue();
  const cost = [];

  const globalGrowthRate = options.growthRate || 1;
  const statesGrowthRate = options.statesGrowthRate || 1;
  const growthRate = (cells.i.length / 2) * globalGrowthRate * statesGrowthRate;

  // Remove state from all cells except locked
  for (const cellId of cells.i) {
    const state = states[cells.state[cellId]];
    if (state && state.lock) continue;
    cells.state[cellId] = 0;
  }

  // Initialize queue with state centers
  for (const state of states) {
    if (!state.i || state.removed) continue;

    const capitalBurg = burgs && burgs[state.capital];
    if (!capitalBurg) continue;

    const capitalCell = capitalBurg.cell;
    if (capitalCell !== undefined) {
      cells.state[capitalCell] = state.i;
    }

    const cultureCenter = cultures && cultures[state.culture] ? cultures[state.culture].center : capitalCell;
    const b = cells.biome && cells.biome[cultureCenter] !== undefined ? cells.biome[cultureCenter] : 0;

    queue.push({ e: state.center, p: 0, s: state.i, b }, 0);
    cost[state.center] = 1;
  }

  // Expand states
  while (queue.length) {
    const next = queue.pop();
    const { e, p, s, b } = next;
    const { type, culture } = states[s];

    if (!cells.c[e]) continue;
    cells.c[e].forEach((neighborCell) => {
      const neighborState = states[cells.state[neighborCell]];
      if (neighborState && neighborState.lock) return; // Don't overwrite locked states
      if (cells.state[neighborCell] && neighborCell === states[cells.state[neighborCell]].center) return; // Don't overwrite capital cells

      const neighborCulture = cells.culture && cells.culture[neighborCell] !== undefined ? cells.culture[neighborCell] : 0;
      const cultureCost = culture === neighborCulture ? -9 : 100;
      const suitability = cells.s && cells.s[neighborCell] !== undefined ? cells.s[neighborCell] : cells.pop && cells.pop[neighborCell] !== undefined ? cells.pop[neighborCell] : 0;
      const populationCost = cells.h[neighborCell] < 20 ? 0 : suitability ? Math.max(20 - suitability, 0) : 5000;
      const neighborBiome = cells.biome && cells.biome[neighborCell] !== undefined ? cells.biome[neighborCell] : 0;
      const biomeCost = getBiomeCost(b, neighborBiome, type, biomesData);
      const neighborFeature = pack.features && cells.f && cells.f[neighborCell] !== undefined ? pack.features[cells.f[neighborCell]] : null;
      const heightCost = getHeightCost(neighborFeature, cells.h[neighborCell], type);
      const neighborRiver = cells.r && cells.r[neighborCell] !== undefined ? cells.r[neighborCell] : 0;
      const riverCost = getRiverCost(neighborRiver, neighborCell, type, cells);
      const neighborType = cells.t && cells.t[neighborCell] !== undefined ? cells.t[neighborCell] : 0;
      const typeCost = getTypeCost(neighborType, type);

      const cellCost = Math.max(cultureCost + populationCost + biomeCost + heightCost + riverCost + typeCost, 0);
      const totalCost = p + 10 + cellCost / states[s].expansionism;

      if (totalCost > growthRate) return;

      if (!cost[neighborCell] || totalCost < cost[neighborCell]) {
        if (cells.h[neighborCell] >= 20) cells.state[neighborCell] = s; // Assign state to land cell
        cost[neighborCell] = totalCost;
        queue.push({ e: neighborCell, p: totalCost, s, b }, totalCost);
      }
    });
  }

  // Assign state to burgs
  if (burgs && cells.burg) {
    burgs.forEach((b) => {
      if (b && b.i && !b.removed && b.cell !== undefined) {
        b.state = cells.state[b.cell];
      }
    });
  }

  function getBiomeCost(b, biome, type, biomesData) {
    if (b === biome) return 10; // Tiny penalty for native biome
    if (type === 'Hunting') return biomesData.cost[biome] * 2;
    if (type === 'Nomadic' && biome > 4 && biome < 10) return biomesData.cost[biome] * 3;
    return biomesData.cost[biome];
  }

  function getHeightCost(f, h, type) {
    if (type === 'Lake' && f && f.type === 'lake') return 10;
    if (type === 'Naval' && h < 20) return 300;
    if (type === 'Nomadic' && h < 20) return 10000;
    if (h < 20) return 1000;
    if (type === 'Highland' && h < 62) return 1100;
    if (type === 'Highland') return 0;
    if (h >= 67) return 2200;
    if (h >= 44) return 300;
    return 0;
  }

  function getRiverCost(r, i, type, cells) {
    if (type === 'River') return r ? 0 : 100;
    if (!r) return 0;
    const flux = cells.fl && cells.fl[i] ? cells.fl[i] : 0;
    return minmax(flux / 10, 20, 100);
  }

  function getTypeCost(t, type) {
    if (t === 1) return type === 'Naval' || type === 'Lake' ? 0 : type === 'Nomadic' ? 60 : 20;
    if (t === 2) return type === 'Naval' || type === 'Nomadic' ? 30 : 0;
    if (t !== -1) return type === 'Naval' || type === 'Lake' ? 100 : 0;
    return 0;
  }
}

/**
 * Normalize state borders (smooth borders)
 * @param {Object} params - Generation parameters
 * @param {Object} params.pack - Pack object (will be modified)
 */
export function normalizeStates({ pack }) {
  if (!pack || !pack.cells || !pack.states || !pack.burgs) {
    throw new Error('Pack object with cells, states, and burgs is required');
  }

  const { cells, burgs, states } = pack;

  for (const i of cells.i) {
    if (cells.h[i] < 20 || (cells.burg && cells.burg[i])) continue; // Don't overwrite burgs
    if (states[cells.state[i]] && states[cells.state[i]].lock) continue; // Don't overwrite locked states
    if (cells.c[i] && cells.burg && cells.c[i].some((c) => burgs[cells.burg[c]] && burgs[cells.burg[c]].capital)) continue; // Don't overwrite near capital

    const neighbors = cells.c[i] ? cells.c[i].filter((c) => cells.h[c] >= 20) : [];
    const adversaries = neighbors.filter(
      (c) => !states[cells.state[c]]?.lock && cells.state[c] !== cells.state[i]
    );
    if (adversaries.length < 2) continue;

    const buddies = neighbors.filter(
      (c) => !states[cells.state[c]]?.lock && cells.state[c] === cells.state[i]
    );
    if (buddies.length > 2) continue;
    if (adversaries.length <= buddies.length) continue;

    cells.state[i] = cells.state[adversaries[0]];
  }
}

/**
 * Collect statistics for states (area, population, neighbors, etc.)
 * @param {Object} params - Generation parameters
 * @param {Object} params.pack - Pack object (will be modified)
 */
export function collectStatistics({ pack }) {
  if (!pack || !pack.cells || !pack.states) {
    throw new Error('Pack object with cells and states is required');
  }

  const { cells, states, burgs } = pack;

  states.forEach((s) => {
    if (s.removed) return;
    s.cells = 0;
    s.area = 0;
    s.burgs = 0;
    s.rural = 0;
    s.urban = 0;
    s.neighbors = new Set();
  });

  for (const i of cells.i) {
    if (cells.h[i] < 20) continue;
    const s = cells.state[i];
    if (!states[s]) continue;

    // Check for neighboring states
    if (cells.c[i] && cells.state) {
      cells.c[i]
        .filter((c) => cells.h[c] >= 20 && cells.state[c] !== s)
        .forEach((c) => {
          if (cells.state[c] !== undefined) {
            states[s].neighbors.add(cells.state[c]);
          }
        });
    }

    // Collect stats
    states[s].cells += 1;
    if (cells.area) states[s].area += cells.area[i];
    if (cells.pop) states[s].rural += cells.pop[i];
    if (cells.burg && cells.burg[i] && burgs[cells.burg[i]]) {
      states[s].urban += burgs[cells.burg[i]].population || 0;
      states[s].burgs++;
    }
  }

  // Convert neighbors Set to array
  states.forEach((s) => {
    if (s.neighbors) {
      s.neighbors = Array.from(s.neighbors);
    }
  });
}

/**
 * Assign colors to states using greedy coloring
 * @param {Object} params - Generation parameters
 * @param {Object} params.pack - Pack object (will be modified)
 * @param {Object} params.rng - RNG instance
 */
export function assignColors({ pack, rng }) {
  if (!pack || !pack.states) {
    throw new Error('Pack object with states is required');
  }

  const colors = ['#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854', '#ffd92f'];

  pack.states.forEach((s) => {
    if (!s.i || s.removed || s.lock) return;
    const neibs = s.neighbors || [];
    s.color = colors.find((c) => neibs.every((n) => pack.states[n] && pack.states[n].color !== c));
    if (!s.color) s.color = getRandomColor(rng);
  });
}

/**
 * Generate states from capitals
 * @param {Object} params - Generation parameters
 * @param {Object} params.pack - Pack object (will be modified)
 * @param {Object} params.options - Generation options
 * @param {Object} params.rng - RNG instance
 * @returns {Array} States array
 */
export function generateStates({ pack, options, rng, grid = null }) {
  if (!pack || !pack.cells || !pack.burgs) {
    throw new Error('Pack object with cells and burgs is required');
  }
  if (!rng) {
    throw new Error('RNG instance is required');
  }

  // Check if dual-grid politics is enabled
  // Note: mapDualGridStatesToPack is called in generator.js before this function
  // So if dual-grid is enabled, pack.states should already be populated
  if (options.useDualGridPolitics && pack.dualGrid && pack.states && pack.states.length > 0) {
    // Dual-grid states already mapped, just run normalization and statistics
    normalizeStates({ pack });
    collectStatistics({ pack });
    // Colors already assigned in mapDualGridStatesToPack
    return pack.states;
  }

  // Original Voronoi-based generation (fallback)
  const states = createStates({ pack, options, rng });
  pack.states = states;

  // Expand states
  expandStates({ pack, options });

  // Normalize borders
  normalizeStates({ pack });

  // Collect statistics
  collectStatistics({ pack });

  // Assign colors
  assignColors({ pack, rng });

  return states;
}
