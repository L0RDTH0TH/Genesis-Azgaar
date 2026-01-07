/**
 * Relief icon rendering with SVG symbols (ported from original)
 * Uses varied SVG symbols (mount, hill, trees, etc.) instead of plain circles
 */

import { getCellPolygonPath, pointInPolygon, poissonDiscSampler } from './utils.js';
import { minmax } from '../utils/math.js';

/**
 * Get relief icon symbol ID based on type
 * Ported from original draw-relief-icons.js
 */
function getIcon(type, set = 'simple') {
  if (set === 'simple') {
    // Map to simple variants
    const simpleMap = {
      mountSnow: 'mount',
      vulcan: 'mount',
      coniferSnow: 'conifer',
      cactus: 'dune',
      deadTree: 'dune',
    };
    const simpleType = simpleMap[type] || type;
    return `#relief-${simpleType}-1`;
  }
  // For colored/gray sets, use variants (not implemented yet, fallback to simple)
  return `#relief-${type}-1`;
}

/**
 * Get biome icon based on biome and temperature
 * Ported from original draw-relief-icons.js
 */
function getBiomeIcon(cellIndex, iconTypes, grid, pack) {
  if (!iconTypes || iconTypes.length === 0) return null;
  let type = iconTypes[Math.floor(Math.random() * iconTypes.length)];
  
  // Check temperature for snow variants (if grid available)
  if (grid && pack && pack.cells && pack.cells.g) {
    const gridIndex = pack.cells.g[cellIndex];
    if (gridIndex !== undefined && grid.cells && grid.cells.temp) {
      const temp = grid.cells.temp[gridIndex];
      if (type === 'conifer' && temp < 0) type = 'coniferSnow';
    }
  }
  
  return getIcon(type);
}

/**
 * Get relief icon (mount/hill) based on height and temperature
 * Ported from original draw-relief-icons.js
 */
function getReliefIcon(cellIndex, height, grid, pack, mod) {
  let type;
  let size;
  
  // Check temperature for snow variants (if grid available)
  let temp = 0;
  if (grid && pack && pack.cells && pack.cells.g) {
    const gridIndex = pack.cells.g[cellIndex];
    if (gridIndex !== undefined && grid.cells && grid.cells.temp) {
      temp = grid.cells.temp[gridIndex];
    }
  }
  
  if (height > 70 && temp < 0) {
    type = 'mountSnow';
  } else if (height > 70) {
    type = 'mount';
  } else {
    type = 'hill';
  }
  
  size = height > 70 ? (height - 45) * mod : minmax((height - 40) * mod, 3, 6);
  
  return [getIcon(type), size];
}

/**
 * Get relief icon symbol definitions (SVG <defs>)
 * Ported from original index.html
 */
