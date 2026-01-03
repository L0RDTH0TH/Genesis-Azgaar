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
  try {
    const { cells, vertices } = pack;
    
    // Check if vertex graph is available (required for isoline rendering)
    if (!vertices || !vertices.c || !Array.isArray(vertices.c) || vertices.c.length === 0) {
      // Return empty isolines to trigger polygon fallback
      return {};
    }
    
    // Additional safety check: verify cells.v contains vertex indices (numbers), not polygon coordinates
    if (cells.v && cells.v.length > 0) {
      const firstCellV = cells.v[0];
      if (firstCellV && Array.isArray(firstCellV) && firstCellV.length > 0) {
        // Check if first element is a coordinate array (polygon) or a number (vertex index)
        if (Array.isArray(firstCellV[0])) {
          // This is polygon coordinates, not vertex indices - can't do isoline rendering
          // This should not happen with full vertex graph, but keep for backward compatibility
          return {};
        }
      }
    }
    
    // Verify that vertices.c is properly populated (not sparse)
    // Sample check: verify at least some entries exist
    let validEntries = 0;
    const sampleSize = Math.min(100, vertices.c.length);
    for (let i = 0; i < sampleSize; i++) {
      if (vertices.c[i] && Array.isArray(vertices.c[i]) && vertices.c[i].length > 0) {
        validEntries++;
      }
    }
    // If less than 50% of sample entries are valid, assume sparse array and fall back
    if (validEntries < sampleSize * 0.5) {
      console.warn('getIsolines: vertices.c appears to be sparse, using polygon fallback');
      return {};
    }
    
  const isolines = {};

  // Define addIsoline function inside the try block so it can access isolines
  function addIsoline(type, vertices, vertexChain) {
    if (!isolines[type]) isolines[type] = {};

    if (options.fill) {
      if (!isolines[type].fill) isolines[type].fill = '';
      isolines[type].fill += getFillPath(vertices, vertexChain);
    }

    if (options.waterGap) {
      if (!isolines[type].waterGap) isolines[type].waterGap = '';
      const isLandVertex = (vertexId) => {
        if (vertexId < 0 || vertexId >= vertices.c.length || !vertices.c[vertexId]) return false;
        return vertices.c[vertexId].every((i) => i >= 0 && i < cells.h.length && cells.h[i] >= MIN_LAND_HEIGHT);
      };
      isolines[type].waterGap += getBorderPath(vertices, vertexChain, isLandVertex);
    }

    if (options.halo) {
      if (!isolines[type].halo) isolines[type].halo = '';
      const isBorderVertex = (vertexId) => {
        if (vertexId < 0 || vertexId >= vertices.c.length || !vertices.c[vertexId]) return false;
        return vertices.c[vertexId].some((i) => i >= 0 && i < cells.b.length && cells.b[i]);
      };
      isolines[type].halo += getBorderPath(vertices, vertexChain, isBorderVertex);
    }
  }

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

    // cells.v[cellId] should contain vertex indices for isoline rendering
    const cellVertices = cells.v[cellId];
    if (!cellVertices || !Array.isArray(cellVertices) || cellVertices.length === 0) continue;
    
    // Safety check: filter out invalid vertex indices first
    const validVertices = cellVertices.filter((v) => {
      if (typeof v !== 'number' || v < 0 || v >= vertices.c.length) return false;
      const vertexCells = vertices.c[v];
      return vertexCells && Array.isArray(vertexCells) && vertexCells.length > 0;
    });
    
    if (validVertices.length === 0) continue;
    
    // Find starting vertex with different type neighbor
    // Double-check that vertices.c[v] exists before accessing
    const startingVertex = validVertices.find((v) => {
      if (v < 0 || v >= vertices.c.length || !vertices.c[v] || !Array.isArray(vertices.c[v])) {
        return false;
      }
      const vertexCells = vertices.c[v];
      return vertexCells.some(ofDifferentType);
    });
    
    if (startingVertex === undefined) continue;

    try {
    const vertexChain = connectVertices({
      vertices,
      startingVertex,
      ofSameType,
      addToChecked,
      closeRing: true,
    });
    if (vertexChain.length < 3) continue;

    addIsoline(type, vertices, vertexChain);
    } catch (error) {
      // Skip this isoline if connection fails
      console.warn(`Failed to connect vertices for cell ${cellId}:`, error.message);
      continue;
    }
  }

  return isolines;
  } catch (error) {
    // If anything goes wrong with isoline rendering, return empty to trigger fallback
    console.warn('getIsolines error:', error.message);
    return {};
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
    
    // Safety check: ensure vertices.c[current] exists
    if (!vertices.c[current] || !Array.isArray(vertices.c[current])) {
      break; // Invalid vertex, stop chain
    }
    
    chain.push(current);

    const neibCells = vertices.c[current];
    if (addToChecked && neibCells) {
      neibCells.filter(ofSameType).forEach(addToChecked);
    }

    const [c1, c2, c3] = neibCells?.map(ofSameType) || [false, false, false];
    const [v1, v2, v3] = vertices.v[current] || [null, null, null];

    // Check each potential next vertex to ensure it's valid and has vertices.c entry
    if (v1 !== undefined && v1 !== previous && v1 < vertices.c.length && vertices.c[v1] && c1 !== c2) {
      next = v1;
    } else if (v2 !== undefined && v2 !== previous && v2 < vertices.c.length && vertices.c[v2] && c2 !== c3) {
      next = v2;
    } else if (v3 !== undefined && v3 !== previous && v3 < vertices.c.length && vertices.c[v3] && c1 !== c3) {
      next = v3;
    } else {
      break; // No valid next vertex
    }

    if (next >= vertices.c.length || next === current || !vertices.c[next]) break;
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
    // Safety check: ensure vertexId is valid and vertices.p exists
    if (vertexId < 0 || vertexId >= vertices.p.length || !vertices.p[vertexId]) {
      continue; // Skip invalid vertex
    }
    
    if (discontinue(vertexId)) {
      discontinued = true;
      continue;
    }

    const operation = discontinued ? 'M' : 'L';
    discontinued = false;
    const point = vertices.p[vertexId];
    if (point && point.length >= 2) {
    pathParts.push(`${operation}${point[0]},${point[1]}`);
    }
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

  // Defensive: Wrap entire function in try-catch to handle any errors from cached builds
  try {
    const cells = pack.cells;
    const bodyPaths = [];
    
    // Check if we have vertex graph and vertex indices for isoline rendering
    const hasVertexGraph = pack.vertices && 
                           pack.vertices.c && 
                           Array.isArray(pack.vertices.c) && 
                           pack.vertices.c.length > 0;
    
    const hasVertexIndices = cells.v && cells.v.length > 0 && 
                             cells.v[0] && Array.isArray(cells.v[0]) && 
                             cells.v[0].length > 0 && 
                             typeof cells.v[0][0] === 'number';
    
    // Try isoline rendering first if available
    if (hasVertexGraph && hasVertexIndices) {
      try {
        const isolines = getIsolines(pack, (cellId) => cells.biome[cellId], {
          fill: true,
          waterGap: true,
        });
        
        const hasIsolines = Object.keys(isolines).length > 0;
        if (hasIsolines) {
          Object.entries(isolines).forEach(([index, { fill, waterGap }]) => {
            const biomeIndex = parseInt(index);
            if (biomeIndex >= 0 && biomeIndex < biomesData.color.length) {
              const color = biomesData.color[biomeIndex];
              bodyPaths.push(getGappedFillPaths('biome', fill, waterGap, color, biomeIndex));
            }
          });
          
          // If we got isolines, return them
          if (bodyPaths.length > 0) {
            return bodyPaths.join('');
          }
        }
      } catch (error) {
        console.warn('Biome isoline rendering failed, using polygon fallback:', error.message);
      }
    }
    
    // Fallback: Render polygons directly (polygon fallback)
    // Group cells by biome and render as polygons
    const biomeGroups = {};
    for (let i = 0; i < cells.i.length; i++) {
      const biomeId = cells.biome[i];
      if (biomeId === undefined || biomeId < 0) continue;
      
      if (!biomeGroups[biomeId]) {
        biomeGroups[biomeId] = [];
      }
      
      // Get polygon from cells.vCoords[i] (polygon coordinates) or convert from vertex indices
      let polygon = null;
      
      // Prefer vCoords if available (direct polygon coordinates)
      if (cells.vCoords && cells.vCoords[i] && Array.isArray(cells.vCoords[i]) && cells.vCoords[i].length > 0) {
        polygon = cells.vCoords[i];
      } 
      // Fallback: convert vertex indices to coordinates
      else if (cells.v && cells.v[i] && pack.vertices && pack.vertices.p) {
        const vertexIndices = cells.v[i];
        if (Array.isArray(vertexIndices) && vertexIndices.length > 0) {
          // Check if it's already coordinates (backward compatibility)
          if (Array.isArray(vertexIndices[0]) && vertexIndices[0].length === 2) {
            polygon = vertexIndices;
          } else {
            // Convert vertex indices to coordinates
            polygon = vertexIndices
              .map(vId => {
                if (typeof vId !== 'number' || vId < 0 || !pack.vertices.p || !pack.vertices.p[vId]) return null;
                const vertex = pack.vertices.p[vId];
                if (!Array.isArray(vertex) || vertex.length < 2) return null;
                return vertex;
              })
              .filter(p => p !== null && p !== undefined && Array.isArray(p) && p.length >= 2);
          }
        }
      }
      
      // If still no polygon, skip this cell
      if (!polygon || polygon.length < 3) continue;
    
      if (polygon && polygon.length > 0) {
        // Convert polygon coordinates to SVG path
        const path = polygon.map(([x, y], idx) => 
          idx === 0 ? `M${x},${y}` : `L${x},${y}`
        ).join(' ') + ' Z';
        
        const color = biomeId < biomesData.color.length 
          ? biomesData.color[biomeId] 
          : biomesData.color[0];
        
        biomeGroups[biomeId].push(`<path d="${path}" fill="${color}" stroke="${color}" stroke-width="0.5" opacity="0.7" />`);
      }
    }
    
    // Combine all paths for each biome
    Object.entries(biomeGroups).forEach(([biomeId, paths]) => {
      bodyPaths.push(`<g id="biome-${biomeId}">${paths.join('')}</g>`);
    });

    return bodyPaths.join('');
  } catch (error) {
    // Defensive: If any error occurs (e.g., from cached build calling getIsolines), return empty
    console.error('Error in drawBiomesSVG (possibly from cached build):', error.message);
    console.error('Stack:', error.stack);
    return ''; // Return empty to allow map to render without biomes
  }
}

