/**
 * =============================================================================
 * canvas2d.js
 * Desc: Canvas 2D renderer with Path2D for Option 1 (Pure Canvas 2D + Path2D)
 * Author: Lordthoth
 * =============================================================================
 */

import { Renderer } from './renderer-interface.js';

/**
 * Canvas 2D renderer with Path2D caching and redraw-on-zoom
 * Implements Option 1 from canvas-only-migration-options-v3.md
 */
export class Canvas2DRenderer extends Renderer {
  /**
   * @param {HTMLCanvasElement} canvas - Canvas element to render to
   * @param {Object} options - Renderer options { viewport: { x, y, scale } }
   */
  constructor(canvas, options = {}) {
    super(canvas);
    
    if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
      throw new Error('Canvas element is required');
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not get 2D rendering context from canvas');
    }

    this.ctx = ctx;
    this.viewport = {
      offsetX: options.viewport?.offsetX || 0,
      offsetY: options.viewport?.offsetY || 0,
      scale: options.viewport?.scale || 1.0,
    };
    
    // Path2D cache for reuse (cellId -> Path2D)
    this.pathCache = new Map();
    
    // Pattern cache (patternId -> CanvasPattern)
    this.patternCache = new Map();
    
    // Gradient cache (gradientId -> CanvasGradient)
    this.gradientCache = new Map();
    
