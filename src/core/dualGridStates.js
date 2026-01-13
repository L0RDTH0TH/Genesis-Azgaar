/**
 * =============================================================================
 * dualGridStates.js
 * Desc: Dual-grid states generation using Stålberg-inspired hex-to-quad algorithm
 * Author: Lordthoth (based on research from Townscaper techniques)
 * =============================================================================
 */

import { RNG } from '../utils/rng.js';

/**
 * Build Stålberg-inspired quad grid from hexagonal base
 * @param {number} hexLayers - Number of hex layers (default: 20)
 * @param {Object} rng - RNG instance for seeded randomness
 * @param {Object} options - Options object with politicsMode (optional)
 * @returns {Object} Dual grid structure with points, level0Quads, level1Quads
 */
export function buildStalbergQuadGrid(hexLayers, rng, options = {}) {
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
  
  // Step 3: Dissolve edges to form quads (per design v2 section 1)
  const dissolveProbability = options.politicsMode?.dissolveProbability ?? 0.5;
  const quads = dissolveEdgesToQuads(triangles, hexPointIndices, points, rng, dissolveProbability);
  
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
  
  // Step 7: Relaxation (per design v2 section 2)
  // Relax Level 0 quads first
  const relaxationIterations = options.politicsMode?.relaxationIterations ?? 200;
  const dampingFactor = options.politicsMode?.dampingFactor ?? 0.3;
  
  const level0NeighborMap = buildNeighborMap(points, level0Quads);
  relaxGrid(points, level0NeighborMap, relaxationIterations, dampingFactor);
  
  // Update Level 0 quad centers after relaxation
  for (const quad of level0Quads) {
    quad.center = calculateQuadCenter(quad.verts, points);
  }
  
  // Relax Level 1 quads (re-build neighbor map for level 1)
  const level1NeighborMap = buildNeighborMap(points, level1Quads);
  relaxGrid(points, level1NeighborMap, relaxationIterations, dampingFactor);
  
  // Update Level 1 quad centers after relaxation
  for (const quad of level1Quads) {
    quad.center = calculateQuadCenter(quad.verts, points);
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
 * Dissolve edges to form quads (per design v2 section 1)
 * Randomly dissolves internal edges to merge adjacent triangles into quads
 * @param {Array} triangles - Array of triangles (will be modified)
 * @param {Array} hexPointIndices - Hex point indices (unused, kept for compatibility)
 * @param {Array} points - Points array
 * @param {Object} rng - RNG instance for seeded randomness
 * @param {number} dissolveProbability - Probability of attempting dissolution (0.0-1.0, default 0.5)
 * @returns {Array} Array of quads and remaining triangles
 */
function dissolveEdgesToQuads(triangles, hexPointIndices, points, rng, dissolveProbability = 0.5) {
  // Work with a mutable copy of triangles
  const workingTriangles = triangles.map(t => ({ ...t, verts: [...t.verts] }));
  const quads = [];
  const maxAttempts = workingTriangles.length * 3;
  let dissolveCount = 0;
  let attempts = 0;
  
  // Build edge map: edge -> [triangle indices that share this edge]
  // Edge is represented as sorted pair of vertex indices
  function getEdgeKey(v1, v2) {
    return v1 < v2 ? `${v1},${v2}` : `${v2},${v1}`;
  }
  
  // Build initial edge map
  function buildEdgeMap(triangles) {
    const edgeMap = new Map();
    triangles.forEach((tri, triIndex) => {
      const [v0, v1, v2] = tri.verts;
      const edges = [
        getEdgeKey(v0, v1),
        getEdgeKey(v1, v2),
        getEdgeKey(v2, v0),
      ];
      edges.forEach(edgeKey => {
        if (!edgeMap.has(edgeKey)) {
          edgeMap.set(edgeKey, []);
        }
        edgeMap.get(edgeKey).push(triIndex);
      });
    });
    return edgeMap;
  }
  
  // Check if dissolving an edge creates a valid quad
  function canDissolveEdge(edgeKey, edgeMap, triangles) {
    const sharingTriangles = edgeMap.get(edgeKey);
    if (!sharingTriangles || sharingTriangles.length !== 2) {
      return false; // Not an internal edge (shared by exactly 2 triangles)
    }
    
    const [tri1Idx, tri2Idx] = sharingTriangles;
    const tri1 = triangles[tri1Idx];
    const tri2 = triangles[tri2Idx];
    
    if (!tri1 || !tri2 || tri1.removed || tri2.removed) {
      return false; // One of the triangles is already removed
    }
    
    // Get all unique vertices from both triangles
    const allVerts = [...new Set([...tri1.verts, ...tri2.verts])];
    
    // Must have exactly 4 unique vertices to form a quad
    if (allVerts.length !== 4) {
      return false;
    }
    
    // Check for degenerate cases (collinear points, etc.)
    // Simple check: ensure no three points are collinear
    // For now, we'll accept any 4-vertex combination (can be refined later)
    return true;
  }
  
  // Merge two triangles into a quad
  function mergeTrianglesToQuad(tri1, tri2, edgeKey) {
    const [v1, v2] = edgeKey.split(',').map(Number);
    const allVerts = [...new Set([...tri1.verts, ...tri2.verts])];
    
    // Order vertices to form a valid quad
    // Strategy: Start with one vertex of the dissolved edge, then traverse
    // We need to order the 4 vertices in a cycle
    const orderedVerts = [];
    const used = new Set();
    
    // Start with v1 (first vertex of dissolved edge)
    orderedVerts.push(v1);
    used.add(v1);
    
    // Find vertices connected to v1 in tri1 or tri2
    function findConnected(vert, triangle) {
      const idx = triangle.verts.indexOf(vert);
      if (idx === -1) return [];
      const prev = triangle.verts[(idx + 2) % 3];
      const next = triangle.verts[(idx + 1) % 3];
      return [prev, next].filter(v => !used.has(v));
    }
    
    // Build ordered cycle
    let current = v1;
    while (orderedVerts.length < 4) {
      const candidates = [];
      const tri1Connected = findConnected(current, tri1);
      const tri2Connected = findConnected(current, tri2);
      candidates.push(...tri1Connected, ...tri2Connected);
      
      if (candidates.length === 0) {
        // Fallback: just add remaining vertices
        const remaining = allVerts.filter(v => !used.has(v));
        if (remaining.length > 0) {
          orderedVerts.push(remaining[0]);
          used.add(remaining[0]);
          current = remaining[0];
        } else {
          break;
        }
      } else {
        const next = candidates[0];
        orderedVerts.push(next);
        used.add(next);
        current = next;
      }
    }
    
    // If we didn't get 4 vertices, use simple ordering
    if (orderedVerts.length !== 4) {
      orderedVerts.length = 0;
      orderedVerts.push(...allVerts);
    }
    
    return {
      type: 'quad',
      verts: orderedVerts,
    };
  }
  
  // Main dissolution loop
  while (attempts < maxAttempts && dissolveCount < maxAttempts) {
    attempts++;
    
    // Rebuild edge map (triangles may have been removed)
    const edgeMap = buildEdgeMap(workingTriangles.filter(t => !t.removed));
    
    // Get all internal edges (shared by exactly 2 triangles)
    const internalEdges = Array.from(edgeMap.entries())
      .filter(([edgeKey, triIndices]) => triIndices.length === 2)
      .map(([edgeKey]) => edgeKey);
    
    if (internalEdges.length === 0) {
      break; // No more internal edges to dissolve
    }
    
    // Randomly select an edge (with probability check)
    if (rng.random() > dissolveProbability) {
      continue; // Skip this attempt based on probability
    }
    
    const randomEdgeIndex = Math.floor(rng.random() * internalEdges.length);
    const selectedEdge = internalEdges[randomEdgeIndex];
    
    // Check if we can dissolve this edge
    if (canDissolveEdge(selectedEdge, edgeMap, workingTriangles)) {
      const sharingTriangles = edgeMap.get(selectedEdge);
      const [tri1Idx, tri2Idx] = sharingTriangles;
      const tri1 = workingTriangles[tri1Idx];
      const tri2 = workingTriangles[tri2Idx];
      
      // Merge into quad
      const quad = mergeTrianglesToQuad(tri1, tri2, selectedEdge);
      quads.push(quad);
      
      // Mark triangles as removed
      tri1.removed = true;
      tri2.removed = true;
      
      dissolveCount++;
    }
  }
  
  // Collect remaining triangles (not dissolved)
  const remainingTriangles = workingTriangles
    .filter(t => !t.removed)
    .map(t => ({ type: 'triangle', verts: t.verts }));
  
  // Return quads + remaining triangles
  return [...quads, ...remainingTriangles];
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
 * Build neighbor map for relaxation (per design v2 section 2)
 * Creates bidirectional connections: Map<pointIndex, neighborIndices[]>
 * @param {Array} points - Points array
 * @param {Array} quads - Quads array (with verts property)
 * @returns {Map} Map from point index to array of connected point indices
 */
export function buildNeighborMap(points, quads) {
  const neighbors = new Map();
  
  // Initialize neighbors map for all points
  for (let i = 0; i < points.length; i++) {
    neighbors.set(i, []);
  }
  
  // Build bidirectional connections from quads
  // Each edge in a quad connects two vertices
  for (const quad of quads) {
    const verts = quad.verts;
    const numVerts = verts.length;
    
    for (let i = 0; i < numVerts; i++) {
      const v0 = verts[i];
      const v1 = verts[(i + 1) % numVerts];
      
      // Add bidirectional connection (avoid duplicates)
      const v0Neighbors = neighbors.get(v0);
      if (!v0Neighbors.includes(v1)) {
        v0Neighbors.push(v1);
      }
      
      const v1Neighbors = neighbors.get(v1);
      if (!v1Neighbors.includes(v0)) {
        v1Neighbors.push(v0);
      }
    }
  }
  
  return neighbors;
}

/**
 * Relax grid using Laplacian smoothing (per design v2 section 2)
 * Iteratively moves points to average of neighbors with damping factor
 * @param {Array} points - Points array (will be modified in place)
 * @param {Map} neighborMap - Map from point index to neighbor indices
 * @param {number} iterations - Number of relaxation iterations (default: 200)
 * @param {number} damping - Damping factor (default: 0.3)
 * @returns {Object} Stats object with iterations used and final movement
 */
export function relaxGrid(points, neighborMap, iterations = 200, damping = 0.3) {
  let consecutiveLowMovement = 0;
  const EARLY_TERMINATION_THRESHOLD = 0.001;
  const MIN_ITERATIONS_FOR_EARLY_TERM = 50;
  const CONSECUTIVE_LOW_MOVEMENT_LIMIT = 10;
  
  for (let iter = 0; iter < iterations; iter++) {
    const forces = new Map(); // pointIndex -> {x, y}
    let maxMovement = 0;
    let totalMovement = 0;
    let pointsMoved = 0;
    
    // Accumulate forces (Laplacian smoothing: move toward average of neighbors)
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const neighborIndices = neighborMap.get(i) || [];
      
      if (neighborIndices.length === 0) continue;
      
      // Calculate average position of neighbors
      let avgX = 0;
      let avgY = 0;
      for (const neighborIdx of neighborIndices) {
        const neighbor = points[neighborIdx];
        avgX += neighbor.x;
        avgY += neighbor.y;
      }
      avgX /= neighborIndices.length;
      avgY /= neighborIndices.length;
      
      // Calculate force (damped movement toward average)
      const forceX = (avgX - point.x) * damping;
      const forceY = (avgY - point.y) * damping;
      
      forces.set(i, { x: forceX, y: forceY });
      
      const movement = Math.abs(forceX) + Math.abs(forceY);
      maxMovement = Math.max(maxMovement, movement);
      totalMovement += movement;
      pointsMoved++;
    }
    
    // Apply forces
    for (const [pointIdx, force] of forces) {
      points[pointIdx].x += force.x;
      points[pointIdx].y += force.y;
    }
    
    // Early termination check (per design v2 section 2)
    const avgMovement = pointsMoved > 0 ? totalMovement / pointsMoved : 0;
    if (iter >= MIN_ITERATIONS_FOR_EARLY_TERM && avgMovement < EARLY_TERMINATION_THRESHOLD) {
      consecutiveLowMovement++;
      if (consecutiveLowMovement >= CONSECUTIVE_LOW_MOVEMENT_LIMIT) {
        return {
          iterationsUsed: iter + 1,
          finalAvgMovement: avgMovement,
          earlyTerminated: true,
        };
      }
    } else {
      consecutiveLowMovement = 0;
    }
  }
  
  return {
    iterationsUsed: iterations,
    finalAvgMovement: 0, // Not calculated if we didn't early terminate
    earlyTerminated: false,
  };
}

/**
 * Snap burgs to nearest dual-grid points (per design v2 section 5)
 * Maps Voronoi burg positions to dual-grid Level 1 quad centers
 * @param {Object} pack - Pack object (will be modified)
 * @param {Object} dualGrid - Dual grid structure with points and level1Quads
 * @param {Object} options - Generation options
 * @returns {Object} Mapping stats {snappedCount, totalBurgs}
 */
export function snapBurgsToDualGrid(pack, dualGrid, options) {
  if (!pack || !pack.burgs) {
    return { snappedCount: 0, totalBurgs: 0 };
  }
  
  if (!dualGrid || !dualGrid.points || !dualGrid.level1Quads) {
    console.warn('Dual grid missing points or level1Quads, skipping burg snapping');
    return { snappedCount: 0, totalBurgs: 0 };
  }
  
  const { points, level1Quads } = dualGrid;
  let snappedCount = 0;
  let totalBurgs = 0;
  
  // Helper: Calculate Euclidean distance between two points
  function distance(p1, p2) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
  
  // Find nearest point in dualGrid.points
  function findNearestPoint(burgX, burgY) {
    let nearestIndex = -1;
    let minDistance = Infinity;
    
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const dist = distance({ x: burgX, y: burgY }, p);
      if (dist < minDistance) {
        minDistance = dist;
        nearestIndex = i;
      }
    }
    
    return { index: nearestIndex, distance: minDistance };
  }
  
  // Find nearest Level 1 quad center
  function findNearestQuad(burgX, burgY) {
    let nearestIndex = -1;
    let minDistance = Infinity;
    
    for (let i = 0; i < level1Quads.length; i++) {
      const quad = level1Quads[i];
      if (!quad.center) continue;
      
      const dist = distance({ x: burgX, y: burgY }, quad.center);
      if (dist < minDistance) {
        minDistance = dist;
        nearestIndex = i;
      }
    }
    
    return { index: nearestIndex, distance: minDistance };
  }
  
  // Snap each burg
  for (const burg of pack.burgs) {
    if (!burg || !burg.i || burg.removed) continue;
    
    // Burg must have valid position
    if (burg.x === undefined || burg.y === undefined || 
        !isFinite(burg.x) || !isFinite(burg.y)) {
      continue;
    }
    
    totalBurgs++;
    
    // Find nearest point
    const nearestPoint = findNearestPoint(burg.x, burg.y);
    if (nearestPoint.index >= 0) {
      burg.dualGridPointId = nearestPoint.index;
      burg.dualGridPointDistance = nearestPoint.distance;
    }
    
    // Find nearest Level 1 quad
    const nearestQuad = findNearestQuad(burg.x, burg.y);
    if (nearestQuad.index >= 0) {
      burg.dualQuadId = nearestQuad.index;
      burg.dualQuadDistance = nearestQuad.distance;
      // Also store reference to the quad's parent (Level 0)
      if (level1Quads[nearestQuad.index].parentQuadId !== undefined) {
        burg.dualQuadParentId = level1Quads[nearestQuad.index].parentQuadId;
      }
    }
    
    snappedCount++;
  }
  
  return { snappedCount, totalBurgs };
}

/**
 * Pattern definitions for chunk matching (per design v2 section 3)
 * Simple adjacency-based patterns for states/provinces
 */
const PATTERNS = [
  {
    id: 'single',
    name: 'Single Quad',
    quads: 1,
    shape: [[0, 0]],
    constraints: { minNeighbors: 0, maxNeighbors: 4 },
  },
  {
    id: 'bar_horizontal',
    name: 'Horizontal Bar (2×1)',
    quads: 2,
    shape: [[0, 0], [1, 0]],
    constraints: { minNeighbors: 2, maxNeighbors: 6 },
  },
  {
    id: 'bar_vertical',
    name: 'Vertical Bar (1×2)',
    quads: 2,
    shape: [[0, 0], [0, 1]],
    constraints: { minNeighbors: 2, maxNeighbors: 6 },
  },
  {
    id: 'block_2x2',
    name: '2×2 Block',
    quads: 4,
    shape: [[0, 0], [1, 0], [0, 1], [1, 1]],
    constraints: { minNeighbors: 4, maxNeighbors: 12 },
  },
  {
    id: 'l_shape',
    name: 'L-Shape Corner',
    quads: 3,
    shape: [[0, 0], [1, 0], [0, 1]],
    constraints: { minNeighbors: 3, maxNeighbors: 8 },
  },
  {
    id: 't_shape',
    name: 'T-Shape',
    quads: 4,
    shape: [[0, 0], [-1, 0], [1, 0], [0, 1]],
    constraints: { minNeighbors: 4, maxNeighbors: 10 },
  },
  {
    id: 'border_chain',
    name: 'Border Chain (3 quads)',
    quads: 3,
    shape: [[0, 0], [1, 0], [2, 0]],
    constraints: { minNeighbors: 3, maxNeighbors: 8 },
  },
  {
    id: 'merge_bridge',
    name: 'Merge Bridge',
    quads: 2,
    shape: [[0, 0], [1, 0]],
    constraints: { minNeighbors: 2, maxNeighbors: 6, requiresDifferentState: true },
  },
  {
    id: 'corner_2x2',
    name: 'Corner 2×2',
    quads: 3,
    shape: [[0, 0], [1, 0], [0, 1]],
    constraints: { minNeighbors: 3, maxNeighbors: 8 },
  },
  {
    id: 'diagonal',
    name: 'Diagonal Line',
    quads: 2,
    shape: [[0, 0], [1, 1]],
    constraints: { minNeighbors: 2, maxNeighbors: 6 },
  },
];

/**
 * Assign patterns to quads using simple adjacency-based matching (per design v2 section 3)
 * Uses burg-seeded quads as starting points for state assignment
 * @param {Object} dualGrid - Dual grid structure with level0Quads and level1Quads
 * @param {Object} pack - Pack object (will be modified)
 * @param {Object} options - Generation options
 * @returns {Object} Assignment stats {statesCreated, quadsAssigned, unassignedQuads}
 */
export function assignPatternsToQuads(dualGrid, pack, options) {
  if (!dualGrid || !dualGrid.level0Quads || !pack || !pack.burgs) {
    return { statesCreated: 0, quadsAssigned: 0, unassignedQuads: 0 };
  }
  
  const { level0Quads } = dualGrid;
  const { burgs } = pack;
  const seed = options.seed || String(Date.now());
  const rng = new RNG(seed + 'patternMatching');
  
  // Build neighbor map for Level 0 quads
  const neighborMap = buildNeighborMap(dualGrid.points, level0Quads);
  
  // Track assigned quads
  const assignedQuads = new Set();
  const quadToState = new Map(); // quadIndex -> stateId
  const states = [];
  let stateIdCounter = 1;
  
  // Get burg-seeded quads (capitals first, then other burgs)
  // Note: burgs are snapped to Level 1 quads, but we need Level 0 quads for states
  // Map Level 1 quad to its parent Level 0 quad
  const seededQuads = [];
  const capitalBurgs = burgs.filter(b => b && b.capital && b.dualQuadId !== undefined);
  const otherBurgs = burgs.filter(b => b && !b.capital && b.dualQuadId !== undefined);
  
  // Helper: Get Level 0 quad from Level 1 quad ID
  function getLevel0QuadFromLevel1(level1QuadId) {
    if (level1QuadId === undefined || level1QuadId < 0) return null;
    const level1Quad = dualGrid.level1Quads[level1QuadId];
    if (!level1Quad || level1Quad.parentQuadId === undefined) return null;
    return level1Quad.parentQuadId;
  }
  
  // Process capitals first (they become state centers)
  for (const burg of capitalBurgs) {
    const level1QuadId = burg.dualQuadId;
    const level0QuadId = getLevel0QuadFromLevel1(level1QuadId);
    if (level0QuadId !== null && level0QuadId < level0Quads.length && !assignedQuads.has(level0QuadId)) {
      seededQuads.push({ quadId: level0QuadId, isCapital: true, burg });
    }
  }
  
  // Then process other burgs (they can become province centers or expand states)
  for (const burg of otherBurgs) {
    const level1QuadId = burg.dualQuadId;
    const level0QuadId = getLevel0QuadFromLevel1(level1QuadId);
    if (level0QuadId !== null && level0QuadId < level0Quads.length && !assignedQuads.has(level0QuadId)) {
      seededQuads.push({ quadId: level0QuadId, isCapital: false, burg });
    }
  }
  
  // Helper: Get neighbors of a quad
  function getQuadNeighbors(quadId) {
    const quad = level0Quads[quadId];
    if (!quad) return [];
    
    const neighborIndices = [];
    const quadVerts = quad.verts;
    
    // Find quads that share vertices with this quad
    for (let i = 0; i < level0Quads.length; i++) {
      if (i === quadId || assignedQuads.has(i)) continue;
      
      const otherQuad = level0Quads[i];
      const otherVerts = otherQuad.verts;
      
      // Check if quads share at least one vertex (adjacent)
      const sharedVerts = quadVerts.filter(v => otherVerts.includes(v));
      if (sharedVerts.length > 0) {
        neighborIndices.push(i);
      }
    }
    
    return neighborIndices;
  }
  
  // Helper: Check if a pattern can be applied at a quad
  function canApplyPattern(pattern, startQuadId, neighborIndices) {
    const numNeighbors = neighborIndices.length;
    const constraints = pattern.constraints;
    
    if (constraints.minNeighbors !== undefined && numNeighbors < constraints.minNeighbors) {
      return false;
    }
    if (constraints.maxNeighbors !== undefined && numNeighbors > constraints.maxNeighbors) {
      return false;
    }
    
    // For merge patterns, check if neighbors have different states
    if (constraints.requiresDifferentState) {
      const hasDifferentState = neighborIndices.some(nId => {
        const neighborState = quadToState.get(nId);
        return neighborState !== undefined && neighborState !== quadToState.get(startQuadId);
      });
      if (!hasDifferentState) return false;
    }
    
    // Check if pattern size fits (enough unassigned neighbors)
    const unassignedNeighbors = neighborIndices.filter(nId => !assignedQuads.has(nId));
    if (unassignedNeighbors.length < pattern.quads - 1) {
      return false; // Not enough unassigned neighbors for pattern
    }
    
    return true;
  }
  
  // Helper: Apply pattern to quads
  function applyPattern(pattern, startQuadId, neighborIndices, stateId) {
    const assigned = [startQuadId];
    assignedQuads.add(startQuadId);
    quadToState.set(startQuadId, stateId);
    level0Quads[startQuadId].stateId = stateId;
    level0Quads[startQuadId].patternId = pattern.id; // Track pattern used
    
    // For multi-quad patterns, assign neighbors
    if (pattern.quads > 1) {
      const unassignedNeighbors = neighborIndices.filter(nId => !assignedQuads.has(nId));
      const toAssign = Math.min(pattern.quads - 1, unassignedNeighbors.length);
      
      // Randomly select neighbors to assign (or take first N)
      const selected = [];
      for (let i = 0; i < toAssign && i < unassignedNeighbors.length; i++) {
        const idx = Math.floor(rng.random() * unassignedNeighbors.length);
        const neighborId = unassignedNeighbors.splice(idx, 1)[0];
        selected.push(neighborId);
      }
      
      for (const neighborId of selected) {
        assignedQuads.add(neighborId);
        quadToState.set(neighborId, stateId);
        level0Quads[neighborId].stateId = stateId;
        level0Quads[neighborId].patternId = pattern.id; // Track pattern used
        assigned.push(neighborId);
      }
    }
    
    return assigned;
  }
  
  // Main assignment loop
  for (const { quadId, isCapital, burg } of seededQuads) {
    if (assignedQuads.has(quadId)) continue;
    
    const neighborIndices = getQuadNeighbors(quadId);
    
    // Try to match a pattern
    let patternMatched = false;
    const shuffledPatterns = [...PATTERNS].sort(() => rng.random() - 0.5); // Shuffle for variety
    
    for (const pattern of shuffledPatterns) {
      if (canApplyPattern(pattern, quadId, neighborIndices)) {
        const stateId = isCapital ? stateIdCounter++ : (quadToState.get(neighborIndices[0]) || stateIdCounter++);
        
        if (isCapital) {
          // Create new state for capital
          states.push({
            i: stateId,
            name: burg.name || `State${stateId}`,
            capital: burg.i,
            center: quadId,
            quads: [],
          });
        }
        
        const assignedQuadIds = applyPattern(pattern, quadId, neighborIndices, stateId);
        
        // Update state's quad list
        const state = states.find(s => s.i === stateId);
        if (state) {
          state.quads.push(...assignedQuadIds);
        }
        
        patternMatched = true;
        break;
      }
    }
    
    // Fallback: assign as singleton if no pattern matches
    if (!patternMatched) {
      const stateId = isCapital ? stateIdCounter++ : (quadToState.get(neighborIndices[0]) || stateIdCounter++);
      
      if (isCapital) {
        states.push({
          i: stateId,
          name: burg.name || `State${stateId}`,
          capital: burg.i,
          center: quadId,
          quads: [quadId],
        });
      }
      
      assignedQuads.add(quadId);
      quadToState.set(quadId, stateId);
      level0Quads[quadId].stateId = stateId;
      level0Quads[quadId].patternId = 'single'; // Fallback pattern
      
      const state = states.find(s => s.i === stateId);
      if (state && !state.quads.includes(quadId)) {
        state.quads.push(quadId);
      }
    }
  }
  
  // Store assignments in dualGrid
  if (!dualGrid.stateAssignments) {
    dualGrid.stateAssignments = {};
  }
  dualGrid.stateAssignments.states = states;
  dualGrid.stateAssignments.quadToState = Array.from(quadToState.entries());
  
  // Count unassigned quads
  const unassignedQuads = level0Quads.filter(q => q.stateId === -1 || q.stateId === undefined).length;
  
  return {
    statesCreated: states.length,
    quadsAssigned: assignedQuads.size,
    unassignedQuads,
  };
}

/**
 * Variant definitions for pattern types (per design v2 section 6)
 * Each pattern can have multiple visual variants to hide repetition
 */
const VARIANTS = {
  single: ['basic', 'ruined', 'fortified', 'decorated', 'minimal'],
  bar_horizontal: ['straight', 'curved', 'broken', 'reinforced'],
  bar_vertical: ['straight', 'curved', 'broken', 'reinforced'],
  block_2x2: ['solid', 'grid', 'checkered', 'fortress', 'plaza'],
  l_shape: ['corner_standard', 'corner_rounded', 'corner_sharp', 'corner_fortified'],
  t_shape: ['cross_standard', 'cross_ornate', 'cross_minimal', 'cross_heavy'],
  border_chain: ['chain_straight', 'chain_wavy', 'chain_zigzag', 'chain_ornate'],
  merge_bridge: ['bridge_simple', 'bridge_arched', 'bridge_solid', 'bridge_decorated'],
  corner_2x2: ['corner_standard', 'corner_rounded', 'corner_sharp'],
  diagonal: ['diagonal_standard', 'diagonal_wavy', 'diagonal_broken'],
  // Default fallback variants
  default: ['basic', 'standard', 'simple', 'plain'],
};

/**
 * Assign variants to quads (per design v2 section 6)
 * Randomly selects variants for each quad based on its pattern type
 * @param {Object} dualGrid - Dual grid structure with stateAssignments
 * @param {Object} options - Generation options
 * @returns {Object} Variant stats {variantsAssigned, uniqueVariants}
 */
export function assignVariantsToQuads(dualGrid, options) {
  if (!dualGrid || !dualGrid.level0Quads || !dualGrid.stateAssignments) {
    return { variantsAssigned: 0, uniqueVariants: 0 };
  }
  
  const { level0Quads, stateAssignments } = dualGrid;
  const seed = options.seed || String(Date.now());
  const rng = new RNG(seed + 'variants');
  
  let variantsAssigned = 0;
  const uniqueVariants = new Set();
  
  // Assign variants to quads based on their pattern
  for (const quad of level0Quads) {
    if (quad.stateId === -1 || quad.stateId === undefined) {
      continue; // Skip unassigned quads
    }
    
    // Get pattern ID (fallback to 'single' if not set)
    const patternId = quad.patternId || 'single';
    
    // Get variants for this pattern (fallback to default)
    const patternVariants = VARIANTS[patternId] || VARIANTS.default;
    
    if (patternVariants && patternVariants.length > 0) {
      // Select random variant
      const variantIndex = Math.floor(rng.random() * patternVariants.length);
      const selectedVariant = patternVariants[variantIndex];
      
      // Store variant on quad
      quad.variantId = selectedVariant;
      quad.patternId = patternId; // Ensure patternId is set
      
      uniqueVariants.add(selectedVariant);
      variantsAssigned++;
    }
  }
  
  return {
    variantsAssigned,
    uniqueVariants: uniqueVariants.size,
    variantList: Array.from(uniqueVariants),
  };
}

/**
 * Map dual-grid states to pack.states and pack.cells.state (per design v2 section 5)
 * Replaces Voronoi-based state generation when useDualGridPolitics is enabled
 * @param {Object} dualGrid - Dual grid structure with stateAssignments
 * @param {Object} pack - Pack object (will be modified)
 * @param {Object} grid - Grid object (for Voronoi cell positions)
 * @param {Object} options - Generation options
 * @param {Object} rng - RNG instance for colors
 * @returns {Object} Mapping stats {statesMapped, cellsMapped}
 */
export function mapDualGridStatesToPack(dualGrid, pack, grid, options, rng) {
  if (!dualGrid || !dualGrid.stateAssignments || !pack || !pack.cells || !grid) {
    return { statesMapped: 0, cellsMapped: 0 };
  }
  
  const { stateAssignments } = dualGrid;
  const { states: dualStates } = stateAssignments;
  const { cells, burgs, cultures } = pack;
  
  // Initialize cells.state array if needed
  if (!cells.state) {
    cells.state = createTypedArray({ maxValue: 65535, length: cells.i.length });
  }
  
  // Clear existing state assignments
  for (let i = 0; i < cells.i.length; i++) {
    cells.state[i] = 0;
  }
  
  // Create pack.states array from dual-grid states
  const packStates = [{ i: 0, name: 'Neutrals' }];
  const colors = ['#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854', '#ffd92f'];
  
  // Helper: Check if a point is inside a quad (simple bounding box check)
  function pointInQuadBounds(point, quad, dualGridPoints) {
    const quadVerts = quad.verts.map(vIdx => dualGridPoints[vIdx]);
    if (quadVerts.length < 3) return false;
    
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    for (const v of quadVerts) {
      minX = Math.min(minX, v.x);
      minY = Math.min(minY, v.y);
      maxX = Math.max(maxX, v.x);
      maxY = Math.max(maxY, v.y);
    }
    
    return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
  }
  
  // Map each dual-grid state to pack state
  for (const dualState of dualStates) {
    if (!dualState.i || dualState.removed) continue;
    
    const stateId = dualState.i;
    const capitalBurg = burgs && burgs[dualState.capital];
    
    // Get state properties from burg
    const culture = capitalBurg ? (capitalBurg.culture || 0) : 0;
    const cultureData = cultures && cultures[culture];
    const type = cultureData ? cultureData.type : 'Generic';
    const name = capitalBurg ? (capitalBurg.name || `State${stateId}`) : `State${stateId}`;
    
    // Create pack state object
    const packState = {
      i: stateId,
      name,
      capital: dualState.capital || 0,
      center: capitalBurg ? capitalBurg.cell : 0,
      culture: culture,
      type,
      color: colors[(stateId - 1) % colors.length],
      expansionism: 1.0, // Default
      form: 'Monarchy', // Default
      coa: null,
      quads: dualState.quads || [],
    };
    
    packStates.push(packState);
    
    // Map quads to Voronoi cells
    // For each quad in this state, find Voronoi cells that overlap with it
    const quadIds = dualState.quads || [];
    for (const quadId of quadIds) {
      const quad = dualGrid.level0Quads[quadId];
      if (!quad) continue;
      
      // Find Voronoi cells whose centers are within this quad's bounds
      for (let cellId = 0; cellId < cells.i.length; cellId++) {
        const cellPos = cells.p[cellId];
        if (!cellPos) continue;
        
        // Check if cell center is within quad bounds
        if (pointInQuadBounds({ x: cellPos[0], y: cellPos[1] }, quad, dualGrid.points)) {
          // Only assign to land cells (height > 20)
          if (cells.h && cells.h[cellId] > 20) {
            cells.state[cellId] = stateId;
          }
        }
      }
    }
  }
  
  // Assign colors using greedy coloring (similar to original)
  const usedColors = new Set();
  for (const state of packStates) {
    if (!state.i || state.removed) continue;
    
    // Try to find a color that doesn't conflict with neighbors
    // For now, use simple rotation (can be enhanced with neighbor checking)
    if (!usedColors.has(state.color)) {
      usedColors.add(state.color);
    } else {
      // Find unused color
      for (const color of colors) {
        if (!usedColors.has(color)) {
          state.color = color;
          usedColors.add(color);
          break;
        }
      }
    }
  }
  
  // Store states in pack
  pack.states = packStates;
  
  // Count mapped cells
  let cellsMapped = 0;
  for (let i = 0; i < cells.i.length; i++) {
    if (cells.state[i] > 0) {
      cellsMapped++;
    }
  }
  
  return {
    statesMapped: packStates.length - 1, // Exclude neutral state
    cellsMapped,
  };
}
