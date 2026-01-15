/**
 * =============================================================================
 * dualGridStates.js
 * Desc: Dual-grid states generation using Stålberg-inspired hex-to-quad algorithm
 * Author: Lordthoth (based on research from Townscaper techniques)
 * =============================================================================
 */

import { RNG } from '../utils/rng.js';
import { createTypedArray } from '../utils/array.js';

/**
 * Build Stålberg-inspired quad grid from transformed hex lattice distribution
 * Clean hexagonal border via post-transform of perfect hex grid
 * 
 * Generates a perfect hexagonal grid first, then applies affine transformation
 * to create elliptical shape. This preserves clean hexagonal outer border
 * (full hex sides visible) while achieving desired elliptical overall shape.
 * 
 * @param {number} hexLayers - Number of hex layers (legacy parameter, not used directly)
 * @param {Object} rng - RNG instance for seeded randomness
 * @param {Object} options - Options object with politicsMode (optional)
 *   - hexLayers: Number of hex rings (default: 45)
 *   - hexSize: Size of hex cells (default: 12)
 *   - aspectRatio: Horizontal stretch factor (default: 1.22)
 *   - relaxationIterations: Reduced to 20-30 to preserve hex structure
 *   - DelaunatorClass: Delaunator class for triangulation (optional, will use simple method if not provided)
 * @returns {Object} Dual grid structure with points, level0Quads, level1Quads, dualPoints
 */
