/**
 * =============================================================================
 * provinces.js
 * Desc: Province generation and assignment
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

import { rn, gauss } from '../utils/math.js';
import { createTypedArray } from '../utils/array.js';

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
 * Province form names by state form
 */
const forms = {
  Monarchy: { County: 22, Earldom: 6, Shire: 2, Landgrave: 2, Margrave: 2, Barony: 2, Captaincy: 1, Seneschalty: 1 },
  Republic: { Province: 6, Department: 2, Governorate: 2, District: 1, Canton: 1, Prefecture: 1 },
  Theocracy: { Parish: 3, Deanery: 1 },
  Union: { Province: 1, State: 1, Canton: 1, Republic: 1, County: 1, Council: 1 },
  Anarchy: { Council: 1, Commune: 1, Community: 1, Tribe: 1 },
  Wild: { Territory: 10, Land: 5, Region: 2, Tribe: 1, Clan: 1, Dependency: 1, Area: 1 },
};

/**
 * Get random weighted value from object
 * @param {Object} weights - Object with key-value pairs (key: weight)
 * @param {Object} rng - RNG instance
 * @returns {string} Random key based on weights
 */
function getWeightedRandom(weights, rng) {
  const array = [];
  for (const key in weights) {
    for (let i = 0; i < weights[key]; i++) {
      array.push(key);
    }
  }
  return rng.pick(array);
}

/**
 * Get mixed color (lighter/darker variant)
 * @param {string} baseColor - Base color
 * @returns {string} Mixed color
 */
function getMixedColor(baseColor) {
  // Simplified - just return base color for now
  // Full implementation would parse HSL and adjust
  return baseColor;
}

/**
 * Check if there's a passable land path between two cells within the same state
 * @param {number} from - Starting cell ID
 * @param {number} to - Target cell ID
 * @param {Object} pack - Pack object
 * @returns {boolean} True if passable
 */
function isPassable(from, to, pack) {
  const { cells } = pack;
  if (cells.f[from] !== cells.f[to]) return false; // Different features

  const passableQueue = [from];
  const used = new Uint8Array(cells.i.length);
  const state = cells.state[from];

  while (passableQueue.length) {
    const current = passableQueue.pop();
    if (current === to) return true;

    if (cells.c[current]) {
      cells.c[current].forEach((c) => {
        if (used[c] || cells.h[c] < 20 || cells.state[c] !== state) return;
        passableQueue.push(c);
        used[c] = 1;
      });
    }
  }
  return false;
}

/**
 * Generate provinces for states
 * @param {Object} params - Generation parameters
 * @param {Object} params.pack - Pack object (will be modified)
 * @param {Object} params.options - Generation options
 * @param {Object} params.rng - RNG instance
 * @returns {Array} Provinces array
 */
