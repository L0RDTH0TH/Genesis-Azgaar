/**
 * =============================================================================
 * burgs.js
 * Desc: Burg (settlement) placement and population assignment
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

import { rn, gauss } from '../utils/math.js';
import { createTypedArray } from '../utils/array.js';

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
 * Get close to edge point for port burgs
 * @param {number} cell1 - Land cell ID
 * @param {number} cell2 - Water cell ID
 * @param {Object} pack - Pack object
 * @returns {[number, number]} Coordinates
 */
function getCloseToEdgePoint(cell1, cell2, pack) {
  const { cells, vertices } = pack;

  const [x0, y0] = cells.p[cell1];

  if (!cells.v[cell1] || !vertices) {
    return [x0, y0];
  }

  const commonVertices = cells.v[cell1].filter((vertex) => vertices.c[vertex] && vertices.c[vertex].some((cell) => cell === cell2));
  if (commonVertices.length < 2) {
    return [x0, y0];
  }

  const [x1, y1] = vertices.p[commonVertices[0]];
  const [x2, y2] = vertices.p[commonVertices[1]];
  const xEdge = (x1 + x2) / 2;
  const yEdge = (y1 + y2) / 2;

  const x = rn(x0 + 0.95 * (xEdge - x0), 2);
  const y = rn(y0 + 0.95 * (yEdge - y0), 2);

  return [x, y];
}

/**
 * Get burg type based on cell properties
 * @param {number} cellId - Cell ID
 * @param {number} port - Port feature ID (0 if not port)
 * @param {Object} pack - Pack object
 * @returns {string} Burg type
 */
function getBurgType(cellId, port, pack) {
  const { cells, features } = pack;

  if (port) return 'Naval';

  const haven = cells.haven[cellId];
  if (haven !== undefined && features[cells.f[haven]] && features[cells.f[haven]].type === 'lake') return 'Lake';

  if (cells.h[cellId] > 60) return 'Highland';

  if (cells.r[cellId] && cells.fl[cellId] >= 100) return 'River';

  const biome = cells.biome[cellId];
  const population = cells.pop ? cells.pop[cellId] : 0;
  if (!cells.burg[cellId] || population <= 5) {
    if (population < 5 && [1, 2, 3, 4].includes(biome)) return 'Nomadic';
    if (biome > 4 && biome < 10) return 'Hunting';
  }

  return 'Generic';
}

/**
 * Place capitals (one per state)
 * @param {Object} params - Generation parameters
 * @param {Object} params.pack - Pack object
 * @param {Object} params.options - Generation options
 * @param {Object} params.rng - RNG instance
 * @returns {Array} Burgs array
 */
function placeCapitals({ pack, options, rng }) {
  const { cells } = pack;
  const statesNumber = options.statesNumber || 18;
  let burgs = [null]; // Index 0 is null - changed to let for retry logic

  // Use suitability score if available, otherwise use population
  const baseScore = cells.s || (cells.pop ? cells.pop : new Float32Array(cells.i.length));
  const score = new Int16Array(Array.from(baseScore).map((s) => s * (0.5 + rng.random() * 0.5))); // randomized cell score
  const sorted = cells.i
    .filter((i) => score[i] > 0 && cells.culture && cells.culture[i])
    .sort((a, b) => score[b] - score[a]);

  let count = statesNumber;
  if (sorted.length < count * 10) {
    count = Math.floor(sorted.length / 10);
    if (!count) {
      return burgs;
    }
  }

  let burgsTree = new SimpleQuadtree(); // Changed to let for reassignment
  let spacing = (options.mapWidth + options.mapHeight) / 2 / count;

  // Match original logic: loop until we have count capitals (burgs.length > count)
  // Original uses: for (let i = 0; burgs.length <= count; i++)
  // This means: continue while burgs.length <= count, stop when burgs.length > count
  // So if count=18, we want burgs.length to be 19 (18 capitals + 1 null), then stop
  for (let i = 0; burgs.length <= count; i++) {
    // If we've exhausted all candidates, retry with reduced spacing
    if (i >= sorted.length) {
      if (spacing <= 1) {
        // Can't reduce spacing further - break out of loop
        break;
      }
      // Retry with reduced spacing
      burgsTree = new SimpleQuadtree();
      burgs = [null]; // Reset burgs array
      spacing /= 1.2;
      i = -1; // Reset loop counter (will be incremented to 0)
      continue;
    }

    const cell = sorted[i];
    const [x, y] = cells.p[cell];

    // Only add if not too close to existing burg
    if (!burgsTree.find(x, y, spacing)) {
      burgs.push({ cell, x, y });
      burgsTree.add([x, y]);
      // Check if we've placed enough - if so, break immediately
      if (burgs.length > count) {
        break;
      }
    }
  }

  // Log for debugging
  if (typeof console !== 'undefined' && console.log) {
    console.log('[placeCapitals] Capital placement:', {
      desiredCount: count,
      placedCount: burgs.length - 1, // Exclude null at index 0
      spacing: spacing.toFixed(2),
      sortedLength: sorted.length,
    });
  }

  return burgs;
}

