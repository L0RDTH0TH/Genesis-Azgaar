/**
 * =============================================================================
 * rivers.js
 * Desc: River generation, flux calculation, and erosion
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

import { rn, minmax } from '../utils/math.js';
import { createTypedArray } from '../utils/array.js';
import { generatePrecipitation } from './flux.js';

/**
 * Alter heights by adding distance to water value
 * Makes map less depressed
 * @param {Object} pack - Pack object with cells
 * @returns {Array<number>} Altered heights array
 */
function alterHeights(pack) {
  const { h, c, t } = pack.cells;
  return Array.from(h).map((height, i) => {
    if (height < 20 || !t || t[i] < 1) return height;
    const neighborAvg = c[i] ? c[i].map((cell) => (t[cell] || 0)).reduce((a, b) => a + b, 0) / c[i].length : 0;
    return height + t[i] / 100 + neighborAvg / 10000;
  });
}

/**
 * Resolve depressions in heightmap (simplified version)
 * @param {Array<number>} h - Heights array (modified in place)
 * @param {Object} pack - Pack object
 * @param {number} maxIterations - Maximum iterations
 */
function resolveDepressions(h, pack, maxIterations = 250) {
  const { cells } = pack;
  const land = cells.i.filter((i) => h[i] >= 20 && !cells.b[i]); // exclude near-border cells
  land.sort((a, b) => h[a] - h[b]); // lowest cells go first

  let depressions = Infinity;
  let prevDepressions = null;
  const progress = [];

  for (let iteration = 0; depressions && iteration < maxIterations; iteration++) {
    if (progress.length > 5 && progress.reduce((a, b) => a + b, 0) > 0) {
      // bad progress, abort
      break;
    }

    depressions = 0;

    for (const i of land) {
      if (!cells.c[i] || cells.c[i].length === 0) continue;
      const minHeight = Math.min(...cells.c[i].map((c) => h[c]));
      if (minHeight >= 100 || h[i] > minHeight) continue;

      depressions++;
      h[i] = minHeight + 0.1;
    }

    if (prevDepressions !== null) progress.push(depressions - prevDepressions);
    prevDepressions = depressions;
  }
}

/**
 * Calculate flux and carve rivers
 * @param {Object} params - Generation parameters
 * @param {Object} params.grid - Grid object
 * @param {Object} params.pack - Pack object (will be modified)
 * @param {Object} params.options - Generation options
 * @param {Object} params.rng - RNG instance
 * @param {Uint8Array} params.precipitation - Precipitation array (optional, will be generated if not provided)
 * @param {boolean} params.allowErosion - Whether to apply erosion (default: true)
 * @returns {Object} Rivers data
 */
