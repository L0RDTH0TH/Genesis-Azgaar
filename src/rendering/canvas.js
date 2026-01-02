/**
 * =============================================================================
 * canvas.js
 * Desc: Canvas 2D rendering for Azgaar Genesis Mythos fork
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

import { getCellPolygonPath, drawPolygon } from './utils.js';
import { getDefaultBiomes } from '../core/biomes.js';

// Style constants from original Azgaar (default.json)
const STYLE_CONSTANTS = {
  oceanBase: '#b4d2f3',
  landBase: '#c9b491', // Base land color (warm beige/tan)
  lakeFreshwater: '#a8c8e0',
  lakeSaltwater: '#9bb5d1',
  oceanLayerOpacity: 0.4,
  // Borders
  stateBorderStroke: '#56566d',
  stateBorderWidth: 1,
  stateBorderDashArray: [2, 2], // Canvas uses array format
  provinceBorderStroke: '#56566d',
  provinceBorderWidth: 0.5,
  provinceBorderDashArray: [0, 2], // Canvas uses array format
  // Rivers
  riverStroke: '#6b93d6',
  riverFill: '#a8c8e0',
  riverOpacity: 0.8,
  // Burgs
  burgCapitalSize: 3,
  burgTownSize: 2,
  burgCapitalColor: '#333',
  burgTownColor: '#666',
};

const MIN_LAND_HEIGHT = 20;

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

  // Render layers in order (Phase 5: Full rendering pipeline)
  // 1. Ocean base (fill entire canvas with ocean)
  drawOceans(ctx, { grid, pack, options });

  // 2. Heightmap/terrain shading (ocean depth + land elevation)
  // This must come before biomes/land so that biomes tint on top of elevation shading
  drawHeightmap(ctx, { grid, pack, options }); // Phase 5.3 - full implementation

  // 3. Land polygons with biome coloring (or base land color if no biomes)
  // Biomes are drawn with blending to allow elevation shading to show through
  // Check for vCoords (polygon coordinates) for canvas rendering
  const hasPolygons = pack.cells.vCoords && pack.cells.vCoords.length > 0 && pack.cells.vCoords[0]?.length > 0;
  if (pack.cells.biome && hasPolygons) {
    // Full rendering: use biome colors with blending
    drawBiomes(ctx, { grid, pack, options });
  } else if (hasPolygons) {
    // Polygon rendering without biomes: skip (heightmap already provides base colors)
    // Note: Could add drawLandPolygons here if we want base land color on top of heightmap
  } else {
    // Fallback: circle-based rendering (backward compatibility)
    drawLandmass(ctx, { grid, pack, options });
  }

  // 4. Lakes (on top of land)
  drawLakes(ctx, { grid, pack, options });

  // 5. Rivers (Phase 5.4 - implemented)
  drawRivers(ctx, { grid, pack, options });

  // 6. Borders (Phase 5.4 - implemented)
  drawBorders(ctx, { grid, pack, options });

  // 7. Burgs (Phase 5.4 - implemented)
  drawBurgs(ctx, { grid, pack, options });

  // 8. Texture (optional - can be skipped initially)
  // drawTexture(ctx, { grid, pack, options });
}

/**
 * Draw ocean layers (base fill + depth layers)
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} params - Rendering parameters
 */
function drawOceans(ctx, { grid, pack, options }) {
  const { mapWidth, mapHeight } = options;

  // Draw base ocean fill (entire canvas)
  ctx.fillStyle = STYLE_CONSTANTS.oceanBase;
  ctx.fillRect(0, 0, mapWidth, mapHeight);

  // Note: Ocean depth layers are now handled in drawHeightmap() (Phase 5.3)
}

/**
 * Draw heightmap shading (ocean depth + land elevation) - Phase 5.3
 * Full implementation with ocean depth gradients and land elevation shading
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} params - Rendering parameters
 */