export function buildStalbergQuadGrid(hexLayers, rng, options = {}) {
  // Global points array (will be populated)
  const points = [];
  
  // Helper: Add point and return index
  // Preserve all properties (including isBoundary for boundary locking)
  function addPoint(point) {
    const index = points.length;
    const newPoint = { x: point.x, y: point.y };
    // Preserve isBoundary and any other properties
    if (point.isBoundary !== undefined) {
      newPoint.isBoundary = point.isBoundary;
    }
    points.push(newPoint);
    return index;
  }
  
  // Helper: Calculate midpoint between two points
  function midpoint(p1, p2) {
    return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  }
  
  // Helper: Compute convex hull using Graham scan algorithm
  // Returns array of point indices that form the convex hull
  function computeConvexHull(points) {
    if (points.length < 3) {
      // Need at least 3 points for a hull
      return points.map((_, i) => i);
    }
    
    // Find bottom-most point (or leftmost in case of tie)
    let bottomIdx = 0;
    for (let i = 1; i < points.length; i++) {
      if (points[i].y < points[bottomIdx].y || 
          (points[i].y === points[bottomIdx].y && points[i].x < points[bottomIdx].x)) {
        bottomIdx = i;
      }
    }
    
    // Sort points by polar angle with respect to bottom point
    const sorted = points.map((p, i) => ({
      idx: i,
      x: p.x,
      y: p.y,
      angle: Math.atan2(p.y - points[bottomIdx].y, p.x - points[bottomIdx].x),
      dist: Math.sqrt((p.x - points[bottomIdx].x) ** 2 + (p.y - points[bottomIdx].y) ** 2)
    })).sort((a, b) => {
      if (Math.abs(a.angle - b.angle) < 1e-10) {
        return a.dist - b.dist; // If same angle, closer first
      }
      return a.angle - b.angle;
    });
    
    // Graham scan
    const hull = [sorted[0].idx, sorted[1].idx];
    
    for (let i = 2; i < sorted.length; i++) {
      const current = sorted[i];
      while (hull.length > 1) {
        const p1 = points[hull[hull.length - 2]];
        const p2 = points[hull[hull.length - 1]];
        const p3 = points[current.idx];
        
        // Cross product to determine turn direction
        const cross = (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x);
        if (cross > 0) break; // Left turn, keep
        hull.pop(); // Right turn, remove
      }
      hull.push(current.idx);
    }
    
    return hull;
  }
  
  // Helper: Create Set of true boundary edge keys from convex hull
  function getTrueBoundaryEdges(points, hullIndices) {
    const boundaryEdges = new Set();
    const getEdgeKey = (v1, v2) => v1 < v2 ? `${v1},${v2}` : `${v2},${v1}`;
    
    // Create edges from consecutive hull points
    for (let i = 0; i < hullIndices.length; i++) {
      const v1 = hullIndices[i];
      const v2 = hullIndices[(i + 1) % hullIndices.length];
      boundaryEdges.add(getEdgeKey(v1, v2));
    }
    
    return boundaryEdges;
  }
  
  // Step 1: Generate transformed hex points (perfect hex grid with post-transform)
  // Clean hexagonal border via post-transform of perfect hex grid
  // This preserves clean hexagonal outer border while achieving elliptical shape
  const baseHexRings = options.politicsMode?.hexLayers ?? 45;
  const baseHexSize = options.politicsMode?.hexSize ?? 12;
  const aspectRatio = options.politicsMode?.aspectRatio ?? 1.22;
  
  // STEP-BY-STEP DEBUG: Density reduction for investigation
  // Prioritize density reduction (spacing) over point count for larger triangles
  const targetPoints = options.politicsMode?.targetPoints ?? null;
  const densityMultiplier = options.politicsMode?.stepByStepDensityMultiplier ?? 1.0;
  
  let hexRings, effectiveHexSize;
  let primalPoints;
  
  // Priority: densityMultiplier (spacing-based) over targetPoints (count-based)
  if (densityMultiplier !== 1.0 && densityMultiplier > 0) {
    // Density-based reduction: increase spacing, reduce rings proportionally
    const densityScale = Math.sqrt(densityMultiplier);
    hexRings = Math.max(1, Math.round(baseHexRings * densityScale));
    effectiveHexSize = baseHexSize / densityScale; // Increase spacing to maintain grid size
    
    const expectedPoints = 3 * hexRings * (hexRings + 1) + 1;
    const originalPoints = 3 * baseHexRings * (baseHexRings + 1) + 1;
    
    console.log(`[buildStalbergQuadGrid] DENSITY REDUCTION: multiplier=${densityMultiplier}, densityScale=${densityScale.toFixed(4)}`);
    console.log(`[buildStalbergQuadGrid] DENSITY REDUCTION: baseHexRings=${baseHexRings}→${hexRings}, baseHexSize=${baseHexSize}→${effectiveHexSize.toFixed(2)}`);
    console.log(`[buildStalbergQuadGrid] DENSITY REDUCTION: Expected points: ${expectedPoints} (original: ${originalPoints}, reduction: ${((1 - expectedPoints / originalPoints) * 100).toFixed(1)}%)`);
    
    primalPoints = createTransformedHexPoints(hexRings, effectiveHexSize, aspectRatio, rng);
    
    // Calculate point density and triangle area estimates
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of primalPoints) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    const width = maxX - minX;
    const height = maxY - minY;
    const area = width * height;
    const pointDensity = primalPoints.length / area;
    
    console.log(`[buildStalbergQuadGrid] DENSITY REDUCTION: Generated ${primalPoints.length} points`);
    console.log(`[buildStalbergQuadGrid] DENSITY REDUCTION: Grid bounds: ${minX.toFixed(1)} to ${maxX.toFixed(1)}, ${minY.toFixed(1)} to ${maxY.toFixed(1)}`);
    console.log(`[buildStalbergQuadGrid] DENSITY REDUCTION: Point density: ${pointDensity.toFixed(6)} points/unit² (spacing: ${effectiveHexSize.toFixed(2)})`);
    console.log(`[buildStalbergQuadGrid] DENSITY REDUCTION: Expected larger triangles (area ~${(1/densityMultiplier).toFixed(1)}x previous)`);
    
  } else if (targetPoints !== null && targetPoints > 0) {
    // Calculate hexRings for target point count: points ≈ 3*hexRings*(hexRings+1) + 1
    // Solve: 3*n*(n+1) + 1 = target => 3n² + 3n + 1 - target = 0
    // Using quadratic formula: n = (-3 + sqrt(9 + 12*(target-1))) / 6
    const discriminant = 9 + 12 * (targetPoints - 1);
    const calculatedRings = Math.round((-3 + Math.sqrt(discriminant)) / 6);
    
    // Find closest achievable hexRings
    let bestRings = calculatedRings;
    let bestDiff = Infinity;
    for (let r = Math.max(1, calculatedRings - 2); r <= calculatedRings + 2; r++) {
      const pointsForRings = 3 * r * (r + 1) + 1;
      const diff = Math.abs(pointsForRings - targetPoints);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestRings = r;
      }
    }
    
    hexRings = bestRings;
    const expectedPoints = 3 * hexRings * (hexRings + 1) + 1;
    
    // Calculate hexSize to maintain grid bounds (scale inversely with rings)
    // Original: baseHexRings rings with baseHexSize spacing
    // Target: hexRings rings with effectiveHexSize spacing
    // To maintain size: effectiveHexSize = baseHexSize * (baseHexRings / hexRings)
    effectiveHexSize = baseHexSize * (baseHexRings / hexRings);
    
    console.log(`[buildStalbergQuadGrid] TARGET POINTS: ${targetPoints}, calculated hexRings=${calculatedRings}, using hexRings=${hexRings} (expected: ${expectedPoints} points, diff: ${Math.abs(expectedPoints - targetPoints)})`);
    console.log(`[buildStalbergQuadGrid] TARGET POINTS: baseHexRings=${baseHexRings}→${hexRings}, baseHexSize=${baseHexSize}→${effectiveHexSize.toFixed(2)}`);
    
    primalPoints = createTransformedHexPoints(hexRings, effectiveHexSize, aspectRatio, rng);
    
    // Store original bounds before culling (for restoration)
    let origMinX = Infinity, origMaxX = -Infinity, origMinY = Infinity, origMaxY = -Infinity;
    for (const p of primalPoints) {
      origMinX = Math.min(origMinX, p.x);
      origMaxX = Math.max(origMaxX, p.x);
      origMinY = Math.min(origMinY, p.y);
      origMaxY = Math.max(origMaxY, p.y);
    }
    const origWidth = origMaxX - origMinX;
    const origHeight = origMaxY - origMinY;
    const origCenterX = (origMinX + origMaxX) / 2;
    const origCenterY = (origMinY + origMaxY) / 2;
    
    // If not exactly target, cull excess points (prefer outer points to maintain center density)
    if (primalPoints.length > targetPoints) {
      const excess = primalPoints.length - targetPoints;
      console.log(`[buildStalbergQuadGrid] TARGET POINTS: Generated ${primalPoints.length} points, culling ${excess} to reach ${targetPoints}`);
      
      // Sort by distance from center (furthest first) and remove excess
      const pointsWithDist = primalPoints.map((p, idx) => ({
        point: p,
        idx,
        dist: Math.sqrt(p.x * p.x + p.y * p.y)
      }));
      pointsWithDist.sort((a, b) => b.dist - a.dist); // Furthest first
      
      // Remove excess points (keep closest to center)
      const toRemove = new Set(pointsWithDist.slice(0, excess).map(p => p.idx));
      primalPoints = primalPoints.filter((_, idx) => !toRemove.has(idx));
      
      console.log(`[buildStalbergQuadGrid] TARGET POINTS: After culling: ${primalPoints.length} points`);
      
      // Restore original bounds by scaling remaining points
      let newMinX = Infinity, newMaxX = -Infinity, newMinY = Infinity, newMaxY = -Infinity;
      for (const p of primalPoints) {
        newMinX = Math.min(newMinX, p.x);
        newMaxX = Math.max(newMaxX, p.x);
        newMinY = Math.min(newMinY, p.y);
        newMaxY = Math.max(newMaxY, p.y);
      }
      const newWidth = newMaxX - newMinX;
      const newHeight = newMaxY - newMinY;
      const newCenterX = (newMinX + newMaxX) / 2;
      const newCenterY = (newMinY + newMaxY) / 2;
      
      // Scale to restore original bounds
      const scaleX = origWidth > 0 ? origWidth / newWidth : 1;
      const scaleY = origHeight > 0 ? origHeight / newHeight : 1;
      const scale = Math.min(scaleX, scaleY); // Use uniform scaling to maintain aspect
      
      for (const p of primalPoints) {
        // Translate to origin, scale, translate back to original center
        p.x = (p.x - newCenterX) * scale + origCenterX;
        p.y = (p.y - newCenterY) * scale + origCenterY;
      }
      
      console.log(`[buildStalbergQuadGrid] TARGET POINTS: Scaled remaining points by ${scale.toFixed(3)}x to restore original bounds`);
    } else if (primalPoints.length < targetPoints) {
      console.log(`[buildStalbergQuadGrid] TARGET POINTS: WARNING: Generated ${primalPoints.length} points (target: ${targetPoints}), cannot add points without breaking hex pattern`);
    }
    
    // Verify bounds are maintained
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of primalPoints) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    console.log(`[buildStalbergQuadGrid] TARGET POINTS: Final count: ${primalPoints.length} (target: ${targetPoints}), bounds: ${minX.toFixed(1)} to ${maxX.toFixed(1)}, ${minY.toFixed(1)} to ${maxY.toFixed(1)}`);
    
  } else if (densityMultiplier !== 1.0) {
    // Legacy density multiplier approach
    const densityScale = Math.sqrt(densityMultiplier);
    hexRings = Math.max(1, Math.round(baseHexRings * densityScale));
    effectiveHexSize = baseHexSize / densityScale;
    
    console.log(`[buildStalbergQuadGrid] DENSITY REDUCTION: multiplier=${densityMultiplier}, baseHexRings=${baseHexRings}→${hexRings}, baseHexSize=${baseHexSize}→${effectiveHexSize.toFixed(2)}`);
    console.log(`[buildStalbergQuadGrid] DENSITY REDUCTION: Expected point reduction: ~${Math.round(3 * baseHexRings * (baseHexRings + 1) + 1)} → ~${Math.round(3 * hexRings * (hexRings + 1) + 1)} points`);
    
    primalPoints = createTransformedHexPoints(hexRings, effectiveHexSize, aspectRatio, rng);
    
    const expectedAtDensity1 = Math.round(3 * baseHexRings * (baseHexRings + 1) + 1);
    const actualReduction = ((1 - primalPoints.length / expectedAtDensity1) * 100).toFixed(1);
    console.log(`[buildStalbergQuadGrid] DENSITY REDUCTION: Generated ${primalPoints.length} points (expected at density 1.0: ~${expectedAtDensity1}, reduction: ${actualReduction}%)`);
    
    // Verify bounds are maintained
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of primalPoints) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    console.log(`[buildStalbergQuadGrid] DENSITY REDUCTION: Grid bounds maintained: ${minX.toFixed(1)} to ${maxX.toFixed(1)}, ${minY.toFixed(1)} to ${maxY.toFixed(1)}`);
  } else {
    hexRings = baseHexRings;
    effectiveHexSize = baseHexSize;
    primalPoints = createTransformedHexPoints(hexRings, effectiveHexSize, aspectRatio, rng);
  }
  const hexPointIndices = primalPoints.map(p => addPoint(p));
  
  // STEP-BY-STEP DEBUG: Capture Stage 1 (raw spawned points)
  const stepByStepRender = options.politicsMode?.stepByStepRender ?? false;
  const pipelineStages = stepByStepRender ? {
    stage1_rawPoints: primalPoints.map(p => ({ x: p.x, y: p.y })), // Raw spawned points
  } : null;
  
  // Step 1.5: EARLY RELAXATION (if testEarlyRelax flag enabled)
  // Smooth foundation points BEFORE building structure (per PIPELINE_ORDER_HYPOTHESIS_REPORT.md)
  const testEarlyRelax = options.politicsMode?.testEarlyRelax ?? false;
  let earlyRelaxationApplied = false;
  
  if (testEarlyRelax) {
    console.log('[buildStalbergQuadGrid] EARLY RELAX TEST: enabled, smoothing foundation points before triangulation');
    
    // Build simple neighbor map from Delaunay triangulation of initial points
    const DelaunatorClass = options.DelaunatorClass;
    let earlyNeighborMap = new Map();
    
    if (DelaunatorClass) {
      // Use Delaunay to get connectivity for simple hex grid
      const coords = primalPoints.map(p => [p.x, p.y]);
      const delaunay = DelaunatorClass.from(coords);
      
      // Build neighbor map from Delaunay triangles
      for (let i = 0; i < points.length; i++) {
        earlyNeighborMap.set(i, []);
      }
      
      // Extract neighbors from Delaunay triangles
      for (let i = 0; i < delaunay.triangles.length; i += 3) {
        const i0 = delaunay.triangles[i];
        const i1 = delaunay.triangles[i + 1];
        const i2 = delaunay.triangles[i + 2];
        
        // Add bidirectional connections
        const addNeighbor = (a, b) => {
          const neighbors = earlyNeighborMap.get(a);
          if (!neighbors.includes(b)) {
            neighbors.push(b);
          }
        };
        
        addNeighbor(i0, i1);
        addNeighbor(i0, i2);
        addNeighbor(i1, i0);
        addNeighbor(i1, i2);
        addNeighbor(i2, i0);
        addNeighbor(i2, i1);
      }
    } else {
      // Fallback: distance-based neighbors (k-nearest, k=6 for hex grid)
      for (let i = 0; i < points.length; i++) {
        const neighbors = [];
        const distances = [];
        
        for (let j = 0; j < points.length; j++) {
          if (i === j) continue;
          const dx = points[i].x - points[j].x;
          const dy = points[i].y - points[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          distances.push({ idx: j, dist });
        }
        
        distances.sort((a, b) => a.dist - b.dist);
        for (let k = 0; k < Math.min(6, distances.length); k++) {
          neighbors.push(distances[k].idx);
        }
        
        earlyNeighborMap.set(i, neighbors);
      }
    }
    
    // Apply early relaxation with low iterations (5 for test)
    const earlyRelaxIterations = options.politicsMode?.earlyRelaxIterations ?? 5;
    const dampingFactor = options.politicsMode?.dampingFactor ?? 0.5;
    
    console.log(`[buildStalbergQuadGrid] Early relax: ${earlyRelaxIterations} iterations, damping=${dampingFactor}`);
    relaxGrid(points, earlyNeighborMap, earlyRelaxIterations, dampingFactor, options);
    
    // Update primalPoints to match relaxed points
    for (let i = 0; i < primalPoints.length; i++) {
      primalPoints[i].x = points[i].x;
      primalPoints[i].y = points[i].y;
    }
    
    earlyRelaxationApplied = true;
    console.log('[buildStalbergQuadGrid] Early relax test: enabled, check center chaos/CV');
  }
  
  // Step 2: Compute true boundary edges (convex hull) BEFORE triangulation
  // This identifies edges on the outer perimeter that should be protected
  const hullIndices = computeConvexHull(primalPoints);
  const trueBoundaryEdges = getTrueBoundaryEdges(primalPoints, hullIndices);
  console.log(`[buildStalbergQuadGrid] Convex hull computed: ${hullIndices.length} hull points, ${trueBoundaryEdges.size} true boundary edges`);
  
  if (stepByStepRender) {
    console.log(`[buildStalbergQuadGrid] True boundary edges (sample):`, Array.from(trueBoundaryEdges).slice(0, 10));
  }
  
  // Step 3: Triangulate from elliptical points using Delaunay triangulation
  // Use Delaunator if available (fast O(n log n)), otherwise fall back to simple method
  const DelaunatorClass = options.DelaunatorClass;
  let rawDelaunayTriangles = null;
  let triangles;
  
  if (DelaunatorClass) {
    const result = triangulateFromPointsWithDelaunator(primalPoints, hexPointIndices, DelaunatorClass);
    triangles = result.triangles;
    rawDelaunayTriangles = result.rawTriangles; // Store raw Delaunator triangle indices
  } else {
    triangles = triangulateFromPointsSimple(primalPoints, hexPointIndices);
  }
  
  console.log(`[buildStalbergQuadGrid] Triangulated ${triangles.length} triangles from ${primalPoints.length} points`);
  
  // STEP-BY-STEP DEBUG: Capture Stage 2 (after triangulation) with detailed analysis
  if (stepByStepRender && pipelineStages) {
    // Calculate triangle statistics
    const triangleAreas = [];
    const sampleTriangles = [];
    for (let i = 0; i < Math.min(10, triangles.length); i++) {
      const tri = triangles[i];
      if (tri && tri.verts && tri.verts.length >= 3) {
        const v0 = points[tri.verts[0]];
        const v1 = points[tri.verts[1]];
        const v2 = points[tri.verts[2]];
        if (v0 && v1 && v2) {
          // Shoelace formula for area
          const area = Math.abs((v0.x * (v1.y - v2.y) + v1.x * (v2.y - v0.y) + v2.x * (v0.y - v1.y)) / 2);
          triangleAreas.push(area);
          sampleTriangles.push({
            index: i,
            verts: tri.verts,
            area: area,
            coords: {
              v0: { x: v0.x, y: v0.y },
              v1: { x: v1.x, y: v1.y },
              v2: { x: v2.x, y: v2.y },
            }
          });
        }
      }
    }
    const avgArea = triangleAreas.length > 0 ? triangleAreas.reduce((a, b) => a + b, 0) / triangleAreas.length : 0;
    const minArea = triangleAreas.length > 0 ? Math.min(...triangleAreas) : 0;
    const maxArea = triangleAreas.length > 0 ? Math.max(...triangleAreas) : 0;
    
    // Calculate point density for Stage 2
    let stage2MinX = Infinity, stage2MaxX = -Infinity, stage2MinY = Infinity, stage2MaxY = -Infinity;
    for (const p of points) {
      stage2MinX = Math.min(stage2MinX, p.x);
      stage2MaxX = Math.max(stage2MaxX, p.x);
      stage2MinY = Math.min(stage2MinY, p.y);
      stage2MaxY = Math.max(stage2MaxY, p.y);
    }
    const stage2Width = stage2MaxX - stage2MinX;
    const stage2Height = stage2MaxY - stage2MinY;
    const stage2Area = stage2Width * stage2Height;
    const stage2PointDensity = points.length / stage2Area;
    
    console.log(`[buildStalbergQuadGrid] STAGE 2 ANALYSIS: ${triangles.length} triangles, avg area: ${avgArea.toFixed(2)}, min: ${minArea.toFixed(2)}, max: ${maxArea.toFixed(2)}`);
    console.log(`[buildStalbergQuadGrid] STAGE 2 ANALYSIS: Point density: ${stage2PointDensity.toFixed(6)} points/unit², grid area: ${stage2Area.toFixed(1)}`);
    console.log(`[buildStalbergQuadGrid] STAGE 2 SAMPLE TRIANGLES (first 10):`, JSON.stringify(sampleTriangles, null, 2));
    
    pipelineStages.stage2_triangles = triangles.map(t => ({
      type: t.type,
      verts: [...t.verts],
    }));
    pipelineStages.stage2_points = points.map(p => ({ x: p.x, y: p.y }));
    pipelineStages.stage2_stats = {
      triangleCount: triangles.length,
      pointCount: points.length,
      avgArea: avgArea,
      minArea: minArea,
      maxArea: maxArea,
      sampleTriangles: sampleTriangles,
    };
    console.log('[buildStalbergQuadGrid] Rendered pipeline stage 2: After triangulation');
  }
  
  // Step 3: Dissolve edges to form quads (per design v2 section 1)
  // Enable dissolution for proper quad rendering (not wireframe triangles)
  const skipDissolution = options.politicsMode?.skipDissolution ?? false; // Default to false for quad rendering
  let quads;
  if (skipDissolution) {
    console.log(`[buildStalbergQuadGrid] Skipping dissolution (rendering raw triangles)`);
    quads = triangles; // Use triangles directly
  } else {
    const dissolveProbability = options.politicsMode?.dissolveProbability ?? 0.85; // REFINEMENT FIX 1: Higher default (0.85) for better conversion
    const stepByStepRender = options.politicsMode?.stepByStepRender ?? false;
    // Pass true boundary edges to dissolution function
    quads = dissolveEdgesToQuads(triangles, hexPointIndices, points, rng, dissolveProbability, stepByStepRender, trueBoundaryEdges);
    console.log(`[buildStalbergQuadGrid] After dissolution: ${quads.length} shapes`);
  }
  
  // STEP-BY-STEP DEBUG: Capture Stage 3 (after dissolution/cull to quads) with detailed analysis
  if (stepByStepRender && pipelineStages) {
    // Analyze quads
    const quadCount = quads.filter(q => q.type === 'quad').length;
    const triangleCount = quads.filter(q => q.type === 'triangle').length;
    const quadAreas = [];
    const sampleQuads = [];
    
    for (let i = 0; i < Math.min(10, quads.length); i++) {
      const quad = quads[i];
      if (quad && quad.verts && quad.verts.length >= 3) {
        const verts = quad.verts.map(vIdx => points[vIdx]).filter(v => v);
        if (verts.length >= 3) {
          // Shoelace formula
          let area = 0;
          for (let j = 0; j < verts.length; j++) {
            const v1 = verts[j];
            const v2 = verts[(j + 1) % verts.length];
            area += v1.x * v2.y - v2.x * v1.y;
          }
          area = Math.abs(area) / 2;
          quadAreas.push(area);
          sampleQuads.push({
            index: i,
            type: quad.type,
            verts: quad.verts,
            vertCount: quad.verts.length,
            area: area,
            coords: verts.map(v => ({ x: v.x, y: v.y })),
          });
        }
      }
    }
    
    const avgQuadArea = quadAreas.length > 0 ? quadAreas.reduce((a, b) => a + b, 0) / quadAreas.length : 0;
    
    console.log(`[buildStalbergQuadGrid] STAGE 3 ANALYSIS: ${quads.length} total shapes (${quadCount} quads, ${triangleCount} triangles)`);
    console.log(`[buildStalbergQuadGrid] STAGE 3: Avg quad area: ${avgQuadArea.toFixed(2)}, sample quads:`, JSON.stringify(sampleQuads, null, 2));
    
    pipelineStages.stage3_quads = quads.map(q => ({
      type: q.type,
      verts: [...q.verts],
    }));
    pipelineStages.stage3_points = points.map(p => ({ x: p.x, y: p.y }));
    pipelineStages.stage3_stats = {
      totalShapes: quads.length,
      quadCount: quadCount,
      triangleCount: triangleCount,
      avgQuadArea: avgQuadArea,
      sampleQuads: sampleQuads,
    };
    console.log('[buildStalbergQuadGrid] Rendered pipeline stage 3: After dissolution/cull to quads');
  }
  
  // Step 4: Subdivide remaining triangles (optional - can skip for lower density)
  const skipTriangleSubdivision = options.politicsMode?.skipTriangleSubdivision ?? true; // Default to true for lower density
  
  // AUDIT: Count remaining triangles before subdivision
  const remainingTrianglesBefore = quads.filter(s => s.type === 'triangle');
  const quadsBefore = quads.filter(s => s.type === 'quad');
  
  if (stepByStepRender) {
    console.log(`[buildStalbergQuadGrid] STAGE 4 PRE-SUBDIVISION: ${quads.length} total shapes (${quadsBefore.length} quads, ${remainingTrianglesBefore.length} triangles)`);
    console.log(`[buildStalbergQuadGrid] STAGE 4: skipTriangleSubdivision=${skipTriangleSubdivision}`);
    
    if (remainingTrianglesBefore.length > 0) {
      console.log(`[buildStalbergQuadGrid] STAGE 4: Sample remaining triangles:`, remainingTrianglesBefore.slice(0, 3).map(t => ({
        verts: t.verts,
        type: t.type
      })));
    }
  }
  
  const allQuads = [];
  let trianglesSubdivided = 0;
  let trianglesSkipped = 0;
  let newQuadsFromTriangles = 0;
  let shapesProcessed = 0;
  let quadsKept = 0;
  
  // CROSS-STAGE AUDIT: Track all triangles to ensure none are missed
  const allTrianglesInInput = quads.filter(s => s.type === 'triangle');
  const processedTriangleVerts = new Set();
  
  if (stepByStepRender) {
    console.log(`[buildStalbergQuadGrid] CROSS-STAGE AUDIT: Stage 4 - Processing ${quads.length} shapes (${quadsBefore.length} quads, ${remainingTrianglesBefore.length} triangles)`);
    console.log(`[buildStalbergQuadGrid] CROSS-STAGE AUDIT: All triangles to process:`, allTrianglesInInput.map(t => t.verts));
  }
  
  for (const shape of quads) {
    shapesProcessed++;
    
    if (shape.type === 'triangle' && !skipTriangleSubdivision) {
      // CROSS-STAGE AUDIT: Verify triangle is being processed
      const vertsKey = shape.verts.sort((a, b) => a - b).join(',');
      processedTriangleVerts.add(vertsKey);
      
      // AUDIT: Log triangle subdivision
      if (stepByStepRender && trianglesSubdivided < 5) {
        console.log(`[buildStalbergQuadGrid] STAGE 4: Subdividing triangle ${trianglesSubdivided + 1}/${remainingTrianglesBefore.length} with verts: [${shape.verts.join(',')}]`);
      }
      
      const subQuads = subdivideTriangleIntoThreeQuads(shape, points, addPoint, midpoint);
      
      // CROSS-STAGE AUDIT: Verify subdivision result
      if (subQuads.length !== 3) {
        console.warn(`[buildStalbergQuadGrid] CROSS-STAGE AUDIT: WARNING - Triangle subdivision returned ${subQuads.length} quads (expected 3) for triangle [${shape.verts.join(',')}]`);
      }
      
      // ENHANCED VALIDATION: Mark quads from triangle subdivision for separate rendering
      const markedSubQuads = subQuads.map(q => ({
        ...q,
        fromTriangleSubdivision: true, // Flag for debug rendering
        sourceTriangle: shape.verts // Track original triangle
      }));
      
      allQuads.push(...markedSubQuads);
      trianglesSubdivided++;
      newQuadsFromTriangles += subQuads.length;
      
      // AUDIT: Log result
      if (stepByStepRender && trianglesSubdivided <= 3) {
        console.log(`[buildStalbergQuadGrid] STAGE 4: Created ${subQuads.length} quads from triangle:`, subQuads.map(q => ({
          verts: q.verts,
          type: q.type
        })));
      }
    } else {
      // Keep shape as-is (either quad from dissolution, or triangle if skipping subdivision)
      if (shape.type === 'triangle') {
        trianglesSkipped++;
        if (stepByStepRender && trianglesSkipped <= 3) {
          console.log(`[buildStalbergQuadGrid] STAGE 4: Skipping triangle subdivision for triangle with verts: [${shape.verts.join(',')}] (skipTriangleSubdivision=${skipTriangleSubdivision})`);
        }
      } else if (shape.type === 'quad') {
        quadsKept++;
      }
      allQuads.push(shape);
    }
  }
  
  // CROSS-STAGE AUDIT: Verify all triangles were processed
  if (stepByStepRender && !skipTriangleSubdivision) {
    const allTriangleVerts = new Set(allTrianglesInInput.map(t => t.verts.sort((a, b) => a - b).join(',')));
    const unprocessedTriangles = Array.from(allTriangleVerts).filter(v => !processedTriangleVerts.has(v));
    
    if (unprocessedTriangles.length > 0) {
      console.error(`[buildStalbergQuadGrid] CROSS-STAGE AUDIT: ERROR - ${unprocessedTriangles.length} triangles were NOT processed:`, unprocessedTriangles);
    } else {
      console.log(`[buildStalbergQuadGrid] CROSS-STAGE AUDIT: SUCCESS - All ${remainingTrianglesBefore.length} triangles were processed`);
    }
    
    // Verify counts match
    const expectedNewQuads = remainingTrianglesBefore.length * 3;
    if (newQuadsFromTriangles !== expectedNewQuads) {
      console.warn(`[buildStalbergQuadGrid] CROSS-STAGE AUDIT: WARNING - Expected ${expectedNewQuads} new quads from ${remainingTrianglesBefore.length} triangles, got ${newQuadsFromTriangles}`);
    } else {
      console.log(`[buildStalbergQuadGrid] CROSS-STAGE AUDIT: Counts match - ${remainingTrianglesBefore.length} triangles → ${newQuadsFromTriangles} quads (3 per triangle)`);
    }
  }
  
  if (skipTriangleSubdivision) {
    console.log(`[buildStalbergQuadGrid] Skipping triangle subdivision (keeping dissolved quads only): ${allQuads.length} quads (${trianglesSkipped} triangles kept as-is)`);
  } else {
    console.log(`[buildStalbergQuadGrid] After subdivision: ${allQuads.length} quads (${trianglesSubdivided} triangles subdivided into ${newQuadsFromTriangles} quads)`);
  }
  
  // AUDIT: Post-subdivision summary
  if (stepByStepRender) {
    const quadsAfter = allQuads.filter(s => s.type === 'quad');
    const trianglesAfter = allQuads.filter(s => s.type === 'triangle');
    console.log(`[buildStalbergQuadGrid] STAGE 4 POST-SUBDIVISION: ${allQuads.length} total shapes (${quadsAfter.length} quads, ${trianglesAfter.length} triangles)`);
    console.log(`[buildStalbergQuadGrid] STAGE 4 STATS: ${trianglesSubdivided} triangles subdivided, ${trianglesSkipped} triangles skipped, ${newQuadsFromTriangles} new quads created`);
    console.log(`[buildStalbergQuadGrid] CROSS-STAGE AUDIT: Stage 4 processing - ${shapesProcessed} shapes processed, ${quadsKept} quads kept, ${trianglesSubdivided} triangles subdivided`);
    
    // Final verification
    if (trianglesAfter.length > 0 && !skipTriangleSubdivision) {
      console.warn(`[buildStalbergQuadGrid] CROSS-STAGE AUDIT: WARNING - ${trianglesAfter.length} triangles remain after subdivision (expected 0)`);
    } else if (trianglesAfter.length === 0 && !skipTriangleSubdivision) {
      console.log(`[buildStalbergQuadGrid] CROSS-STAGE AUDIT: SUCCESS - All triangles subdivided, 0 triangles remaining`);
    }
  }
  
  // STEP-BY-STEP DEBUG: Capture Stage 4 (after subdivide triangles to quads)
  if (stepByStepRender && pipelineStages) {
    pipelineStages.stage4_subdividedTriangles = allQuads.map(q => ({
      type: q.type,
      verts: [...q.verts],
    }));
    pipelineStages.stage4_points = points.map(p => ({ x: p.x, y: p.y }));
    console.log('[buildStalbergQuadGrid] Rendered pipeline stage 4: After subdivide triangles to quads');
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
  
  // Step 6: Subdivide Level 0 quads into Level 1 quads (optional, skip for preview)
  const skipLevel1Subdivision = options.politicsMode?.skipLevel1Subdivision ?? true; // Default to true for preview
  const level1Quads = [];
  
  if (!skipLevel1Subdivision) {
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
    console.log(`[buildStalbergQuadGrid] Level 1 subdivision: ${level1Quads.length} quads`);
  } else {
    console.log(`[buildStalbergQuadGrid] Skipping Level 1 subdivision (preview mode)`);
  }
  
  // STEP-BY-STEP DEBUG: Capture Stage 5 (after subdivide quads)
  if (stepByStepRender && pipelineStages) {
    pipelineStages.stage5_subdividedQuads = {
      level0: level0Quads.map(q => ({
        verts: [...q.verts],
        center: { x: q.center.x, y: q.center.y },
      })),
      level1: level1Quads.map(q => ({
        verts: [...q.verts],
        center: { x: q.center.x, y: q.center.y },
      })),
    };
    pipelineStages.stage5_points = points.map(p => ({ x: p.x, y: p.y }));
    console.log('[buildStalbergQuadGrid] Rendered pipeline stage 5: After subdivide quads');
  }
  
  // Step 7: Relaxation (per design v2 section 2)
  // FORCE exact iterations when stepByStepRender is enabled (1 or 0 to isolate structural issues)
  if (stepByStepRender) {
    const debugRelaxIterations = options.politicsMode?.stepByStepRelaxIterations ?? 1;
    if (options.politicsMode?.relaxationIterations !== undefined && options.politicsMode.relaxationIterations !== debugRelaxIterations) {
      console.log('[buildStalbergQuadGrid] STEP-BY-STEP DEBUG: Forcing relaxation to ' + debugRelaxIterations + ' iteration(s) (was ' + options.politicsMode.relaxationIterations + ')');
    }
    options.politicsMode = options.politicsMode || {};
    options.politicsMode.relaxationIterations = debugRelaxIterations; // Force exact iterations for step-by-step debug
  }
  // Relax Level 0 quads first
  // Optimized iterations (80-120) for convergence without over-movement, higher damping to prevent oscillation
  // DIAGNOSTIC: testLowRelaxation flag for testing minimal relaxation (1 iteration)
  // EARLY RELAX: Skip late relaxation if early relaxation was applied
  let relaxationIterations = 0; // Initialize for logging
  const dampingFactor = options.politicsMode?.dampingFactor ?? 0.5;
  
  if (earlyRelaxationApplied) {
    console.log('[buildStalbergQuadGrid] Skipping late relaxation (early relaxation already applied)');
    relaxationIterations = 0; // No late relaxation
    // Update quad centers without relaxation
    for (const quad of level0Quads) {
      quad.center = calculateQuadCenter(quad.verts, points);
    }
    if (level1Quads.length > 0) {
      for (const quad of level1Quads) {
        quad.center = calculateQuadCenter(quad.verts, points);
      }
    }
  } else {
    // Normal late relaxation (current behavior)
    relaxationIterations = options.politicsMode?.testLowRelaxation
      ? 1
      : (options.politicsMode?.relaxationIterations ?? 100);
    
    if (options.politicsMode?.testLowRelaxation) {
      console.log('[buildStalbergQuadGrid] DIAGNOSTIC MODE: testLowRelaxation=true, using 1 iteration only');
      console.log('[buildStalbergQuadGrid] Relaxation test: iterations=1, center chaos? Manual check required');
    }
  
  const level0NeighborMap = buildNeighborMap(points, level0Quads);
    relaxGrid(points, level0NeighborMap, relaxationIterations, dampingFactor, options);
  
  // Update Level 0 quad centers after relaxation
  for (const quad of level0Quads) {
    quad.center = calculateQuadCenter(quad.verts, points);
  }
  
    // Relax Level 1 quads only if they exist
    if (level1Quads.length > 0) {
  const level1NeighborMap = buildNeighborMap(points, level1Quads);
      relaxGrid(points, level1NeighborMap, relaxationIterations, dampingFactor, options);
  
  // Update Level 1 quad centers after relaxation
  for (const quad of level1Quads) {
    quad.center = calculateQuadCenter(quad.verts, points);
      }
    }
  }
  
  // Step 8: Apply dual offset for rounded corners (per design v2 section 2)
  // Reduced offset factor to prevent edge crossings (0.35 = 35% move toward center)
  const dualOffsetFactor = options.politicsMode?.dualOffsetFactor ?? 0.35;
  console.log(`[buildStalbergQuadGrid] Applying dual offset with factor ${dualOffsetFactor}`);
  const dualPoints = applyDualOffset(points, level0Quads, dualOffsetFactor);
  
  // STEP-BY-STEP DEBUG: Capture Stage 6 (after relaxation + dual offset - final)
  if (stepByStepRender && pipelineStages) {
    pipelineStages.stage6_final = {
      points: points.map(p => ({ x: p.x, y: p.y })),
      dualPoints: dualPoints.map(p => ({ x: p.x, y: p.y })),
      level0Quads: level0Quads.map(q => ({
        verts: [...q.verts],
        center: { x: q.center.x, y: q.center.y },
      })),
    };
    console.log('[buildStalbergQuadGrid] Rendered pipeline stage 6: After relaxation + dual offset (final)');
  }
  
  // Step 9: Calculate cell uniformity metrics (post-relaxation analysis)
  if (level0Quads.length > 0) {
    const cellAreas = [];
    for (const quad of level0Quads) {
      if (quad.verts && quad.verts.length >= 3) {
        // Simple area calculation using shoelace formula
        const verts = quad.verts.map(vIdx => points[vIdx]);
        let area = 0;
        for (let j = 0; j < verts.length; j++) {
          const v1 = verts[j];
          const v2 = verts[(j + 1) % verts.length];
          area += v1.x * v2.y - v2.x * v1.y;
        }
        area = Math.abs(area) / 2;
        if (isFinite(area) && area > 0) {
          cellAreas.push(area);
        }
      }
    }
    
    if (cellAreas.length > 0) {
      const avgArea = cellAreas.reduce((a, b) => a + b, 0) / cellAreas.length;
      const variance = cellAreas.reduce((sum, area) => sum + Math.pow(area - avgArea, 2), 0) / cellAreas.length;
      const stdDev = Math.sqrt(variance);
      const coefficientOfVariation = (stdDev / avgArea) * 100;
      const relaxationMode = options.politicsMode?.testLowRelaxation ? 'DIAGNOSTIC (1 iter)' : 'NORMAL';
      console.log(`[buildStalbergQuadGrid] Cell uniformity check (${relaxationMode}): avg cell size ~${avgArea.toFixed(2)}, variance ${variance.toFixed(2)}, CV ${coefficientOfVariation.toFixed(1)}%`);
    }
  }
  
  // Log relaxation parameters for debugging
  console.log(`[buildStalbergQuadGrid] Relaxation parameters: iterations=${relaxationIterations}, damping=${dampingFactor}, offsetFactor=${dualOffsetFactor}, adaptiveDamping=enabled, softBoundary=enabled`);
  console.log(`[buildStalbergQuadGrid] Dual offset complete: ${dualPoints.length} dual points generated`);
  
  // Store raw Delaunay triangles if available (for wireframe rendering)
  const result = {
    points,
    dualPoints,
    level0Quads,
    level1Quads,
  };
  
  // Add raw triangles if they were generated (for temporary wireframe rendering)
  if (rawDelaunayTriangles !== null && rawDelaunayTriangles !== undefined) {
    result.rawDelaunayTriangles = rawDelaunayTriangles;
    console.log(`[buildStalbergQuadGrid] Stored ${rawDelaunayTriangles.length / 3} raw triangles for wireframe rendering`);
  }
  
  // Add pipeline stages for step-by-step rendering
  if (stepByStepRender && pipelineStages) {
    result.pipelineStages = pipelineStages;
    console.log('[buildStalbergQuadGrid] Step-by-step debug: Captured 6 pipeline stages');
  }
  
  return result;
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
 * Create elliptical points using Vogel/Fibonacci spiral distribution
 * Generates a clean, near-perfect circular/elliptical point distribution
 * that naturally fits an ellipse without requiring heavy post-processing.
 * 
 * Uses golden angle (≈2.39996 radians) for uniform spacing in spiral.
 * Points are distributed with ~sqrt(i) radius growth for even density.
 * 
 * @param {number} count - Number of points to generate (~5000-8000)
 * @param {number} aspectRatio - Horizontal stretch factor (default: 1.22 for elliptical shape)
 * @param {Object} rng - RNG instance (for potential future shuffling)
 * @returns {Array} Array of {x, y} points centered at origin
 */
function createEllipticalPoints(count, aspectRatio = 1.22, rng) {
  const points = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5)); // ≈2.39996 radians
  
  // Base radius tuned to fill ~80-90% of target viewBox (r≈500)
  // Scale factor adjusted to match target distribution
  const baseRadius = 480;
  
  for (let i = 0; i < count; i++) {
    // Vogel spiral: angle grows by golden angle, radius grows ~sqrt(i)
    const theta = i * goldenAngle;
    const r = Math.sqrt(i / count) * baseRadius;
    
    // Apply elliptical warping: stretch X by aspectRatio
    const x = r * Math.cos(theta) * aspectRatio;
    const y = r * Math.sin(theta);
    
    points.push({ x, y });
  }
  
  // Optional: Light shuffle to break perfect spiral look (commented out for now)
  // This preserves the clean distribution while adding slight randomness
  // if (rng) {
  //   for (let i = points.length - 1; i > 0; i--) {
  //     const j = Math.floor(rng.random() * (i + 1));
  //     [points[i], points[j]] = [points[j], points[i]];
  //   }
  // }
  
  return points;
}

