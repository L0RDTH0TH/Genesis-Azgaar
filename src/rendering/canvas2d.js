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
    
    // Layer filtering (active layers to render)
    this.activeLayers = options.layers || ['terrain', 'biomes', 'states'];
    
    // Viewport bounds (for clamping)
    this.viewportBounds = null; // Set after first render based on cell bounds

    // Visual quality options
    this.imageSmoothingEnabled = options.imageSmoothingEnabled !== false; // Default true
    this.strokeCrispness = options.strokeCrispness !== false; // Default true
    this.ctx.imageSmoothingEnabled = this.imageSmoothingEnabled;
    
    if (this.strokeCrispness) {
      this.ctx.lineJoin = 'miter'; // Sharper joins
      this.ctx.lineCap = 'butt'; // Sharper caps
      this.ctx.miterLimit = 10;
    }

    // Path2D dirty flags (track if paths need regeneration)
    this.pathDirty = new Set();

    // Temperature range buckets for gradient caching (cold/mild/hot)
    this.temperatureGradientBuckets = new Map(); // bucketKey -> CanvasGradient

    // Label collection for batching
    this._labelBatch = [];
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
    // Error boundary: Handle invalid/empty render data gracefully
    if (!renderData || !renderData.cells || !Array.isArray(renderData.cells)) {
      console.warn('[Canvas2DRenderer.renderMap] Invalid renderData');
      this.clear();
      return;
    }

    // Handle empty map gracefully
    if (renderData.cells.length === 0) {
      this.clear();
      if (typeof console !== 'undefined' && console.log) {
        console.log('[Canvas2DRenderer.renderMap] Empty map - cleared canvas');
      }
      return;
    }

    // Validate extreme zoom levels
    if (this.viewport.scale < 0.01 || this.viewport.scale > 100) {
      console.warn(`[Canvas2DRenderer.renderMap] Extreme zoom level (${this.viewport.scale}) - clamping`);
      this.viewport.scale = Math.max(0.01, Math.min(100, this.viewport.scale));
    }

    // Store for redraw
    this._renderDataCache = renderData;

    // Update active layers from renderData if provided
    if (renderData.activeLayers && Array.isArray(renderData.activeLayers)) {
      this.activeLayers = renderData.activeLayers;
    }

    // Calculate viewport bounds from cell bounds (for clamping)
    if (!this.viewportBounds && renderData.cells.length > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const cell of renderData.cells) {
        if (cell.bounds) {
          minX = Math.min(minX, cell.bounds.x || 0);
          minY = Math.min(minY, cell.bounds.y || 0);
          maxX = Math.max(maxX, (cell.bounds.x || 0) + (cell.bounds.width || 0));
          maxY = Math.max(maxY, (cell.bounds.y || 0) + (cell.bounds.height || 0));
        }
      }
      if (isFinite(minX) && isFinite(minY) && isFinite(maxX) && isFinite(maxY)) {
        this.viewportBounds = { minX, minY, maxX, maxY };
      }
    }

    // Clamp viewport to bounds
    this.clampViewport();

    // Clear canvas
    this.clear();

    // Apply viewport transform
    this.ctx.save();
    this.ctx.translate(this.viewport.offsetX, this.viewport.offsetY);
    this.ctx.scale(this.viewport.scale, this.viewport.scale);

    // Calculate visible world bounds (viewport culling)
    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;
    const scale = this.viewport.scale;
    const offsetX = this.viewport.offsetX;
    const offsetY = this.viewport.offsetY;
    
    // World bounds visible in viewport (inverse transform)
    const worldMinX = -offsetX / scale;
    const worldMinY = -offsetY / scale;
    const worldMaxX = (canvasWidth - offsetX) / scale;
    const worldMaxY = (canvasHeight - offsetY) / scale;

    // Collect labels for batching (drawn after all cells)
    this._labelBatch = [];

    // Render all cells (filtered by layer and viewport culling)
    for (const cell of renderData.cells) {
      try {
        if (!cell || !cell.path || cell.path.length < 3) continue;
        
        // Layer filtering: skip if cell layer is not in activeLayers
        if (cell.layer && !this.activeLayers.includes(cell.layer)) {
          continue;
        }

        // Viewport culling: skip cells outside visible area (optimization)
        if (cell.bounds) {
          const cellRight = (cell.bounds.x || 0) + (cell.bounds.width || 0);
          const cellBottom = (cell.bounds.y || 0) + (cell.bounds.height || 0);
          if (cellRight < worldMinX || (cell.bounds.x || 0) > worldMaxX ||
              cellBottom < worldMinY || (cell.bounds.y || 0) > worldMaxY) {
            continue; // Cell is outside viewport
          }
        }

        // Create or reuse Path2D (only regenerate if dirty)
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

        // Collect labels for batching (drawn after all cells)
        if (cell.labels && Array.isArray(cell.labels) && cell.labels.length > 0) {
          this._labelBatch.push(...cell.labels.map(label => ({ ...label, cellId: cell.i })));
        }
      } catch (error) {
        // Error boundary: log rendering errors without crashing
        if (typeof console !== 'undefined' && console.error) {
          console.error(`[Canvas2DRenderer.renderMap] Error rendering cell ${cell?.i}:`, error);
        }
        continue; // Skip problematic cell
      }
    }

    // Draw all labels in batch (sorted by importance: capitals first, then by size)
    if (this._labelBatch.length > 0) {
      this._labelBatch.sort((a, b) => {
        // Sort by font size (larger first), then by cell ID for consistency
        const sizeA = a.fontSize || 12;
        const sizeB = b.fontSize || 12;
        if (sizeA !== sizeB) return sizeB - sizeA;
        return (a.cellId || 0) - (b.cellId || 0);
      });
      this.drawLabels(this._labelBatch, scale);
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
   * @param {boolean} smooth - Whether to animate zoom (default: false)
   */
  zoomToCell(cellBounds, zoomScale = 2.0, smooth = false) {
    if (!cellBounds || !isFinite(cellBounds.x) || !isFinite(cellBounds.y)) {
      console.warn('[Canvas2DRenderer.zoomToCell] Invalid cellBounds');
      return;
    }

    // Calculate center of cell bounds
    const cellCenterX = cellBounds.x + (cellBounds.width || 0) / 2;
    const cellCenterY = cellBounds.y + (cellBounds.height || 0) / 2;

    // Target viewport state
    const targetScale = Math.max(0.1, Math.min(10, zoomScale));
    const canvasCenterX = this.canvas.width / 2;
    const canvasCenterY = this.canvas.height / 2;
    const targetOffsetX = canvasCenterX - cellCenterX * targetScale;
    const targetOffsetY = canvasCenterY - cellCenterY * targetScale;

    if (smooth && typeof requestAnimationFrame !== 'undefined') {
      // Smooth zoom animation
      const startScale = this.viewport.scale;
      const startOffsetX = this.viewport.offsetX;
      const startOffsetY = this.viewport.offsetY;
      const duration = 300; // ms
      const startTime = performance.now();
      
      const animate = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Easing function (ease-out)
        const eased = 1 - Math.pow(1 - progress, 3);
        
        this.viewport.scale = startScale + (targetScale - startScale) * eased;
        this.viewport.offsetX = startOffsetX + (targetOffsetX - startOffsetX) * eased;
        this.viewport.offsetY = startOffsetY + (targetOffsetY - startOffsetY) * eased;
        
        // Clamp during animation
        this.clampViewport();
        this.redraw();
        
        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      };
      
      requestAnimationFrame(animate);
    } else {
      // Instant zoom
      this.viewport.scale = targetScale;
      this.viewport.offsetX = targetOffsetX;
      this.viewport.offsetY = targetOffsetY;
      this.clampViewport();
      this.redraw();
    }
  }

  /**
   * Clamp viewport to map bounds (prevent panning outside)
   */
  clampViewport() {
    if (!this.viewportBounds) return;

    const { minX, minY, maxX, maxY } = this.viewportBounds;
    const canvasWidth = this.canvas.width;
    const canvasHeight = this.canvas.height;
    const scale = this.viewport.scale;

    // Calculate visible world bounds at current scale
    const worldWidth = canvasWidth / scale;
    const worldHeight = canvasHeight / scale;

    // Clamp offset to keep map within view
    const maxOffsetX = maxX * scale - canvasWidth;
    const minOffsetX = minX * scale;
    const maxOffsetY = maxY * scale - canvasHeight;
    const minOffsetY = minY * scale;

    this.viewport.offsetX = Math.max(minOffsetX, Math.min(maxOffsetX, this.viewport.offsetX));
    this.viewport.offsetY = Math.max(minOffsetY, Math.min(maxOffsetY, this.viewport.offsetY));
  }

  /**
   * Set active layers for filtering
   * @param {Array<string>} layers - Layer names to render (e.g. ['terrain', 'biomes'])
   */
  setActiveLayers(layers) {
    if (Array.isArray(layers)) {
      this.activeLayers = layers;
      this.redraw();
    }
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
   * @param {Object} patternDef - Pattern definition { type, baseColor, density, ... }
   * @returns {CanvasPattern|string} Pattern object or fallback color string
   */
  getOrCreatePattern(patternDef) {
    if (!patternDef || !patternDef.type) {
      return patternDef?.baseColor || patternDef?.color || '#cccccc';
    }
    
    // Cache key includes type and baseColor for pattern variations
    const cacheKey = `${patternDef.type}-${patternDef.baseColor || 'default'}-${patternDef.density || 0.5}`;
    if (this.patternCache.has(cacheKey)) {
      return this.patternCache.get(cacheKey);
    }
    
    // Create pattern canvas based on type
    const patternCanvas = this.createPatternCanvas(patternDef);
    if (!patternCanvas) {
      return patternDef.baseColor || patternDef.color || '#cccccc';
    }
    
    const pattern = this.ctx.createPattern(patternCanvas, 'repeat');
    if (pattern) {
      this.patternCache.set(cacheKey, pattern);
      return pattern;
    }
    
    // Fallback to solid color if pattern creation fails
    return patternDef.baseColor || patternDef.color || '#cccccc';
  }

  /**
   * Create a pattern canvas for rendering
   * @param {Object} patternDef - Pattern definition { type, baseColor, density, ... }
   * @returns {HTMLCanvasElement|null} Pattern canvas or null if failed
   */
  createPatternCanvas(patternDef) {
    const { type, baseColor = '#cccccc', density = 0.5 } = patternDef;
    const size = 24; // Pattern tile size
    
    const patternCanvas = document.createElement('canvas');
    patternCanvas.width = size;
    patternCanvas.height = size;
    const ctx = patternCanvas.getContext('2d');
    
    if (!ctx) return null;
    
    // Fill base color
    ctx.fillStyle = baseColor;
    ctx.fillRect(0, 0, size, size);
    
    try {
      switch (type) {
        case 'desert':
          // Desert pattern: sparse dots/vegetation (deterministic via hash)
          ctx.fillStyle = this.darkenColor(baseColor, 0.15);
          const dotCount = Math.floor(4 * density);
          const patternSeed = this.hash(`${type}-${baseColor}-${density}`);
          for (let i = 0; i < dotCount; i++) {
            // Use hash-based deterministic random positions
            const hash1 = this.hash(`${patternSeed}-${i}-x`);
            const hash2 = this.hash(`${patternSeed}-${i}-y`);
            const x = (hash1 * size) | 0;
            const y = (hash2 * size) | 0;
            ctx.beginPath();
            ctx.arc(x, y, 1.5, 0, Math.PI * 2);
            ctx.fill();
          }
          // Add wavy lines (dunes)
          ctx.strokeStyle = this.darkenColor(baseColor, 0.1);
          ctx.lineWidth = 0.5;
          for (let y = 0; y < size; y += 4) {
            ctx.beginPath();
            ctx.moveTo(0, y + Math.sin((y / size) * Math.PI * 2) * 1);
            ctx.lineTo(size, y + Math.sin((y / size) * Math.PI * 2) * 1);
            ctx.stroke();
          }
          break;
          
        case 'deciduous':
          // Deciduous forest: tree canopy circles (deterministic via hash)
          ctx.fillStyle = this.darkenColor(baseColor, 0.2);
          const treeCount = Math.floor(6 * density);
          const deciduousSeed = this.hash(`${type}-${baseColor}-${density}`);
          for (let i = 0; i < treeCount; i++) {
            const hash1 = this.hash(`${deciduousSeed}-${i}-x`);
            const hash2 = this.hash(`${deciduousSeed}-${i}-y`);
            const hash3 = this.hash(`${deciduousSeed}-${i}-r`);
            const x = (hash1 * size) | 0;
            const y = (hash2 * size) | 0;
            const radius = 2 + hash3 * 2;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
          }
          break;
          
        case 'rainforest':
          // Rainforest: dense overlapping circles (deterministic via hash)
          ctx.fillStyle = this.darkenColor(baseColor, 0.25);
          const forestCount = Math.floor(10 * density);
          const rainforestSeed = this.hash(`${type}-${baseColor}-${density}`);
          for (let i = 0; i < forestCount; i++) {
            const hash1 = this.hash(`${rainforestSeed}-${i}-x`);
            const hash2 = this.hash(`${rainforestSeed}-${i}-y`);
            const hash3 = this.hash(`${rainforestSeed}-${i}-r`);
            const x = (hash1 * size) | 0;
            const y = (hash2 * size) | 0;
            const radius = 2 + hash3 * 3;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
          }
          break;
          
        case 'conifer':
          // Conifer (taiga): triangular tree shapes (deterministic via hash)
          ctx.fillStyle = this.darkenColor(baseColor, 0.2);
          const coniferCount = Math.floor(8 * density);
          const coniferSeed = this.hash(`${type}-${baseColor}-${density}`);
          for (let i = 0; i < coniferCount; i++) {
            const hash1 = this.hash(`${coniferSeed}-${i}-x`);
            const hash2 = this.hash(`${coniferSeed}-${i}-y`);
            const hash3 = this.hash(`${coniferSeed}-${i}-h`);
            const x = (hash1 * size) | 0;
            const y = (hash2 * size) | 0;
            const height = 3 + hash3 * 2;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x - 1.5, y + height);
            ctx.lineTo(x + 1.5, y + height);
            ctx.closePath();
            ctx.fill();
          }
          break;
          
        case 'wetland':
          // Wetland: wavy water lines + sparse dots
          ctx.strokeStyle = this.darkenColor(baseColor, 0.2);
          ctx.lineWidth = 0.8;
          for (let y = 0; y < size; y += 3) {
            ctx.beginPath();
            ctx.moveTo(0, y + Math.sin((y / size) * Math.PI * 4) * 1.5);
            for (let x = 0; x <= size; x += 2) {
              ctx.lineTo(x, y + Math.sin((x / size) * Math.PI * 4) * 1.5);
            }
            ctx.stroke();
          }
          ctx.fillStyle = this.darkenColor(baseColor, 0.15);
          const vegCount = Math.floor(3 * density);
          const wetlandSeed = this.hash(`${type}-${baseColor}-${density}`);
          for (let i = 0; i < vegCount; i++) {
            const hash1 = this.hash(`${wetlandSeed}-${i}-x`);
            const hash2 = this.hash(`${wetlandSeed}-${i}-y`);
            const x = (hash1 * size) | 0;
            const y = (hash2 * size) | 0;
            ctx.beginPath();
            ctx.arc(x, y, 1, 0, Math.PI * 2);
            ctx.fill();
          }
          break;
          
        default:
          // Unknown pattern type - return base color filled canvas
          break;
      }
    } catch (error) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn(`[Canvas2DRenderer] Pattern "${type}" generation failed:`, error);
      }
      // Return base color filled canvas on error
    }
    
    return patternCanvas;
  }

  /**
   * Darken a color by a factor
   * @param {string} color - Hex color string
   * @param {number} factor - Darkening factor (0-1)
   * @returns {string} Darkened hex color
   */
  darkenColor(color, factor) {
    if (!color || typeof color !== 'string' || !color.startsWith('#')) {
      return color;
    }
    
    // Parse hex
    const hex = color.slice(1);
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    
    // Darken
    const newR = Math.max(0, Math.floor(r * (1 - factor)));
    const newG = Math.max(0, Math.floor(g * (1 - factor)));
    const newB = Math.max(0, Math.floor(b * (1 - factor)));
    
    // Convert back to hex
    return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
  }

  /**
   * Get or create CanvasGradient (cached per bounds)
   * @param {Object} gradientDef - Gradient definition { type: 'linear', stops: [[0, '#ff0000'], [1, '#0000ff']] }
   * @param {Object} bounds - Cell bounds for gradient calculation
   * @returns {CanvasGradient} Gradient object
   */
  getOrCreateGradient(gradientDef, bounds) {
    // Cache gradients by temperature range buckets (cold/mild/hot) instead of per-cell
    // This reduces gradient creation overhead while maintaining visual quality
    
    if (gradientDef.type === 'linear' && gradientDef.stops) {
      // Create bucket key from gradient stops (temperature range approximation)
      const stopColors = gradientDef.stops.map(([offset, color]) => color).join('-');
      const bucketKey = `gradient-${gradientDef.type}-${stopColors}`;
      
      // Check if we can reuse a cached gradient (same temperature pattern, different bounds)
      if (this.temperatureGradientBuckets.has(bucketKey)) {
        const cachedGradient = this.temperatureGradientBuckets.get(bucketKey);
        // Note: Canvas gradients are bound to context, so we recreate with same stops but new bounds
        // This is still faster than parsing stops each time
        const gradient = this.ctx.createLinearGradient(
          bounds.x, bounds.y,
          bounds.x + (bounds.width || 100), bounds.y + (bounds.height || 100)
        );
        gradientDef.stops.forEach(([offset, color]) => {
          gradient.addColorStop(offset, color);
        });
        return gradient;
      }
      
      // Create new gradient and cache the bucket key for future reference
      const gradient = this.ctx.createLinearGradient(
        bounds.x, bounds.y,
        bounds.x + (bounds.width || 100), bounds.y + (bounds.height || 100)
      );
      gradientDef.stops.forEach(([offset, color]) => {
        gradient.addColorStop(offset, color);
      });
      
      // Cache bucket key (don't cache gradient itself - it's context-bound)
      this.temperatureGradientBuckets.set(bucketKey, { bounds, stops: gradientDef.stops });
      
      return gradient;
    }
    
    // Default: solid color
    return '#ffffff';
  }

  /**
   * Draw labels with font scaling, outline, and collision avoidance
   * @param {Array} labels - Label array [{ text, x, y, fontSize, color }]
   * @param {number} scale - Current viewport scale
   */
  drawLabels(labels, scale) {
    if (!labels || !Array.isArray(labels) || labels.length === 0) return;
    
    // Scale font size based on zoom (smaller at low zoom, larger at high zoom)
    // At scale 1.0, use original size; at scale < 0.5, reduce; at scale > 2.0, increase
    const fontScaleFactor = Math.max(0.5, Math.min(2.0, scale));
    
    // Collision avoidance: track used positions at low zoom
    const minScaleForLabels = 0.3; // Hide labels below this scale
    const minScaleForCollision = 0.5; // Apply collision avoidance below this scale
    const labelPositions = [];
    
    if (scale < minScaleForLabels) {
      return; // Skip labels at very low zoom
    }
    
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    
    for (const label of labels) {
      if (!label || !label.text) continue;
      
      const baseFontSize = label.fontSize || 12;
      const scaledFontSize = Math.max(6, Math.floor(baseFontSize * fontScaleFactor));
      const x = label.x || 0;
      const y = label.y || 0;
      const color = label.color || '#000';
      
      // Collision avoidance at low zoom
      if (scale < minScaleForCollision) {
        const minDistance = 30; // Minimum pixel distance between labels
        let tooClose = false;
        for (const pos of labelPositions) {
          const dx = (x - pos.x) * scale;
          const dy = (y - pos.y) * scale;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < minDistance) {
            tooClose = true;
            break;
          }
        }
        if (tooClose) continue; // Skip overlapping label
        labelPositions.push({ x, y });
      }
      
      // Draw text with outline/shadow for readability
      this.ctx.font = `${scaledFontSize}px sans-serif`;
      
      // Outline/shadow for better readability (use shadow if outline is too expensive at low zoom)
      if (scale < 0.5) {
        // Use shadow at low zoom (cheaper than stroke)
        this.ctx.shadowColor = '#ffffff';
        this.ctx.shadowBlur = scaledFontSize * 0.2;
        this.ctx.shadowOffsetX = 0;
        this.ctx.shadowOffsetY = 0;
      } else {
        // Use outline at higher zoom (better quality)
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = scaledFontSize * 0.15;
        this.ctx.strokeText(label.text, x, y);
      }
      
      // Fill text
      this.ctx.fillStyle = color;
      this.ctx.fillText(label.text, x, y);
      
      // Reset shadow after drawing
      if (scale < 0.5) {
        this.ctx.shadowColor = 'transparent';
        this.ctx.shadowBlur = 0;
        this.ctx.shadowOffsetX = 0;
        this.ctx.shadowOffsetY = 0;
      }
    }
  }

  /**
   * Simple hash function for deterministic pattern generation
   * @param {string} str - Input string
   * @returns {number} Hash value (0-1)
   */
  hash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash) / 2147483647; // Normalize to 0-1
  }
}
