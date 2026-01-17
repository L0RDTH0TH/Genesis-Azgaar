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
      x: options.viewport?.x || 0,
      y: options.viewport?.y || 0,
      scale: options.viewport?.scale || 1.0,
    };
    
    // Path2D cache for reuse (cellId -> Path2D)
    this.pathCache = new Map();
    
    // Pattern cache (patternId -> CanvasPattern)
    this.patternCache = new Map();
    
    // Gradient cache (gradientId -> CanvasGradient)
    this.gradientCache = new Map();
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
    this.ctx.translate(this.viewport.x, this.viewport.y);
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
   * Render Azgaar cell data as Canvas 2D paths
   * @param {Object} cellData - Cell rendering data
   * @param {Array<Array<number>>} cellData.path - Array of [x, y] points
   * @param {Object} cellData.fill - Fill style { type: 'color'|'pattern'|'gradient', ... }
   * @param {Object} cellData.stroke - Stroke style { color, width, dashArray? }
   * @param {Array} cellData.labels - Text labels [{ text, x, y, fontSize, color }]
   * @param {Object} bounds - Cell bounds { x, y, width, height }
   */
  renderCell(cellData, bounds) {
    if (!cellData || !cellData.path || cellData.path.length < 3) {
      return;
    }
    
    // Create or reuse Path2D
    const path = this.getOrCreatePath(cellData.path, `cell-${cellData.i || 'unknown'}`);
    
    // Apply cell transform
    this.ctx.save();
    this.ctx.translate(bounds.x, bounds.y);
    if (cellData.bounds && cellData.bounds.width && cellData.bounds.height) {
      const scaleX = bounds.width / cellData.bounds.width;
      const scaleY = bounds.height / cellData.bounds.height;
      this.ctx.scale(scaleX, scaleY);
    }
    
    // Set fill style
    if (cellData.fill) {
      this.ctx.fillStyle = this.getFillStyle(cellData.fill, bounds);
      this.ctx.fill(path);
    }
    
    // Set stroke style
    if (cellData.stroke) {
      this.ctx.strokeStyle = cellData.stroke.color || '#333';
      this.ctx.lineWidth = cellData.stroke.width || 1;
      if (cellData.stroke.dashArray) {
        this.ctx.setLineDash(cellData.stroke.dashArray);
      }
      this.ctx.stroke(path);
      if (cellData.stroke.dashArray) {
        this.ctx.setLineDash([]); // Reset
      }
    }
    
    // Draw labels
    if (cellData.labels && cellData.labels.length > 0) {
      cellData.labels.forEach(label => {
        this.ctx.fillStyle = label.color || '#000';
        this.ctx.font = `${label.fontSize || 12}px sans-serif`;
        this.ctx.fillText(label.text || '', label.x || 0, label.y || 0);
      });
    }
    
    this.ctx.restore();
  }

  /**
   * Zoom viewport to focus on cell (redraw at new scale)
   * @param {Object} cellBounds - Cell bounds { x, y, width, height }
   */
  zoomToCell(cellBounds) {
    const zoomScale = 2.0; // Example zoom factor
    this.viewport.scale = zoomScale;
    this.viewport.x = -cellBounds.x * zoomScale + this.canvas.width / 2;
    this.viewport.y = -cellBounds.y * zoomScale + this.canvas.height / 2;
    this.redraw();
  }

  /**
   * Hit-test at screen coordinates
   * @param {number} x - Screen X coordinate
   * @param {number} y - Screen Y coordinate
   * @returns {string|null} Cell ID if hit, null otherwise
   */
  hitTest(x, y) {
    // Convert screen coords to viewport coords
    const viewportX = (x - this.viewport.x) / this.viewport.scale;
    const viewportY = (y - this.viewport.y) / this.viewport.scale;
    
    // Test against cached paths
    for (const [cellId, path] of this.pathCache.entries()) {
      if (this.ctx.isPointInPath(path, viewportX, viewportY)) {
        return cellId;
      }
    }
    return null;
  }

  /**
   * Redraw entire viewport (triggered on zoom/pan/resize)
   */
  redraw() {
    // Subclass should override to redraw all visible cells
    // This is a stub - actual implementation will redraw from stored cell data
    if (this._cellDataCache) {
      this._cellDataCache.forEach((cellData, bounds) => {
        this.renderCell(cellData, bounds);
      });
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
    
    // Stub: Generate pattern image/canvas and create pattern
    // TODO: Implement pattern generation in Phase 1
    const patternCanvas = document.createElement('canvas');
    patternCanvas.width = 20;
    patternCanvas.height = 20;
    const patternCtx = patternCanvas.getContext('2d');
    patternCtx.fillStyle = '#cccccc';
    patternCtx.fillRect(0, 0, 20, 20);
    
    const pattern = this.ctx.createPattern(patternCanvas, 'repeat');
    this.patternCache.set(cacheKey, pattern);
    return pattern;
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
