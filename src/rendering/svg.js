/**
 * =============================================================================
 * svg.js
 * Desc: SVG vector rendering for Azgaar Genesis Mythos fork
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

import { getDefaultBiomes } from '../core/biomes.js';
import { rn } from '../utils/math.js';

// Style constants from original Azgaar (default.json)
const STYLE_CONSTANTS = {
  oceanBase: '#b4d2f3',
  landBase: '#eef6fb',
  lakeFreshwater: '#a8c8e0',
  lakeSaltwater: '#9bb5d1',
  stateBorderStroke: '#56566d',
  stateBorderWidth: 1,
  stateBorderDashArray: '2',
  provinceBorderStroke: '#56566d',
  provinceBorderWidth: 0.5,
  provinceBorderDashArray: '0 2',
  riverStroke: '#6b93d6',
  riverFill: '#a8c8e0',
  burgCapitalSize: 1,
  burgTownSize: 0.5,
  burgCapitalColor: '#333',
  burgTownColor: '#666',
};

const MIN_LAND_HEIGHT = 20;

/**
 * Get isolines (continuous paths) for cells based on a type function
 * Ported from original pathUtils.js
 * @param {Object} pack - Pack object with cells and vertices
 * @param {Function} getType - Function that returns type for a cell ID
 * @param {Object} options - Options {fill, waterGap, halo}
 * @returns {Object} Isolines object keyed by type
 */
function getIsolines(pack, getType, options = { fill: false, waterGap: false, halo: false }) {
  const { cells, vertices } = pack;
  const isolines = {};

  const checkedCells = new Uint8Array(cells.i.length);
  const addToChecked = (cellId) => (checkedCells[cellId] = 1);
  const isChecked = (cellId) => checkedCells[cellId] === 1;

  for (const cellId of cells.i) {
    if (isChecked(cellId) || !getType(cellId)) continue;
    addToChecked(cellId);

    const type = getType(cellId);
    const ofSameType = (cellId) => getType(cellId) === type;
    const ofDifferentType = (cellId) => getType(cellId) !== type;

    const onborderCell = cells.c[cellId]?.find(ofDifferentType);
    if (onborderCell === undefined) continue;

    // Check if inner lake
    const feature = pack.features?.[cells.f?.[onborderCell]];
    if (feature?.type === 'lake' && feature.shoreline?.every(ofSameType)) continue;

    const startingVertex = cells.v[cellId]?.find((v) =>
      vertices.c[v]?.some(ofDifferentType)
    );
    if (startingVertex === undefined) continue;

    const vertexChain = connectVertices({
      vertices,
      startingVertex,
      ofSameType,
      addToChecked,
      closeRing: true,
    });
    if (vertexChain.length < 3) continue;

    addIsoline(type, vertices, vertexChain);
  }

  return isolines;

  function addIsoline(type, vertices, vertexChain) {
    if (!isolines[type]) isolines[type] = {};

    if (options.fill) {
      if (!isolines[type].fill) isolines[type].fill = '';
      isolines[type].fill += getFillPath(vertices, vertexChain);
    }

    if (options.waterGap) {
      if (!isolines[type].waterGap) isolines[type].waterGap = '';
      const isLandVertex = (vertexId) => vertices.c[vertexId]?.every((i) => cells.h[i] >= MIN_LAND_HEIGHT);
      isolines[type].waterGap += getBorderPath(vertices, vertexChain, isLandVertex);
    }

    if (options.halo) {
      if (!isolines[type].halo) isolines[type].halo = '';
      const isBorderVertex = (vertexId) => vertices.c[vertexId]?.some((i) => cells.b[i]);
      isolines[type].halo += getBorderPath(vertices, vertexChain, isBorderVertex);
    }
  }
}

/**
 * Connect vertices to form a closed chain
 * @param {Object} params - {vertices, startingVertex, ofSameType, addToChecked, closeRing}
 * @returns {Array<number>} Chain of vertex IDs
 */
