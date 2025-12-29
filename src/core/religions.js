/**
 * =============================================================================
 * religions.js
 * Desc: Religion generation and expansion
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
 * Simple quadtree-like structure for spacing checks
 */
class SimpleQuadtree {
  constructor() {
    this.points = [];
  }

  add(point) {
    this.points.push(point);
  }

  find(x, y, radius) {
    for (const [px, py] of this.points) {
      const dist = Math.sqrt((x - px) ** 2 + (y - py) ** 2);
      if (dist < radius) return [px, py];
    }
    return undefined;
  }
}

/**
 * Get random color
 * @param {Object} rng - RNG instance
 * @returns {string} Color in hex format
 */
function getRandomColor(rng) {
  const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e'];
  return rng.pick(colors);
}

/**
 * Get mixed color (lighter/darker variant)
 * @param {string} baseColor - Base color
 * @param {number} lightness - Lightness adjustment (0-1)
 * @param {number} saturation - Saturation adjustment (0-1)
 * @returns {string} Mixed color
 */
function getMixedColor(baseColor, lightness = 0.25, saturation = 0.4) {
  // Simplified - just return base color for now
  // Full implementation would parse HSL and adjust
  return baseColor;
}

/**
 * Generate folk religions (one per culture)
 * @param {Object} pack - Pack object
 * @returns {Array} Folk religions array
 */
function generateFolkReligions(pack) {
  if (!pack.cultures) return [];

  return pack.cultures
    .filter((c) => c.i && !c.removed)
    .map((culture) => ({
      type: 'Folk',
      form: 'Animism', // Default form
      culture: culture.i,
      center: culture.center,
    }));
}

/**
 * Generate organized religions
 * @param {Object} params - Generation parameters
 * @param {Object} params.pack - Pack object
 * @param {Object} params.options - Generation options
 * @param {Object} params.rng - RNG instance
 * @returns {Array} Organized religions array
 */
function generateOrganizedReligions({ pack, options, rng }) {
  const { cells, burgs } = pack;
  const religionsNumber = options.religionsNumber || 0;
  if (religionsNumber < 1) return [];

  const candidateCells = getCandidateCells();
  const religionCores = placeReligions();

  const cultsCount = Math.floor((rng.randInt(1, 4) / 10) * religionCores.length); // 10-40%
  const heresiesCount = Math.floor((rng.randInt(0, 3) / 10) * religionCores.length); // 0-30%
  const organizedCount = religionCores.length - cultsCount - heresiesCount;

  const getType = (index) => {
    if (index < organizedCount) return 'Organized';
    if (index < organizedCount + cultsCount) return 'Cult';
    return 'Heresy';
  };

  const forms = {
    Organized: ['Monotheism', 'Polytheism', 'Dualism', 'Pantheism'],
    Cult: ['Cult', 'Sect', 'Order'],
    Heresy: ['Heresy', 'Sect', 'Schism'],
  };

  return religionCores.map((cellId, index) => {
    const type = getType(index);
    const formOptions = forms[type] || ['Religion'];
    const form = rng.pick(formOptions);
    const cultureId = cells.culture && cells.culture[cellId] !== undefined ? cells.culture[cellId] : 0;

    return { type, form, culture: cultureId, center: cellId };
  });

  function placeReligions() {
    const religionCells = [];
    const religionsTree = new SimpleQuadtree();

    const spacing = (options.mapWidth + options.mapHeight) / 2 / religionsNumber;

    for (const cellId of candidateCells) {
      const [x, y] = cells.p[cellId];

      if (!religionsTree.find(x, y, spacing)) {
        religionCells.push(cellId);
        religionsTree.add([x, y]);

        if (religionCells.length === religionsNumber) return religionCells;
      }
    }

    return religionCells;
  }

  function getCandidateCells() {
    const validBurgs = burgs ? burgs.filter((b) => b && b.i && !b.removed) : [];

    if (validBurgs.length >= religionsNumber) {
      return validBurgs
        .sort((a, b) => (b.population || 0) - (a.population || 0))
        .map((burg) => burg.cell);
    }

    // Fallback to high-suitability cells
    const baseScore = cells.s || (cells.pop ? cells.pop : new Float32Array(cells.i.length));
    return cells.i
      .filter((i) => baseScore[i] > 2)
      .sort((a, b) => baseScore[b] - baseScore[a]);
  }
}

/**
 * Specify religion properties (name, color, expansion, etc.)
 * @param {Object} params - Generation parameters
 * @param {Object} params.pack - Pack object
 * @param {Object} params.rng - RNG instance
 * @param {Array} newReligions - New religions to specify
 * @returns {Array} Specified religions
 */
function specifyReligions({ pack, rng, newReligions }) {
  const { cells, cultures } = pack;

  return newReligions.map(({ type, form, culture: cultureId, center }) => {
    const culture = cultures && cultures[cultureId] ? cultures[cultureId] : null;
    const stateId = cells.state && cells.state[center] !== undefined ? cells.state[center] : 0;

    // Simplified name generation
    const name = `${type}${cultureId > 0 ? cultureId : ''}`;

    // Determine expansion mode
    let expansion = 'global';
    if (type === 'Folk') {
      expansion = 'culture';
    } else if (stateId > 0 && rng.probability(0.5)) {
      expansion = 'state';
    }

    // Expansionism based on type
    let expansionism = 0;
    if (type === 'Folk') {
      expansionism = 0;
    } else if (type === 'Organized') {
      expansionism = gauss(5, 3, 0, 10, 1, rng);
    } else if (type === 'Cult') {
      expansionism = gauss(0.5, 0.5, 0, 5, 1, rng);
    } else if (type === 'Heresy') {
      expansionism = gauss(1, 0.5, 0, 5, 1, rng);
    }

    // Color based on culture and type
    let color = getRandomColor(rng);
    if (culture) {
      if (type === 'Folk') {
        color = culture.color || color;
      } else if (type === 'Heresy') {
        color = getMixedColor(culture.color || color, 0.35, 0.2);
      } else if (type === 'Cult') {
        color = getMixedColor(culture.color || color, 0.5, 0);
      } else {
        color = getMixedColor(culture.color || color, 0.25, 0.4);
      }
    }

    return {
      name,
      type,
      form,
      culture: cultureId,
      center,
      deity: null, // Placeholder
      expansion,
      expansionism,
      color,
    };
  });
}