    // Store render data for redraw
    this._renderDataCache = null;
  }

  /**
   * Render dual-grid wireframe (blue quads + red survivors)
   * @param {Object} gridData - Dual grid data
   * @param {Array<{x, y}>} gridData.points - Grid points
   * @param {Array} gridData.level0Quads - Level 0 quads with verts array
   * @param {Array} gridData.survivors - Survivor triangles (optional)
   */
  renderGrid(gridData) {
    const { points, level0Quads, survivors = [] } = gridData;
    
    // Clear canvas
    this.clear();
    
    // Apply viewport transform
    this.ctx.save();
    this.ctx.translate(this.viewport.offsetX, this.viewport.offsetY);
    this.ctx.scale(this.viewport.scale, this.viewport.scale);
    
    // Draw quads (blue wireframe)
    if (level0Quads && level0Quads.length > 0) {
      this.ctx.strokeStyle = '#4488ff';
      this.ctx.lineWidth = 2;
      this.ctx.lineJoin = 'round';
      this.ctx.lineCap = 'round';
      
      level0Quads.forEach((quad, i) => {
        if (!quad.verts || quad.verts.length < 3) return;
        
        const path = this.getOrCreatePath(
          quad.verts.map(vi => points[vi]),
          `quad-${i}`
        );
        this.ctx.stroke(path);
      });
    }
    
    // Draw survivors (red filled + thick stroke)
    if (survivors && survivors.length > 0) {
      survivors.forEach((survivor, i) => {
        if (!survivor.verts || survivor.verts.length < 3) return;
        
        const path = this.getOrCreatePath(
          survivor.verts.map(vi => points[vi]),
          `survivor-${i}`
        );
        
        // Red fill
        this.ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
        this.ctx.fill(path);
        
        // Red thick stroke
        this.ctx.strokeStyle = '#ff0000';
        this.ctx.lineWidth = 7;
        this.ctx.stroke(path);
      });
    }
    
    this.ctx.restore();
  }

  /**
   * Render Azgaar map data (all cells from exportRenderData output)
   * This is the main rendering method for Phase 2
   * @param {Object} renderData - Output from exportRenderData({ mode: 'canvas2d' })
   * @param {Array} renderData.cells - Array of cell data with path, fill, stroke, labels
   */
  renderMap(renderData) {
    if (!renderData || !renderData.cells || !Array.isArray(renderData.cells)) {
      console.warn('[Canvas2DRenderer.renderMap] Invalid renderData');
      return;
    }

    // Store for redraw
    this._renderDataCache = renderData;

    // Clear canvas
    this.clear();

    // Apply viewport transform
    this.ctx.save();
    this.ctx.translate(this.viewport.offsetX, this.viewport.offsetY);
    this.ctx.scale(this.viewport.scale, this.viewport.scale);

    // Render all cells
    for (const cell of renderData.cells) {
      if (!cell || !cell.path || cell.path.length < 3) continue;

      // Create or reuse Path2D
      const cacheKey = `cell-${cell.i}`;
      const path = this.getOrCreatePath(cell.path, cacheKey);

      // Set fill style
      if (cell.fill) {
        this.ctx.fillStyle = this.getFillStyle(cell.fill, cell.bounds || {});
        this.ctx.fill(path);
      }

      // Set stroke style (only if color is not null)
      if (cell.stroke && cell.stroke.color) {
        this.ctx.strokeStyle = cell.stroke.color;
        this.ctx.lineWidth = cell.stroke.width || 1;
        if (cell.stroke.dashArray && Array.isArray(cell.stroke.dashArray)) {
          this.ctx.setLineDash(cell.stroke.dashArray);
        }
        this.ctx.stroke(path);
        if (cell.stroke.dashArray) {
          this.ctx.setLineDash([]); // Reset
        }
      }

      // Draw labels (after fill/stroke, so they appear on top)
      if (cell.labels && Array.isArray(cell.labels) && cell.labels.length > 0) {
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        cell.labels.forEach(label => {
          if (!label || !label.text) return;
          this.ctx.fillStyle = label.color || '#000';
          this.ctx.font = `${label.fontSize || 12}px sans-serif`;
          // Labels are in world coordinates, so they'll be transformed with viewport
          this.ctx.fillText(label.text, label.x || 0, label.y || 0);
        });
      }
    }

    this.ctx.restore();
  }

  /**
   * Render Azgaar cell data as Canvas 2D paths (single cell, for zoom/focus)
   * @param {Object} cellData - Cell rendering data
   * @param {Array<Array<number>>} cellData.path - Array of [x, y] points
   * @param {Object} cellData.fill - Fill style { type: 'color'|'pattern'|'gradient', ... }
   * @param {Object} cellData.stroke - Stroke style { color, width, dashArray? }
   * @param {Array} cellData.labels - Text labels [{ text, x, y, fontSize, color }]
   * @param {Object} bounds - Cell bounds { x, y, width, height } (optional, for focus rendering)
   */
  renderCell(cellData, bounds = null) {
    if (!cellData || !cellData.path || cellData.path.length < 3) {
      return;
    }
    
    // Create or reuse Path2D
    const cacheKey = `cell-${cellData.i}`;
    const path = this.getOrCreatePath(cellData.path, cacheKey);
    
    // Apply cell-specific transform if bounds provided
    this.ctx.save();
    if (bounds) {
      this.ctx.translate(bounds.x, bounds.y);
      if (cellData.bounds && cellData.bounds.width && cellData.bounds.height) {
        const scaleX = bounds.width / cellData.bounds.width;
        const scaleY = bounds.height / cellData.bounds.height;
        this.ctx.scale(scaleX, scaleY);
      }
    }
    
    // Set fill style
    if (cellData.fill) {
      this.ctx.fillStyle = this.getFillStyle(cellData.fill, cellData.bounds || bounds || {});
      this.ctx.fill(path);
    }
    
    // Set stroke style
    if (cellData.stroke && cellData.stroke.color) {
      this.ctx.strokeStyle = cellData.stroke.color;
      this.ctx.lineWidth = cellData.stroke.width || 1;
      if (cellData.stroke.dashArray && Array.isArray(cellData.stroke.dashArray)) {
        this.ctx.setLineDash(cellData.stroke.dashArray);
      }
      this.ctx.stroke(path);
      if (cellData.stroke.dashArray) {
        this.ctx.setLineDash([]); // Reset
      }
    }
    
    // Draw labels
    if (cellData.labels && Array.isArray(cellData.labels) && cellData.labels.length > 0) {
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      cellData.labels.forEach(label => {
        if (!label || !label.text) return;
        this.ctx.fillStyle = label.color || '#000';
        this.ctx.font = `${label.fontSize || 12}px sans-serif`;
        this.ctx.fillText(label.text, label.x || 0, label.y || 0);
      });
    }
    
    this.ctx.restore();
  }

  /**
   * Zoom viewport to focus on cell (redraw at new scale)
   * @param {Object} cellBounds - Cell bounds { x, y, width, height }
   * @param {number} zoomScale - Zoom scale factor (default: 2.0)
   */
  zoomToCell(cellBounds, zoomScale = 2.0) {
    if (!cellBounds || !isFinite(cellBounds.x) || !isFinite(cellBounds.y)) {
      console.warn('[Canvas2DRenderer.zoomToCell] Invalid cellBounds');
      return;
    }

    // Calculate center of cell bounds
    const cellCenterX = cellBounds.x + (cellBounds.width || 0) / 2;
    const cellCenterY = cellBounds.y + (cellBounds.height || 0) / 2;

    // Update viewport scale
    this.viewport.scale = zoomScale;

    // Calculate offset to center cell in viewport
    const canvasCenterX = this.canvas.width / 2;
    const canvasCenterY = this.canvas.height / 2;
    this.viewport.offsetX = canvasCenterX - cellCenterX * zoomScale;
    this.viewport.offsetY = canvasCenterY - cellCenterY * zoomScale;

    // Redraw with new viewport
    this.redraw();
  }

  /**
   * Hit-test at screen coordinates
   * @param {number} x - Screen X coordinate
   * @param {number} y - Screen Y coordinate
   * @returns {number|null} Cell index (i) if hit, null otherwise
   */
  hitTest(x, y) {
    if (!isFinite(x) || !isFinite(y)) {
      return null;
    }

    // Convert screen coords to world/viewport coords (inverse transform)
    // screen = world * scale + offset
    // world = (screen - offset) / scale
    const worldX = (x - this.viewport.offsetX) / this.viewport.scale;
    const worldY = (y - this.viewport.offsetY) / this.viewport.scale;
    
    // Test against cached paths (check in reverse order so top-most cell is returned)
    // Path2D cache keys are 'cell-{i}', so we iterate and extract cell index
    const cacheEntries = Array.from(this.pathCache.entries());
    for (let i = cacheEntries.length - 1; i >= 0; i--) {
      const [cacheKey, path] = cacheEntries[i];
      if (this.ctx.isPointInPath(path, worldX, worldY)) {
        // Extract cell index from cache key 'cell-{i}'
        const match = cacheKey.match(/^cell-(\d+)$/);
        if (match) {
          return parseInt(match[1], 10);
        }
        return null;
      }
    }
    return null;
  }

  /**
   * Redraw entire viewport (triggered on zoom/pan/resize)
   * Uses cached renderData from last renderMap() call
   */
  redraw() {
    if (this._renderDataCache) {
      this.renderMap(this._renderDataCache);
    } else {
      // If no cached data, just clear
      this.clear();
    }
  }

  /**
   * Clear the canvas
   */
  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Get or create Path2D from points (cached for reuse)
   * @param {Array<Array<number>>} points - Array of [x, y] points
   * @param {string} cacheKey - Cache key for reuse
   * @returns {Path2D} Path2D object
   */
  getOrCreatePath(points, cacheKey) {
    if (this.pathCache.has(cacheKey)) {
      return this.pathCache.get(cacheKey);
    }
    
    const path = new Path2D();
    if (points.length === 0) return path;
    
    path.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      path.lineTo(points[i][0], points[i][1]);
    }
    path.closePath();
    
    this.pathCache.set(cacheKey, path);
    return path;
  }

  /**
   * Get fill style (color, pattern, or gradient)
   * @param {Object} fill - Fill definition
   * @param {Object} bounds - Cell bounds for gradient calculation
   * @returns {string|CanvasPattern|CanvasGradient} Fill style
   */
  getFillStyle(fill, bounds) {
    if (fill.type === 'color') {
      return fill.color || '#ffffff';
    } else if (fill.type === 'pattern') {
      return this.getOrCreatePattern(fill.pattern);
    } else if (fill.type === 'gradient') {
      return this.getOrCreateGradient(fill.gradient, bounds);
    }
    return '#ffffff'; // Default
  }

  /**
   * Get or create CanvasPattern (cached)
   * @param {Object} patternDef - Pattern definition { type, ... }
   * @returns {CanvasPattern} Pattern object
   */
  getOrCreatePattern(patternDef) {
    const cacheKey = patternDef.type || 'default';
    if (this.patternCache.has(cacheKey)) {
      return this.patternCache.get(cacheKey);
    }
    
    // Stub: Generate simple pattern (full implementation can be added later)
    if (typeof console !== 'undefined' && console.warn) {
      console.warn(`[Canvas2DRenderer] Pattern "${cacheKey}" is stubbed - using default pattern`);
    }
    
    const patternCanvas = document.createElement('canvas');
    patternCanvas.width = 20;
    patternCanvas.height = 20;
    const patternCtx = patternCanvas.getContext('2d');
    patternCtx.fillStyle = '#cccccc';
    patternCtx.fillRect(0, 0, 20, 20);
    
    const pattern = this.ctx.createPattern(patternCanvas, 'repeat');
    if (pattern) {
      this.patternCache.set(cacheKey, pattern);
      return pattern;
    }
    
    // Fallback to solid color if pattern creation fails
    return '#cccccc';
  }

  /**
   * Get or create CanvasGradient (cached per bounds)
   * @param {Object} gradientDef - Gradient definition { type: 'linear', stops: [[0, '#ff0000'], [1, '#0000ff']] }
   * @param {Object} bounds - Cell bounds for gradient calculation
   * @returns {CanvasGradient} Gradient object
   */
  getOrCreateGradient(gradientDef, bounds) {
    // For now, gradients are not cached (bounds-dependent)
    // TODO: Implement gradient caching if needed in Phase 1
    
    if (gradientDef.type === 'linear') {
      const gradient = this.ctx.createLinearGradient(
        bounds.x, bounds.y,
        bounds.x + bounds.width, bounds.y + bounds.height
      );
      if (gradientDef.stops) {
        gradientDef.stops.forEach(([offset, color]) => {
          gradient.addColorStop(offset, color);
        });
      }
      return gradient;
    }
    
    // Default: solid color
    return '#ffffff';
  }
}
