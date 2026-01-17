/**
 * =============================================================================
 * renderer-interface.js
 * Desc: Abstract renderer interface for Canvas-only migration (Option 1 & 3)
 * Author: Lordthoth
 * =============================================================================
 */

/**
 * Abstract Renderer interface
 * Defines the contract for all renderers (Canvas 2D, WebGL/PixiJS)
 */
export class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas - Canvas element to render to
   */
  constructor(canvas) {
    if (this.constructor === Renderer) {
      throw new Error('Renderer is abstract and cannot be instantiated directly');
    }
    this.canvas = canvas;
  }

  /**
   * Render dual-grid wireframe (blue quads + red survivors)
   * @param {Object} gridData - Dual grid data { points, level0Quads, survivors }
   * @abstract
   */
  renderGrid(gridData) {
    throw new Error('renderGrid() must be implemented by subclass');
  }

  /**
   * Render Azgaar cell data (terrain, biomes, states, etc.)
   * @param {Object} cellData - Cell rendering data (paths, fills, strokes, etc.)
   * @param {Object} bounds - Cell bounds { x, y, width, height }
   * @abstract
   */
  renderCell(cellData, bounds) {
    throw new Error('renderCell() must be implemented by subclass');
  }

  /**
   * Zoom viewport to focus on cell (modal-equivalent behavior)
   * @param {Object} cellBounds - Cell bounds to zoom to { x, y, width, height }
   * @abstract
   */
  zoomToCell(cellBounds) {
    throw new Error('zoomToCell() must be implemented by subclass');
  }

  /**
   * Hit-test at screen coordinates (for click/double-click detection)
   * @param {number} x - Screen X coordinate
   * @param {number} y - Screen Y coordinate
   * @returns {string|null} Cell ID if hit, null otherwise
   * @abstract
   */
  hitTest(x, y) {
    throw new Error('hitTest() must be implemented by subclass');
  }

  /**
   * Redraw entire viewport (triggered on zoom/pan/resize)
   * @abstract
   */
  redraw() {
    throw new Error('redraw() must be implemented by subclass');
  }

  /**
   * Clear the canvas
   * @abstract
   */
  clear() {
    throw new Error('clear() must be implemented by subclass');
  }
}
