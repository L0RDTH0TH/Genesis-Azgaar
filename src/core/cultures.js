/**
 * =============================================================================
 * cultures.js
 * Desc: Culture generation and expansion
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
 * Get default culture definitions based on culture set
 * @param {string} culturesSet - Culture set ID
 * @param {number} count - Number of cultures needed
 * @param {Object} pack - Pack object
 * @param {Object} grid - Grid object
 * @param {Object} rng - RNG instance
 * @returns {Array} Array of culture definitions
 */
function getDefaultCultures(culturesSet, count, pack, grid, rng) {
  const { cells } = pack;
  const { s, t, h, biome, haven, harbor, r, fl, g } = cells;
  const { temp } = grid.cells;
  const sMax = Math.max(...s);
  const n = (cell) => Math.ceil((s[cell] / sMax) * 3); // normalized cell score
  const td = (cell, goal) => {
    const d = Math.abs(temp[g[cell]] - goal);
    return d ? d + 1 : 1;
  }; // temperature difference fee
  const bd = (cell, biomes, fee = 4) => (biomes.includes(biome[cell]) ? 1 : fee); // biome difference fee
  const sf = (cell, fee = 4) =>
    haven[cell] && pack.features[cells.f[haven[cell]]].type !== 'lake' ? 1 : fee; // not on sea coast fee

  // Simplified default cultures for "world" set
  // Full implementation would include all culture sets
  const defaultCultures = [
    { name: 'Shwazen', base: 0, odd: 0.7, sort: (i) => n(i) / td(i, 10) / bd(i, [6, 8]), shield: 'heater' },
    { name: 'Angshire', base: 1, odd: 1, sort: (i) => n(i) / td(i, 10) / sf(i), shield: 'heater' },
    { name: 'Luari', base: 2, odd: 0.6, sort: (i) => n(i) / td(i, 12) / bd(i, [6, 8]), shield: 'oldFrench' },
    { name: 'Tallian', base: 3, odd: 0.6, sort: (i) => n(i) / td(i, 15), shield: 'horsehead' },
    { name: 'Astellian', base: 4, odd: 0.6, sort: (i) => n(i) / td(i, 16), shield: 'spanish' },
    { name: 'Slovan', base: 5, odd: 0.7, sort: (i) => (n(i) / td(i, 6)) * t[i], shield: 'round' },
    { name: 'Norse', base: 6, odd: 0.7, sort: (i) => n(i) / td(i, 5), shield: 'heater' },
    { name: 'Elladan', base: 7, odd: 0.7, sort: (i) => (n(i) / td(i, 18)) * h[i], shield: 'boeotian' },
    { name: 'Romian', base: 8, odd: 0.7, sort: (i) => n(i) / td(i, 15), shield: 'roman' },
    { name: 'Soumi', base: 9, odd: 0.3, sort: (i) => (n(i) / td(i, 5) / bd(i, [9])) * t[i], shield: 'pavise' },
    { name: 'Koryo', base: 10, odd: 0.1, sort: (i) => n(i) / td(i, 12) / t[i], shield: 'round' },
    { name: 'Hantzu', base: 11, odd: 0.1, sort: (i) => n(i) / td(i, 13), shield: 'banner' },
    { name: 'Yamoto', base: 12, odd: 0.1, sort: (i) => n(i) / td(i, 15) / t[i], shield: 'round' },
  ];

  // Select cultures based on odd probability
  const selected = [];
  const available = [...defaultCultures];

  for (let i = 0; selected.length < count && available.length > 0; ) {
    const rnd = rng.randInt(0, available.length - 1);
    const culture = available[rnd];
    let attempts = 0;
    while (attempts < 200 && !rng.probability(culture.odd)) {
      attempts++;
    }
    if (attempts < 200) {
      selected.push(culture);
      available.splice(rnd, 1);
    } else {
      // Force selection if probability is too low
      selected.push(culture);
      available.splice(rnd, 1);
    }
  }

  return selected.slice(0, count);
}

