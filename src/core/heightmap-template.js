/**
 * =============================================================================
 * heightmap-template.js
 * Desc: Template-based heightmap generation operations (ported from original Azgaar)
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

import { rn, lim, minmax } from '../utils/math.js';
import { findGridCell } from './voronoi.js';

/**
 * Template system for heightmap generation
 * Implements operations: Hill, Pit, Range, Trough, Strait, Mask, Smooth, Modify
 */
export class HeightmapTemplate {
  constructor(grid, options, rng) {
    this.grid = grid;
    this.options = options;
    this.rng = rng;
    this.heights = null;
    const cellsDesired = options.cellsDesired || 10000;
    this.blobPower = this.getBlobPower(cellsDesired);
    this.linePower = this.getLinePower(cellsDesired);
    this.graphWidth = options.mapWidth;
    this.graphHeight = options.mapHeight;
  }

  setHeights(heights) {
    this.heights = heights;
  }

  getHeights() {
    return this.heights;
  }

  getBlobPower(cells) {
    const blobPowerMap = {
      1000: 0.93, 2000: 0.95, 5000: 0.97, 10000: 0.98,
      20000: 0.99, 30000: 0.991, 40000: 0.993, 50000: 0.994,
      60000: 0.995, 70000: 0.9955, 80000: 0.996, 90000: 0.9964, 100000: 0.9973
    };
    return blobPowerMap[cells] || 0.98;
  }

  getLinePower(cells) {
    const linePowerMap = {
      1000: 0.75, 2000: 0.77, 5000: 0.79, 10000: 0.81,
      20000: 0.82, 30000: 0.83, 40000: 0.84, 50000: 0.86,
      60000: 0.87, 70000: 0.88, 80000: 0.91, 90000: 0.92, 100000: 0.93
    };
    return linePowerMap[cells] || 0.81;
  }

  getNumberInRange(r) {
    if (typeof r !== 'string') {
      throw new Error('Range value should be a string');
    }
    if (!isNaN(+r)) return ~~r + (this.rng.probability(r - ~~r) ? 1 : 0);
    const sign = r[0] === '-' ? -1 : 1;
    if (isNaN(+r[0])) r = r.slice(1);
    const range = r.includes('-') ? r.split('-') : null;
    if (!range) {
      throw new Error('Cannot parse the number. Check the format: ' + r);
    }
    return this.rng.randInt(range[0] * sign, +range[1]);
  }

  getPointInRange(range, length) {
    if (typeof range !== 'string') {
      throw new Error('Range should be a string');
    }
    const parts = range.split('-');
    const min = (parts[0] / 100 || 0) * length;
    const max = (parts[1] / 100 || min) * length;
    return this.rng.randFloat(min, max);
  }

  /**
   * Add hill (blob) - creates organic blob-shaped elevation
   */
  addHill(count, height, rangeX, rangeY) {
    count = this.getNumberInRange(count);
    while (count > 0) {
      this.addOneHill(height, rangeX, rangeY);
      count--;
    }
  }

  addOneHill(height, rangeX, rangeY) {
    const change = new Uint8Array(this.heights.length);
    let limit = 0;
    let start;
    let h = lim(this.getNumberInRange(height));

    do {
      const x = this.getPointInRange(rangeX || '0-100', this.graphWidth);
      const y = this.getPointInRange(rangeY || '0-100', this.graphHeight);
      start = findGridCell(x, y, this.grid);
      limit++;
    } while (this.heights[start] + h > 90 && limit < 50);

    change[start] = h;
    const queue = [start];
    while (queue.length) {
      const q = queue.shift();
      const neighbors = this.grid.cells.c[q] || [];
      
      for (const c of neighbors) {
        if (change[c]) continue;
        change[c] = change[q] ** this.blobPower * (this.rng.randFloat() * 0.2 + 0.9);
        if (change[c] > 1) queue.push(c);
      }
    }

    for (let i = 0; i < this.heights.length; i++) {
      this.heights[i] = lim(this.heights[i] + change[i]);
    }
  }

  /**
   * Add pit (round depression)
   */
  addPit(count, height, rangeX, rangeY) {
    count = this.getNumberInRange(count);
    while (count > 0) {
      this.addOnePit(height, rangeX, rangeY);
      count--;
    }
  }