export function generateProvinces({ pack, options, rng }) {
  if (!pack || !pack.cells || !pack.states || !pack.burgs) {
    throw new Error('Pack object with cells, states, and burgs is required');
  }
  if (!rng) {
    throw new Error('RNG instance is required');
  }

  const { cells, states, burgs } = pack;
  const provinces = [null]; // Index 0 is null
  const provinceIds = createTypedArray({ maxValue: 65535, length: cells.i.length });

  const provincesRatio = options.provincesRatio || 20;
  const max = provincesRatio === 100 ? 1000 : gauss(20, 5, 5, 100, 0, rng) * Math.pow(provincesRatio, 0.5);

  // Generate provinces for each state
  states.forEach((s) => {
    if (!s.i || s.removed) return;
    s.provinces = [];

    const stateBurgs = burgs
      .filter((b) => b && b.i && !b.removed && b.state === s.i && !provinceIds[b.cell])
      .sort((a, b) => {
        const popA = (a.population || 0) * gauss(1, 0.2, 0.5, 1.5, 3, rng);
        const popB = (b.population || 0) * gauss(1, 0.2, 0.5, 1.5, 3, rng);
        return popB - popA;
      })
      .sort((a, b) => (b.capital || 0) - (a.capital || 0));

    if (stateBurgs.length < 2) return; // At least 2 provinces required

    const provincesNumber = Math.max(Math.ceil((stateBurgs.length * provincesRatio) / 100), 2);
    const form = { ...forms[s.form || 'Monarchy'] };

    for (let i = 0; i < provincesNumber && i < stateBurgs.length; i++) {
      const provinceId = provinces.length;
      const burg = stateBurgs[i];
      const center = burg.cell;
      const burgId = burg.i;
      const c = burg.culture || cells.culture ? cells.culture[center] : 0;

      // Simplified name generation
      const nameByBurg = rng.probability(0.5);
      const name = nameByBurg ? burg.name || `Burg${burgId}` : `Province${provinceId}`;
      const formName = getWeightedRandom(form, rng);
      form[formName] = (form[formName] || 0) + 10; // Increase weight for next selection
      const fullName = `${name} ${formName}`;
      const color = getMixedColor(s.color);
      const kinship = nameByBurg ? 0.8 : 0.4;

      provinces.push({
        i: provinceId,
        state: s.i,
        center,
        burg: burgId,
        name,
        formName,
        fullName,
        color,
        coa: null, // Placeholder for coat of arms
      });

      s.provinces.push(provinceId);
      provinceIds[center] = provinceId;
    }
  });

  // Expand provinces
  const queue = new SimplePriorityQueue();
  const cost = [];

  provinces.forEach((p) => {
    if (!p || !p.i || p.removed) return;
    provinceIds[p.center] = p.i;
    queue.push({ e: p.center, province: p.i, state: p.state, p: 0 }, 0);
    cost[p.center] = 1;
  });

  while (queue.length) {
    const { e, p, province, state } = queue.pop();

    if (!cells.c[e]) continue;
    cells.c[e].forEach((neighborCell) => {
      if (provinceIds[neighborCell]) return; // Already assigned

      const land = cells.h[neighborCell] >= 20;
      if (!land && (!cells.t || !cells.t[neighborCell])) return; // Cannot pass deep ocean
      if (land && (!cells.state || cells.state[neighborCell] !== state)) return; // Must be same state

      const elevation = cells.h[neighborCell] >= 70 ? 100 : cells.h[neighborCell] >= 50 ? 30 : cells.h[neighborCell] >= 20 ? 10 : 100;
      const totalCost = p + elevation;

      if (totalCost > max) return;
      if (!cost[neighborCell] || totalCost < cost[neighborCell]) {
        if (land) provinceIds[neighborCell] = province; // Assign province to land cell
        cost[neighborCell] = totalCost;
        queue.push({ e: neighborCell, province, state, p: totalCost }, totalCost);
      }
    });
  }

  // Justify province shapes (smooth borders)
  for (const i of cells.i) {
    if (cells.burg && cells.burg[i]) continue; // Don't overwrite burgs
    if (provinceIds[i]) continue; // Already assigned

    const neighbors = cells.c[i] ? cells.c[i].filter((c) => cells.state && cells.state[c] === cells.state[i] && provinceIds[c]) : [];
    const adversaries = neighbors.filter((c) => provinceIds[c] !== provinceIds[i]);
    if (adversaries.length < 2) continue;

    const buddies = neighbors.filter((c) => provinceIds[c] === provinceIds[i]).length;
    if (buddies > 2) continue;

    // Count occurrences of each adversary province
    const competitorCounts = {};
    adversaries.forEach((c) => {
      const prov = provinceIds[c];
      competitorCounts[prov] = (competitorCounts[prov] || 0) + 1;
    });

    const maxCount = Math.max(...Object.values(competitorCounts));
    if (buddies >= maxCount) continue;

    // Assign to most common adversary
    const winnerProv = Object.keys(competitorCounts).find((p) => competitorCounts[p] === maxCount);
    if (winnerProv) provinceIds[i] = Number(winnerProv);
  }

  // Add "wild" provinces for unassigned cells
  const noProvince = cells.i.filter((i) => cells.state && cells.state[i] && !provinceIds[i]);
  states.forEach((s) => {
    if (!s.i || s.removed) return;
    if (!s.provinces || s.provinces.length === 0) return;

    let stateNoProvince = noProvince.filter((i) => cells.state && cells.state[i] === s.i && !provinceIds[i]);

    while (stateNoProvince.length > 0) {
      const provinceId = provinces.length;
      const burgCell = stateNoProvince.find((i) => cells.burg && cells.burg[i]);
      const center = burgCell !== undefined ? burgCell : stateNoProvince[0];
      const burg = burgCell !== undefined && cells.burg ? cells.burg[burgCell] : 0;
      provinceIds[center] = provinceId;

      // Expand wild province
      const wildCost = [];
      const wildQueue = new SimplePriorityQueue();
      wildCost[center] = 1;
      wildQueue.push({ e: center, p: 0 }, 0);

      while (wildQueue.length) {
        const { e, p } = wildQueue.pop();

        if (!cells.c[e]) continue;
        cells.c[e].forEach((nextCellId) => {
          if (provinceIds[nextCellId]) return;
          const land = cells.h[nextCellId] >= 20;
          if (cells.state && cells.state[nextCellId] && cells.state[nextCellId] !== s.i) return;

          const ter = land ? (cells.state && cells.state[nextCellId] === s.i ? 3 : 20) : cells.t && cells.t[nextCellId] ? 10 : 30;
          const totalCost = p + ter;

          if (totalCost > max) return;
          if (!wildCost[nextCellId] || totalCost < wildCost[nextCellId]) {
            if (land && cells.state && cells.state[nextCellId] === s.i) provinceIds[nextCellId] = provinceId;
            wildCost[nextCellId] = totalCost;
            wildQueue.push({ e: nextCellId, p: totalCost }, totalCost);
          }
        });
      }

      // Generate wild province name
      const c = cells.culture && cells.culture[center] !== undefined ? cells.culture[center] : 0;
      const f = pack.features && cells.f && cells.f[center] !== undefined ? pack.features[cells.f[center]] : null;
      const color = getMixedColor(s.color);

      const provCells = stateNoProvince.filter((i) => provinceIds[i] === provinceId);
      const singleIsle = f && provCells.length === f.cells && !provCells.find((i) => cells.f && cells.f[i] !== f.i);
      const isleGroup = !singleIsle && !provCells.find((i) => pack.features && cells.f && cells.f[i] !== undefined && pack.features[cells.f[i]] && pack.features[cells.f[i]].group !== 'isle');
      const colony = !singleIsle && !isleGroup && rng.probability(0.5) && s.center !== undefined && !isPassable(s.center, center, pack);

      const name = (() => {
        if (colony && rng.probability(0.8)) return `New ${s.name}`;
        if (burgCell !== undefined && rng.probability(0.5) && burgs && burgs[burg]) return burgs[burg].name;
        return `Province${provinceId}`;
      })();

      const formName = (() => {
        if (singleIsle) return 'Island';
        if (isleGroup) return 'Islands';
        if (colony) return 'Colony';
        return getWeightedRandom(forms.Wild, rng);
      })();

      const fullName = `${name} ${formName}`;

      provinces.push({
        i: provinceId,
        state: s.i,
        center,
        burg: burg || 0,
        name,
        formName,
        fullName,
        color,
        coa: null,
      });

      s.provinces.push(provinceId);

      // Re-check for remaining unassigned cells
      stateNoProvince = noProvince.filter((i) => cells.state && cells.state[i] === s.i && !provinceIds[i]);
    }
  });

  cells.province = provinceIds;
  pack.provinces = provinces;

  return provinces;
}