export function generateRivers({
  grid,
  pack,
  options,
  rng,
  precipitation = null,
  allowErosion = true,
}) {
  if (!grid || !pack) {
    throw new Error('Grid and pack objects are required');
  }
  if (!rng) {
    throw new Error('RNG instance is required');
  }

  const { cells } = pack;
  const MIN_FLUX_TO_FORM_RIVER = 30;
  const cellsNumberModifier = (options.cellsDesired / 10000) ** 0.25;

  // Generate precipitation if not provided
  if (!precipitation) {
    precipitation = generatePrecipitation({ grid, options, rng });
  }

  // Store precipitation in grid if not already there
  if (!grid.cells.prec) {
    grid.cells.prec = precipitation;
  }

  // Initialize flux and river arrays
  cells.fl = createTypedArray({ maxValue: 65535, length: cells.i.length }); // water flux array
  cells.r = createTypedArray({ maxValue: 65535, length: cells.i.length }); // rivers array
  cells.conf = createTypedArray({ maxValue: 255, length: cells.i.length }); // confluences array

  const riversData = {}; // rivers data: {riverId: [cellIds]}
  const riverParents = {}; // {childRiverId: parentRiverId}
  let riverNext = 1; // first river id is 1

  const addCellToRiver = (cell, river) => {
    if (!riversData[river]) riversData[river] = [cell];
    else riversData[river].push(cell);
  };

  // Alter heights for better water flow
  const h = alterHeights(pack);

  // Resolve depressions
  resolveDepressions(h, pack, options.resolveDepressionsSteps || 250);

  // Drain water and create rivers
  drainWater();

  // Define rivers from collected data
  defineRivers();

  // Calculate confluence flux
  calculateConfluenceFlux();

  // Apply erosion if enabled
  if (allowErosion) {
    cells.h = Uint8Array.from(h); // apply altered heights
    downcutRivers();
  }

  return {
    rivers: pack.rivers || [],
    flux: cells.fl,
    riverIds: cells.r,
    confluences: cells.conf,
  };

  function drainWater() {
    const land = cells.i.filter((i) => h[i] >= 20).sort((a, b) => h[b] - h[a]);

    land.forEach((i) => {
      // Add flux from precipitation
      const gridCell = cells.g ? cells.g[i] : i;
      cells.fl[i] += precipitation[gridCell] / cellsNumberModifier;

      // Near-border cell: pour water out of the screen
      if (cells.b && cells.b[i] && cells.r[i]) {
        return addCellToRiver(-1, cells.r[i]);
      }

      // Find downhill cell
      if (!cells.c[i] || cells.c[i].length === 0) return;
      const neighbors = cells.c[i];
      if (!Array.isArray(neighbors) || neighbors.length === 0) return;
      const min = neighbors.sort((a, b) => h[a] - h[b])[0];

      // Cell is depressed (no downhill)
      if (h[i] <= h[min]) return;

      if (cells.fl[i] < MIN_FLUX_TO_FORM_RIVER) {
        // Flux is too small to operate as a river
        if (h[min] >= 20) cells.fl[min] += cells.fl[i];
        return;
      }

      // Proclaim a new river
      if (!cells.r[i]) {
        cells.r[i] = riverNext;
        addCellToRiver(i, riverNext);
        riverNext++;
      }

      flowDown(min, cells.fl[i], cells.r[i]);
    });
  }

  function flowDown(toCell, fromFlux, river) {
    const toFlux = cells.fl[toCell] - cells.conf[toCell];
    const toRiver = cells.r[toCell];

    if (toRiver) {
      // Downhill cell already has river assigned
      if (fromFlux > toFlux) {
        cells.conf[toCell] += cells.fl[toCell]; // mark confluence
        if (h[toCell] >= 20) riverParents[toRiver] = river; // min river is a tributary
        cells.r[toCell] = river; // re-assign river if downhill part has less flux
      } else {
        cells.conf[toCell] += fromFlux; // mark confluence
        if (h[toCell] >= 20) riverParents[river] = toRiver; // current river is a tributary
      }
    } else {
      cells.r[toCell] = river; // assign the river to the downhill cell
    }

    if (h[toCell] < 20) {
      // Pour water to the water body
      if (pack.features && cells.f) {
        const waterBody = pack.features[cells.f[toCell]];
        if (waterBody && waterBody.type === 'lake') {
          if (!waterBody.river || fromFlux > waterBody.enteringFlux) {
            waterBody.river = river;
            waterBody.enteringFlux = fromFlux;
          }
          waterBody.flux = (waterBody.flux || 0) + fromFlux;
          if (!waterBody.inlets) waterBody.inlets = [river];
          else waterBody.inlets.push(river);
        }
      }
    } else {
      // Propagate flux and add next river segment
      cells.fl[toCell] += fromFlux;
    }

    addCellToRiver(toCell, river);
  }

  function defineRivers() {
    // Re-initialize rivers array
    cells.r = createTypedArray({ maxValue: 65535, length: cells.i.length });
    cells.conf = createTypedArray({ maxValue: 255, length: cells.i.length });
    pack.rivers = [];

    const defaultWidthFactor = rn(1 / (options.cellsDesired / 10000) ** 0.25, 2);
    const mainStemWidthFactor = defaultWidthFactor * 1.2;

    for (const key in riversData) {
      const riverCells = riversData[key];
      if (riverCells.length < 3) continue; // exclude tiny rivers

      const riverId = +key;
      for (const cell of riverCells) {
        if (cell < 0 || cells.h[cell] < 20) continue;

        // Mark real confluences and assign river to cells
        if (cells.r[cell]) cells.conf[cell] = 1;
        else cells.r[cell] = riverId;
      }

      const source = riverCells[0];
      const mouth = riverCells[riverCells.length - 2] || riverCells[riverCells.length - 1];
      const parent = riverParents[key] || 0;

      const widthFactor = !parent || parent === riverId ? mainStemWidthFactor : defaultWidthFactor;
      const discharge = cells.fl[mouth] || 0; // m3 in second
      const length = getApproximateLength(riverCells);
      const sourceWidth = getSourceWidth(cells.fl[source] || 0);
      const width = getWidth(getOffset({ flux: discharge, pointIndex: riverCells.length, widthFactor, startingWidth: sourceWidth }));

      pack.rivers.push({
        i: riverId,
        source,
        mouth,
        discharge,
        length,
        width,
        widthFactor,
        sourceWidth,
        parent,
        cells: riverCells,
      });
    }
  }

  function calculateConfluenceFlux() {
    for (const i of cells.i) {
      if (!cells.conf[i]) continue;
      if (!cells.c[i] || cells.c[i].length === 0) continue;

      const sortedInflux = cells.c[i]
        .filter((c) => cells.r[c] && h[c] > h[i])
        .map((c) => cells.fl[c])
        .sort((a, b) => b - a);
      cells.conf[i] = sortedInflux.reduce((acc, flux, index) => (index ? acc + flux : acc), 0);
    }
  }

  function downcutRivers() {
    const MAX_DOWNCUT = 5;

    for (const i of cells.i) {
      if (cells.h[i] < 35) continue; // don't downcut lowlands
      if (!cells.fl[i]) continue;
      if (!cells.c[i] || cells.c[i].length === 0) continue;

      const higherCells = cells.c[i].filter((c) => cells.h[c] > cells.h[i]);
      if (higherCells.length === 0) continue;

      const higherFlux = higherCells.reduce((acc, c) => acc + cells.fl[c], 0) / higherCells.length;
      if (!higherFlux) continue;

      const downcut = Math.floor(cells.fl[i] / higherFlux);
      if (downcut) cells.h[i] -= Math.min(downcut, MAX_DOWNCUT);
    }
  }

  function getOffset({ flux, pointIndex, widthFactor, startingWidth }) {
    if (pointIndex === 0) return startingWidth;

    const FLUX_FACTOR = 500;
    const MAX_FLUX_WIDTH = 1;
    const LENGTH_FACTOR = 200;
    const LENGTH_STEP_WIDTH = 1 / LENGTH_FACTOR;
    const LENGTH_PROGRESSION = [1, 1, 2, 3, 5, 8, 13, 21, 34].map((n) => n / LENGTH_FACTOR);

    const fluxWidth = Math.min(flux ** 0.7 / FLUX_FACTOR, MAX_FLUX_WIDTH);
    const lengthWidth =
      pointIndex * LENGTH_STEP_WIDTH + (LENGTH_PROGRESSION[pointIndex] || LENGTH_PROGRESSION[LENGTH_PROGRESSION.length - 1]);
    return widthFactor * (lengthWidth + fluxWidth) + startingWidth;
  }

  function getSourceWidth(flux) {
    const FLUX_FACTOR = 500;
    const MAX_FLUX_WIDTH = 1;
    return rn(Math.min(flux ** 0.9 / FLUX_FACTOR, MAX_FLUX_WIDTH), 2);
  }

  function getWidth(offset) {
    return rn((offset / 1.5) ** 1.8, 2); // mouth width in km
  }

  function getApproximateLength(riverCells) {
    if (!cells.p || riverCells.length < 2) return 0;
    let length = 0;
    for (let i = 1; i < riverCells.length; i++) {
      const prev = riverCells[i - 1];
      const curr = riverCells[i];
      if (prev < 0 || curr < 0) continue;
      const [x1, y1] = cells.p[prev];
      const [x2, y2] = cells.p[curr];
      length += Math.hypot(x2 - x1, y2 - y1);
    }
    return rn(length, 2);
  }
}