/**
 * Create elliptical hex lattice points (clipped/warped hex grid for stack-ability)
 * Pivoted to hex lattice for stack-ability - generates hexagonal lattice points
 * that are clipped or warped to fit within an elliptical boundary.
 * 
 * This provides better tiling/stack-ability compared to spiral distribution
 * while maintaining uniform density and elliptical shape.
 * 
 * @param {number} layers - Number of hex layers/rings (default: 50)
 * @param {number} hexSize - Size of hex cells (default: 10)
 * @param {number} aspectRatio - Horizontal stretch factor for ellipse (default: 1.22)
 * @param {Object} rng - RNG instance for noise/shuffling
 * @returns {Array} Array of {x, y} points centered at origin, clipped to ellipse
 */
function createEllipticalHexPoints(layers = 50, hexSize = 10, aspectRatio = 1.22, rng) {
  const points = [];
  const maxRadius = 480; // Target max radius (~500 for viewBox)
  const noiseScale = hexSize / 10; // Light noise for organic feel
  
  // Center point
  points.push({ x: 0, y: 0 });
  
  // Generate hex points using axial coordinates (q, r)
  for (let q = -layers; q <= layers; q++) {
    const r1 = Math.max(-layers, -q - layers);
    const r2 = Math.min(layers, -q + layers);
    for (let r = r1; r <= r2; r++) {
      if (q === 0 && r === 0) continue; // Skip center (already added)
      
      // Convert axial to pixel coordinates
      let x = (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r) * hexSize;
      let y = (3 / 2 * r) * hexSize;
      
      // Check if point is inside ellipse: (x/aspectR)^2 + y^2 <= r^2
      const ellipseX = x / aspectRatio;
      const distFromCenter = Math.sqrt(ellipseX * ellipseX + y * y);
      
      if (distFromCenter > maxRadius) {
        // Point is outside ellipse - warp inward slightly (multiply by 0.95)
        const warpFactor = 0.95;
        x *= warpFactor;
        y *= warpFactor;
        
        // Re-check after warping
        const ellipseXWarped = x / aspectRatio;
        const distWarped = Math.sqrt(ellipseXWarped * ellipseXWarped + y * y);
        
        // If still outside, skip this point
        if (distWarped > maxRadius) {
          continue;
        }
      }
      
      // Add light noise for organic feel
      if (rng) {
        x += (rng.random() - 0.5) * noiseScale;
        y += (rng.random() - 0.5) * noiseScale;
      }
      
      points.push({ x, y });
    }
  }
  
  // Light shuffle for organic feel (optional)
  if (rng && points.length > 1) {
    for (let i = points.length - 1; i > 0; i--) {
      const j = Math.floor(rng.random() * (i + 1));
      [points[i], points[j]] = [points[j], points[i]];
    }
  }
  
  return points;
}