  addOnePit(height, rangeX, rangeY) {
    const used = new Uint8Array(this.heights.length);
    let limit = 0, start;
    let h = lim(this.getNumberInRange(height));

    do {
      const x = this.getPointInRange(rangeX || '0-100', this.graphWidth);
      const y = this.getPointInRange(rangeY || '0-100', this.graphHeight);
      start = findGridCell(x, y, this.grid);
      limit++;
    } while (this.heights[start] < 20 && limit < 50);

    const queue = [start];
    while (queue.length) {
      const q = queue.shift();
      h = h ** this.blobPower * (this.rng.randFloat() * 0.2 + 0.9);
      if (h < 1) return;

      const neighbors = this.grid.cells.c[q] || [];
      neighbors.forEach((c) => {
        if (used[c]) return;
        this.heights[c] = lim(this.heights[c] - h * (this.rng.randFloat() * 0.2 + 0.9));
        used[c] = 1;
        queue.push(c);
      });
    }
  }

  /**
   * Add range (elongated ridge/mountain chain)
   */
  addRange(count, height, rangeX, rangeY) {
    count = this.getNumberInRange(count);
    while (count > 0) {
      this.addOneRange(height, rangeX, rangeY);
      count--;
    }
  }

  addOneRange(height, rangeX, rangeY) {
    const used = new Uint8Array(this.heights.length);
    let h = lim(this.getNumberInRange(height));

    // Find start and end points
    const startX = this.getPointInRange(rangeX || '0-100', this.graphWidth);
    const startY = this.getPointInRange(rangeY || '0-100', this.graphHeight);
    let dist = 0, limit = 0, endX, endY;

    do {
      endX = this.rng.randFloat() * this.graphWidth * 0.8 + this.graphWidth * 0.1;
      endY = this.rng.randFloat() * this.graphHeight * 0.7 + this.graphHeight * 0.15;
      dist = Math.abs(endY - startY) + Math.abs(endX - startX);
      limit++;
    } while ((dist < this.graphWidth / 8 || dist > this.graphWidth / 3) && limit < 50);

    const startCell = findGridCell(startX, startY, this.grid);
    const endCell = findGridCell(endX, endY, this.grid);
    const range = this.getRangePath(startCell, endCell, used);

    // Add height to ridge and cells around
    let queue = range.slice(), i = 0;
    while (queue.length) {
      const frontier = queue.slice();
      queue = [];
      i++;
      frontier.forEach((idx) => {
        this.heights[idx] = lim(this.heights[idx] + h * (this.rng.randFloat() * 0.3 + 0.85));
      });
      h = h ** this.linePower - 1;
      if (h < 2) break;
      frontier.forEach((f) => {
        const neighbors = this.grid.cells.c[f] || [];
        neighbors.forEach((idx) => {
          if (!used[idx]) {
            queue.push(idx);
            used[idx] = 1;
          }
        });
      });
    }
  }

  getRangePath(cur, end, used) {
    const range = [cur];
    const p = this.grid.points;
    used[cur] = 1;

    while (cur !== end) {
      let min = Infinity;
      const neighbors = this.grid.cells.c[cur] || [];
      neighbors.forEach((e) => {
        if (used[e]) return;
        let diff = (p[end][0] - p[e][0]) ** 2 + (p[end][1] - p[e][1]) ** 2;
        if (this.rng.randFloat() > 0.85) diff = diff / 2;
        if (diff < min) {
          min = diff;
          cur = e;
        }
      });
      if (min === Infinity) return range;
      range.push(cur);
      used[cur] = 1;
    }
    return range;
  }

  /**
   * Add trough (elongated depression)
   */
  addTrough(count, height, rangeX, rangeY) {
    count = this.getNumberInRange(count);
    while (count > 0) {
      this.addOneTrough(height, rangeX, rangeY);
      count--;
    }
  }

  addOneTrough(height, rangeX, rangeY) {
    const used = new Uint8Array(this.heights.length);
    let h = lim(this.getNumberInRange(height));

    let startX, startY, limit = 0, startCell;
    do {
      startX = this.getPointInRange(rangeX || '0-100', this.graphWidth);
      startY = this.getPointInRange(rangeY || '0-100', this.graphHeight);
      startCell = findGridCell(startX, startY, this.grid);
      limit++;
    } while (this.heights[startCell] < 20 && limit < 50);

    let dist = 0, endX, endY;

    limit = 0;
    do {
      endX = this.rng.randFloat() * this.graphWidth * 0.8 + this.graphWidth * 0.1;
      endY = this.rng.randFloat() * this.graphHeight * 0.7 + this.graphHeight * 0.15;
      dist = Math.abs(endY - startY) + Math.abs(endX - startX);
      limit++;
    } while ((dist < this.graphWidth / 8 || dist > this.graphWidth / 2) && limit < 50);

    startCell = findGridCell(startX, startY, this.grid);
    const endCell = findGridCell(endX, endY, this.grid);
    const range = this.getRangePath(startCell, endCell, used);

    // Subtract height from trough
    let queue = range.slice(), i = 0;
    while (queue.length) {
      const frontier = queue.slice();
      queue = [];
      i++;
      frontier.forEach((idx) => {
        this.heights[idx] = lim(this.heights[idx] - h * (this.rng.randFloat() * 0.3 + 0.85));
      });
      h = h ** this.linePower - 1;
      if (h < 2) break;
      frontier.forEach((f) => {
        const neighbors = this.grid.cells.c[f] || [];
        neighbors.forEach((idx) => {
          if (!used[idx]) {
            queue.push(idx);
            used[idx] = 1;
          }
        });
      });
    }
  }

