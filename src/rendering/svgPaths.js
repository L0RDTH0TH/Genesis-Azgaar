/**
 * =============================================================================
 * svgPaths.js
 * Desc: Reusable SVG path generation functions for dual grids and interactive elements
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

/**
 * Generate SVG path string for a single cell
 * @param {number} cellId - Cell ID
 * @param {Object} pack - Pack object with cells and vertices
 * @returns {string} SVG path string (d="M...L...Z")
 */
export function generateCellPath(cellId, pack) {
  const { cells, vertices } = pack;
  
  if (!cells || !cells.v || !cells.v[cellId] || !vertices || !vertices.p) {
    return '';
  }
  
  const vertexIds = cells.v[cellId];
  if (!vertexIds || vertexIds.length === 0) {
    return '';
  }
  
  const points = vertexIds
    .map(vId => vertices.p[vId])
    .filter(p => p && p.length === 2);
  
  if (points.length < 3) {
    return '';
  }
  
  const firstPoint = points[0];
  const restPoints = points.slice(1);
  return `M${firstPoint[0]},${firstPoint[1]} L${restPoints.map(p => `${p[0]},${p[1]}`).join(' ')} Z`;
}

/**
 * Generate SVG path strings for dual grid quads
 * @param {Object} dualGrid - Dual grid data with points and quads
 * @param {Array<{x, y}>} dualGrid.points - Grid points
 * @param {Array} dualGrid.level0Quads - Level 0 quads with verts array
 * @param {Array} dualGrid.level1Quads - Level 1 quads (optional)
 * @returns {Array<{quadId: number, path: string}>} Array of quad paths
 */
export function generateDualGridPaths(dualGrid) {
  if (!dualGrid || !dualGrid.points || !dualGrid.level0Quads) {
    return [];
  }
  
  const { points, level0Quads, level1Quads = [] } = dualGrid;
  const paths = [];
  
  // Generate paths for Level 0 quads
  level0Quads.forEach((quad) => {
    if (!quad.verts || quad.verts.length < 3) return;
    
    const quadPoints = quad.verts
      .map(vId => points[vId])
      .filter(p => p && (p.x !== undefined || p[0] !== undefined));
    
    if (quadPoints.length < 3) return;
    
    // Handle both {x, y} and [x, y] formats
    const normalizedPoints = quadPoints.map(p => 
      p.x !== undefined ? [p.x, p.y] : p
    );
    
    const firstPoint = normalizedPoints[0];
    const restPoints = normalizedPoints.slice(1);
    const path = `M${firstPoint[0]},${firstPoint[1]} L${restPoints.map(p => `${p[0]},${p[1]}`).join(' ')} Z`;
    
    paths.push({
      quadId: quad.i,
      level: 0,
      path,
    });
  });
  
  // Generate paths for Level 1 quads (if present)
  level1Quads.forEach((quad) => {
    if (!quad.verts || quad.verts.length < 3) return;
    
    const quadPoints = quad.verts
      .map(vId => points[vId])
      .filter(p => p && (p.x !== undefined || p[0] !== undefined));
    
    if (quadPoints.length < 3) return;
    
    const normalizedPoints = quadPoints.map(p => 
      p.x !== undefined ? [p.x, p.y] : p
    );
    
    const firstPoint = normalizedPoints[0];
    const restPoints = normalizedPoints.slice(1);
    const path = `M${firstPoint[0]},${firstPoint[1]} L${restPoints.map(p => `${p[0]},${p[1]}`).join(' ')} Z`;
    
    paths.push({
      quadId: quad.i,
      level: 1,
      path,
    });
  });
  
  return paths;
}

/**
 * Generate interactive SVG cell group with data-cell-id attribute
 * @param {number} cellId - Cell ID
 * @param {string} pathString - SVG path string
 * @param {string} fill - Fill color
 * @param {string} stroke - Stroke color (optional)
 * @returns {string} SVG group element with path
 */
export function generateInteractiveCellGroup(cellId, pathString, fill, stroke = 'none') {
  if (!pathString) return '';
  
  const strokeAttr = stroke !== 'none' ? ` stroke="${stroke}"` : '';
  return `<g id="cell-${cellId}" data-cell-id="${cellId}">
    <path d="${pathString}" fill="${fill}"${strokeAttr} />
  </g>`;
}
