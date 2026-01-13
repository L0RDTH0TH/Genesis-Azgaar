/**
 * =============================================================================
 * dualGridStates.js
 * Desc: Dual-grid states generation using Stålberg-inspired hex-to-quad algorithm
 * Author: Lordthoth (based on research from Townscaper techniques)
 * =============================================================================
 */

/**
 * Build Stålberg-inspired quad grid from hexagonal base
 * @param {number} hexLayers - Number of hex layers (default: 20)
 * @param {Object} rng - RNG instance for seeded randomness
 * @returns {Object} Dual grid structure with points, level0Quads, level1Quads
 */
export function buildStalbergQuadGrid(hexLayers, rng) {
  // Global points array (will be populated)
  const points = [];
  
  // Helper: Add point and return index
  function addPoint(point) {
    const index = points.length;
    points.push({ x: point.x, y: point.y });
    return index;
  }
  
  // Helper: Calculate midpoint between two points
  function midpoint(p1, p2) {
    return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  }
  
  // Step 1: Generate hexagonal points
  const hexPoints = createHexagonalPoints(hexLayers, rng);
  const hexPointIndices = hexPoints.map(p => addPoint(p));
  
  // Step 2: Triangulate from hex centers (connect to neighbors)
  const triangles = triangulateFromHex(hexPoints, hexPointIndices);
  
  // Step 3: Dissolve edges to form quads (simplified for MVP)
  const quads = dissolveEdgesToQuads(triangles, hexPointIndices, points, rng);
  
  // Step 4: Subdivide remaining triangles
  const allQuads = [];
  for (const shape of quads) {
    if (shape.type === 'triangle') {
      const subQuads = subdivideTriangleIntoThreeQuads(shape, points, addPoint, midpoint);
      allQuads.push(...subQuads);
    } else {
      allQuads.push(shape);
    }
  }
  
  // Step 5: Create Level 0 quads (current quads)
  const level0Quads = allQuads.map((q, i) => ({
    i: i,
    level: 0,
    verts: q.verts,
    center: calculateQuadCenter(q.verts, points),
    parentQuadId: null,
    childQuadIds: [],
    stateId: -1,
    provinceId: -1,
  }));
  
  // Step 6: Subdivide Level 0 quads into Level 1 quads
  const level1Quads = [];
  for (let i = 0; i < level0Quads.length; i++) {
    const parentQuad = level0Quads[i];
    const subQuads = subdivideQuadIntoFour(parentQuad, points, addPoint, midpoint);
    
    parentQuad.childQuadIds = [];
    for (const subQuad of subQuads) {
      const childIndex = level1Quads.length;
      level1Quads.push({
        i: childIndex,
        level: 1,
        verts: subQuad.verts,
        center: calculateQuadCenter(subQuad.verts, points),
        parentQuadId: i,
        childQuadIds: null,
        stateId: -1,
        provinceId: -1,
      });
      parentQuad.childQuadIds.push(childIndex);
    }
  }
  
  return {
    points,
    level0Quads,
    level1Quads,
  };
}

/**
 * Create hexagonal points using axial coordinates
 * @param {number} layers - Number of hex layers
 * @param {Object} rng - RNG instance
 * @returns {Array} Array of {x, y} points
 */
function createHexagonalPoints(layers, rng) {
  const points = [];
  const hexSize = 10; // Size of hex (adjust to fit map scale)
  
  // Center point
  points.push({ x: 0, y: 0 });
  
  // Hex grid math: axial coordinates (q, r)
  for (let q = -layers; q <= layers; q++) {
    const r1 = Math.max(-layers, -q - layers);
    const r2 = Math.min(layers, -q + layers);
    for (let r = r1; r <= r2; r++) {
      if (q === 0 && r === 0) continue; // Skip center (already added)
      
      // Convert axial to pixel coordinates
      const x = (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r) * hexSize;
      const y = (3 / 2 * r) * hexSize;
      points.push({ x, y });
    }
  }
  
  return points;
}

/**
 * Triangulate hex centers by connecting to neighbors
 * Creates triangles from hex connectivity
 * @param {Array} hexPoints - Array of hex center points
 * @param {Array} hexPointIndices - Array of point indices
 * @returns {Array} Array of triangles {type: 'triangle', verts: [i1, i2, i3]}
 */
function triangulateFromHex(hexPoints, hexPointIndices) {
  const triangles = [];
  const hexNeighbors = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]; // Axial directions
  
  // Build hex index map (q, r) -> point index
  const hexMap = new Map();
  hexPoints.forEach((p, i) => {
    // Approximate q, r from pixel coords (inverse of createHexagonalPoints)
    const hexSize = 10;
    const r = Math.round((2 / 3) * p.y / hexSize);
    const q = Math.round((p.x / hexSize - Math.sqrt(3) / 2 * r) / Math.sqrt(3));
    hexMap.set(`${q},${r}`, i);
  });
  
  // Connect each hex to its neighbors (simplified triangulation)
  const edgeSet = new Set();
  for (let i = 0; i < hexPoints.length; i++) {
    const p = hexPoints[i];
    const hexSize = 10;
    const r = Math.round((2 / 3) * p.y / hexSize);
    const q = Math.round((p.x / hexSize - Math.sqrt(3) / 2 * r) / Math.sqrt(3));
    
    // Connect to 2 neighbors to form triangles (avoid duplicates)
    for (let dir = 0; dir < 3; dir++) {
      const [dq1, dr1] = hexNeighbors[dir];
      const [dq2, dr2] = hexNeighbors[(dir + 1) % 6];
      
      const key1 = `${q + dq1},${r + dr1}`;
      const key2 = `${q + dq2},${r + dr2}`;
      
      const n1 = hexMap.get(key1);
      const n2 = hexMap.get(key2);
      
      if (n1 !== undefined && n2 !== undefined) {
        const edgeKey = [i, n1, n2].sort((a, b) => a - b).join(',');
        if (!edgeSet.has(edgeKey)) {
          edgeSet.add(edgeKey);
          triangles.push({
            type: 'triangle',
            verts: [hexPointIndices[i], hexPointIndices[n1], hexPointIndices[n2]],
          });
        }
      }
    }
  }
  
  return triangles;
}