  /**
   * Add strait (water channel)
   */
  addStrait(width, direction = 'vertical') {
    width = Math.min(this.getNumberInRange(width), Math.floor(this.graphWidth / (this.grid.cellsX || 100)) / 3);
    if (width < 1 && !this.rng.probability(width)) return;
    
    const used = new Uint8Array(this.heights.length);
    const vert = direction === 'vertical';
    const startX = vert ? Math.floor(this.rng.randFloat() * this.graphWidth * 0.4 + this.graphWidth * 0.3) : 5;
    const startY = vert ? 5 : Math.floor(this.rng.randFloat() * this.graphHeight * 0.4 + this.graphHeight * 0.3);
    const endX = vert
      ? Math.floor(this.graphWidth - startX - this.graphWidth * 0.1 + this.rng.randFloat() * this.graphWidth * 0.2)
      : this.graphWidth - 5;
    const endY = vert
      ? this.graphHeight - 5
      : Math.floor(this.graphHeight - startY - this.graphHeight * 0.1 + this.rng.randFloat() * this.graphHeight * 0.2);

    const start = findGridCell(startX, startY, this.grid);
    const end = findGridCell(endX, endY, this.grid);
    let range = this.getRangePath(start, end, used);
    const query = [];

    const step = 0.1 / width;
    while (width > 0) {
      const exp = 0.9 - step * width;
      range.forEach((r) => {
        const neighbors = this.grid.cells.c[r] || [];
        neighbors.forEach((e) => {
          if (used[e]) return;
          used[e] = 1;
          query.push(e);
          this.heights[e] **= exp;
          if (this.heights[e] > 100) this.heights[e] = 5;
        });
      });
      range = query.slice();
      width--;
    }
  }

  /**
   * Modify heights (add or multiply)
   */
  modify(range, add, mult) {
    const min = range === 'land' ? 20 : range === 'all' ? 0 : +range.split('-')[0];
    const max = range === 'land' || range === 'all' ? 100 : +range.split('-')[1];
    const isLand = min === 20;

    for (let i = 0; i < this.heights.length; i++) {
      const h = this.heights[i];
      if (h < min || h > max) continue;

      let newH = h;
      if (add) newH = isLand ? Math.max(newH + add, 20) : newH + add;
      if (mult !== 1 && mult !== 0) newH = isLand ? (newH - 20) * mult + 20 : newH * mult;
      this.heights[i] = lim(newH);
    }
  }

  /**
   * Smooth heights
   */
  smooth(fr = 2, add = 0) {
    const newHeights = new Uint8Array(this.heights.length);
    
    for (let i = 0; i < this.heights.length; i++) {
      const a = [this.heights[i]];
      const neighbors = this.grid.cells.c[i] || [];
      neighbors.forEach((c) => a.push(this.heights[c]));
      
      const mean = a.reduce((sum, val) => sum + val, 0) / a.length;
      if (fr === 1) {
        newHeights[i] = mean + add;
      } else {
        newHeights[i] = lim((this.heights[i] * (fr - 1) + mean + add) / fr);
      }
    }
    
    this.heights.set(newHeights);
  }

  /**
   * Apply mask (edge masking)
   */
  mask(power = 1) {
    const fr = Math.abs(power) || 1;

    for (let i = 0; i < this.heights.length; i++) {
      const [x, y] = this.grid.points[i];
      const nx = (2 * x) / this.graphWidth - 1; // [-1, 1], 0 is center
      const ny = (2 * y) / this.graphHeight - 1; // [-1, 1], 0 is center
      let distance = (1 - nx ** 2) * (1 - ny ** 2); // 1 is center, 0 is edge
      if (power < 0) distance = 1 - distance; // inverted
      const masked = this.heights[i] * distance;
      this.heights[i] = lim((this.heights[i] * (fr - 1) + masked) / fr);
    }
  }
}