export function getReliefIconDefs() {
  return `
<defs>
  <g id="defs-relief">
    <symbol id="relief-mount-1" viewBox="0 0 100 100">
      <path d="m3,69 16,-12 31,-32 15,20 30,24" fill="#fff" stroke="#5c5c70" stroke-width="1" />
      <path d="m3,69 16,-12 31,-32 -14,44" fill="#999999" />
      <path d="m3,71 h92 m-83,3 h83" stroke="#5c5c70" stroke-dasharray="7, 11" stroke-width="1" />
    </symbol>
    <symbol id="relief-hill-1" viewBox="0 0 100 100">
      <path d="m20,55 q30,-28 60,0" fill="#999999" stroke="#5c5c70" />
      <path d="m38,55 q13,-24 40,0" fill="#fff" />
      <path d="m20,58 h70 m-62,3 h50" stroke="#5c5c70" stroke-dasharray="7, 11" stroke-width="1" />
    </symbol>
    <symbol id="relief-deciduous-1" viewBox="0 0 100 100">
      <path d="m49.5,52 v7 h1 v-7 h-0.5 q13,-7 0,-16 q-13,9 0,16" fill="#fff" stroke="#5c5c70" />
      <path d="M 50,51.5 C 44,49 40,43 50,36.5" fill="#999999" />
    </symbol>
    <symbol id="relief-conifer-1" viewBox="0 0 100 100">
      <path d="m49.5,55 v4 h1 v-4 l4.5,0 -4,-8 l3.5,0 -4.5,-9 -4,9 3,0 -3.5,8 7,0" fill="#fff" stroke="#5c5c70" />
      <path d="m 46,54.5 3.5,-8 H 46.6 L 50,39 v 15.5 z" fill="#999999" />
    </symbol>
    <symbol id="relief-acacia-1" viewBox="0 0 100 100">
      <path d="m34.5 44.5 c 1.8, -3 8.1, -5.7 12.6, -5.4 6, -2.2 9.3, -0.9 11.9, 1.3 1.7, 0.2 3.2,-0.3 5.2, 2.2 2.7, 1.2 3.7, 2.4 2.7, 3.7 -1.6, 0.3 -2.2, 0 -4.7, -1.6 -5.2, 0.1 -7, 0.7 -8.7, -0.9 -2.8, 1 -3.6, 0 -9.7, 0.2 -4.6, 0 -8, 1.6 -9.3, 0.4 z" fill="#fff" />
      <path d="m52 38 c-2.3 -0.1 -4.3 1.1 -4.9 1.1 -2.2 -0.2 -5 0.2 -6.4 1 -1.3 0.7 -2.8 1.6 -3.7 2.1 -1 0.6 -3.4 1.8 -2.2 2.7 1.1 0.9 3.1 -0.2 4.2 0.3 1.4 0.8 2.9 1 4.5 0.9 1.1 -0.1 2.2 -0.4 2.4 1 0.3 1.9 1.1 3.5 2.1 5.1 0.8 2.4 1 2.8 1 6.8 l2 0 c 0 -1.1 -0.1 -4 1.2 -5.7 1.1 -1.4 1.4 -3.4 3 -4.4 0.9 -1.4 2 -2.6 3.8 -2.7 1.7 -0.3 3.8 0.8 5.1 0.3 0.9 -0.1 3.2 1 3.5 -1 0.1 -2 -2.2 -2.1 -3.2 -3.3 -1.1 -1.5 -3.3 -1.9 -4.9 -1.8 -1 -0.5 -2 -2.5 -7.3 -2.5 z" fill="#5c5c70" />
      <path d="m47 42.33 c2 0.1 4.1 0.5 6.1 -0.3 1.4 -0.3 2.6 0.8 3.6 1.6 0.7 0.4 2.5 0.7 2.7 1.2 -2.2 -0.1 -3.6 0.4 -4.8 -0.4 -1 -0.7 -2.2 -0.3 -3 -0.2 -0.9 0.1 -3 -0.4 -5.5 -0.2 -2.6 0.2 -5.1 -0.1 -7.2 0.5 -3.6 0.6 -3.7 0 -3.7 0 2.2 -2 9.1 -1.7 11.9 -2.2 z" fill="#999999" />
    </symbol>
    <symbol id="relief-palm-1" viewBox="0 0 100 100">
      <path d="m 48.1,55.5 2.1,0 c 0,0 1.3,-5.5 1.2,-8.6 0,-3.2 -1.1,-5.5 -1.1,-5.5 l -0.5,-0.4 -0.2,0.1 c 0,0 0.9,2.7 0.5,6.2 -0.5,3.8 -2.1,8.2 -2.1,8.2 z" fill="#5c5c70" />
      <path d="m 54.9,48.8 c 0,0 1.9,-2.5 0.3,-5.4 -1.4,-2.6 -4.3,-3.2 -4.3,-3.2 0,0 1.6,-0.6 3.3,-0.3 1.7,0.3 4.1,2.5 4.1,2.5 0,0 -0.6,-3.6 -3.6,-4.4 -2.2,-0.6 -4.2,1.3 -4.2,1.3 0,0 0.3,-1.5 -0.2,-2.9 -0.6,-1.4 -2.6,-1.9 -2.6,-1.9 0,0 0.8,1.1 1.2,2.2 0.3,0.9 0.3,2 0.3,2 0,0 -1.3,-1.8 -3.7,-1.5 -2.5,0.2 -3.7,2.5 -3.7,2.5 0,0 2.3,-0.6 3.4,-0.6 1.1,0.1 2.6,0.8 2.6,0.8 l -0.4,0.2 c 0,0 -1.2,-0.4 -2.7,0.4 -1.9,1.1 -2.9,3.7 -2.9,3.7 0,0 1.4,-1.4 2.3,-1.9 0.5,-0.3 1.8,-0.7 1.8,-0.7 0,0 -0.7,1.3 -0.9,3.1 -0.1,2.5 1.1,4.6 1.1,4.6 0,0 0.1,-3.4 1.2,-5.6 1,-1.9 2.3,-2.6 2.3,-2.6 l 0.4,-0.2 c 0,0 1.5,0.7 2.8,2.8 1,1.7 2.3,5 2.3,5 z" fill="#fff" stroke="#5c5c70" stroke-width=".6" />
      <path d="m 47.75,34.61 c 0,0 0.97,1.22 1.22,2.31 0.2,0.89 0.35,2.81 0.35,2.81 0,0 -1.59,-1.5 -3.2,-1.61 -1.82,-0.13 -3.97,1.31 -3.97,1.31 0,0 2.11,-0.49 3.34,-0.47 1.51,0.03 3.33,1.21 3.33,1.21 0,0 -1.7,0.83 -2.57,2.8 -0.88,1.97 -0.34,6.01 -0.34,6.01 0,0 0.04,-2.95 0.94,-4.96 0.8,-1.78 2.11,-2.67 2.44,-2.85 0.66,-0.34 0.49,-1.09 0.49,-1.09 0,0 -0.1,-2.18 -0.52,-3.37 -0.42,-1.21 -1.51,-2.11 -1.51,-2.11 z" fill="#999" />
      <path d="m 42,43.7 c 0,0 1.2,-1.1 1.8,-1.5 0.7,-0.4 2,-0.8 2,-0.8 L 46.5,40.5 c 0,0 -0.8,0 -2.3,0.8 -1.3,0.8 -2.2,2.3 -2.2,2.3 z" fill="#999" />
    </symbol>
    <symbol id="relief-grass-1" viewBox="0 0 100 100">
      <path d="m 49.5,53.1 c 0,-3.4 -2.4,-4.8 -3,-5.4 1,1.8 2.4,3.7 1.8,5.4 z M 51,53.2 C 51.4,49.6 49.6,47.9 48,46.8 c 1.1,1.8 2.8,4.6 1.8,6.5 z M 51.4,51.4 c 0.6,-1.9 1.8,-3.4 3,-4.3 -0.8,0.3 -2.9,1.5 -3.4,2.8 0.2,0.4 0.3,0.8 0.4,1.5 z M 52.9,53.2 c -0.7,-1.9 0.5,-3.3 1.5,-4.4 -1.7,1 -3,2.2 -2.7,4.4 z" fill="#5c5c70" stroke="none" />
    </symbol>
    <symbol id="relief-swamp-1" viewBox="0 0 100 100">
      <path d="m 50,46 v 6 m 0,0 3,-4 m -3,4 -3,-4 m -6,4.5 h 3 m 4,0 h 4 m 4,0 3,0" fill="none" stroke="#5c5c70" stroke-linecap="round" />
    </symbol>
    <symbol id="relief-dune-1" viewBox="0 0 100 100">
      <path d="m 28.7,52.8 c 5,-3.9 10,-8.2 15.8,-8.3 4.5,0 10.8,3.8 15.2,6.5 3.5,2.2 6.8,2 6.8,2" fill="none" stroke="#5c5c70" stroke-width="1.8" />
      <path d="m 44.2,47.6 c -3.2,3.2 3.5,5.7 5.9,7.8" fill="none" stroke="#5c5c70" />
    </symbol>
  </g>
</defs>`;
}