function drawHeightmap(ctx, { grid, pack, options }) {
  if (!pack || !pack.cells || !pack.cells.h || !pack.cells.v) {
    return; // No pack data available
  }

  const { cells } = pack;
  const heights = cells.h;

  if (!heights || heights.length === 0) {
    return;
  }

  // Ocean depth colors: deep to shallow
  const deepOcean = '#2c5282';      // Very deep ocean
  const midOcean = '#4a7bb8';       // Deep ocean
  const shallowOcean = '#b4d2f3';   // Shallow/coastal
  
  // Land elevation colors: lowlands to mountains
  // Lowlands (20-50): warm greens/browns
  const lowland = '#8b7355';        // Warm brown-green
  const lowlandLight = '#a0826d';   // Lighter lowland
  
  // Hills (51-70): desaturated greens
  const hills = '#6b7d5a';          // Desaturated green
  const hillsLight = '#7d8f6a';     // Lighter hills
  
  // Mountains (71-100): gray to white (snow-capped)
  const mountain = '#8b8680';       // Gray mountain
  const mountainSnow = '#d5e7eb';   // Snow-capped peaks
  
  // Draw all cells with height-based coloring
  for (let i = 0; i < heights.length; i++) {
    const height = heights[i];
    const polygon = getCellPolygonPath(i, pack);
    
    if (!polygon || polygon.length < 3) {
      continue;
    }
    
    let fillColor;
    
    if (height < MIN_LAND_HEIGHT) {
      // Ocean depth shading (height 0-19)
      // Interpolate from deep to shallow based on height
      if (height < 7) {
        // Very deep ocean (0-6)
        const ratio = height / 7;
        fillColor = interpolateColor(deepOcean, midOcean, ratio);
      } else {
        // Deep to shallow ocean (7-19)
        const ratio = (height - 7) / (MIN_LAND_HEIGHT - 7);
        fillColor = interpolateColor(midOcean, shallowOcean, ratio);
      }
    } else {
      // Land elevation shading (height 20-100)
      if (height < 50) {
        // Lowlands (20-49): warm browns/greens
        const ratio = (height - MIN_LAND_HEIGHT) / (50 - MIN_LAND_HEIGHT);
        fillColor = interpolateColor(lowland, lowlandLight, ratio);
      } else if (height < 70) {
        // Hills (50-69): desaturated greens
        const ratio = (height - 50) / (70 - 50);
        fillColor = interpolateColor(lowlandLight, hills, ratio);
      } else if (height < 85) {
        // Mountains (70-84): gray
        const ratio = (height - 70) / (85 - 70);
        fillColor = interpolateColor(hills, mountain, ratio);
      } else {
        // High peaks (85-100): gray to white (snow)
        const ratio = (height - 85) / (100 - 85);
        fillColor = interpolateColor(mountain, mountainSnow, ratio);
      }
    }
    
    // Draw the polygon with height-based color
    ctx.fillStyle = fillColor;
    drawPolygon(ctx, polygon);
    ctx.fill();
  }
}

/**
 * Simple color interpolation helper
 * @param {string} color1 - Hex color string (e.g., '#4a7bb8')
 * @param {string} color2 - Hex color string
 * @param {number} ratio - Interpolation ratio (0.0 = color1, 1.0 = color2)
 * @returns {string} Interpolated hex color
 */
function interpolateColor(color1, color2, ratio) {
  // Simple RGB interpolation
  const hex1 = color1.replace('#', '');
  const hex2 = color2.replace('#', '');
  
  const r1 = parseInt(hex1.substr(0, 2), 16);
  const g1 = parseInt(hex1.substr(2, 2), 16);
  const b1 = parseInt(hex1.substr(4, 2), 16);
  
  const r2 = parseInt(hex2.substr(0, 2), 16);
  const g2 = parseInt(hex2.substr(2, 2), 16);
  const b2 = parseInt(hex2.substr(4, 2), 16);
  
  const r = Math.round(r1 + (r2 - r1) * ratio);
  const g = Math.round(g1 + (g2 - g1) * ratio);
  const b = Math.round(b1 + (b2 - b1) * ratio);
  
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
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
  const cells = pack.cells;
  const cellPoints = pack.cells.p;

  // Check if cells.f exists
  if (!cells.f || !cellPoints) {
    return; // No feature data or cell points available
  }

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
 * Draw landmass using Voronoi polygons (Phase 5.2)
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} params - Rendering parameters
 */
