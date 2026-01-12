/**
 * =============================================================================
 * utils.js
 * Desc: Rendering utility functions for canvas operations
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

/**
 * Get polygon path coordinates for a cell
 * Returns the polygon coordinates from pack.cells.vCoords[cellIndex] if available
 * Falls back to converting vertex indices to coordinates if vCoords not available
 * @param {number} cellIndex - Cell index in pack
 * @param {Object} pack - Pack object
 * @returns {Array<Array<number>>|null} Array of [x, y] coordinates, or null if not available
 */
export function getCellPolygonPath(cellIndex, pack) {
  if (!pack || !pack.cells) {
    return null;
  }
  
  // Prefer vCoords (polygon coordinates) for canvas rendering
  if (pack.cells.vCoords && pack.cells.vCoords[cellIndex]) {
    const coords = pack.cells.vCoords[cellIndex];
    if (Array.isArray(coords) && coords.length > 0) {
      return coords;
    }
  }
  
  // Fallback: convert vertex indices to coordinates
  if (pack.cells.v && pack.cells.v[cellIndex] && pack.vertices && pack.vertices.p) {
    const vertexIndices = pack.cells.v[cellIndex];
    if (Array.isArray(vertexIndices) && vertexIndices.length > 0) {
      // Check if it's already coordinates (backward compatibility)
      if (Array.isArray(vertexIndices[0]) && vertexIndices[0].length === 2) {
        return vertexIndices;
  }
      // Convert vertex indices to coordinates
      return vertexIndices.map(vId => pack.vertices.p[vId]).filter(p => p !== undefined);
    }
  }
  
  return null;
}

/**
 * Draw polygon on canvas context
 * Helper function to draw a polygon from coordinates
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Array<Array<number>>} polygon - Array of [x, y] coordinates
 */
export function drawPolygon(ctx, polygon) {
  if (!polygon || polygon.length === 0) {
    return;
  }
  
  ctx.beginPath();
  const [firstX, firstY] = polygon[0];
  ctx.moveTo(firstX, firstY);
  
  for (let i = 1; i < polygon.length; i++) {
    const [x, y] = polygon[i];
    ctx.lineTo(x, y);
  }
  
  ctx.closePath();
}

/**
 * Check if a point is inside a polygon using ray casting algorithm
 * @param {Array<number>} point - Point [x, y]
 * @param {Array<Array<number>>} polygon - Polygon vertices [[x1, y1], [x2, y2], ...]
 * @returns {boolean} True if point is inside polygon
 */
export function pointInPolygon(point, polygon) {
  if (!polygon || polygon.length < 3) return false;
  
  const [x, y] = point;
  let inside = false;
  
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  
  return inside;
}

/**
 * Clip polygon by bounding box (ported from original/commonUtils.js)
 * Uses Cohen-Sutherland algorithm for clipping
 * @param {Array<Array<number>>} points - Polygon points [[x1, y1], [x2, y2], ...]
 * @param {number} width - Map width (right boundary)
 * @param {number} height - Map height (bottom boundary)
 * @param {number} secure - Security parameter (default: 0)
 * @returns {Array<Array<number>>} Clipped polygon points
 */
export function clipPoly(points, width, height, secure = 0) {
  if (points.length < 2) return points;
  if (points.some(point => point === undefined || !Array.isArray(point) || point.length < 2)) {
    console.error("Invalid point in clipPoly", points);
    return points;
  }

  const bbox = [0, 0, width, height]; // [x0, y0, x1, y1]
  let clipped = points;

  // Clip against each edge of the bounding box (top, right, bottom, left)
  // Using bit codes: 1=left, 2=right, 4=bottom, 8=top
  for (let edge = 1; edge <= 8; edge *= 2) {
    const result = [];
    if (clipped.length === 0) break;

    let prevInside = !(bitCode(clipped[clipped.length - 1], bbox) & edge);

    for (let i = 0; i < clipped.length; i++) {
      const current = clipped[i];
      const currentInside = !(bitCode(current, bbox) & edge);

      if (currentInside !== prevInside) {
        // Edge crossing detected - add intersection point
        const intersection = intersectEdge(clipped[i - 1] || clipped[clipped.length - 1], current, edge, bbox);
        if (intersection) {
          result.push(intersection);
          if (secure && currentInside !== prevInside) {
            result.push(intersection); // Add twice if secure mode
            if (secure > 1) result.push(intersection); // Add thrice if secure > 1
          }
        }
      }

      if (currentInside) {
        result.push(current);
      }

      prevInside = currentInside;
    }

    clipped = result;
    if (clipped.length === 0) break;
  }

  return clipped.length > 0 ? clipped : points;
}