/**
 * Define culture type based on center position
 * @param {number} cellId - Cell ID
 * @param {Object} pack - Pack object
 * @param {Object} rng - RNG instance
 * @returns {string} Culture type
 */
function defineCultureType(cellId, pack, rng) {
  const { cells } = pack;
  const { h, biome, haven, harbor, r, fl, f } = cells;

  if (h[cellId] < 70 && [1, 2, 4].includes(biome[cellId])) return 'Nomadic';
  if (h[cellId] > 50) return 'Highland';
  
  const havenCell = haven && haven[cellId] !== undefined ? haven[cellId] : null;
  const feature = havenCell !== null && pack.features && f[havenCell] !== undefined 
    ? pack.features[f[havenCell]] 
    : null;
    
  if (feature && feature.type === 'lake' && feature.cells > 5) return 'Lake';
  if (
    (harbor && harbor[cellId] && feature && feature.type !== 'lake' && rng.probability(0.1)) ||
    (harbor && harbor[cellId] === 1 && rng.probability(0.6)) ||
    (pack.features && f[cellId] !== undefined && pack.features[f[cellId]] && pack.features[f[cellId]].group === 'isle' && rng.probability(0.4))
  )
    return 'Naval';
  if (r && r[cellId] && fl && fl[cellId] > 100) return 'River';
  if (cells.t && cells.t[cellId] > 2 && [3, 7, 8, 9, 10, 12].includes(biome[cellId])) return 'Hunting';
  return 'Generic';
}

/**
 * Define culture expansionism based on type
 * @param {string} type - Culture type
 * @param {Object} options - Options
 * @param {Object} rng - RNG instance
 * @returns {number} Expansionism value
 */
function defineCultureExpansionism(type, options, rng) {
  let base = 1; // Generic
  if (type === 'Lake') base = 0.8;
  else if (type === 'Naval') base = 1.5;
  else if (type === 'River') base = 0.9;
  else if (type === 'Nomadic') base = 1.5;
  else if (type === 'Hunting') base = 0.7;
  else if (type === 'Highland') base = 1.2;

  const sizeVariety = options.sizeVariety || 1;
  return rn(((rng.random() * sizeVariety) / 2 + 1) * base, 1);
}

/**
 * Abbreviate culture name to code
 * @param {string} name - Culture name
 * @param {Array<string>} existingCodes - Existing codes
 * @returns {string} Abbreviated code
 */
function abbreviate(name, existingCodes) {
  const words = name.split(' ');
  let code = words.map((w) => w[0].toUpperCase()).join('');
  if (code.length > 3) code = code.substring(0, 3);
  if (existingCodes.includes(code)) {
    code = name.substring(0, 3).toUpperCase();
  }
  return code;
}

/**
 * Place culture center
 * @param {Function} sortingFn - Sorting function
 * @param {Array} populated - Array of populated cell IDs
 * @param {number} count - Number of cultures
 * @param {Object} pack - Pack object
 * @param {Object} options - Options
 * @param {Object} rng - RNG instance
 * @param {Uint16Array} cultureIds - Culture IDs array
 * @param {Array} centers - Existing centers
 * @returns {number} Cell ID of center
 */
function placeCenter(sortingFn, populated, count, pack, options, rng, cultureIds, centers) {
  const spacing = (options.mapWidth + options.mapHeight) / 2 / count;
  const MAX_ATTEMPTS = 100;

  const sorted = [...populated].sort((a, b) => sortingFn(b) - sortingFn(a));
  const max = Math.floor(sorted.length / 2);

  let cellId = 0;
  let currentSpacing = spacing;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    cellId = rng.biased(0, max, 5);
    currentSpacing *= 0.9;
    if (!cultureIds[cellId]) {
      // Check distance to existing centers
      const [x, y] = pack.cells.p[cellId];
      let tooClose = false;
      for (const center of centers) {
        const [cx, cy] = pack.cells.p[center];
        const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        if (dist < currentSpacing) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) break;
    }
  }

  return cellId;
}