/**
 * Create transformed hex points (perfect hex grid with post-transform for clean border)
 * Clean hexagonal border via post-transform of perfect hex grid
 * 
 * Generates a perfect concentric hexagonal grid first, then applies affine transformation
 * to create an elliptical shape. This preserves the clean hexagonal outer border
 * (full hex sides visible) while achieving the desired elliptical overall shape.
 * 
 * @param {number} hexRings - Number of hex rings (default: 45)
 * @param {number} hexSize - Size of hex cells (default: 12)
 * @param {number} aspect - Horizontal stretch factor for ellipse (default: 1.22)
 * @param {Object} rng - RNG instance for noise/shuffling
 * @returns {Array} Array of {x, y} points centered at origin, transformed to ellipse
 */
function createTransformedHexPoints(hexRings = 45, hexSize = 12, aspect = 1.22, rng) {
  const points = [];
  const noiseScale = hexSize / 12; // Light noise for organic feel
  
  // CORRECT SCALING: Calculate scale to fit target radius (~500px) after aspect stretch
  const targetRadius = 500;
  
  // True max radius before aspect (flat-top hex dominant axis)
  const maxRaw = hexRings * hexSize * Math.sqrt(3);
  
  // After aspect stretch on x
  const maxAfterAspect = maxRaw * aspect;
  
  const scaleToFit = targetRadius / maxAfterAspect;
  
  console.log(`[createTransformedHexPoints] Scaling: hexRings=${hexRings}, hexSize=${hexSize}, maxRaw=${maxRaw.toFixed(1)}, maxAfterAspect=${maxAfterAspect.toFixed(1)}, scaleToFit=${scaleToFit.toFixed(4)}`);
  
  // Step 1: Generate perfect concentric hex rings (axial coordinates q, r)
  // Center point
  points.push({ x: 0, y: 0 });
  
  // Generate all hex points for rings 0 to hexRings
  // Locked boundary for immutable hex border during relaxation
  let boundaryCount = 0;
  for (let q = -hexRings; q <= hexRings; q++) {
    const r1 = Math.max(-hexRings, -q - hexRings);
    const r2 = Math.min(hexRings, -q + hexRings);
    for (let r = r1; r <= r2; r++) {
      if (q === 0 && r === 0) continue; // Skip center (already added)
      
      // Convert axial to pixel coordinates (perfect hex grid)
      // Apply scale FIRST, right after calculating raw x/y
      const x = (Math.sqrt(3) * q + Math.sqrt(3) / 2 * r) * hexSize;
      const y = (3 / 2 * r) * hexSize;
      
      // Apply scale to fit target
      const p = { x: x * scaleToFit, y: y * scaleToFit };
      
      // Then apply aspect stretch
      p.x *= aspect;
      
      // Tag boundary points (outermost ring) - these will be locked during relaxation
      // A point is on the boundary if it's at the edge of the hex grid
      const isBoundary = (q === -hexRings || q === hexRings || 
                          r === -hexRings || r === hexRings ||
                          q + r === -hexRings || q + r === hexRings);
      
      if (isBoundary) {
        p.isBoundary = true;
        boundaryCount++;
      }
      
      points.push(p);
    }
  }
  console.log(`[createTransformedHexPoints] Tagged ${boundaryCount} boundary points (outermost ring)`);
  
  // Step 2: Add light noise for organic feel (after transformation)
  if (rng) {
    for (const p of points) {
      p.x += (rng.random() - 0.5) * noiseScale;
      p.y += (rng.random() - 0.5) * noiseScale;
    }
  }
  
  // Step 3: Light shuffle for organic feel (optional)
  if (rng && points.length > 1) {
    for (let i = points.length - 1; i > 0; i--) {
      const j = Math.floor(rng.random() * (i + 1));
      [points[i], points[j]] = [points[j], points[i]];
    }
  }
  
  // NO OTHER SCALES HERE – remove any finalScale, 0.92, 0.88, etc.
  // Step 4: Recenter to origin
  let sumX = 0, sumY = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
  }
  const centroidX = sumX / points.length;
  const centroidY = sumY / points.length;
  
  // Recenter to origin
  for (const p of points) {
    p.x -= centroidX;
    p.y -= centroidY;
  }
  
  // Bounds check logging
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  points.forEach(p => {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  });
  console.log(`[createTransformedHexPoints] Final grid bounds: minX=${minX.toFixed(1)}, maxX=${maxX.toFixed(1)}, minY=${minY.toFixed(1)}, maxY=${maxY.toFixed(1)}, width=${(maxX-minX).toFixed(1)}, height=${(maxY-minY).toFixed(1)}`);
  
  return points;
}

/**
 * Triangulate points using Delaunator (fast O(n log n) Delaunay triangulation)
 * @param {Array} points - Array of {x, y} points
 * @param {Array} pointIndices - Array of point indices
 * @param {Function} DelaunatorClass - Delaunator class
 * @returns {Array} Array of triangles {type: 'triangle', verts: [i1, i2, i3]}
 */
function triangulateFromPointsWithDelaunator(points, pointIndices, DelaunatorClass) {
  // Convert points to array of [x, y] pairs for Delaunator
  // Delaunator expects [[x0, y0], [x1, y1], ...] format
  const coords = points.map(p => [p.x, p.y]);
  
  // Create Delaunay triangulation
  const delaunay = DelaunatorClass.from(coords);
  const triangles = [];
  const edgeSet = new Set();
  
  // Debug: Check Delaunator output
  console.log(`[triangulateFromPointsWithDelaunator] Input: ${points.length} points, coords length: ${coords.length}`);
  console.log(`[triangulateFromPointsWithDelaunator] Delaunay triangles length: ${delaunay.triangles ? delaunay.triangles.length : 'undefined'}`);
  
  // Extract triangles from Delaunay triangulation
  // delaunay.triangles is a flat array: [t0a, t0b, t0c, t1a, t1b, t1c, ...]
  if (!delaunay.triangles || delaunay.triangles.length === 0) {
    console.warn('[triangulateFromPointsWithDelaunator] No triangles returned from Delaunator');
    return { triangles: [], rawTriangles: null };
  }
  
  // Store raw triangle indices for wireframe rendering (before deduplication)
  const rawTriangles = Array.from(delaunay.triangles);
  
  for (let i = 0; i < delaunay.triangles.length; i += 3) {
    const i0 = delaunay.triangles[i];
    const i1 = delaunay.triangles[i + 1];
    const i2 = delaunay.triangles[i + 2];
    
    // Map to point indices
    const v0 = pointIndices[i0];
    const v1 = pointIndices[i1];
    const v2 = pointIndices[i2];
    
    // Create sorted key to avoid duplicates
    const triKey = [v0, v1, v2].sort((a, b) => a - b).join(',');
    
    if (!edgeSet.has(triKey)) {
      edgeSet.add(triKey);
      triangles.push({
        type: 'triangle',
        verts: [v0, v1, v2],
      });
    }
  }
  
  return { triangles, rawTriangles };
}

/**
 * Triangulate points using simple nearest-neighbor approach (fallback, slow O(n²))
 * Only use this if Delaunator is not available
 * @param {Array} points - Array of {x, y} points
 * @param {Array} pointIndices - Array of point indices
 * @returns {Array} Array of triangles {type: 'triangle', verts: [i1, i2, i3]}
 */