/**
 * Draw states as SVG paths
 * @param {Object} pack - Pack object
 * @returns {string} SVG paths for states
 */
export function drawStatesSVG(pack) {
  if (!pack.cells || !pack.cells.state || !pack.states) return '';

  // Defensive: Wrap entire function in try-catch to handle any errors from cached builds
  try {
    const { cells, states } = pack;
    const bodyPaths = [];
    
    // Check if we have vertex graph and vertex indices for isoline rendering
    const hasVertexGraph = pack.vertices && 
                           pack.vertices.c && 
                           Array.isArray(pack.vertices.c) && 
                           pack.vertices.c.length > 0;
    
    const hasVertexIndices = cells.v && cells.v.length > 0 && 
                             cells.v[0] && Array.isArray(cells.v[0]) && 
                             cells.v[0].length > 0 && 
                             typeof cells.v[0][0] === 'number';
    
    // Try isoline rendering first if available
    if (hasVertexGraph && hasVertexIndices) {
      try {
        const isolines = getIsolines(pack, (cellId) => cells.state[cellId], {
          fill: true,
          waterGap: true,
        });
        
        const hasIsolines = Object.keys(isolines).length > 0;
        if (hasIsolines) {
          Object.entries(isolines).forEach(([index, { fill, waterGap }]) => {
            const stateIndex = parseInt(index);
            if (stateIndex > 0 && stateIndex < states.length && states[stateIndex]) {
              const color = states[stateIndex].color || '#cccccc';
              bodyPaths.push(getGappedFillPaths('state', fill, waterGap, color, stateIndex));
            }
          });
          
          // If we got isolines, return them
          if (bodyPaths.length > 0) {
            return bodyPaths.join('');
          }
        }
      } catch (error) {
        console.warn('State isoline rendering failed, using polygon fallback:', error.message);
      }
    }
    
    // Fallback: Render polygons directly (polygon fallback)
  // Group cells by state and render as polygons
  const stateGroups = {};
  for (let i = 0; i < cells.i.length; i++) {
    const stateId = cells.state[i];
    if (stateId === undefined || stateId < 0 || !states[stateId]) continue;
    
    if (!stateGroups[stateId]) {
      stateGroups[stateId] = [];
    }
    
    // Get polygon from cells.vCoords[i] or convert from vertex indices
    let polygon = null;
    
    // Prefer vCoords if available
    if (cells.vCoords && cells.vCoords[i] && Array.isArray(cells.vCoords[i]) && cells.vCoords[i].length > 0) {
      polygon = cells.vCoords[i];
    } 
    // Fallback: convert vertex indices to coordinates
    else if (cells.v && cells.v[i] && pack.vertices && pack.vertices.p) {
      const vertexIndices = cells.v[i];
      if (Array.isArray(vertexIndices) && vertexIndices.length > 0) {
        if (Array.isArray(vertexIndices[0]) && vertexIndices[0].length === 2) {
          polygon = vertexIndices;
        } else {
          polygon = vertexIndices.map(vId => pack.vertices.p[vId]).filter(p => p !== undefined);
        }
      }
    }
    
    if (polygon && polygon.length > 0) {
      // Convert polygon coordinates to SVG path
      const path = polygon.map(([x, y], idx) => 
        idx === 0 ? `M${x},${y}` : `L${x},${y}`
      ).join(' ') + ' Z';
      
      const color = states[stateId].color || '#cccccc';
      stateGroups[stateId].push(`<path d="${path}" fill="${color}" stroke="${color}" stroke-width="0.5" opacity="0.6" />`);
    }
  }
  
    // Combine all paths for each state
    Object.entries(stateGroups).forEach(([stateId, paths]) => {
      bodyPaths.push(`<g id="state-${stateId}">${paths.join('')}</g>`);
    });

    return bodyPaths.join('');
  } catch (error) {
    // Defensive: If any error occurs (e.g., from cached build calling getIsolines), return empty
    console.error('Error in drawStatesSVG (possibly from cached build):', error.message);
    console.error('Stack:', error.stack);
    return ''; // Return empty to allow map to render without states
  }
}

