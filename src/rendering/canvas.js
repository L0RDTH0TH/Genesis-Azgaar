/**
 * =============================================================================
 * canvas.js
 * Desc: Canvas 2D rendering for Azgaar Genesis Mythos fork
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

// Style constants from original Azgaar (default.json)
const STYLE_CONSTANTS = {
  oceanBase: '#b4d2f3',
  landBase: '#eef6fb',
  lakeFreshwater: '#a8c8e0',
  lakeSaltwater: '#9bb5d1',
  oceanLayerOpacity: 0.4,
};

/**
 * Render a complete map to a canvas element
 * @param {HTMLCanvasElement} canvas - Canvas element to render to
 * @param {Object} data - Map data from generateMap()
 * @param {Object} data.grid - Grid object
 * @param {Object} data.pack - Pack object
 * @param {Object} data.options - Generation options
 */
export function renderMap(canvas, data) {
  if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
    throw new Error('Canvas element is required');
  }

  if (!data || !data.grid || !data.pack) {
    throw new Error('Map data with grid and pack is required');
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not get 2D rendering context from canvas');
  }

  const { grid, pack, options } = data;
  const { mapWidth, mapHeight } = options;

  // Set canvas size
  canvas.width = mapWidth;
  canvas.height = mapHeight;

  // Clear canvas
  ctx.clearRect(0, 0, mapWidth, mapHeight);

  // Render layers in order (matching original Azgaar order)
  // 1. Ocean layers (base + depth layers)
  drawOceans(ctx, { grid, pack, options });

  // 2. Lakes
  drawLakes(ctx, { grid, pack, options });

  // 3. Landmass (base land fill)
  drawLandmass(ctx, { grid, pack, options });

  // 4. Texture (optional - can be skipped initially)
  // drawTexture(ctx, { grid, pack, options });

  // Note: Additional layers (heightmap, biomes, borders, etc.) will be added in later iterations
}

/**
 * Draw ocean layers (base fill + depth layers)
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} params - Rendering parameters
 */
function drawOceans(ctx, { grid, pack, options }) {
  const { mapWidth, mapHeight } = options;
  const { cells } = grid;

  // Draw base ocean fill
  ctx.fillStyle = STYLE_CONSTANTS.oceanBase;
  ctx.fillRect(0, 0, mapWidth, mapHeight);

  // Draw ocean depth layers (for cells with height < 20)
  // Simplified: Draw cells that are ocean (cells.t[i] < 0 or cells.h[i] < 20)
  // For now, we'll draw a simple ocean base. Depth layers can be added later
  // when we have proper path generation for ocean contours.

  // TODO: Implement ocean depth layers using connectVertices logic from original
  // This requires:
  // - Iterating cells sorted by height
  // - Finding border cells at each height level
  // - Connecting vertices to form closed paths
  // - Drawing paths with opacity based on depth
}

/**
 * Draw lakes from pack features
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} params - Rendering parameters
 */
function drawLakes(ctx, { grid, pack, options }) {
  if (!pack.features || !pack.cells) {
    return; // No features or cells available
  }

  const features = pack.features;
  const { cells, p: cellPoints } = pack.cells;

  // For each lake feature, draw cells that belong to it
  for (const feature of features) {
    if (!feature || feature.type !== 'lake') {
      continue;
    }

    // Determine lake color based on group
    const lakeGroup = feature.group || 'freshwater';
    ctx.fillStyle =
      lakeGroup === 'saltwater'
        ? STYLE_CONSTANTS.lakeSaltwater
        : STYLE_CONSTANTS.lakeFreshwater;

    // Find all cells belonging to this feature
    // pack.cells.f[i] contains the feature ID for cell i
    // Improved: Draw filled circles for each lake cell (better visual than tiny points)
    for (let i = 0; i < cells.f.length; i++) {
      if (cells.f[i] === feature.i) {
        const [x, y] = cellPoints[i];
        if (x !== undefined && y !== undefined) {
          // Draw larger filled circle for better visibility
          // Size based on cell area if available, otherwise use fixed size
          const radius = cells.area && cells.area[i] ? Math.sqrt(cells.area[i]) * 0.5 : 3;
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  // Note: Full polygon rendering requires cell vertices which are not yet calculated
  // in the simplified pack structure. This will be improved in future phases when
  // full reGraph with refined Voronoi is implemented.
}

/**
 * Draw landmass base fill
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} params - Rendering parameters
 */
function drawLandmass(ctx, { grid, pack, options }) {
  const { mapWidth, mapHeight } = options;

  // Draw base land fill (will be partially covered by ocean/lakes)
  ctx.fillStyle = STYLE_CONSTANTS.landBase;
  ctx.fillRect(0, 0, mapWidth, mapHeight);
}

/**
 * Draw texture overlay (optional)
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} params - Rendering parameters
 */
function drawTexture(ctx, { grid, pack, options }) {
  // TODO: Implement texture overlay
  // This would:
  // 1. Load texture image (e.g., from options.textureUrl)
  // 2. Create pattern
  // 3. Apply with opacity and mask to land only
  // For now, this is optional and can be skipped
}