/**
 * Generate cultures
 * @param {Object} params - Generation parameters
 * @param {Object} params.pack - Pack object (will be modified)
 * @param {Object} params.grid - Grid object
 * @param {Object} params.options - Generation options
 * @param {Object} params.rng - RNG instance
 * @param {Object} params.biomesData - Biome data (optional)
 * @returns {Array} Cultures array
 */
export function generateCultures({ pack, grid, options, rng, biomesData: providedBiomesData = null }) {
  if (!pack || !pack.cells) {
    throw new Error('Pack object with cells is required');
  }
  if (!rng) {
    throw new Error('RNG instance is required');
  }

  const biomesData = providedBiomesData || getDefaultBiomes();
  const { cells } = pack;
  const cultureIds = createTypedArray({ maxValue: 65535, length: cells.i.length }); // cell cultures

  const culturesNumber = options.cultures || 12;
  const culturesSet = options.culturesSet || 'world';
  // Use suitability score if available, otherwise use population
  const baseScore = cells.s || (cells.pop ? cells.pop : new Float32Array(cells.i.length));
  const populated = cells.i.filter((i) => baseScore[i] > 0); // populated cells

  if (populated.length < culturesNumber * 25) {
    const adjustedCount = Math.floor(populated.length / 50);
    if (!adjustedCount) {
      // No populated cells - create wildlands only
      pack.cultures = [{ name: 'Wildlands', i: 0, base: 1, shield: 'round', origins: [null] }];
      cells.culture = cultureIds;
      return pack.cultures;
    }
  }

  const count = Math.min(culturesNumber, populated.length / 25);
  const cultures = getDefaultCultures(culturesSet, count, pack, grid, rng);
  const centers = [];
  const codes = [];

  cultures.forEach((c, i) => {
    const newId = i + 1;
    const sortingFn = c.sort || ((i) => baseScore[i]);
    const center = placeCenter(sortingFn, populated, count, pack, options, rng, cultureIds, centers);

    centers.push(center);
    c.center = center;
    c.i = newId;
    delete c.odd;
    delete c.sort;
    c.color = `hsl(${rng.randInt(0, 360)}, 70%, 50%)`; // Random color
    c.type = defineCultureType(center, pack, rng);
    c.expansionism = defineCultureExpansionism(c.type, options, rng);
    c.origins = [0];
    c.code = abbreviate(c.name, codes);
    codes.push(c.code);
    c.shield = c.shield || 'heater';
    cultureIds[center] = newId;
  });

  // Add wildlands as first culture (id 0)
  cultures.unshift({ name: 'Wildlands', i: 0, base: 1, origins: [null], shield: 'round' });

  cells.culture = cultureIds;
  pack.cultures = cultures;

  return cultures;
}

/**
 * Expand cultures across the map (Dijkstra-like algorithm)
 * @param {Object} params - Generation parameters
 * @param {Object} params.pack - Pack object (will be modified)
 * @param {Object} params.options - Generation options
 * @param {Object} params.biomesData - Biome data (optional)
 */