/**
 * Draw borders (state and province) as SVG paths
 * @param {Object} pack - Pack object
 * @returns {Object} {stateBorders, provinceBorders} SVG path strings
 */
export function drawBordersSVG(pack) {
  if (!pack.cells || !pack.cells.state) {
    if (typeof console !== 'undefined' && console.log) {
      console.log('[drawBordersSVG] No cells.state, returning empty');
    }
    return { stateBorders: '', provinceBorders: '' };
  }

  const { cells, vertices } = pack;
  
  // Check if vertex graph is available for isoline border rendering
  const hasVertexGraph = vertices && 
                         vertices.c && 
                         Array.isArray(vertices.c) && 
                         vertices.c.length > 0 &&
                         cells.v &&
                         cells.v.length > 0;
  
  // If no vertex graph, use simplified border rendering
  if (!hasVertexGraph) {
    if (typeof console !== 'undefined' && console.log) {
      console.log('[drawBordersSVG] No vertex graph, using simplified rendering');
    }
    return drawBordersSVGSimplified(pack);
  }
  
  const statePath = [];
  const provincePath = [];
  const checked = {};
  
  // Debug: Log state/province data availability
  if (typeof console !== 'undefined' && console.log) {
    const statesCount = pack.states ? pack.states.length : 0;
    const provincesCount = pack.provinces ? pack.provinces.length : 0;
    const uniqueStates = new Set();
    const uniqueProvinces = new Set();
    for (let i = 0; i < Math.min(cells.i.length, 1000); i++) {
      if (cells.state[i] !== undefined) uniqueStates.add(cells.state[i]);
      if (cells.province && cells.province[i] !== undefined) uniqueProvinces.add(cells.province[i]);
    }
    console.log('[drawBordersSVG] Border data:', {
      statesCount,
      provincesCount,
      uniqueStatesInSample: uniqueStates.size,
      uniqueProvincesInSample: uniqueProvinces.size,
      hasVertexGraph,
    });
  }

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
    const cellVertices = cells.v[fromCell];
    if (!cellVertices || cellVertices.length === 0) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn(`[getBorder] Cell ${fromCell} has no vertices`);
      }
      return null;
    }
    
    const startingVertex = cellVertices.find((v) => {
      if (typeof v !== 'number' || v < 0 || v >= vertices.c.length || !vertices.c[v] || !Array.isArray(vertices.c[v])) {
        return false;
      }
      return vertices.c[v].some((i) => isLand(i) && isTypeTo(i));
    });
    if (startingVertex === undefined) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn(`[getBorder] No starting vertex found for ${type} border from cell ${fromCell} to ${toCell}`);
      }
      return null;
    }

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
        
        // Safety check: ensure vertices.c[current] exists
        if (current < 0 || current >= vertices.c.length || !vertices.c[current] || !Array.isArray(vertices.c[current])) {
          break; // Invalid vertex, stop chain
        }
        
        chain.push(current);

        const neibCells = vertices.c[current];
        if (neibCells) neibCells.forEach(addToChecked);

        const [c1, c2, c3] = neibCells?.map(checkCell) || [false, false, false];
        const [v1, v2, v3] = vertices.v[current] || [null, null, null];

        // Check each potential next vertex to ensure it's valid and has vertices.c entry
        if (v1 !== undefined && v1 !== previous && v1 < vertices.c.length && vertices.c[v1] && c1 !== c2) {
          next = v1;
        } else if (v2 !== undefined && v2 !== previous && v2 < vertices.c.length && vertices.c[v2] && c2 !== c3) {
          next = v2;
        } else if (v3 !== undefined && v3 !== previous && v3 < vertices.c.length && vertices.c[v3] && c1 !== c3) {
          next = v3;
        } else {
          break; // No valid next vertex
        }

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
 * Simplified border rendering using polygon edges (fallback when vertex graph unavailable)
 * @param {Object} pack - Pack object
 * @returns {Object} {stateBorders, provinceBorders} SVG path strings
 */