function drawLandPolygons(ctx, { grid, pack, options }) {
  if (!pack || !pack.cells || !pack.cells.h || !pack.cells.v) {
    return; // No pack data available
  }

  const { cells } = pack;
  const heights = cells.h;

  if (!heights || heights.length === 0) {
    return;
  }

  // Set base land color
  ctx.fillStyle = STYLE_CONSTANTS.landBase;

  // Draw land cells as filled polygons
  for (let i = 0; i < heights.length; i++) {
    // Only draw if this is a land cell (height >= 20)
    if (heights[i] >= MIN_LAND_HEIGHT) {
      const polygon = getCellPolygonPath(i, pack);
      if (polygon && polygon.length >= 3) {
        // Draw filled polygon
        drawPolygon(ctx, polygon);
        ctx.fill();
      }
    }
  }
}

/**
 * Draw biomes with color coding (Phase 5.2)
 * Biomes are drawn with blending to allow elevation shading to show through
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} params - Rendering parameters
 */
function drawBiomes(ctx, { grid, pack, options }) {
  if (!pack || !pack.cells || !pack.cells.h || !pack.cells.biome || !pack.cells.v) {
    // Fallback to base land polygons if biome data not available
    drawLandPolygons(ctx, { grid, pack, options });
    return;
  }

  const { cells } = pack;
  const heights = cells.h;
  const biomes = cells.biome;

  if (!heights || !biomes || heights.length === 0) {
    return;
  }

  // Get biome color mapping
  const biomesData = getDefaultBiomes();
  const biomeColors = biomesData.color || [];

  // Set global composite operation for blending
  // Use 'multiply' to blend biomes with elevation shading underneath
  const originalComposite = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'multiply'; // Blend biomes with elevation base
  ctx.globalAlpha = 0.7; // Slight transparency to allow elevation to show through

  // Draw land cells with biome colors
  for (let i = 0; i < heights.length; i++) {
    // Only draw if this is a land cell (height >= 20)
    if (heights[i] >= MIN_LAND_HEIGHT) {
      const biomeId = biomes[i];
      const polygon = getCellPolygonPath(i, pack);
      
      if (polygon && polygon.length >= 3) {
        // Get biome color (fallback to base land color if invalid)
        const color = (biomeId >= 0 && biomeId < biomeColors.length) 
          ? biomeColors[biomeId] 
          : STYLE_CONSTANTS.landBase;
        
        ctx.fillStyle = color;
        drawPolygon(ctx, polygon);
        ctx.fill();
      }
    }
  }

  // Restore original composite operation and alpha
  ctx.globalCompositeOperation = originalComposite;
  ctx.globalAlpha = 1.0;
}

/**
 * Draw landmass base fill (DEPRECATED - circle-based fallback)
 * This is a fallback for when polygon data is not available (simplified pack)
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} params - Rendering parameters
 * @deprecated Use drawLandPolygons() or drawBiomes() instead
 */