/**
 * Expand religions across the map (Dijkstra-like algorithm)
 * @param {Object} params - Generation parameters
 * @param {Object} params.pack - Pack object (will be modified)
 * @param {Object} params.options - Generation options
 * @param {Array} religions - Religions array
 * @returns {Uint16Array} Religion IDs array
 */
function expandReligions({ pack, options, religions }) {
  const { cells } = pack;
  const religionIds = createTypedArray({ maxValue: 65535, length: cells.i.length });

  // Spread folk religions to their cultures
  religions
    .filter((r) => r.type === 'Folk')
    .forEach((r) => {
      for (const i of cells.i) {
        if (cells.culture && cells.culture[i] === r.culture) {
          religionIds[i] = r.i;
        }
      }
    });

  const queue = new SimplePriorityQueue();
  const cost = [];

  const growthRate = options.growthRate || 1;
  const maxExpansionCost = (cells.i.length / 20) * growthRate;

  // Initialize queue with organized religion centers
  religions
    .filter((r) => r.i && !r.lock && r.type !== 'Folk' && !r.removed)
    .forEach((r) => {
      religionIds[r.center] = r.i;
      const stateId = cells.state && cells.state[r.center] !== undefined ? cells.state[r.center] : 0;
      queue.push({ e: r.center, p: 0, r: r.i, s: stateId }, 0);
      cost[r.center] = 1;
    });

  const religionsMap = new Map(religions.map((r) => [r.i, r]));

  // Expand religions
  while (queue.length) {
    const { e, p, r, s: state } = queue.pop();
    const { culture, expansion, expansionism } = religionsMap.get(r);

    if (!cells.c[e]) continue;
    cells.c[e].forEach((nextCell) => {
      const religion = religionsMap.get(religionIds[nextCell]);
      if (religion && religion.lock) return; // Don't overwrite locked religions

      // Check expansion constraints
      if (expansion === 'culture' && cells.culture && cells.culture[nextCell] !== culture) return;
      if (expansion === 'state' && cells.state && cells.state[nextCell] !== state) return;

      const cultureCost = cells.culture && cells.culture[nextCell] !== culture ? 10 : 0;
      const stateCost = cells.state && cells.state[nextCell] !== state ? 10 : 0;
      const passageCost = getPassageCost(e, nextCell, pack);

      const cellCost = cultureCost + stateCost + passageCost;
      const totalCost = p + 10 + cellCost / expansionism;

      if (totalCost > maxExpansionCost) return;

      if (!cost[nextCell] || totalCost < cost[nextCell]) {
        if (cells.culture && cells.culture[nextCell]) religionIds[nextCell] = r;
        cost[nextCell] = totalCost;
        queue.push({ e: nextCell, p: totalCost, r, s: state }, totalCost);
      }
    });
  }

  function getPassageCost(cellId, nextCellId, pack) {
    const { cells } = pack;
    const h1 = cells.h[cellId];
    const h2 = cells.h[nextCellId];

    if (h1 < 20 && h2 < 20) return 5; // Water to water
    if (h1 < 20 || h2 < 20) return 50; // Water to land or vice versa
    if (h2 >= 67) return 30; // Mountains
    if (h2 >= 44) return 10; // Hills
    return 5; // Normal land
  }

  return religionIds;
}

/**
 * Generate religions
 * @param {Object} params - Generation parameters
 * @param {Object} params.pack - Pack object (will be modified)
 * @param {Object} params.options - Generation options
 * @param {Object} params.rng - RNG instance
 * @returns {Array} Religions array
 */
export function generateReligions({ pack, options, rng }) {
  if (!pack || !pack.cells) {
    throw new Error('Pack object with cells is required');
  }
  if (!rng) {
    throw new Error('RNG instance is required');
  }

  // Skip if religions are disabled
  const religionsNumber = options.religionsNumber || 0;
  if (religionsNumber === 0) {
    pack.religions = [{ name: 'No religion', i: 0 }];
    pack.cells.religion = createTypedArray({ maxValue: 65535, length: pack.cells.i.length });
    return pack.religions;
  }

  const folkReligions = generateFolkReligions(pack);
  const organizedReligions = generateOrganizedReligions({ pack, options, rng });

  const namedReligions = specifyReligions({ pack, rng, newReligions: [...folkReligions, ...organizedReligions] });

  // Index religions
  const religions = [{ name: 'No religion', i: 0 }];
  namedReligions.forEach((r, i) => {
    religions.push({
      ...r,
      i: i + 1,
    });
  });

  // Expand religions
  const religionIds = expandReligions({ pack, options, religions });

  pack.religions = religions;
  pack.cells.religion = religionIds;

  return religions;
}