/**
 * Get bit code for Cohen-Sutherland clipping algorithm
 * @param {Array<number>} point - Point [x, y]
 * @param {Array<number>} bbox - Bounding box [x0, y0, x1, y1]
 * @returns {number} Bit code (1=left, 2=right, 4=bottom, 8=top)
 */
function bitCode(point, bbox) {
  let code = 0;
  const [x, y] = point;
  const [x0, y0, x1, y1] = bbox;

  if (x < x0) code |= 1; // Left
  else if (x > x1) code |= 2; // Right

  if (y < y0) code |= 4; // Bottom
  else if (y > y1) code |= 8; // Top

  return code;
}

/**
 * Find intersection point with edge
 * @param {Array<number>} p1 - First point [x, y]
 * @param {Array<number>} p2 - Second point [x, y]
 * @param {number} edge - Edge code (1=left, 2=right, 4=bottom, 8=top)
 * @param {Array<number>} bbox - Bounding box [x0, y0, x1, y1]
 * @returns {Array<number>|null} Intersection point [x, y] or null
 */
function intersectEdge(p1, p2, edge, bbox) {
  const [x1, y1] = p1;
  const [x2, y2] = p2;
  const [x0, y0, x1_bound, y1_bound] = bbox;

  if (edge & 8) { // Top edge
    return [x1 + (x2 - x1) * (y1_bound - y1) / (y2 - y1), y1_bound];
  } else if (edge & 4) { // Bottom edge
    return [x1 + (x2 - x1) * (y0 - y1) / (y2 - y1), y0];
  } else if (edge & 2) { // Right edge
    return [x1_bound, y1 + (y2 - y1) * (x1_bound - x1) / (x2 - x1)];
  } else if (edge & 1) { // Left edge
    return [x0, y1 + (y2 - y1) * (x0 - x1) / (x2 - x1)];
  }

  return null;
}

/**
 * Poisson disc sampling for evenly distributed points
 * Based on mbostock's poissonDiscSampler
 * @generator
 * @param {number} x0 - Minimum x coordinate
 * @param {number} y0 - Minimum y coordinate
 * @param {number} x1 - Maximum x coordinate
 * @param {number} y1 - Maximum y coordinate
 * @param {number} r - Minimum distance between points
 * @param {number} k - Number of attempts per point (default: 3)
 * @yields {Array<number>} [x, y] coordinates
 */
export function* poissonDiscSampler(x0, y0, x1, y1, r, k = 3) {
  if (!(x1 >= x0) || !(y1 >= y0) || !(r > 0)) throw new Error('Invalid bounds');
  
  const width = x1 - x0;
  const height = y1 - y0;
  const r2 = r * r;
  const r2_3 = 3 * r2;
  const cellSize = r * Math.SQRT1_2;
  const gridWidth = Math.ceil(width / cellSize);
  const gridHeight = Math.ceil(height / cellSize);
  const grid = new Array(gridWidth * gridHeight);
  const queue = [];
  
  function far(x, y) {
    const i = (x / cellSize) | 0;
    const j = (y / cellSize) | 0;
    const i0 = Math.max(i - 2, 0);
    const j0 = Math.max(j - 2, 0);
    const i1 = Math.min(i + 3, gridWidth);
    const j1 = Math.min(j + 3, gridHeight);
    for (let j = j0; j < j1; ++j) {
      const o = j * gridWidth;
      for (let i = i0; i < i1; ++i) {
        const s = grid[o + i];
        if (s) {
          const dx = s[0] - x;
          const dy = s[1] - y;
          if (dx * dx + dy * dy < r2) return false;
        }
      }
    }
    return true;
  }
  
  function sample(x, y) {
    queue.push((grid[gridWidth * ((y / cellSize) | 0) + ((x / cellSize) | 0)] = [x, y]));
    return [x + x0, y + y0];
  }
  
  yield sample(width / 2, height / 2);
  
  pick: while (queue.length) {
    const i = (Math.random() * queue.length) | 0;
    const parent = queue[i];
    
    for (let j = 0; j < k; ++j) {
      const a = 2 * Math.PI * Math.random();
      const r = Math.sqrt(Math.random() * r2_3 + r2);
      const x = parent[0] + r * Math.cos(a);
      const y = parent[1] + r * Math.sin(a);
      if (0 <= x && x < width && 0 <= y && y < height && far(x, y)) {
        yield sample(x, y);
        continue pick;
      }
    }
    
    const r = queue.pop();
    if (i < queue.length) queue[i] = r;
  }
}