function connectVertices({ vertices, startingVertex, ofSameType, addToChecked, closeRing }) {
  const MAX_ITERATIONS = vertices.c.length;
  const chain = [];
  let next = startingVertex;

  for (let i = 0; i === 0 || next !== startingVertex; i++) {
    const previous = chain[chain.length - 1];
    const current = next;
    chain.push(current);

    const neibCells = vertices.c[current];
    if (addToChecked && neibCells) {
      neibCells.filter(ofSameType).forEach(addToChecked);
    }

    const [c1, c2, c3] = neibCells?.map(ofSameType) || [false, false, false];
    const [v1, v2, v3] = vertices.v[current] || [null, null, null];

    if (v1 !== undefined && v1 !== previous && c1 !== c2) next = v1;
    else if (v2 !== undefined && v2 !== previous && c2 !== c3) next = v2;
    else if (v3 !== undefined && v3 !== previous && c1 !== c3) next = v3;

    if (next >= vertices.c.length || next === current) break;
    if (i >= MAX_ITERATIONS) break;
  }

  if (closeRing) chain.push(startingVertex);
  return chain;
}

/**
 * Get fill path from vertex chain
 * @param {Object} vertices - Vertices object
 * @param {Array<number>} vertexChain - Chain of vertex IDs
 * @returns {string} SVG path string
 */
function getFillPath(vertices, vertexChain) {
  const points = vertexChain.map((vertexId) => vertices.p[vertexId]);
  if (points.length === 0) return '';
  const firstPoint = points[0];
  const restPoints = points.slice(1);
  return `M${firstPoint[0]},${firstPoint[1]} L${restPoints.map((p) => `${p[0]},${p[1]}`).join(' ')} Z`;
}

/**
 * Get border path with discontinuities
 * @param {Object} vertices - Vertices object
 * @param {Array<number>} vertexChain - Chain of vertex IDs
 * @param {Function} discontinue - Function that returns true to discontinue path
 * @returns {string} SVG path string
 */
function getBorderPath(vertices, vertexChain, discontinue) {
  let discontinued = true;
  const pathParts = [];

  for (const vertexId of vertexChain) {
    if (discontinue(vertexId)) {
      discontinued = true;
      continue;
    }

    const operation = discontinued ? 'M' : 'L';
    discontinued = false;
    const point = vertices.p[vertexId];
    pathParts.push(`${operation}${point[0]},${point[1]}`);
  }

  return pathParts.join(' ').trim();
}

/**
 * Get gapped fill paths for SVG (fill + water gap)
 * @param {string} elementName - Element name prefix
 * @param {string} fill - Fill path
 * @param {string} waterGap - Water gap path
 * @param {string} color - Fill color
 * @param {number|string} index - Element index
 * @returns {string} SVG path elements
 */
function getGappedFillPaths(elementName, fill, waterGap, color, index) {
  let html = '';
  if (fill) {
    html += `<path d="${fill}" fill="${color}" id="${elementName}${index}" />`;
  }
  if (waterGap) {
    html += `<path d="${waterGap}" fill="none" stroke="${color}" stroke-width="3" id="${elementName}-gap${index}" />`;
  }
  return html;
}

/**
 * Draw biomes as SVG paths
 * @param {Object} pack - Pack object
 * @param {Object} biomesData - Biome data with colors
 * @returns {string} SVG paths for biomes
 */
export function drawBiomesSVG(pack, biomesData) {
  if (!pack.cells || !pack.cells.biome) return '';

  const cells = pack.cells;
  const bodyPaths = [];
  const isolines = getIsolines(pack, (cellId) => cells.biome[cellId], {
    fill: true,
    waterGap: true,
  });

  Object.entries(isolines).forEach(([index, { fill, waterGap }]) => {
    const biomeIndex = parseInt(index);
    if (biomeIndex >= 0 && biomeIndex < biomesData.color.length) {
      const color = biomesData.color[biomeIndex];
      bodyPaths.push(getGappedFillPaths('biome', fill, waterGap, color, biomeIndex));
    }
  });

  return bodyPaths.join('');
}

/**
 * Draw states as SVG paths
 * @param {Object} pack - Pack object
 * @returns {string} SVG paths for states
 */