/**
 * Dissolve edges to form quads (simplified MVP version)
 * @param {Array} triangles - Array of triangles
 * @param {Array} hexPointIndices - Hex point indices
 * @param {Array} points - Points array
 * @param {Object} rng - RNG instance
 * @returns {Array} Array of quads and remaining triangles
 */
function dissolveEdgesToQuads(triangles, hexPointIndices, points, rng) {
  // Simplified: Just return triangles for MVP
  // Full implementation would merge adjacent triangles into quads
  return triangles;
}

/**
 * Subdivide triangle into 3 quads
 * @param {Object} triangle - Triangle with verts array
 * @param {Array} points - Points array
 * @param {Function} addPoint - Function to add point and return index
 * @param {Function} midpoint - Function to calculate midpoint
 * @returns {Array} Array of 3 quads
 */
function subdivideTriangleIntoThreeQuads(triangle, points, addPoint, midpoint) {
  const [v0, v1, v2] = triangle.verts;
  const p0 = points[v0];
  const p1 = points[v1];
  const p2 = points[v2];
  
  // Calculate midpoints
  const mid01 = midpoint(p0, p1);
  const mid12 = midpoint(p1, p2);
  const mid20 = midpoint(p2, p0);
  
  // Add midpoints to points array
  const i01 = addPoint(mid01);
  const i12 = addPoint(mid12);
  const i20 = addPoint(mid20);
  
  // Calculate center
  const center = {
    x: (p0.x + p1.x + p2.x) / 3,
    y: (p0.y + p1.y + p2.y) / 3,
  };
  const ic = addPoint(center);
  
  // Create 3 quads
  return [
    { type: 'quad', verts: [v0, i01, ic, i20] },
    { type: 'quad', verts: [i01, v1, i12, ic] },
    { type: 'quad', verts: [ic, i12, v2, i20] },
  ];
}

/**
 * Subdivide quad into 4 sub-quads
 * @param {Object} quad - Quad with verts array
 * @param {Array} points - Points array
 * @param {Function} addPoint - Function to add point and return index
 * @param {Function} midpoint - Function to calculate midpoint
 * @returns {Array} Array of 4 sub-quads
 */
function subdivideQuadIntoFour(quad, points, addPoint, midpoint) {
  const [v0, v1, v2, v3] = quad.verts;
  const p0 = points[v0];
  const p1 = points[v1];
  const p2 = points[v2];
  const p3 = points[v3];
  
  // Calculate midpoints
  const mid01 = midpoint(p0, p1);
  const mid12 = midpoint(p1, p2);
  const mid23 = midpoint(p2, p3);
  const mid30 = midpoint(p3, p0);
  
  // Add midpoints
  const i01 = addPoint(mid01);
  const i12 = addPoint(mid12);
  const i23 = addPoint(mid23);
  const i30 = addPoint(mid30);
  
  // Calculate center
  const center = {
    x: (p0.x + p1.x + p2.x + p3.x) / 4,
    y: (p0.y + p1.y + p2.y + p3.y) / 4,
  };
  const ic = addPoint(center);
  
  // Create 4 sub-quads
  return [
    { type: 'quad', verts: [v0, i01, ic, i30] },
    { type: 'quad', verts: [i01, v1, i12, ic] },
    { type: 'quad', verts: [ic, i12, v2, i23] },
    { type: 'quad', verts: [i30, ic, i23, v3] },
  ];
}

/**
 * Calculate center point of a quad
 * @param {Array} verts - Array of vertex indices
 * @param {Array} points - Points array
 * @returns {Object} Center point {x, y}
 */
function calculateQuadCenter(verts, points) {
  let sumX = 0;
  let sumY = 0;
  for (const v of verts) {
    sumX += points[v].x;
    sumY += points[v].y;
  }
  return {
    x: sumX / verts.length,
    y: sumY / verts.length,
  };
}

/**
 * Build neighbor map for relaxation (for future use)
 * @param {Array} points - Points array
 * @param {Array} quads - Quads array
 * @returns {Map} Map from point index to array of connected point indices
 */
export function buildNeighborMap(points, quads) {
  const neighbors = new Map();
  
  // Initialize neighbors map
  for (let i = 0; i < points.length; i++) {
    neighbors.set(i, []);
  }
  
  // Build connections from quads
  for (const quad of quads) {
    const verts = quad.verts;
    for (let i = 0; i < verts.length; i++) {
      const v0 = verts[i];
      const v1 = verts[(i + 1) % verts.length];
      
      if (!neighbors.get(v0).includes(v1)) {
        neighbors.get(v0).push(v1);
      }
      if (!neighbors.get(v1).includes(v0)) {
        neighbors.get(v1).push(v0);
      }
    }
  }
  
  return neighbors;
}