/**
 * Place additional towns
 * @param {Object} params - Generation parameters
 * @param {Object} params.pack - Pack object (will be modified)
 * @param {Object} params.options - Generation options
 * @param {Object} params.rng - RNG instance
 * @param {Array} burgs - Existing burgs array
 * @param {SimpleQuadtree} burgsTree - Quadtree for spacing
 */
function placeTowns({ pack, options, rng, burgs, burgsTree }) {
  const { cells } = pack;

  // Use suitability score if available, otherwise use population
  const baseScore = cells.s || (cells.pop ? cells.pop : new Float32Array(cells.i.length));
  const score = new Int16Array(
    Array.from(baseScore).map((s) => s * gauss(1, 3, 0, 20, 3, rng))
  ); // randomized cell score
  const sorted = cells.i
    .filter((i) => !cells.burg[i] && score[i] > 0 && cells.culture && cells.culture[i])
    .sort((a, b) => score[b] - score[a]);

  const cellsDesired = options.cellsDesired || 10000;
  const desiredNumber =
    options.manors === 1000 || options.manors === 'auto'
      ? rn(sorted.length / 5 / (cellsDesired / 10000) ** 0.8)
      : options.manors || 1000;
  const burgsNumber = Math.min(desiredNumber, sorted.length);
  let burgsAdded = 0;

  let spacing = (options.mapWidth + options.mapHeight) / 150 / (burgsNumber ** 0.7 / 66);

  while (burgsAdded < burgsNumber && spacing > 1) {
    for (let i = 0; burgsAdded < burgsNumber && i < sorted.length; i++) {
      if (cells.burg[sorted[i]]) continue;
      const cell = sorted[i];
      const [x, y] = cells.p[cell];
      const s = spacing * gauss(1, 0.3, 0.2, 2, 2, rng); // randomize spacing
      if (burgsTree.find(x, y, s)) continue; // too close to existing burg

      const burg = burgs.length;
      const culture = cells.culture[cell];
      // Simplified name generation - will be enhanced when names module is fully integrated
      const name = `Town${burg}`;
      burgs.push({
        cell,
        x,
        y,
        state: 0,
        i: burg,
        culture,
        name,
        capital: 0,
        feature: cells.f[cell],
      });
      burgsTree.add([x, y]);
      cells.burg[cell] = burg;
      burgsAdded++;
    }
    spacing *= 0.5;
  }
}

/**
 * Specify burg properties (population, port status, coordinates)
 * @param {Object} params - Generation parameters
 * @param {Object} params.pack - Pack object (will be modified)
 * @param {Object} params.grid - Grid object
 * @param {Object} params.options - Generation options
 * @param {Object} params.rng - RNG instance
 */