function drawLandmass(ctx, { grid, pack, options }) {
  if (!grid || !grid.cells || !grid.points) {
    return; // No grid data available
  }

  const { cells, points } = grid;
  const heights = cells.h;

  if (!heights || !points || heights.length === 0) {
    return; // Required data not available
  }

  // Draw land cells (height >= 20) as filled circles on top of ocean
  // This is a fallback approach when polygon vertices are not available
  ctx.fillStyle = STYLE_CONSTANTS.landBase;
  
  // Calculate cell radius for good coverage with overlap
  const cellCount = heights.length;
  const mapArea = options.mapWidth * options.mapHeight;
  const avgCellArea = mapArea / cellCount;
  const cellRadius = Math.sqrt(avgCellArea / Math.PI) * 2.5; // 250% for complete overlap
  
  for (let i = 0; i < heights.length && i < points.length; i++) {
    // Only draw if this is a land cell (height >= 20)
    if (heights[i] >= MIN_LAND_HEIGHT) {
      const [x, y] = points[i];
      if (x !== undefined && y !== undefined && 
          x >= -cellRadius && x <= options.mapWidth + cellRadius &&
          y >= -cellRadius && y <= options.mapHeight + cellRadius) {
        ctx.beginPath();
        ctx.arc(x, y, cellRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

/**
 * Draw rivers as flowing paths (Phase 5.4)
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} params - Rendering parameters
 */
function drawRivers(ctx, { grid, pack, options }) {
  if (!pack.rivers || !Array.isArray(pack.rivers) || pack.rivers.length === 0) {
    return;
  }

  ctx.save();
  ctx.globalAlpha = STYLE_CONSTANTS.riverOpacity;

  for (const river of pack.rivers) {
    if (!river.cells || river.cells.length < 2) continue;

    // Get points from cell centers
    const points = river.cells
      .map((cellId) => {
        if (cellId < 0 || cellId >= pack.cells.p.length) return null;
        return pack.cells.p[cellId];
      })
      .filter((p) => p !== null);

    if (points.length < 2) continue;

    // Add meandering for natural river curves
    const meanderedPoints = addMeandering(points);

    // Draw river path with width based on flow
    const widthFactor = river.widthFactor || 1;
    const baseWidth = (river.sourceWidth || 1) * 2;
    const strokeWidth = baseWidth * widthFactor;

    ctx.strokeStyle = STYLE_CONSTANTS.riverStroke;
    ctx.fillStyle = STYLE_CONSTANTS.riverFill;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Draw river path using quadratic curves for smoothness
    ctx.beginPath();
    ctx.moveTo(meanderedPoints[0][0], meanderedPoints[0][1]);

    for (let i = 1; i < meanderedPoints.length; i++) {
      if (i === 1) {
        ctx.lineTo(meanderedPoints[i][0], meanderedPoints[i][1]);
      } else {
        // Use quadratic curves for smoother rivers
        const [x1, y1] = meanderedPoints[i - 1];
        const [x2, y2] = meanderedPoints[i];
        const [x0, y0] = meanderedPoints[i - 2] || meanderedPoints[i - 1];
        const cpX = (x1 + x2) / 2;
        const cpY = (y1 + y2) / 2;
        ctx.quadraticCurveTo(cpX, cpY, x2, y2);
      }
    }

    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Simplified meandering for rivers
 * @param {Array<Array<number>>} points - Array of [x, y] points
 * @returns {Array<Array<number>>} Meandered points
 */
function addMeandering(points) {
  if (points.length < 2) return points;

  const meandered = [];
  const meanderingAmount = 0.3;

  for (let i = 0; i < points.length; i++) {
    const [x, y] = points[i];
    meandered.push([x, y]);

    if (i < points.length - 1) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[i + 1];
      const dx = x2 - x1;
      const dy = y2 - y1;
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      const perpX = -dy * meanderingAmount;
      const perpY = dx * meanderingAmount;

      meandered.push([midX + perpX, midY + perpY]);
    }
  }

  return meandered;
}

/**
 * Draw borders (state and province) (Phase 5.4)
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} params - Rendering parameters
 */
function drawBorders(ctx, { grid, pack, options }) {
  if (!pack.cells || !pack.cells.state) {
    return;
  }

  const { cells } = pack;

  // Check if we have polygon data for border rendering
  const hasPolygons = pack.cells.vCoords && pack.cells.vCoords.length > 0 && pack.cells.vCoords[0]?.length > 0;

  if (!hasPolygons) {
    // Fallback: can't draw borders without polygon data
    return;
  }

  const checked = {};
  const isLand = (cellId) => cells.h[cellId] >= MIN_LAND_HEIGHT;

  ctx.save();

  // Draw province borders first (thinner, underneath)
  ctx.strokeStyle = STYLE_CONSTANTS.provinceBorderStroke;
  ctx.lineWidth = STYLE_CONSTANTS.provinceBorderWidth;
  ctx.setLineDash(STYLE_CONSTANTS.provinceBorderDashArray);
  ctx.lineCap = 'round';

  for (let cellId = 0; cellId < cells.i.length; cellId++) {
    if (!isLand(cellId) || !cells.state[cellId]) continue;

    const provinceId = cells.province?.[cellId];
    const stateId = cells.state[cellId];
    if (!provinceId) continue;

    const neighbors = cells.c[cellId] || [];
    for (const neibId of neighbors) {
      if (neibId >= cells.i.length || !isLand(neibId)) continue;

      const neibProvinceId = cells.province?.[neibId];
      const neibStateId = cells.state[neibId];

      // Province border (within same state)
      if (
        neibProvinceId &&
        provinceId !== neibProvinceId &&
        stateId === neibStateId
      ) {
        const key = `prov-${Math.min(provinceId, neibProvinceId)}-${Math.max(provinceId, neibProvinceId)}-${cellId}`;
        if (!checked[key]) {
          checked[key] = true;
          const sharedEdge = findSharedEdge(cells.vCoords[cellId], neibId, pack);
          if (sharedEdge) {
            ctx.beginPath();
            ctx.moveTo(sharedEdge[0][0], sharedEdge[0][1]);
            ctx.lineTo(sharedEdge[1][0], sharedEdge[1][1]);
            ctx.stroke();
          }
        }
      }
    }
  }

  // Draw state borders (thicker, on top)
  ctx.strokeStyle = STYLE_CONSTANTS.stateBorderStroke;
  ctx.lineWidth = STYLE_CONSTANTS.stateBorderWidth;
  ctx.setLineDash(STYLE_CONSTANTS.stateBorderDashArray);

  for (let cellId = 0; cellId < cells.i.length; cellId++) {
    if (!isLand(cellId) || !cells.state[cellId]) continue;

    const stateId = cells.state[cellId];
    const neighbors = cells.c[cellId] || [];

    for (const neibId of neighbors) {
      if (neibId >= cells.i.length || !isLand(neibId)) continue;

      const neibStateId = cells.state[neibId];

      // State border
      if (stateId !== neibStateId && stateId > neibStateId) {
        const key = `state-${neibStateId}-${stateId}-${cellId}`;
        if (!checked[key]) {
          checked[key] = true;
          const sharedEdge = findSharedEdge(cells.vCoords[cellId], neibId, pack);
          if (sharedEdge) {
            ctx.beginPath();
            ctx.moveTo(sharedEdge[0][0], sharedEdge[0][1]);
            ctx.lineTo(sharedEdge[1][0], sharedEdge[1][1]);
            ctx.stroke();
          }
        }
      }
    }
  }

  ctx.setLineDash([]); // Reset line dash
  ctx.restore();
}

/**
 * Find shared edge between two cells
 * @param {Array<Array<number>>} polygon1 - First cell polygon coordinates
 * @param {number} cellId2 - Second cell ID
 * @param {Object} pack - Pack object
 * @returns {Array<Array<number>>|null} Shared edge as [[x1,y1], [x2,y2]] or null
 */
function findSharedEdge(polygon1, cellId2, pack) {
  if (!polygon1 || !Array.isArray(polygon1) || polygon1.length === 0) {
    return null;
  }

  const polygon2 = pack.cells.vCoords?.[cellId2];
  if (!polygon2 || !Array.isArray(polygon2) || polygon2.length === 0) {
    return null;
  }

  // Find the closest edge between the two polygons
  let minDist = Infinity;
  let closestEdge = null;

  for (let i = 0; i < polygon1.length; i++) {
    const p1 = polygon1[i];
    const p2 = polygon1[(i + 1) % polygon1.length];

    // Find closest point in polygon2 to the midpoint of this edge
    const midX = (p1[0] + p2[0]) / 2;
    const midY = (p1[1] + p2[1]) / 2;

    for (let j = 0; j < polygon2.length; j++) {
      const q = polygon2[j];
      const dist = Math.sqrt((midX - q[0]) ** 2 + (midY - q[1]) ** 2);

      if (dist < minDist && dist < 5) {
        minDist = dist;
        closestEdge = [p1, p2];
      }
    }
  }

  return minDist < 5 ? closestEdge : null;
}

/**
 * Draw burgs (cities/towns) (Phase 5.4)
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} params - Rendering parameters
 */
function drawBurgs(ctx, { grid, pack, options }) {
  if (!pack.burgs || !Array.isArray(pack.burgs) || pack.burgs.length === 0) {
    return;
  }

  ctx.save();

  for (const burg of pack.burgs) {
    if (!burg || burg.removed || burg.x === undefined || burg.y === undefined) continue;

    const isCapital = burg.capital;
    const size = isCapital ? STYLE_CONSTANTS.burgCapitalSize : STYLE_CONSTANTS.burgTownSize;
    const color = isCapital ? STYLE_CONSTANTS.burgCapitalColor : STYLE_CONSTANTS.burgTownColor;

    // Draw burg circle
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(burg.x, burg.y, size, 0, Math.PI * 2);
    ctx.fill();

    // Draw label if name exists (optional, for major burgs)
    if (burg.name && (isCapital || size >= STYLE_CONSTANTS.burgTownSize * 1.5)) {
      ctx.fillStyle = color;
      ctx.font = `${size * 3}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const labelY = burg.y - size * 1.5;
      ctx.fillText(burg.name, burg.x, labelY);
    }
  }

  ctx.restore();
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