export function drawStatesSVG(pack) {
  if (!pack.cells || !pack.cells.state || !pack.states) return '';

  const { cells, states } = pack;
  const bodyPaths = [];

  const isolines = getIsolines(pack, (cellId) => cells.state[cellId], {
    fill: true,
    waterGap: true,
  });

  Object.entries(isolines).forEach(([index, { fill, waterGap }]) => {
    const stateIndex = parseInt(index);
    if (stateIndex > 0 && stateIndex < states.length && states[stateIndex]) {
      const color = states[stateIndex].color || '#cccccc';
      bodyPaths.push(getGappedFillPaths('state', fill, waterGap, color, stateIndex));
    }
  });

  return bodyPaths.join('');
}

/**
 * Draw borders (state and province) as SVG paths
 * @param {Object} pack - Pack object
 * @returns {Object} {stateBorders, provinceBorders} SVG path strings
 */
export function drawBordersSVG(pack) {
  if (!pack.cells || !pack.cells.state) {
    return { stateBorders: '', provinceBorders: '' };
  }

  const { cells, vertices } = pack;
  const statePath = [];
  const provincePath = [];
  const checked = {};

  const isLand = (cellId) => cells.h[cellId] >= MIN_LAND_HEIGHT;

  for (let cellId = 0; cellId < cells.i.length; cellId++) {
    if (!cells.state[cellId]) continue;
    const provinceId = cells.province?.[cellId];
    const stateId = cells.state[cellId];

    // Province border
    if (provinceId) {
      const provToCell = cells.c[cellId]?.find((neibId) => {
        const neibProvinceId = cells.province?.[neibId];
        return (
          neibProvinceId &&
          provinceId > neibProvinceId &&
          !checked[`prov-${provinceId}-${neibProvinceId}-${cellId}`] &&
          cells.state[neibId] === stateId
        );
      });

      if (provToCell !== undefined) {
        const addToChecked = (cId) => (checked[`prov-${provinceId}-${cells.province[provToCell]}-${cId}`] = true);
        const border = getBorder({ type: 'province', fromCell: cellId, toCell: provToCell, addToChecked });

        if (border) {
          provincePath.push(border);
          continue;
        }
      }
    }

    // State border
    const stateToCell = cells.c[cellId]?.find((neibId) => {
      const neibStateId = cells.state[neibId];
      return (
        isLand(neibId) &&
        stateId > neibStateId &&
        !checked[`state-${stateId}-${neibStateId}-${cellId}`]
      );
    });

    if (stateToCell !== undefined) {
      const addToChecked = (cId) => (checked[`state-${stateId}-${cells.state[stateToCell]}-${cId}`] = true);
      const border = getBorder({ type: 'state', fromCell: cellId, toCell: stateToCell, addToChecked });

      if (border) {
        statePath.push(border);
        continue;
      }
    }
  }

  function getBorder({ type, fromCell, toCell, addToChecked }) {
    const getType = (cellId) => cells[type]?.[cellId];
    const isTypeFrom = (cellId) => cellId < cells.i.length && getType(cellId) === getType(fromCell);
    const isTypeTo = (cellId) => cellId < cells.i.length && getType(cellId) === getType(toCell);

    addToChecked(fromCell);
    const startingVertex = cells.v[fromCell]?.find((v) =>
      vertices.c[v]?.some((i) => isLand(i) && isTypeTo(i))
    );
    if (startingVertex === undefined) return null;

    const checkVertex = (vertex) =>
      vertices.c[vertex]?.some(isTypeFrom) &&
      vertices.c[vertex]?.some((c) => isLand(c) && isTypeTo(c));
    const chain = getVerticesLine({
      vertices,
      startingVertex,
      checkCell: isTypeFrom,
      checkVertex,
      addToChecked,
    });
    if (chain.length > 1) {
      return 'M' + chain.map((vId) => `${vertices.p[vId][0]},${vertices.p[vId][1]}`).join(' ');
    }

    return null;
  }

  function getVerticesLine({ vertices, startingVertex, checkCell, checkVertex, addToChecked }) {
    let chain = [];
    let next = startingVertex;
    const MAX_ITERATIONS = vertices.c.length;

    for (let run = 0; run < 2; run++) {
      chain = [];

      for (let i = 0; i < MAX_ITERATIONS; i++) {
        const previous = chain[chain.length - 1];
        const current = next;
        chain.push(current);

        const neibCells = vertices.c[current];
        if (neibCells) neibCells.forEach(addToChecked);

        const [c1, c2, c3] = neibCells?.map(checkCell) || [false, false, false];
        const [v1, v2, v3] = vertices.v[current] || [null, null, null];

        if (v1 !== undefined && v1 !== previous && c1 !== c2) next = v1;
        else if (v2 !== undefined && v2 !== previous && c2 !== c3) next = v2;
        else if (v3 !== undefined && v3 !== previous && c1 !== c3) next = v3;

        if (next === current || next === startingVertex) {
          if (next === startingVertex) chain.push(startingVertex);
          startingVertex = next;
          break;
        }
      }
    }

    return chain;
  }

  const stateBordersSVG = statePath.length
    ? `<path d="${statePath.join(' ')}" stroke="${STYLE_CONSTANTS.stateBorderStroke}" stroke-width="${STYLE_CONSTANTS.stateBorderWidth}" stroke-dasharray="${STYLE_CONSTANTS.stateBorderDashArray}" fill="none" />`
    : '';

  const provinceBordersSVG = provincePath.length
    ? `<path d="${provincePath.join(' ')}" stroke="${STYLE_CONSTANTS.provinceBorderStroke}" stroke-width="${STYLE_CONSTANTS.provinceBorderWidth}" stroke-dasharray="${STYLE_CONSTANTS.provinceBorderDashArray}" fill="none" />`
    : '';

  return { stateBorders: stateBordersSVG, provinceBorders: provinceBordersSVG };
}