function triangulateFromPointsSimple(points, pointIndices) {
  // For small point sets only (warn if too large)
  if (points.length > 1000) {
    console.warn(`[triangulateFromPointsSimple] Large point set (${points.length}), consider using Delaunator for better performance`);
  }
  
  const triangles = [];
  const edgeSet = new Set();
  const k = 6; // Number of nearest neighbors to consider
  
  // Helper: Calculate distance between two points
  function distance(p1, p2) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
  
  // For each point, find k nearest neighbors and create triangles
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const neighbors = [];
    
    // Find k nearest neighbors
    for (let j = 0; j < points.length; j++) {
      if (i === j) continue;
      const dist = distance(p, points[j]);
      neighbors.push({ index: j, distance: dist });
    }
    
    // Sort by distance and take k nearest
    neighbors.sort((a, b) => a.distance - b.distance);
    const nearest = neighbors.slice(0, k).map(n => n.index);
    
    // Create triangles with nearest neighbors (connect to pairs)
    for (let ni = 0; ni < nearest.length; ni++) {
      const n1 = nearest[ni];
      const n2 = nearest[(ni + 1) % nearest.length];
      
      // Create triangle [i, n1, n2] if not already exists
      const triKey = [pointIndices[i], pointIndices[n1], pointIndices[n2]]
        .sort((a, b) => a - b).join(',');
      
      if (!edgeSet.has(triKey)) {
        edgeSet.add(triKey);
        triangles.push({
          type: 'triangle',
          verts: [pointIndices[i], pointIndices[n1], pointIndices[n2]],
        });
      }
    }
  }
  
  return triangles;
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
function dissolveEdgesToQuads(triangles, hexPointIndices, points, rng, dissolveProbability = 0.5, debugMode = false, trueBoundaryEdges = null, hullIndices = null) {
  // STEP-BY-STEP DEBUG: Detailed logging
  if (debugMode) {
    console.log(`[dissolveEdgesToQuads] STARTING: ${triangles.length} input triangles, ${points.length} points, dissolveProbability=${dissolveProbability}`);
    if (trueBoundaryEdges) {
      console.log(`[dissolveEdgesToQuads] True boundary edges provided: ${trueBoundaryEdges.size} edges to protect`);
    } else {
      console.log(`[dissolveEdgesToQuads] WARNING: No true boundary edges provided - using legacy boundary detection`);
    }
    if (hullIndices) {
      console.log(`[dissolveEdgesToQuads] Hull indices provided: ${hullIndices.length} hull points`);
    }
  }
  
  // Helper: Check if an edge is border-adjacent (has at least one vertex on hull)
  function isBorderAdjacentEdge(edgeKey) {
    if (!hullIndices || hullIndices.length === 0) {
      // Fallback: Check if edge is in trueBoundaryEdges or has boundary vertices
      if (trueBoundaryEdges && trueBoundaryEdges.has(edgeKey)) {
        return true;
      }
      const [v1, v2] = edgeKey.split(',').map(Number);
      const p1 = points[v1];
      const p2 = points[v2];
      return (p1?.isBoundary || p2?.isBoundary) || false;
    }
    const [v1, v2] = edgeKey.split(',').map(Number);
    return hullIndices.includes(v1) || hullIndices.includes(v2);
  }
  
  // REFINEMENT FIX 1: Epsilon tolerance for floating-point vertex comparison
  const EPSILON = 1e-6;
  function vertsEqual(v1, v2) {
    return Math.abs(v1 - v2) < EPSILON;
  }
  
  // Work with a mutable copy of triangles
  const workingTriangles = triangles.map(t => ({ ...t, verts: [...t.verts] }));
  const quads = [];
  
  // BORDER ISOLATION FIX: Increase maxAttempts dynamically based on initial candidate count
  // Calculate initial candidate count inline (buildEdgeMap is defined later)
  const getEdgeKeyForMaxAttempts = (v1, v2) => v1 < v2 ? `${v1},${v2}` : `${v2},${v1}`;
  const tempEdgeMap = new Map();
  workingTriangles.forEach((tri) => {
    if (tri.removed) return;
    const [v0, v1, v2] = tri.verts;
    const edges = [
      getEdgeKeyForMaxAttempts(v0, v1),
      getEdgeKeyForMaxAttempts(v1, v2),
      getEdgeKeyForMaxAttempts(v2, v0),
    ];
    edges.forEach(edgeKey => {
      if (!tempEdgeMap.has(edgeKey)) {
        tempEdgeMap.set(edgeKey, []);
      }
      tempEdgeMap.get(edgeKey).push(tri);
    });
  });
  const initialCandidateCount = Array.from(tempEdgeMap.entries())
    .filter(([edgeKey, triObjects]) => triObjects.length === 2 && !triObjects[0].removed && !triObjects[1].removed)
    .length;
  const maxAttempts = Math.max(workingTriangles.length * 3, initialCandidateCount * 2);
  
  if (debugMode) {
    console.log(`[dissolveEdgesToQuads] Initial candidates: ${initialCandidateCount}, maxAttempts: ${maxAttempts} (base: ${workingTriangles.length * 3})`);
  }
  
  let dissolveCount = 0;
  let attempts = 0;
  let edgesDissolved = 0;
  let invalidEdgeAttempts = 0;
  let degenerateQuadAttempts = 0;
  let probabilitySkips = 0; // REFINEMENT FIX 1: Track probability skips
  let epsilonMatches = 0; // REFINEMENT FIX 2: Track epsilon-adjusted matches
  
  // TARGETED DEBUG: Track all edges that were candidates but never selected/merged
  const allCandidateEdges = new Set(); // All edges that were ever candidates
  const attemptedEdges = new Set(); // Edges that were actually selected and attempted
  const mergedEdges = new Set(); // Edges that were successfully merged
  const skippedEdgesLog = []; // Detailed log of why edges were skipped
  
  // BORDER ISOLATION AUDIT: Track border vs interior candidates
  const borderCandidates = new Set(); // Border-adjacent candidate edges
  const borderAttempted = new Set(); // Border edges attempted
  const borderMerged = new Set(); // Border edges successfully merged
  const borderSkipped = []; // Border edges skipped with reasons
  
  // Build edge map: edge -> [triangle indices that share this edge]
  // Edge is represented as sorted pair of vertex indices
  function getEdgeKey(v1, v2) {
    return v1 < v2 ? `${v1},${v2}` : `${v2},${v1}`;
  }
  
  // Build initial edge map
  // PRIORITY 2 FIX: Store triangle objects instead of indices to eliminate index staleness
  function buildEdgeMap(triangles) {
    const edgeMap = new Map();
    let boundaryEdges = 0;
    let multiSharedEdges = 0;
    const problematicEdges = [];
    
    triangles.forEach((tri) => {
      // Skip removed triangles
      if (tri.removed) return;
      
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
        edgeMap.get(edgeKey).push(tri); // Store triangle object, not index
      });
    });
    
    // AUDIT: Validate edge map
    edgeMap.forEach((triObjects, edgeKey) => {
      if (triObjects.length === 1) {
        boundaryEdges++;
      } else if (triObjects.length > 2) {
        multiSharedEdges++;
        if (problematicEdges.length < 10) {
          problematicEdges.push({
            edge: edgeKey,
            count: triObjects.length,
            triangleVerts: triObjects.map(tri => tri?.verts || 'missing')
          });
        }
      }
    });
    
    if (debugMode) {
      console.log(`[buildEdgeMap] AUDIT: Total edges: ${edgeMap.size}, boundary: ${boundaryEdges}, multi-shared (>2): ${multiSharedEdges}`);
      if (problematicEdges.length > 0) {
        console.log(`[buildEdgeMap] AUDIT: Sample problematic edges:`, JSON.stringify(problematicEdges, null, 2));
      }
      
      // Log sample of first 10 edges
      const sampleEdges = Array.from(edgeMap.entries()).slice(0, 10).map(([edgeKey, triObjects]) => ({
        edge: edgeKey,
        triangleVerts: triObjects.map(tri => tri?.verts || 'missing')
      }));
      console.log(`[buildEdgeMap] AUDIT: Sample edges (first 10):`, JSON.stringify(sampleEdges, null, 2));
    }
    
    return edgeMap;
  }
  
  // Check if dissolving an edge creates a valid quad
  // PRIORITY 2 FIX: Now receives triangle objects directly from edge map (no index lookup needed)
  // REFINEMENT FIX 2: Uses epsilon tolerance for vertex comparison
  function canDissolveEdge(edgeKey, edgeMap, triangles) {
    const sharingTriangles = edgeMap.get(edgeKey);
    if (!sharingTriangles || sharingTriangles.length !== 2) {
      if (debugMode) {
        console.log(`[canDissolveEdge] REJECT: Edge ${edgeKey} shared by ${sharingTriangles?.length || 0} triangles (expected 2)`);
      }
      return false; // Not an internal edge (shared by exactly 2 triangles)
    }
    
    // PRIORITY 2 FIX: Get triangle objects directly (no index lookup)
    const [tri1, tri2] = sharingTriangles;
    
    if (!tri1 || !tri2 || tri1.removed || tri2.removed) {
      if (debugMode) {
        console.log(`[canDissolveEdge] REJECT: Edge ${edgeKey} - triangle missing or removed (tri1: ${tri1 ? 'exists' : 'missing'}, tri2: ${tri2 ? 'exists' : 'missing'}, tri1.removed: ${tri1?.removed}, tri2.removed: ${tri2?.removed})`);
      }
      return false; // One of the triangles is already removed
    }
    
    // PRIORITY 1 FIX: Extract edge vertices and verify they exist in both triangles
    const [v1, v2] = edgeKey.split(',').map(Number);
    const tri1HasEdge = tri1.verts.includes(v1) && tri1.verts.includes(v2);
    const tri2HasEdge = tri2.verts.includes(v1) && tri2.verts.includes(v2);
    
    if (!tri1HasEdge || !tri2HasEdge) {
      if (debugMode) {
        console.log(`[canDissolveEdge] REJECT: Edge ${edgeKey} not present in both triangles (tri1 has edge: ${tri1HasEdge}, tri2 has edge: ${tri2HasEdge}, tri1 verts: [${tri1.verts.join(',')}], tri2 verts: [${tri2.verts.join(',')}])`);
      }
      return false;
    }
    
    // REFINEMENT FIX 2: Verify triangles share EXACTLY the two edge vertices using epsilon tolerance
    // First try exact match, then epsilon match
    let sharedVerts = tri1.verts.filter(v => tri2.verts.includes(v));
    
    // If exact match fails, try epsilon tolerance
    if (sharedVerts.length !== 2) {
      sharedVerts = tri1.verts.filter(v1 => 
        tri2.verts.some(v2 => vertsEqual(v1, v2))
      );
      if (sharedVerts.length === 2) {
        epsilonMatches++;
        if (debugMode && epsilonMatches <= 5) {
          console.log(`[canDissolveEdge] Epsilon match: Found shared vertices using tolerance (edge: ${edgeKey})`);
        }
      }
    }
    
    // Verify shared vertices include the edge vertices (with epsilon tolerance)
    const hasV1 = sharedVerts.some(v => vertsEqual(v, v1));
    const hasV2 = sharedVerts.some(v => vertsEqual(v, v2));
    
    if (sharedVerts.length !== 2 || !hasV1 || !hasV2) {
      if (debugMode) {
        console.log(`[canDissolveEdge] REJECT: Triangles share ${sharedVerts.length} vertices [${sharedVerts.join(',')}], expected exactly 2: [${v1},${v2}]. tri1 verts: [${tri1.verts.join(',')}], tri2 verts: [${tri2.verts.join(',')}]`);
      }
      return false;
    }
    
    // REFINEMENT FIX 2: Get all unique vertices using epsilon tolerance
    // Build unique set with epsilon-rounded keys
    const uniqueVerts = [];
    const seenKeys = new Set();
    
    for (const v of [...tri1.verts, ...tri2.verts]) {
      const roundedKey = Math.round(v / EPSILON) * EPSILON;
      const keyStr = roundedKey.toFixed(6);
      if (!seenKeys.has(keyStr)) {
        seenKeys.add(keyStr);
        uniqueVerts.push(v);
      }
    }
    
    // Must have exactly 4 unique vertices to form a quad
    if (uniqueVerts.length !== 4) {
      if (debugMode) {
        console.log(`[canDissolveEdge] REJECT: ${uniqueVerts.length} unique vertices (expected 4), tri1: [${tri1.verts.join(',')}], tri2: [${tri2.verts.join(',')}], shared: [${sharedVerts.join(',')}]`);
      }
      return false;
    }
    
    // Check for degenerate cases (collinear points, etc.)
    // Simple check: ensure no three points are collinear
    // For now, we'll accept any 4-vertex combination (can be refined later)
    return true;
  }
  
  // Merge two triangles into a quad
  // AUDIT: Enhanced logging to track vertex ordering and potential issues
  function mergeTrianglesToQuad(tri1, tri2, edgeKey) {
    const [v1, v2] = edgeKey.split(',').map(Number);
    const allVerts = [...new Set([...tri1.verts, ...tri2.verts])];
    
    // AUDIT: Log input data
    if (debugMode && edgesDissolved <= 10) {
      console.log(`[mergeTrianglesToQuad] AUDIT: Merging edge ${edgeKey}`);
      console.log(`  tri1 verts: [${tri1.verts.join(',')}]`);
      console.log(`  tri2 verts: [${tri2.verts.join(',')}]`);
      console.log(`  shared edge: [${v1},${v2}]`);
      console.log(`  allVerts (unique): [${allVerts.join(',')}] (count: ${allVerts.length})`);
    }
    
    // AUDIT: Check for issues before ordering
    if (allVerts.length !== 4) {
      if (debugMode) {
        console.log(`[mergeTrianglesToQuad] WARNING: Expected 4 unique vertices, got ${allVerts.length}`);
        console.log(`  tri1 verts: [${tri1.verts.join(',')}], tri2 verts: [${tri2.verts.join(',')}]`);
      }
    }
    
    // Order vertices to form a valid quad
    // IMPROVED ALGORITHM: The two triangles share edge [v1, v2]. 
    // The quad should be ordered as: [v1, unique_from_tri1, v2, unique_from_tri2]
    // This ensures vertices form a proper cycle around the quad perimeter
    const orderedVerts = [];
    let orderingMethod = 'proper';
    
    // Find the unique vertex from each triangle (not on the shared edge)
    const tri1Unique = tri1.verts.find(v => v !== v1 && v !== v2);
    const tri2Unique = tri2.verts.find(v => v !== v1 && v !== v2);
    
    if (tri1Unique === undefined || tri2Unique === undefined) {
      if (debugMode) {
        console.log(`[mergeTrianglesToQuad] ERROR: Cannot find unique vertices. tri1: [${tri1.verts.join(',')}], tri2: [${tri2.verts.join(',')}], edge: [${v1},${v2}]`);
      }
      // Fallback: use allVerts in order (may cause incorrect shape)
      orderedVerts.push(...allVerts);
      orderingMethod = 'fallback';
    } else {
      // AUDIT: Use proper quad ordering: [v1, tri1Unique, v2, tri2Unique]
      // This ensures vertices form a proper cycle around the quad
      orderedVerts.push(v1, tri1Unique, v2, tri2Unique);
      
      if (debugMode && edgesDissolved <= 10) {
        console.log(`[mergeTrianglesToQuad] Using proper quad ordering: [${v1}, ${tri1Unique}, ${v2}, ${tri2Unique}]`);
      }
    }
    
    // AUDIT: Verify vertex ordering forms a valid cycle
    // Check if vertices are in correct order (no duplicates, proper cycle)
    const hasDuplicates = orderedVerts.length !== new Set(orderedVerts).size;
    if (hasDuplicates && debugMode) {
      console.log(`[mergeTrianglesToQuad] WARNING: Duplicate vertices in ordered list: [${orderedVerts.join(',')}]`);
    }
    
    // AUDIT: Log final quad
    if (debugMode && edgesDissolved <= 10) {
      console.log(`[mergeTrianglesToQuad] RESULT: Quad with ${orderedVerts.length} vertices: [${orderedVerts.join(',')}] (ordering: ${orderingMethod})`);
      if (orderingMethod === 'fallback') {
        console.log(`[mergeTrianglesToQuad] WARNING: Used fallback ordering - may cause incorrect polygon shape`);
      }
      if (hasDuplicates) {
        console.log(`[mergeTrianglesToQuad] ERROR: Quad has duplicate vertices - will cause rendering issues`);
      }
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
    const activeTriangles = workingTriangles.filter(t => !t.removed);
    const edgeMap = buildEdgeMap(activeTriangles);
    
    // Get all internal edges (shared by exactly 2 triangles)
    // REFINED BOUNDARY PROTECTION: Only protect edges where BOTH endpoints are hull vertices AND edge is on hull segment
    // Allow merges of shared edges even if one endpoint is on hull (as long as edge itself isn't a hull segment)
    const internalEdges = [];
    const skippedEdges = [];
    let borderCandidateCount = 0;
    let interiorCandidateCount = 0;
    
    for (const [edgeKey, triObjects] of edgeMap.entries()) {
      // AUDIT: Log ALL edges with their sharing count and protection status
      const sharingCount = triObjects.length;
      const isInTrueBoundary = trueBoundaryEdges && trueBoundaryEdges.has(edgeKey);
      
      // CRITICAL BUG IDENTIFIED: Current logic protects edges in trueBoundaryEdges even if shared by 2 triangles
      // CORRECT LOGIC: Only protect edges that are:
      //   1. Shared by exactly 1 triangle (true boundary) AND
      //   2. On the convex hull (in trueBoundaryEdges)
      // If shared by 2 triangles, allow dissolution even if on hull (it's an internal edge near border)
      
      if (sharingCount === 1) {
        // True boundary edge (shared by only 1 triangle) - protect if on hull
        if (isInTrueBoundary) {
          if (debugMode && attempts <= 10) {
            console.log(`[dissolveEdgesToQuads] AUDIT: Protected true boundary edge: ${edgeKey} (shared by 1 triangle, on hull)`);
          }
          skippedEdges.push({ edge: edgeKey, reason: 'true_boundary_single_triangle', sharingCount: 1, isInTrueBoundary: true });
          continue; // Skip true boundary edges (shared by 1 triangle, on hull)
        }
        // Not on hull but shared by 1 - still protect (boundary edge)
        if (debugMode && attempts <= 10) {
          console.log(`[dissolveEdgesToQuads] AUDIT: Protected boundary edge: ${edgeKey} (shared by 1 triangle, not on hull)`);
        }
        skippedEdges.push({ edge: edgeKey, reason: 'boundary_single_triangle', sharingCount: 1, isInTrueBoundary: false });
        continue;
      }
      
      // Must be shared by exactly 2 triangles to be a candidate
      if (sharingCount !== 2 || triObjects[0].removed || triObjects[1].removed) {
        continue;
      }
      
      // CRITICAL FIX: If shared by 2 triangles, allow dissolution even if in trueBoundaryEdges
      // The edge is internal (shared by 2 triangles), so it can be dissolved
      // Previous bug: We were protecting edges in trueBoundaryEdges even if shared by 2 triangles
      if (isInTrueBoundary && debugMode && attempts <= 20) {
        console.log(`[dissolveEdgesToQuads] AUDIT: ALLOWING internal edge on hull: ${edgeKey} (shared by 2 triangles, in trueBoundaryEdges but allowing merge)`);
        console.log(`  Tri1: [${triObjects[0].verts.join(',')}], Tri2: [${triObjects[1].verts.join(',')}]`);
      }
      
      // TARGETED DEBUG: Track all candidate edges
      allCandidateEdges.add(edgeKey);
      
      // BORDER ISOLATION AUDIT: Track border vs interior candidates
      const isBorder = isBorderAdjacentEdge(edgeKey);
      if (isBorder) {
        borderCandidates.add(edgeKey);
        borderCandidateCount++;
      } else {
        interiorCandidateCount++;
      }
      
      // TARGETED DEBUG: Log all internal edges being considered
      if (debugMode && attempts <= 20) {
        const [v1, v2] = edgeKey.split(',').map(Number);
        const p1 = points[v1];
        const p2 = points[v2];
        const v1OnHull = p1?.isBoundary || false;
        const v2OnHull = p2?.isBoundary || false;
        console.log(`[dissolveEdgesToQuads] Internal edge candidate: ${edgeKey}, tri1: [${triObjects[0].verts.join(',')}], tri2: [${triObjects[1].verts.join(',')}], v1OnHull: ${v1OnHull}, v2OnHull: ${v2OnHull}`);
      }
      
      internalEdges.push(edgeKey); // Allow merge (shared edge, not on true boundary)
    }
    
    // BORDER ISOLATION AUDIT: Log candidate stats at start of iteration
    if (debugMode && attempts <= 10) {
      console.log(`[dissolveEdgesToQuads] ITERATION ${attempts}: ${internalEdges.length} total candidates (${borderCandidateCount} border, ${interiorCandidateCount} interior), ${activeTriangles.length} active triangles`);
    }
    
    // TARGETED DEBUG: Log skipped edges summary
    if (debugMode && skippedEdges.length > 0 && attempts <= 5) {
      console.log(`[dissolveEdgesToQuads] Skipped ${skippedEdges.length} edges due to boundary protection (sample):`, skippedEdges.slice(0, 5));
    }
    
    if (internalEdges.length === 0) {
      if (debugMode && attempts === 1) {
        console.log(`[dissolveEdgesToQuads] WARNING: No internal edges found on first attempt! Active triangles: ${activeTriangles.length}`);
      }
      break; // No more internal edges to dissolve
    }
    
    // REFINEMENT FIX 1: Randomly select an edge (with configurable probability check)
    const rand = rng.random();
    if (rand > dissolveProbability) {
      probabilitySkips++;
      // TARGETED DEBUG: Track probability skips (but don't log which edge was skipped since we haven't selected yet)
      if (debugMode && probabilitySkips <= 10) {
        console.log(`[dissolveEdgesToQuads] Skipped merge due to probability (rand=${rand.toFixed(3)}, threshold=${dissolveProbability}, internalEdges=${internalEdges.length}, border=${borderCandidateCount})`);
      }
      continue; // Skip this attempt based on probability
    }
    
    const randomEdgeIndex = Math.floor(rng.random() * internalEdges.length);
    const selectedEdge = internalEdges[randomEdgeIndex];
    const isSelectedBorder = isBorderAdjacentEdge(selectedEdge);
    
    // BORDER ISOLATION AUDIT: Track attempted edges
    if (isSelectedBorder) {
      borderAttempted.add(selectedEdge);
    }
    
    // Log allowed merge near boundary (if edge has boundary vertices but isn't a true boundary edge)
    if (debugMode && attempts <= 10 && trueBoundaryEdges) {
      const [v1, v2] = selectedEdge.split(',').map(Number);
      const p1 = points[v1];
      const p2 = points[v2];
      if ((p1?.isBoundary || p2?.isBoundary) && !trueBoundaryEdges.has(selectedEdge)) {
        console.log(`[dissolveEdgesToQuads] Allowed internal merge near boundary: ${selectedEdge} (vertices may be boundary, but edge is not on true hull)`);
      }
    }
    
    // PRIORITY 1 FIX: Use canDissolveEdge() with explicit edge sharing validation
    const canDissolve = canDissolveEdge(selectedEdge, edgeMap, workingTriangles);
    
    // AUDIT: Log detailed attempt info (reduced logging since canDissolveEdge() now logs rejections)
    if (debugMode && attempts <= 20) {
      const sharingTriangles = edgeMap.get(selectedEdge);
      const auditInfo = {
        attempt: attempts,
        selectedEdge: selectedEdge,
        sharingTriangles: sharingTriangles,
        canDissolve: canDissolve,
        edgeMapSize: edgeMap.size,
        activeTriangles: activeTriangles.length
      };
      
      if (sharingTriangles && sharingTriangles.length === 2) {
      const [tri1Idx, tri2Idx] = sharingTriangles;
      const tri1 = workingTriangles[tri1Idx];
      const tri2 = workingTriangles[tri2Idx];
        auditInfo.tri1Verts = tri1?.verts;
        auditInfo.tri2Verts = tri2?.verts;
        auditInfo.tri1Removed = tri1?.removed;
        auditInfo.tri2Removed = tri2?.removed;
      }
      
      if (canDissolve) {
        console.log(`[dissolveEdgesToQuads] AUDIT attempt ${attempts} - APPROVED:`, JSON.stringify(auditInfo, null, 2));
      }
    }
    
    if (canDissolve) {
      // PRIORITY 2 FIX: Get triangle objects directly from edge map (no index lookup)
      const sharingTriangles = edgeMap.get(selectedEdge);
      const [tri1, tri2] = sharingTriangles;
      
      // Merge into quad
      const quad = mergeTrianglesToQuad(tri1, tri2, selectedEdge);
      
      // Validate quad (must have 4 vertices)
      if (quad.verts.length !== 4) {
        degenerateQuadAttempts++;
        if (debugMode && degenerateQuadAttempts <= 10) {
          console.log(`[dissolveEdgesToQuads] Degenerate quad from edge ${selectedEdge}: ${quad.verts.length} vertices (expected 4), tri1 verts: [${tri1.verts.join(',')}], tri2 verts: [${tri2.verts.join(',')}]`);
        }
        continue; // Invalid quad
      }
      
      // SAFETY VALIDATION: Ensure we didn't dissolve a true boundary edge (sharingCount === 1)
      const edgeInfo = edgeMap.get(selectedEdge);
      if (edgeInfo && edgeInfo.length === 1) {
        console.error(`[dissolveEdgesToQuads] ERROR: Attempted to dissolve true boundary edge! ${selectedEdge} (sharingCount=1)`);
        // Rollback: Don't mark triangles as removed, don't add quad
        continue; // Skip this merge
      }
      
      // Mark triangles as removed
      tri1.removed = true;
      tri2.removed = true;
      
      // Add quad
      quads.push(quad);
      dissolveCount++;
      edgesDissolved++;
      mergedEdges.add(selectedEdge); // TARGETED DEBUG: Track successfully merged edges
      
      // BORDER ISOLATION AUDIT: Track successful merges
      if (isSelectedBorder) {
        borderMerged.add(selectedEdge);
      }
      
      if (debugMode && edgesDissolved <= 10) {
        console.log(`[dissolveEdgesToQuads] SUCCESS: Dissolved edge ${selectedEdge} (border=${isSelectedBorder}) into quad with verts: [${quad.verts.join(',')}]`);
        const remainingActive = workingTriangles.filter(t => !t.removed).length;
        const remainingCandidates = internalEdges.length - 1; // Approximate
        console.log(`  Remaining: ${remainingActive} triangles, ~${remainingCandidates} candidates`);
      }
    } else {
      invalidEdgeAttempts++;
      // BORDER ISOLATION AUDIT: Track why edge was rejected
      if (debugMode && attempts <= 30) {
        const reason = 'canDissolveEdge_rejected';
        skippedEdgesLog.push({ edge: selectedEdge, reason: reason, attempt: attempts, isBorder: isSelectedBorder });
        if (isSelectedBorder) {
          borderSkipped.push({ edge: selectedEdge, reason: reason, attempt: attempts });
          console.log(`[dissolveEdgesToQuads] BORDER EDGE REJECTED: ${selectedEdge}, reason=${reason}`);
        }
      }
      // Note: canDissolveEdge() already logs rejection reasons, so we don't duplicate here
    }
  }
  
  // FINAL MERGE PASS: Deterministic pass to catch remaining valid merges
  // Per audit recommendation: Force-merge valid edges that were skipped due to probability
  let finalPassMerges = 0;
  let finalPassAttempts = 0;
  const maxFinalPassIterations = 2; // Limit to 1-2 iterations to avoid over-merging
  
  if (debugMode) {
    const remainingBeforeFinal = workingTriangles.filter(t => !t.removed).length;
    console.log(`[dissolveEdgesToQuads] Starting final merge pass (${remainingBeforeFinal} triangles remaining, max ${maxFinalPassIterations} iterations)`);
  }
  
  for (let finalIter = 0; finalIter < maxFinalPassIterations; finalIter++) {
    const activeTriangles = workingTriangles.filter(t => !t.removed);
    if (activeTriangles.length < 2) break; // Need at least 2 triangles to merge
    
    const edgeMap = buildEdgeMap(activeTriangles);
    // CRITICAL FIX: Only protect edges shared by 1 triangle (true boundary)
    // Allow all edges shared by 2 triangles, even if on hull
    const internalEdges = Array.from(edgeMap.entries())
      .filter(([edgeKey, triObjects]) => {
        const sharingCount = triObjects.length;
        const isInTrueBoundary = trueBoundaryEdges && trueBoundaryEdges.has(edgeKey);
        
        // Skip if not shared by exactly 2 triangles
        if (sharingCount !== 2 || triObjects[0].removed || triObjects[1].removed) {
          return false;
        }
        
        // CRITICAL FIX: Only protect if shared by 1 triangle AND on hull
        // If shared by 2 triangles, allow merge even if on hull (it's an internal edge)
        if (sharingCount === 1 && isInTrueBoundary) {
          return false; // True boundary edge (shared by 1, on hull) - protect
        }
        
        return true; // Allow merge (shared by 2 triangles, internal edge)
      })
      .map(([edgeKey]) => edgeKey);
    
    if (internalEdges.length === 0) {
      if (debugMode && finalIter === 0) {
        console.log(`[dissolveEdgesToQuads] Final pass: No internal edges found (all remaining triangles are isolated)`);
      }
      break; // No more internal edges
    }
    
      // Process all valid edges (probability = 1.0, force merge)
      // CRITICAL FIX: Only protect edges shared by 1 triangle (true boundary)
      // Allow all edges shared by 2 triangles, even if on hull
      let mergedThisIteration = 0;
      const finalPassSkipped = [];
      
      for (const selectedEdge of internalEdges) {
        // Check sharing count from edgeMap
        const edgeInfo = edgeMap.get(selectedEdge);
        const sharingCount = edgeInfo ? edgeInfo.length : 0;
        const isInTrueBoundary = trueBoundaryEdges && trueBoundaryEdges.has(selectedEdge);
        
        // Only protect if shared by 1 triangle (true boundary)
        // If shared by 2 triangles, allow merge even if on hull
        if (sharingCount === 1 && isInTrueBoundary) {
          if (debugMode && finalPassAttempts < 10) {
            console.log(`[dissolveEdgesToQuads] Final pass: Skipped true boundary edge: ${selectedEdge} (shared by 1 triangle, on hull)`);
          }
          finalPassSkipped.push({ edge: selectedEdge, reason: 'true_boundary_single_triangle', sharingCount: 1 });
          continue;
        }
        
        // If shared by 2 triangles but in trueBoundaryEdges, log but allow
        if (sharingCount === 2 && isInTrueBoundary && debugMode && finalPassAttempts < 10) {
          console.log(`[dissolveEdgesToQuads] Final pass: ALLOWING internal edge on hull: ${selectedEdge} (shared by 2 triangles)`);
        }
        
        finalPassAttempts++;
        const canDissolve = canDissolveEdge(selectedEdge, edgeMap, workingTriangles);
        
        // TARGETED DEBUG: Log final pass attempts
        if (debugMode && finalPassAttempts <= 10) {
          const [v1, v2] = selectedEdge.split(',').map(Number);
          const p1 = points[v1];
          const p2 = points[v2];
          console.log(`[dissolveEdgesToQuads] Final pass attempt ${finalPassAttempts}: edge ${selectedEdge}, canDissolve: ${canDissolve}, v1OnHull: ${p1?.isBoundary}, v2OnHull: ${p2?.isBoundary}`);
        }
      
      if (canDissolve) {
        const sharingTriangles = edgeMap.get(selectedEdge);
        const [tri1, tri2] = sharingTriangles;
        
        // Merge into quad
        const quad = mergeTrianglesToQuad(tri1, tri2, selectedEdge);
        
        // Validate quad (must have 4 vertices)
        if (quad.verts.length !== 4) {
          if (debugMode && finalPassMerges < 5) {
            console.log(`[dissolveEdgesToQuads] Final pass: Degenerate quad from edge ${selectedEdge}: ${quad.verts.length} vertices`);
          }
          continue; // Invalid quad
        }
        
        // SAFETY VALIDATION: Ensure we didn't dissolve a true boundary edge (sharingCount === 1)
        const edgeInfo = edgeMap.get(selectedEdge);
        if (edgeInfo && edgeInfo.length === 1) {
          console.error(`[dissolveEdgesToQuads] ERROR: Final pass attempted to dissolve true boundary edge! ${selectedEdge} (sharingCount=1)`);
          continue; // Skip this merge
        }
        
        // Mark triangles as removed
        tri1.removed = true;
        tri2.removed = true;
        
        // Add quad
        quads.push(quad);
        edgesDissolved++;
        finalPassMerges++;
        mergedThisIteration++;
        
        if (debugMode && finalPassMerges <= 5) {
          console.log(`[dissolveEdgesToQuads] Final pass: Merged edge ${selectedEdge} into quad with verts: [${quad.verts.join(',')}]`);
        }
      }
    }
    
    if (debugMode && finalIter === 0) {
      console.log(`[dissolveEdgesToQuads] Final pass iteration ${finalIter + 1}: ${mergedThisIteration} merges from ${internalEdges.length} edges`);
    }
    
    // If no merges this iteration, stop early
    if (mergedThisIteration === 0) break;
  }
  
  if (debugMode && finalPassMerges > 0) {
    const remainingAfterFinal = workingTriangles.filter(t => !t.removed).length;
    console.log(`[dissolveEdgesToQuads] Final pass complete: ${finalPassMerges} additional merges (${finalPassAttempts} attempts), ${remainingAfterFinal} triangles remaining`);
  }
  
  // DETERMINISTIC FINAL CLEANUP PASS: Try ALL remaining candidates, prioritizing border edges
  // BORDER ISOLATION FIX: This ensures all eligible pairs are attempted, especially border ones
  let finalCleanupMerges = 0;
  let finalCleanupAttempts = 0;
  
  const activeTrianglesForCleanup = workingTriangles.filter(t => !t.removed);
  if (activeTrianglesForCleanup.length >= 2) {
    if (debugMode) {
      console.log(`[dissolveEdgesToQuads] Starting deterministic final cleanup pass (${activeTrianglesForCleanup.length} triangles remaining)`);
    }
    
    let cleanupEdgeMap = buildEdgeMap(activeTrianglesForCleanup);
    
    // Get all remaining candidates (shared by exactly 2 triangles)
    let remainingCandidates = Array.from(cleanupEdgeMap.entries())
      .filter(([edgeKey, triObjects]) => {
        const sharingCount = triObjects.length;
        const isInTrueBoundary = trueBoundaryEdges && trueBoundaryEdges.has(edgeKey);
        
        // Skip if not shared by exactly 2 triangles
        if (sharingCount !== 2 || triObjects[0].removed || triObjects[1].removed) {
          return false;
        }
        
        // Only protect if shared by 1 triangle AND on hull
        if (sharingCount === 1 && isInTrueBoundary) {
          return false; // True boundary edge - protect
        }
        
        return true; // Allow merge
      })
      .map(([edgeKey, triObjects]) => ({
        edge: edgeKey,
        isBorder: isBorderAdjacentEdge(edgeKey),
        triObjects: triObjects
      }));
    
    // Sort: Border edges first, then interior
    remainingCandidates.sort((a, b) => {
      if (a.isBorder && !b.isBorder) return -1;
      if (!a.isBorder && b.isBorder) return 1;
      return 0; // Same type, keep original order
    });
    
    if (debugMode && remainingCandidates.length > 0) {
      const borderCount = remainingCandidates.filter(c => c.isBorder).length;
      console.log(`[dissolveEdgesToQuads] Final cleanup: ${remainingCandidates.length} remaining candidates (${borderCount} border, ${remainingCandidates.length - borderCount} interior)`);
    }
    
    // Try all remaining candidates (deterministic, no probability check)
    for (const candidate of remainingCandidates) {
      finalCleanupAttempts++;
      const selectedEdge = candidate.edge;
      
      // Skip true boundary edges (safety check)
      const edgeInfo = cleanupEdgeMap.get(selectedEdge);
      if (edgeInfo && edgeInfo.length === 1) {
        if (debugMode && finalCleanupAttempts <= 5) {
          console.log(`[dissolveEdgesToQuads] Final cleanup: Skipped true boundary edge: ${selectedEdge}`);
        }
        continue;
      }
      
      const canDissolve = canDissolveEdge(selectedEdge, cleanupEdgeMap, activeTrianglesForCleanup.map(t => ({ ...t, removed: false })));
      
      if (canDissolve) {
        const [tri1, tri2] = candidate.triObjects;
        
        // Merge into quad
        const quad = mergeTrianglesToQuad(tri1, tri2, selectedEdge);
        
        // Validate quad (must have 4 vertices)
        if (quad.verts.length !== 4) {
          if (debugMode && finalCleanupMerges < 5) {
            console.log(`[dissolveEdgesToQuads] Final cleanup: Degenerate quad from edge ${selectedEdge}: ${quad.verts.length} vertices`);
          }
          continue; // Invalid quad
        }
        
        // Mark triangles as removed
        tri1.removed = true;
        tri2.removed = true;
        
        // Add quad
        quads.push(quad);
        edgesDissolved++;
        finalCleanupMerges++;
        
        if (debugMode && finalCleanupMerges <= 10) {
          console.log(`[dissolveEdgesToQuads] Final cleanup: Merged edge ${selectedEdge} (border=${candidate.isBorder}) into quad with verts: [${quad.verts.join(',')}]`);
        }
        
        // Rebuild edge map after each merge (triangles removed)
        const remainingActive = workingTriangles.filter(t => !t.removed);
        if (remainingActive.length < 2) break; // No more pairs
        cleanupEdgeMap = buildEdgeMap(remainingActive);
        
        // Update remaining candidates (remove merged edge)
        remainingCandidates = remainingCandidates.filter(c => c.edge !== selectedEdge);
      }
    }
    
    if (debugMode && finalCleanupMerges > 0) {
      const remainingAfterCleanup = workingTriangles.filter(t => !t.removed).length;
      console.log(`[dissolveEdgesToQuads] Final cleanup complete: ${finalCleanupMerges} additional merges (${finalCleanupAttempts} attempts), ${remainingAfterCleanup} triangles remaining`);
    } else if (debugMode && remainingCandidates.length === 0) {
      console.log(`[dissolveEdgesToQuads] Final cleanup: No remaining candidates (all triangles are isolated)`);
    }
  }
  
  // Collect remaining triangles (not dissolved)
  const remainingTriangles = workingTriangles
    .filter(t => !t.removed)
    .map(t => ({ type: 'triangle', verts: t.verts }));
  
  // TARGETED DEBUG: Analyze edges that were candidates but never merged
  if (debugMode) {
    const neverAttempted = Array.from(allCandidateEdges).filter(e => !attemptedEdges.has(e));
    const attemptedButNotMerged = Array.from(attemptedEdges).filter(e => !mergedEdges.has(e));
    
    console.log(`[dissolveEdgesToQuads] TARGETED DEBUG: Edge tracking summary:`);
    console.log(`  Total candidate edges: ${allCandidateEdges.size}`);
    console.log(`  Edges attempted: ${attemptedEdges.size}`);
    console.log(`  Edges successfully merged: ${mergedEdges.size}`);
    console.log(`  Edges never attempted: ${neverAttempted.length}`);
    console.log(`  Edges attempted but not merged: ${attemptedButNotMerged.length}`);
    
    if (neverAttempted.length > 0 && neverAttempted.length <= 20) {
      console.log(`[dissolveEdgesToQuads] TARGETED DEBUG: Edges that were candidates but never selected/attempted:`, neverAttempted);
    } else if (neverAttempted.length > 20) {
      console.log(`[dissolveEdgesToQuads] TARGETED DEBUG: ${neverAttempted.length} edges were candidates but never selected (too many to list, showing first 10):`, neverAttempted.slice(0, 10));
    }
    
    if (attemptedButNotMerged.length > 0 && attemptedButNotMerged.length <= 20) {
      console.log(`[dissolveEdgesToQuads] TARGETED DEBUG: Edges that were attempted but not merged:`, attemptedButNotMerged);
      console.log(`[dissolveEdgesToQuads] TARGETED DEBUG: Skip reasons:`, skippedEdgesLog.slice(0, 10));
    }
  }
  
  // CROSS-STAGE AUDIT: Analyze missed merge opportunities
  if (debugMode && remainingTriangles.length > 0) {
    console.log(`[dissolveEdgesToQuads] CROSS-STAGE AUDIT: Analyzing ${remainingTriangles.length} remaining triangles for missed merge opportunities`);
    
    // Build edge map for remaining triangles
    const remainingEdgeMap = buildEdgeMap(remainingTriangles.map(t => ({ ...t, removed: false })));
    
    // Find edges shared by exactly 2 remaining triangles (potential missed quads)
    const missedMergeCandidates = Array.from(remainingEdgeMap.entries())
      .filter(([edgeKey, triObjects]) => triObjects.length === 2)
      .map(([edgeKey, triObjects]) => ({
        edge: edgeKey,
        tri1: triObjects[0],
        tri2: triObjects[1],
        tri1Verts: triObjects[0].verts,
        tri2Verts: triObjects[1].verts
      }));
    
    if (missedMergeCandidates.length > 0) {
      console.log(`[dissolveEdgesToQuads] CROSS-STAGE AUDIT: Found ${missedMergeCandidates.length} potential missed merge opportunities (edges shared by 2 remaining triangles)`);
      
      // Analyze why these weren't merged
      let validMissedMerges = 0;
      let invalidMissedMerges = 0;
      
      for (const candidate of missedMergeCandidates.slice(0, 10)) { // Sample first 10
        const canMerge = canDissolveEdge(candidate.edge, remainingEdgeMap, remainingTriangles.map(t => ({ ...t, removed: false })));
        if (canMerge) {
          validMissedMerges++;
          console.log(`[dissolveEdgesToQuads] CROSS-STAGE AUDIT: VALID MISSED MERGE - Edge ${candidate.edge} could be merged: tri1 [${candidate.tri1Verts.join(',')}], tri2 [${candidate.tri2Verts.join(',')}]`);
        } else {
          invalidMissedMerges++;
        }
      }
      
      console.log(`[dissolveEdgesToQuads] CROSS-STAGE AUDIT: Sample analysis - ${validMissedMerges} valid missed merges, ${invalidMissedMerges} invalid (out of ${Math.min(10, missedMergeCandidates.length)} sampled)`);
    } else {
      console.log(`[dissolveEdgesToQuads] CROSS-STAGE AUDIT: No missed merge opportunities found (no edges shared by 2 remaining triangles)`);
      
      // Additional analysis: Check if remaining triangles share edges with created quads
      // This would indicate they could have been merged if selected earlier
      const quadEdgeSet = new Set();
      quads.forEach(quad => {
        if (quad.verts && quad.verts.length >= 3) {
          for (let i = 0; i < quad.verts.length; i++) {
            const v1 = quad.verts[i];
            const v2 = quad.verts[(i + 1) % quad.verts.length];
            quadEdgeSet.add(getEdgeKey(v1, v2));
          }
        }
      });
      
      let trianglesAdjacentToQuads = 0;
      const adjacentTriangles = [];
      
      remainingTriangles.forEach(tri => {
        const triEdges = [
          getEdgeKey(tri.verts[0], tri.verts[1]),
          getEdgeKey(tri.verts[1], tri.verts[2]),
          getEdgeKey(tri.verts[2], tri.verts[0])
        ];
        
        const sharedWithQuads = triEdges.filter(e => quadEdgeSet.has(e));
        if (sharedWithQuads.length > 0) {
          trianglesAdjacentToQuads++;
          adjacentTriangles.push({
            verts: tri.verts,
            sharedEdges: sharedWithQuads
          });
        }
      });
      
      if (trianglesAdjacentToQuads > 0) {
        console.log(`[dissolveEdgesToQuads] CROSS-STAGE AUDIT: ${trianglesAdjacentToQuads} remaining triangles share edges with created quads (indicating they could have been merged if selected earlier)`);
        console.log(`[dissolveEdgesToQuads] CROSS-STAGE AUDIT: Sample adjacent triangles:`, adjacentTriangles.slice(0, 5));
      }
    }
    
    // Log all remaining triangles with their edges
    console.log(`[dissolveEdgesToQuads] CROSS-STAGE AUDIT: All remaining triangles:`, remainingTriangles.map(t => ({
      verts: t.verts,
      edges: [
        getEdgeKey(t.verts[0], t.verts[1]),
        getEdgeKey(t.verts[1], t.verts[2]),
        getEdgeKey(t.verts[2], t.verts[0])
      ]
    })));
    
    // Analyze rejection reasons
    console.log(`[dissolveEdgesToQuads] CROSS-STAGE AUDIT: Rejection breakdown - ${probabilitySkips} probability skips, ${invalidEdgeAttempts} invalid edges, ${degenerateQuadAttempts} degenerate quads`);
    console.log(`[dissolveEdgesToQuads] CROSS-STAGE AUDIT: Probability skips represent ${((probabilitySkips / attempts) * 100).toFixed(1)}% of attempts (dissolveProbability=${dissolveProbability})`);
    console.log(`[dissolveEdgesToQuads] CROSS-STAGE AUDIT: Success rate: ${((edgesDissolved / attempts) * 100).toFixed(1)}% (${edgesDissolved} successful out of ${attempts} attempts)`);
    
    // Analyze why merges might have been missed
    if (probabilitySkips > 0) {
      const probabilitySkipRate = (probabilitySkips / attempts) * 100;
      console.log(`[dissolveEdgesToQuads] CROSS-STAGE AUDIT: ${probabilitySkipRate.toFixed(1)}% of attempts were skipped due to probability (dissolveProbability=${dissolveProbability})`);
      console.log(`[dissolveEdgesToQuads] CROSS-STAGE AUDIT: Recommendation: Consider increasing dissolveProbability to ${Math.min(0.95, dissolveProbability + 0.1)} to reduce missed merges`);
    }
  }
  
  // STEP-BY-STEP DEBUG: Final statistics
  if (debugMode) {
    const finalQuadCount = quads.length;
    const finalTriangleCount = remainingTriangles.length;
    const totalShapes = finalQuadCount + finalTriangleCount;
    console.log(`[dissolveEdgesToQuads] COMPLETED: ${attempts} attempts, ${edgesDissolved} edges dissolved, ${invalidEdgeAttempts} invalid edges, ${degenerateQuadAttempts} degenerate quads`);
    console.log(`[dissolveEdgesToQuads] RESULT: ${totalShapes} total shapes (${finalQuadCount} quads, ${finalTriangleCount} triangles)`);
    console.log(`[dissolveEdgesToQuads] DISSOLUTION RATE: ${attempts > 0 ? ((edgesDissolved / attempts) * 100).toFixed(1) : 0}% success rate`);
    console.log(`[dissolveEdgesToQuads] TRIANGLE-TO-QUAD CONVERSION: ${finalQuadCount} quads from ${triangles.length} triangles = ${((finalQuadCount / triangles.length) * 100).toFixed(1)}% conversion rate`);
    console.log(`[dissolveEdgesToQuads] FAILURE BREAKDOWN: ${invalidEdgeAttempts} invalid edges, ${degenerateQuadAttempts} degenerate quads`);
    console.log(`[dissolveEdgesToQuads] REFINEMENT STATS: ${probabilitySkips} probability skips, ${epsilonMatches} epsilon-adjusted matches`);
    
    // AUDIT: Export failure statistics
    const auditSummary = {
      totalAttempts: attempts,
      successful: edgesDissolved,
      failed: invalidEdgeAttempts,
      degenerate: degenerateQuadAttempts,
      successRate: attempts > 0 ? ((edgesDissolved / attempts) * 100).toFixed(1) + '%' : '0%',
      conversionRate: ((finalQuadCount / triangles.length) * 100).toFixed(1) + '%',
      finalShapes: {
        quads: finalQuadCount,
        triangles: finalTriangleCount,
        total: totalShapes
      }
    };
    console.log(`[dissolveEdgesToQuads] AUDIT SUMMARY:`, JSON.stringify(auditSummary, null, 2));
    
    // Export Stage 2/3 data summary for debugging
    if (debugMode) {
      const stage2Data = {
        triangles: triangles.length,
        points: points.length,
        avgTriangleArea: triangles.reduce((sum, t) => {
          const [v0, v1, v2] = t.verts;
          const area = Math.abs((points[v0].x * (points[v1].y - points[v2].y) + 
                                 points[v1].x * (points[v2].y - points[v0].y) + 
                                 points[v2].x * (points[v0].y - points[v1].y)) / 2);
          return sum + area;
        }, 0) / triangles.length
      };
      
      const stage3Data = {
        totalShapes: totalShapes,
        quads: finalQuadCount,
        triangles: finalTriangleCount,
        dissolutionSuccessRate: attempts > 0 ? (edgesDissolved / attempts) * 100 : 0,
        conversionRate: (finalQuadCount / triangles.length) * 100
      };
      
      console.log(`[dissolveEdgesToQuads] STAGE 2 DATA:`, JSON.stringify(stage2Data, null, 2));
      console.log(`[dissolveEdgesToQuads] STAGE 3 DATA:`, JSON.stringify(stage3Data, null, 2));
    }
  }
  
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
  
  // FIX 3: Check if any parent vertex is boundary - tag new points accordingly
  const hasBoundaryParent = (p0.isBoundary || p1.isBoundary || p2.isBoundary || p3.isBoundary);
  
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
  
  // Tag new points as boundary if parent was boundary
  if (hasBoundaryParent) {
    if (points[i01]) points[i01].isBoundary = true;
    if (points[i12]) points[i12].isBoundary = true;
    if (points[i23]) points[i23].isBoundary = true;
    if (points[i30]) points[i30].isBoundary = true;
  }
  
  // Calculate center
  const center = {
    x: (p0.x + p1.x + p2.x + p3.x) / 4,
    y: (p0.y + p1.y + p2.y + p3.y) / 4,
  };
  const ic = addPoint(center);
  
  // Center is interior, not boundary
  
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
 * Apply dual offset to points for rounded corners (Townscaper-style)
 * Moves each quad vertex inward toward the quad center by a fixed factor
 * @param {Array} points - Original points array
 * @param {Array} quads - Quads array (with verts property)
 * @param {number} offsetFactor - Offset factor (default: 0.30, 30% of distance to center)
 * @returns {Array} New array of dual points with offset applied
 */
function applyDualOffset(points, quads, offsetFactor = 0.30) {
  console.log(`[applyDualOffset] Starting: ${points.length} points, ${quads.length} quads, offsetFactor=${offsetFactor}`);
  const dualPoints = points.map(p => ({ x: p.x, y: p.y })); // Copy original points
  let pointsModified = 0;
  
  let sampleLogged = false;
  
  for (const quad of quads) {
    if (!quad.verts || quad.verts.length < 3) continue;
    
    // Compute quad center
    let cx = 0, cy = 0;
    for (const v of quad.verts) {
      cx += points[v].x;
      cy += points[v].y;
    }
    cx /= quad.verts.length;
    cy /= quad.verts.length;
    
    // Calculate minimum edge length for clamping
    let minEdgeLength = Infinity;
    for (let i = 0; i < quad.verts.length; i++) {
      const v0 = points[quad.verts[i]];
      const v1 = points[quad.verts[(i + 1) % quad.verts.length]];
      const edgeLen = Math.sqrt((v1.x - v0.x) ** 2 + (v1.y - v0.y) ** 2);
      minEdgeLength = Math.min(minEdgeLength, edgeLen);
    }
    
    // For each vertex, move inward toward center
    // FIX 2: Preserve boundary points - don't offset them (maintains clean hex border)
    for (const v of quad.verts) {
      const p = points[v];
      
      // Skip boundary points - keep them fixed for clean border
      if (p.isBoundary) {
        continue; // Don't offset boundary points
      }
      
      const dx = cx - p.x;
      const dy = cy - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < 1e-6) continue; // Avoid division by zero (center == vertex)
      
      // Validate input coordinates
      if (!isFinite(p.x) || !isFinite(p.y) || !isFinite(cx) || !isFinite(cy)) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn(`[applyDualOffset] Invalid coordinates detected for quad vertex ${v}, skipping offset`);
        }
        continue; // Keep original position if invalid
      }
      
      // Clamp move to avoid over-offset (max 10% of min edge length)
      const move = Math.min(offsetFactor * dist, 0.1 * minEdgeLength);
      
      const newPos = {
        x: p.x + (dx / dist) * move,
        y: p.y + (dy / dist) * move,
      };
      
      // Validate output coordinates
      if (!isFinite(newPos.x) || !isFinite(newPos.y)) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn(`[applyDualOffset] Invalid coordinates after offset for vertex ${v}, keeping original position`);
        }
        continue; // Keep original position if offset produces invalid coordinates
      }
      
      dualPoints[v] = newPos;
      pointsModified++;
      
      // Debug: Log sample before/after for first quad's first vertex
      if (!sampleLogged && quad.verts[0] === v) {
        console.log(`[dualGrid] Dual offset applied — sample before/after for vert 0:`, 
          `before: (${p.x.toFixed(3)}, ${p.y.toFixed(3)})`, 
          `after: (${newPos.x.toFixed(3)}, ${newPos.y.toFixed(3)})`,
          `move: ${move.toFixed(3)}, offsetFactor: ${offsetFactor}`);
        sampleLogged = true;
      }
    }
  }
  
  console.log(`[applyDualOffset] Completed: ${pointsModified} points modified, returning ${dualPoints.length} dual points`);
  return dualPoints;
}