export function expandCultures({ pack, options, biomesData: providedBiomesData = null }) {
  if (!pack || !pack.cells || !pack.cultures) {
    throw new Error('Pack object with cells and cultures is required');
  }

  const biomesData = providedBiomesData || getDefaultBiomes();
  const { cells, cultures } = pack;

  const queue = new SimplePriorityQueue();
  const cost = [];

  const neutralRate = options.neutralRate || 1;
  const maxExpansionCost = cells.i.length * 0.6 * neutralRate;

  // Remove culture from all cells except locked
  const hasLocked = cultures.some((c) => !c.removed && c.lock);
  if (hasLocked) {
    for (const cellId of cells.i) {
      const culture = cultures[cells.culture[cellId]];
      if (culture && culture.lock) continue;
      cells.culture[cellId] = 0;
    }
  } else {
    cells.culture = createTypedArray({ maxValue: 65535, length: cells.i.length });
  }

  for (const culture of cultures) {
    if (!culture.i || culture.removed || culture.lock) continue;
    queue.push({ cellId: culture.center, cultureId: culture.i, priority: 0 }, 0);
  }

  while (queue.length) {
    const { cellId, priority, cultureId } = queue.pop();
    const { type, expansionism } = cultures[cultureId];

    if (!cells.c[cellId]) continue;
    cells.c[cellId].forEach((neibCellId) => {
      if (hasLocked) {
        const neibCultureId = cells.culture[neibCellId];
        if (neibCultureId && cultures[neibCultureId] && cultures[neibCultureId].lock) return;
      }

      const biome = cells.biome ? cells.biome[neibCellId] : 0;
      const biomeCost = getBiomeCost(cultureId, biome, type, biomesData, cells);
      const biomeChangeCost = biome === (cells.biome && cells.biome[cultures[cultureId].center] ? cells.biome[cultures[cultureId].center] : 0) ? 0 : 20;
      const heightCost = getHeightCost(neibCellId, cells.h[neibCellId], type, pack);
      const riverCost = getRiverCost(cells.r ? cells.r[neibCellId] : 0, neibCellId, type, cells);
      const typeCost = getTypeCost(cells.t ? cells.t[neibCellId] : 0, type);

      const cellCost = (biomeCost + biomeChangeCost + heightCost + riverCost + typeCost) / expansionism;
      const totalCost = priority + cellCost;

      if (totalCost > maxExpansionCost) return;

      if (!cost[neibCellId] || totalCost < cost[neibCellId]) {
        // Assign culture to populated cells
      const hasPopulation = (cells.pop && cells.pop[neibCellId] > 0) || (cells.s && cells.s[neibCellId] > 0);
      if (hasPopulation) cells.culture[neibCellId] = cultureId;
        cost[neibCellId] = totalCost;
        queue.push({ cellId: neibCellId, cultureId, priority: totalCost }, totalCost);
      }
    });
  }

  function getBiomeCost(c, biome, type, biomesData, cells) {
    if (cells.biome[cultures[c].center] === biome) return 10;
    if (type === 'Hunting') return biomesData.cost[biome] * 5;
    if (type === 'Nomadic' && biome > 4 && biome < 10) return biomesData.cost[biome] * 10;
    return biomesData.cost[biome] * 2;
  }

  function getHeightCost(i, h, type, pack) {
    const f = pack.features[pack.cells.f[i]];
    const a = pack.cells.area ? pack.cells.area[i] : 1;
    if (type === 'Lake' && f && f.type === 'lake') return 10;
    if (type === 'Naval' && h < 20) return a * 2;
    if (type === 'Nomadic' && h < 20) return a * 50;
    if (h < 20) return a * 6;
    if (type === 'Highland' && h < 44) return 3000;
    if (type === 'Highland' && h < 62) return 200;
    if (type === 'Highland') return 0;
    if (h >= 67) return 200;
    if (h >= 44) return 30;
    return 0;
  }

  function getRiverCost(riverId, cellId, type, cells) {
    if (type === 'River') return riverId ? 0 : 100;
    if (!riverId) return 0;
    const flux = cells.fl && cells.fl[cellId] ? cells.fl[cellId] : 0;
    return minmax(flux / 10, 20, 100);
  }

  function getTypeCost(t, type) {
    if (t === 1) return type === 'Naval' || type === 'Lake' ? 0 : type === 'Nomadic' ? 60 : 20;
    if (t === 2) return type === 'Naval' || type === 'Nomadic' ? 30 : 0;
    if (t !== -1) return type === 'Naval' || type === 'Lake' ? 100 : 0;
    return 0;
  }
}