/**
 * Draw rivers as SVG paths
 * @param {Object} pack - Pack object
 * @returns {string} SVG paths for rivers
 */
export function drawRiversSVG(pack) {
  if (!pack.rivers || !Array.isArray(pack.rivers)) return '';

  const riverPaths = pack.rivers
    .map((river) => {
      if (!river.cells || river.cells.length < 2) return null;

      // Get points from cells (simplified - use cell centers)
      const points = river.cells.map((cellId) => {
        if (cellId < 0 || cellId >= pack.cells.p.length) return null;
        return pack.cells.p[cellId];
      }).filter((p) => p !== null);

      if (points.length < 2) return null;

      // Add meandering (simplified version)
      const meanderedPoints = addMeandering(points);
      
      // Create path
      const path = getRiverPath(meanderedPoints, river.widthFactor || 1, river.sourceWidth || 1);
      return `<path id="river${river.i}" d="${path}" fill="${STYLE_CONSTANTS.riverFill}" stroke="${STYLE_CONSTANTS.riverStroke}" stroke-width="0.5" />`;
    })
    .filter((p) => p !== null);

  return riverPaths.join('');
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
 * Get river path from meandered points
 * @param {Array<Array<number>>} points - Meandered points
 * @param {number} widthFactor - Width factor
 * @param {number} startingWidth - Starting width
 * @returns {string} SVG path string
 */
function getRiverPath(points, widthFactor, startingWidth) {
  if (points.length < 2) return '';

  // Simplified: create a smooth curve through points
  let path = `M${points[0][0]},${points[0][1]}`;

  for (let i = 1; i < points.length; i++) {
    if (i === 1) {
      path += ` L${points[i][0]},${points[i][1]}`;
    } else {
      // Use quadratic curves for smoother rivers
      const [x1, y1] = points[i - 1];
      const [x2, y2] = points[i];
      const [x0, y0] = points[i - 2] || points[i - 1];
      const cpX = (x1 + x2) / 2;
      const cpY = (y1 + y2) / 2;
      path += ` Q${cpX},${cpY} ${x2},${y2}`;
    }
  }

  return path;
}

/**
 * Draw burgs (cities/towns) as SVG elements
 * @param {Object} pack - Pack object
 * @returns {string} SVG elements for burgs
 */
export function drawBurgsSVG(pack) {
  if (!pack.burgs || !Array.isArray(pack.burgs)) return '';

  const burgElements = [];

  for (const burg of pack.burgs) {
    if (!burg || burg.removed || !burg.x || !burg.y) continue;

    const isCapital = burg.capital;
    const size = isCapital ? STYLE_CONSTANTS.burgCapitalSize : STYLE_CONSTANTS.burgTownSize;
    const color = isCapital ? STYLE_CONSTANTS.burgCapitalColor : STYLE_CONSTANTS.burgTownColor;

    burgElements.push(
      `<circle id="burg${burg.i}" cx="${rn(burg.x, 2)}" cy="${rn(burg.y, 2)}" r="${size}" fill="${color}" />`
    );

    // Add label if name exists
    if (burg.name) {
      const labelY = burg.y - size * 1.5;
      burgElements.push(
        `<text id="burgLabel${burg.i}" x="${rn(burg.x, 2)}" y="${rn(labelY, 2)}" font-size="${size * 3}" text-anchor="middle" fill="${color}">${burg.name}</text>`
      );
    }
  }

  return burgElements.join('');
}

/**
 * Draw features (lakes, islands) as SVG paths
 * @param {Object} pack - Pack object
 * @returns {string} SVG paths for features
 */
export function drawFeaturesSVG(pack) {
  if (!pack.features || !Array.isArray(pack.features)) return '';

  const featurePaths = [];

  for (const feature of pack.features) {
    if (!feature || feature.type === 'ocean') continue;

    if (feature.vertices && feature.vertices.length > 0 && pack.vertices) {
      const points = feature.vertices
        .map((vId) => pack.vertices.p[vId])
        .filter((p) => p !== undefined);

      if (points.length >= 3) {
        const path = `M${points[0][0]},${points[0][1]} L${points.slice(1).map((p) => `${p[0]},${p[1]}`).join(' ')} Z`;
        const fillColor =
          feature.type === 'lake'
            ? feature.group === 'saltwater'
              ? STYLE_CONSTANTS.lakeSaltwater
              : STYLE_CONSTANTS.lakeFreshwater
            : STYLE_CONSTANTS.landBase;

        featurePaths.push(
          `<path id="feature_${feature.i}" d="${path}" fill="${fillColor}" stroke="${fillColor}" stroke-width="0.5" />`
        );
      }
    }
  }

  return featurePaths.join('');
}

/**
 * Render complete map to SVG string
 * @param {Object} data - Map data {grid, pack, options}
 * @param {Object} options - Rendering options {width, height, container}
 * @returns {string} Complete SVG string
 */
export function renderMapSVG(data, options = {}) {
  if (!data || !data.pack) {
    throw new Error('Map data with pack is required');
  }

  const { pack, options: genOptions } = data;
  const { mapWidth, mapHeight } = genOptions || options;

  const width = options.width || mapWidth || 1000;
  const height = options.height || mapHeight || 600;

  // Get biome data
  const biomesData = getDefaultBiomes();

  // Build SVG layers
  const layers = [];

  // 1. Ocean base
  layers.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="${STYLE_CONSTANTS.oceanBase}" />`);

  // 2. Features (lakes, islands)
  const featuresSVG = drawFeaturesSVG(pack);
  if (featuresSVG) {
    layers.push(`<g id="features">${featuresSVG}</g>`);
  }

  // 3. Landmass base
  layers.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="${STYLE_CONSTANTS.landBase}" />`);

  // 4. Biomes
  const biomesSVG = drawBiomesSVG(pack, biomesData);
  if (biomesSVG) {
    layers.push(`<g id="biomes" opacity="0.7">${biomesSVG}</g>`);
  }

  // 5. States
  const statesSVG = drawStatesSVG(pack);
  if (statesSVG) {
    layers.push(`<g id="states" opacity="0.6">${statesSVG}</g>`);
  }

  // 6. Rivers
  const riversSVG = drawRiversSVG(pack);
  if (riversSVG) {
    layers.push(`<g id="rivers">${riversSVG}</g>`);
  }

  // 7. Borders
  const borders = drawBordersSVG(pack);
  if (borders.stateBorders || borders.provinceBorders) {
    layers.push(`<g id="borders">${borders.stateBorders}${borders.provinceBorders}</g>`);
  }

  // 8. Burgs
  const burgsSVG = drawBurgsSVG(pack);
  if (burgsSVG) {
    layers.push(`<g id="burgs">${burgsSVG}</g>`);
  }

  // Combine into complete SVG
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
${layers.join('\n')}
</svg>`;

  return svg;
}