/**
 * Relax grid using Laplacian smoothing (per design v2 section 2)
 * Iteratively moves points to average of neighbors with damping factor
 * @param {Array} points - Points array (will be modified in place)
 * @param {Map} neighborMap - Map from point index to neighbor indices
 * @param {number} iterations - Number of relaxation iterations (default: 200)
 * @param {number} damping - Damping factor (default: 0.3)
 * @param {Object} options - Optional options object for advanced features
 * @returns {Object} Stats object with iterations used and final movement
 */
export function relaxGrid(points, neighborMap, iterations = 200, damping = 0.3, options = {}) {
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
    // Locked boundary for immutable hex border during relaxation
    let boundaryPointsLocked = 0;
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const neighborIndices = neighborMap.get(i) || [];
      
      if (neighborIndices.length === 0) continue;
      
      // Skip boundary points - they remain fixed during relaxation
      if (point.isBoundary) {
        boundaryPointsLocked++;
        continue;
      }
      
      // FIX 3: Soften boundary locking - allow near-boundary points to move partially
      // Check if point is near boundary (1-2 rings from boundary)
      // This reduces edge expansion from hard boundary barrier
      let boundaryScale = 1.0; // Default: full movement
      if (options?.politicsMode?.softBoundary !== false) { // Default: enabled
        // Count how many neighbors are boundary points
        let boundaryNeighborCount = 0;
        for (const neighborIdx of neighborIndices) {
          if (points[neighborIdx]?.isBoundary) {
            boundaryNeighborCount++;
          }
        }
        // If 1-3 boundary neighbors, point is near-boundary - scale movement
        if (boundaryNeighborCount > 0) {
          // Linear scaling: 1 neighbor = 50% movement, 2 neighbors = 33%, 3+ = 25%
          boundaryScale = 1.0 / (boundaryNeighborCount + 1);
        }
      }
      
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
      
      // FIX 1: Variable damping based on neighbor count to balance forces
      // Points with more neighbors (center) get less damping to prevent compression
      // Points with fewer neighbors (edges) get more damping to allow expansion
      // Average neighbor count in hex grid is ~6, use as normalization
      const avgNeighborCount = 6;
      const neighborCount = neighborIndices.length;
      const adaptiveDamping = damping * (avgNeighborCount / Math.max(neighborCount, 1));
      // Clamp adaptive damping to reasonable range (0.2 - 1.0)
      const clampedDamping = Math.max(0.2, Math.min(1.0, adaptiveDamping));
      
      // Calculate force (damped movement toward average with adaptive damping)
      let forceX = (avgX - point.x) * clampedDamping;
      let forceY = (avgY - point.y) * clampedDamping;
      
      // FIX 3 continued: Apply boundary softening factor
      forceX *= boundaryScale;
      forceY *= boundaryScale;
      
      // Validate force values before storing
      if (!isFinite(forceX) || !isFinite(forceY)) {
        if (typeof console !== 'undefined' && console.warn) {
          console.warn(`[relaxGrid] Invalid force detected for point ${i}: (${forceX}, ${forceY}), skipping`);
        }
        continue;
      }
      
      forces.set(i, { x: forceX, y: forceY });
      
      const movement = Math.abs(forceX) + Math.abs(forceY);
      maxMovement = Math.max(maxMovement, movement);
      totalMovement += movement;
      pointsMoved++;
    }
    
    // Log boundary locking on first iteration
    if (iter === 0 && boundaryPointsLocked > 0) {
      console.log(`[relaxGrid] Boundary points locked: ${boundaryPointsLocked} of ${points.length}`);
    }
    
    // Apply forces (boundary points are not in forces map, so they won't move)
    // Validate and clamp points to prevent NaN/Infinity
    let invalidPointsCount = 0;
    for (const [pointIdx, force] of forces) {
      const newX = points[pointIdx].x + force.x;
      const newY = points[pointIdx].y + force.y;
      
      // Check for NaN/Infinity and clamp if needed
      if (!isFinite(newX) || !isFinite(newY)) {
        invalidPointsCount++;
        // Skip update if invalid - keep previous position
        if (typeof console !== 'undefined' && console.warn) {
          console.warn(`[relaxGrid] Invalid coordinates detected for point ${pointIdx}: (${newX}, ${newY}), keeping previous position`);
        }
        continue;
      }
      
      points[pointIdx].x = newX;
      points[pointIdx].y = newY;
    }
    
    if (invalidPointsCount > 0 && iter === 0) {
      console.warn(`[relaxGrid] Detected ${invalidPointsCount} invalid points in iteration ${iter + 1}, skipped updates`);
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