function specifyBurgs({ pack, grid, options, rng }) {
  const { cells, features } = pack;
  const temp = grid.cells.temp;

  for (const b of pack.burgs) {
    if (!b || !b.i || b.lock) continue;
    const i = b.cell;

    // Assign port status
    const haven = cells.haven[i];
    if (haven !== undefined && temp[cells.g[i]] > 0) {
      const f = cells.f[haven];
      const feature = features[f];
      const port = feature && feature.cells > 1 && ((b.capital && cells.harbor[i]) || cells.harbor[i] === 1);
      b.port = port ? f : 0;
    } else {
      b.port = 0;
    }

    // Define burg population
    const suitability = cells.s ? cells.s[i] : (cells.pop ? cells.pop[i] : 0);
    b.population = rn(Math.max(suitability / 8 + b.i / 1000 + (i % 100) / 1000, 0.1), 3);
    if (b.capital) b.population = rn(b.population * 1.3, 3);

    if (b.port) {
      b.population = b.population * 1.3;
      const [x, y] = getCloseToEdgePoint(i, haven, pack);
      b.x = x;
      b.y = y;
    }

    // Add random factor
    b.population = rn(b.population * gauss(2, 3, 0.6, 20, 3, rng), 3);

    // Shift burgs on rivers
    if (!b.port && cells.r[i]) {
      const shift = Math.min((cells.fl[i] || 0) / 150, 1);
      if (i % 2) b.x = rn(b.x + shift, 2);
      else b.x = rn(b.x - shift, 2);
      if (cells.r[i] % 2) b.y = rn(b.y + shift, 2);
      else b.y = rn(b.y - shift, 2);
    }

    // Define burg type
    b.type = getBurgType(i, b.port, pack);
  }

  // De-assign port status if it's the only one on feature
  const ports = pack.burgs.filter((b) => b && b.i && !b.removed && b.port > 0);
  for (const f of features) {
    if (!f || !f.i || f.land || f.border) continue;
    const featurePorts = ports.filter((b) => b.port === f.i);
    if (featurePorts.length === 1) featurePorts[0].port = 0;
  }
}

/**
 * Generate burgs (settlements)
 * @param {Object} params - Generation parameters
 * @param {Object} params.pack - Pack object (will be modified)
 * @param {Object} params.grid - Grid object
 * @param {Object} params.options - Generation options
 * @param {Object} params.rng - RNG instance
 * @returns {Array} Burgs array
 */
export function generateBurgs({ pack, grid, options, rng }) {
  if (!pack || !pack.cells) {
    throw new Error('Pack object with cells is required');
  }
  if (!rng) {
    throw new Error('RNG instance is required');
  }

  const { cells } = pack;
  const n = cells.i.length;

  cells.burg = createTypedArray({ maxValue: 65535, length: n }); // cell burg

  // Place capitals first
  const burgs = placeCapitals({ pack, options, rng });

  // Create quadtree for spacing
  const burgsTree = new SimpleQuadtree();
  for (let i = 1; i < burgs.length; i++) {
    if (burgs[i]) {
      burgsTree.add([burgs[i].x, burgs[i].y]);
    }
  }

  // Place additional towns
  placeTowns({ pack, options, rng, burgs, burgsTree });

  // Assign initial properties to capitals
  // IMPORTANT: Only mark the first (statesNumber) burgs as capitals
  const statesNumber = options.statesNumber || 18;
  const maxCapitals = Math.min(statesNumber, burgs.length - 1); // Exclude null at index 0
  
  for (let i = 1; i <= maxCapitals; i++) {
    if (!burgs[i]) continue;
    const b = burgs[i];
    b.i = i;
    b.state = i; // Capital is also state capital
    b.culture = cells.culture[b.cell];
    // Simplified name generation - will be enhanced when names module is fully integrated
    b.name = `Capital${i}`;
    b.feature = cells.f[b.cell];
    b.capital = 1;
    cells.burg[b.cell] = i;
  }
  
  // Mark remaining burgs as non-capitals (towns)
  for (let i = maxCapitals + 1; i < burgs.length; i++) {
    if (!burgs[i]) continue;
    const b = burgs[i];
    b.i = i;
    b.capital = 0; // Not a capital
    b.state = 0; // No state assigned yet
    b.culture = cells.culture[b.cell];
    b.name = `Town${i}`;
    b.feature = cells.f[b.cell];
    cells.burg[b.cell] = i;
  }

  pack.burgs = burgs;

  // Specify burg properties
  specifyBurgs({ pack, grid, options, rng });

  return burgs;
}