/**
 * Draw relief icons using SVG symbols (ported from original)
 * @param {Object} pack - Pack object
 * @param {Object} biomesData - Biome data with icons information
 * @param {Object} grid - Grid object (for temperature)
 * @param {Object} options - Rendering options {density, size, renderConfig}
 * @param {Object} options.renderConfig - Render configuration for pseudo3D effects
 * @returns {string} SVG elements for relief icons
 */
export function drawReliefIconsSVG(pack, biomesData, grid = null, options = {}) {
  if (!pack.cells || !pack.cells.h || !pack.cells.biome) return '';
  
  const renderConfig = options.renderConfig || {};
  const reliefConfig = renderConfig.layers?.relief || {};
  const baseDensity = options.density || 0.3;
  // Apply density multiplier from config (default 1.2 for increased density)
  const densityMultiplier = reliefConfig.density || 1.0;
  const density = baseDensity * densityMultiplier;
  const size = 2 * (options.size || 1);
  const mod = 0.2 * size; // size modifier
  const heightScaling = reliefConfig.heightScaling !== false; // Default to true
  const relief = [];
  const cells = pack.cells;
  
  // Helper: round number
  const rn = (n, d = 0) => Math.round(n * Math.pow(10, d)) / Math.pow(10, d);
  
  // Calculate average cell size for radius estimation
  let totalArea = 0;
  let cellCount = 0;
  for (const i of cells.i) {
    const polygon = getCellPolygonPath(i, pack);
    if (!polygon || polygon.length < 3) continue;
    const xs = polygon.map(p => p[0]);
    const ys = polygon.map(p => p[1]);
    const area = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    totalArea += area;
    cellCount++;
  }
  const avgCellSize = cellCount > 0 ? Math.sqrt(totalArea / cellCount) : 50;
  const radiusBase = avgCellSize * 0.5; // ~cellSize*0.5 as requested
  
  // High-density biome indices (forests/swamps with icons): 5,6,7,8,9 (forests), 12 (wetland)
  const highDensityBiomes = new Set([5, 6, 7, 8, 9, 12]); // Tropical seasonal, Temperate deciduous, Tropical rainforest, Temperate rainforest, Taiga, Wetland
  
  for (const i of cells.i) {
    const height = cells.h[i];
    if (height < 20) continue; // no icons on water
    if (cells.r && cells.r[i]) continue; // no icons on rivers
    const biome = cells.biome[i];
    
    const polygon = getCellPolygonPath(i, pack);
    if (!polygon || polygon.length < 3) continue;
    
    const xs = polygon.map(p => p[0]);
    const ys = polygon.map(p => p[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    
    // Place biome icons (height < 50) OR relief icons (height >= 50)
    if (height < 50) {
      // Biome icons only on high-density biomes
      if (!highDensityBiomes.has(biome)) continue;
      if (biomesData.iconsDensity[biome] === 0) continue;
      
      // Use original density calculation (matches original)
      const iconsDensity = biomesData.iconsDensity[biome] / 100;
      const radius = 2 / iconsDensity / density;
      if (Math.random() > iconsDensity * 10) continue;
      
      const iconTypes = biomesData.icons[biome] || [];
      if (iconTypes.length === 0) continue;
      
      // Place biome icons
      for (const [cx, cy] of poissonDiscSampler(minX, minY, maxX, maxY, radius)) {
        if (!pointInPolygon([cx, cy], polygon)) continue;
        let h = (4 + Math.random()) * size;
        const icon = getBiomeIcon(i, iconTypes, grid, pack);
        if (!icon) continue;
        if (icon === "#relief-grass-1") h *= 1.2;
        relief.push({i: icon, x: rn(cx - h, 2), y: rn(cy - h, 2), s: rn(h * 2, 2)});
      }
    } else {
      // Relief icons (mount/hill) for height >= 50 (ENABLED - Phase 1 fix)
      const radius = 2 / density;
      const [icon, h] = getReliefIcon(i, height, grid, pack, mod);
      
      // Height-based scaling: taller mountains get larger icons
      let iconSize = h * 2;
      if (heightScaling) {
        // Scale icon size based on height (50-100 range)
        const heightFactor = (height - 50) / 50; // 0 to 1 for heights 50-100
        iconSize = h * 2 * (1 + heightFactor * 0.5); // 1.0x to 1.5x scaling
      }
      
      // Place relief icons using Poisson sampling (matches original behavior)
      for (const [cx, cy] of poissonDiscSampler(minX, minY, maxX, maxY, radius)) {
        if (!pointInPolygon([cx, cy], polygon)) continue;
        relief.push({i: icon, x: rn(cx - h, 2), y: rn(cy - h, 2), s: rn(iconSize, 2)});
      }
    }
  }
  
  // Sort relief icons by y+size (bottom to top) for proper rendering order
  relief.sort((a, b) => (a.y + a.s) - (b.y + b.s));
  
  // Get pseudo3D config
  const renderConfig = options.renderConfig || {};
  const pseudo3D = renderConfig.effects?.pseudo3D || {};
  const pseudo3DEnabled = pseudo3D.enabled !== false; // Default to enabled if not specified
  
  // Generate SVG elements with pseudo-3D shadows if enabled
  const reliefHTML = relief.map(r => {
    // Add CSS class for styling (e.g., relief-mountain, relief-hill)
    const iconType = r.i.includes('mountain') ? 'relief-mountain' : (r.i.includes('hill') ? 'relief-hill' : 'relief-icon');
    
    if (pseudo3DEnabled) {
      // Apply drop shadow filter for pseudo-3D effect
      const iconElement = `<use href="${r.i}" x="${r.x}" y="${r.y}" width="${r.s}" height="${r.s}" class="${iconType}" filter="url(#dropShadow)"/>`;
      return iconElement;
    }
    
    return `<use href="${r.i}" x="${r.x}" y="${r.y}" width="${r.s}" height="${r.s}" class="${iconType}"/>`;
  });
  
  // Debug logging
  if (typeof console !== 'undefined' && console.log && reliefHTML.length > 0) {
    console.log(`[drawReliefIconsSVG] Generated ${reliefHTML.length} relief icons${pseudo3DEnabled ? ' with pseudo-3D shadows' : ''}`);
  }
  
  return reliefHTML.join('');
}