function drawBordersSVGSimplified(pack) {
  const { cells } = pack;
  const statePath = [];
  const provincePath = [];
  const checked = {};
  
  // Debug: Log simplified border rendering
  if (typeof console !== 'undefined' && console.log) {
    console.log('[drawBordersSVGSimplified] Starting simplified border rendering');
  }

  const isLand = (cellId) => cells.h[cellId] >= MIN_LAND_HEIGHT;

  for (let cellId = 0; cellId < cells.i.length; cellId++) {
    if (!cells.state[cellId] || !isLand(cellId)) continue;
    const provinceId = cells.province?.[cellId];
    const stateId = cells.state[cellId];

    // Get polygon for this cell
    let polygon = null;
    if (cells.vCoords && cells.vCoords[cellId]) {
      polygon = cells.vCoords[cellId];
    } else if (cells.v && cells.v[cellId] && pack.vertices && pack.vertices.p) {
      const vertexIndices = cells.v[cellId];
      if (Array.isArray(vertexIndices) && vertexIndices.length > 0) {
        if (Array.isArray(vertexIndices[0]) && vertexIndices[0].length === 2) {
          polygon = vertexIndices;
        } else {
          polygon = vertexIndices.map(vId => pack.vertices.p[vId]).filter(p => p !== undefined);
        }
      }
    }

    if (!polygon || polygon.length < 3) continue;

    // Check neighbors for borders
    const neighbors = cells.c[cellId] || [];
    for (const neibId of neighbors) {
      if (neibId >= cells.i.length || !isLand(neibId)) continue;
      
      const neibStateId = cells.state[neibId];
      const neibProvinceId = cells.province?.[neibId];

      // Province border
      if (provinceId && neibProvinceId && provinceId !== neibProvinceId && stateId === neibStateId) {
        const key = `prov-${Math.min(provinceId, neibProvinceId)}-${Math.max(provinceId, neibProvinceId)}-${cellId}`;
        if (!checked[key]) {
          checked[key] = true;
          // Find shared edge and add to path
          const sharedEdge = findSharedEdge(polygon, neibId, pack);
          if (sharedEdge) {
            provincePath.push(`M${sharedEdge[0][0]},${sharedEdge[0][1]} L${sharedEdge[1][0]},${sharedEdge[1][1]}`);
          }
        }
      }

      // State border
      if (stateId !== neibStateId && stateId > neibStateId) {
        const key = `state-${neibStateId}-${stateId}-${cellId}`;
        if (!checked[key]) {
          checked[key] = true;
          // Find shared edge and add to path
          const sharedEdge = findSharedEdge(polygon, neibId, pack);
          if (sharedEdge) {
            statePath.push(`M${sharedEdge[0][0]},${sharedEdge[0][1]} L${sharedEdge[1][0]},${sharedEdge[1][1]}`);
          }
        }
      }
    }
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
 * Find shared edge between two cells (simplified - finds closest edge)
 * @param {Array<Array<number>>} polygon1 - First cell polygon
 * @param {number} cellId2 - Second cell ID
 * @param {Object} pack - Pack object
 * @returns {Array<Array<number>>|null} Shared edge as [[x1,y1], [x2,y2]] or null
 */
function findSharedEdge(polygon1, cellId2, pack) {
  if (!polygon1 || polygon1.length < 2) return null;
  
  let polygon2 = null;
  if (pack.cells.vCoords && pack.cells.vCoords[cellId2]) {
    polygon2 = pack.cells.vCoords[cellId2];
  } else if (pack.cells.v && pack.cells.v[cellId2] && pack.vertices && pack.vertices.p) {
    const vertexIndices = pack.cells.v[cellId2];
    if (Array.isArray(vertexIndices) && vertexIndices.length > 0) {
      if (Array.isArray(vertexIndices[0]) && vertexIndices[0].length === 2) {
        polygon2 = vertexIndices;
      } else {
        polygon2 = vertexIndices.map(vId => pack.vertices.p[vId]).filter(p => p !== undefined);
      }
    }
  }
  
  if (!polygon2 || polygon2.length < 2) return null;
  
  // Find closest points between polygons (simplified shared edge detection)
  let minDist = Infinity;
  let closestEdge = null;
  
  for (let i = 0; i < polygon1.length; i++) {
    const p1 = polygon1[i];
    const p1Next = polygon1[(i + 1) % polygon1.length];
    
    for (let j = 0; j < polygon2.length; j++) {
      const p2 = polygon2[j];
      const p2Next = polygon2[(j + 1) % polygon2.length];
      
      // Check if edges are close (shared edge)
      const dist1 = Math.sqrt((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2);
      const dist2 = Math.sqrt((p1Next[0] - p2Next[0]) ** 2 + (p1Next[1] - p2Next[1]) ** 2);
      
      if (dist1 < 1 && dist2 < 1) {
        // Found shared edge
        return [[p1[0], p1[1]], [p1Next[0], p1Next[1]]];
      }
      
      // Track closest edge for fallback
      const avgDist = (dist1 + dist2) / 2;
      if (avgDist < minDist) {
        minDist = avgDist;
        closestEdge = [[p1[0], p1[1]], [p1Next[0], p1Next[1]]];
      }
    }
  }
  
  // Return closest edge if no exact match (fallback)
  return minDist < 5 ? closestEdge : null;
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
    const population = burg.population || 0;
    const showLabel = isCapital || population > 500; // Show labels for capitals and larger towns

    burgElements.push(
      `<circle id="burg${burg.i}" cx="${rn(burg.x, 2)}" cy="${rn(burg.y, 2)}" r="${size}" fill="${color}" stroke="#fff" stroke-width="0.5" />`
    );

    // Add arched/curved label for capitals and larger towns
    if (burg.name && showLabel) {
      const labelOffset = isCapital ? size * 2.5 : size * 2;
      const fontSize = isCapital ? 10 : 8;
      const labelY = burg.y - labelOffset;
      
      // Create arched text path for capitals, straight text for towns
      if (isCapital) {
        // Arched text path for capitals (curved along an arc)
        const arcRadius = labelOffset * 0.8;
        const startAngle = -Math.PI / 6; // -30 degrees
        const endAngle = Math.PI / 6; // +30 degrees
        const pathId = `burgLabelPath${burg.i}`;
        
        // Create arc path
        const startX = burg.x + arcRadius * Math.cos(startAngle);
        const startY = burg.y - labelOffset + arcRadius * Math.sin(startAngle);
        const endX = burg.x + arcRadius * Math.cos(endAngle);
        const endY = burg.y - labelOffset + arcRadius * Math.sin(endAngle);
        const midX = burg.x;
        const midY = burg.y - labelOffset - arcRadius * 0.3;
        
        // Use quadratic bezier for smooth arc
        const pathD = `M ${rn(startX, 2)},${rn(startY, 2)} Q ${rn(midX, 2)},${rn(midY, 2)} ${rn(endX, 2)},${rn(endY, 2)}`;
        
        burgElements.push(
          `<defs><path id="${pathId}" d="${pathD}" /></defs>`,
          `<text id="burgLabel${burg.i}"><textPath href="#${pathId}" startOffset="50%" text-anchor="middle" font-size="${fontSize}" font-weight="bold" fill="${color}" stroke="#fff" stroke-width="0.3">${burg.name}</textPath></text>`
        );
      } else {
        // Straight text for towns
        burgElements.push(
          `<text id="burgLabel${burg.i}" x="${rn(burg.x, 2)}" y="${rn(labelY, 2)}" font-size="${fontSize}" text-anchor="middle" fill="${color}" stroke="#fff" stroke-width="0.3">${burg.name}</text>`
        );
      }
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
  let biomesSVG = '';
  try {
    biomesSVG = drawBiomesSVG(pack, biomesData);
  } catch (error) {
    // Defensive: Catch any errors (including from cached builds calling getIsolines)
    console.warn('Biome rendering failed (possibly from cached build), using empty layer:', error.message);
    console.warn('Error stack:', error.stack);
    // Continue with empty biomes - map will still render
    biomesSVG = ''; // Ensure it's empty on error
  }
  // Always add biomes layer (even if empty) to maintain SVG structure
  layers.push(`<g id="biomes" opacity="0.7">${biomesSVG}</g>`);

  // 5. States
  const statesSVG = drawStatesSVG(pack);
  if (statesSVG) {
    layers.push(`<g id="states" opacity="0.5">${statesSVG}</g>`);
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
