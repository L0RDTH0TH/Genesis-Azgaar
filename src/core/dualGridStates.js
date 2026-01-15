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
  
  // Step 1: Generate transformed hex points (perfect hex grid with post-transform)
  // Clean hexagonal border via post-transform of perfect hex grid
  // This preserves clean hexagonal outer border while achieving elliptical shape
  const baseHexRings = options.politicsMode?.hexLayers ?? 45;
  const baseHexSize = options.politicsMode?.hexSize ?? 12;
  const aspectRatio = options.politicsMode?.aspectRatio ?? 1.22;
  
  // STEP-BY-STEP DEBUG: Density reduction for investigation
  // Reduce point density by half (reduce hexRings, increase hexSize to maintain grid size)
  // Point count in hex grid ≈ 3*hexRings*(hexRings+1) + 1, so reducing hexRings reduces points
  // To maintain grid size: reduce hexRings by √densityMultiplier, increase hexSize by 1/√densityMultiplier
  const densityMultiplier = options.politicsMode?.stepByStepDensityMultiplier ?? 1.0;
  
  let hexRings, effectiveHexSize;
  if (densityMultiplier !== 1.0) {
    // Reduce rings to reduce point count, increase size to maintain grid dimensions
    const densityScale = Math.sqrt(densityMultiplier); // For 0.5 density, scale = 0.707
    hexRings = Math.max(1, Math.round(baseHexRings * densityScale));
    effectiveHexSize = baseHexSize / densityScale; // Compensate for reduced rings
    
    console.log(`[buildStalbergQuadGrid] DENSITY REDUCTION: multiplier=${densityMultiplier}, baseHexRings=${baseHexRings}→${hexRings}, baseHexSize=${baseHexSize}→${effectiveHexSize.toFixed(2)}`);
    console.log(`[buildStalbergQuadGrid] DENSITY REDUCTION: Expected point reduction: ~${Math.round(3 * baseHexRings * (baseHexRings + 1) + 1)} → ~${Math.round(3 * hexRings * (hexRings + 1) + 1)} points`);
  } else {
    hexRings = baseHexRings;
    effectiveHexSize = baseHexSize;
  }
  
  const primalPoints = createTransformedHexPoints(hexRings, effectiveHexSize, aspectRatio, rng);
  
  if (densityMultiplier !== 1.0) {
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
  
  // Step 2: Triangulate from elliptical points using Delaunay triangulation
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
    
    console.log(`[buildStalbergQuadGrid] STAGE 2 ANALYSIS: ${triangles.length} triangles, avg area: ${avgArea.toFixed(2)}, min: ${minArea.toFixed(2)}, max: ${maxArea.toFixed(2)}`);
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
    const dissolveProbability = options.politicsMode?.dissolveProbability ?? 0.5;
    const stepByStepRender = options.politicsMode?.stepByStepRender ?? false;
    quads = dissolveEdgesToQuads(triangles, hexPointIndices, points, rng, dissolveProbability, stepByStepRender);
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
  const allQuads = [];
  for (const shape of quads) {
    if (shape.type === 'triangle' && !skipTriangleSubdivision) {
      const subQuads = subdivideTriangleIntoThreeQuads(shape, points, addPoint, midpoint);
      allQuads.push(...subQuads);
    } else {
      // Keep shape as-is (either quad from dissolution, or triangle if skipping subdivision)
      allQuads.push(shape);
    }
  }
  if (skipTriangleSubdivision) {
    console.log(`[buildStalbergQuadGrid] Skipping triangle subdivision (keeping dissolved quads only): ${allQuads.length} quads`);
  } else {
    console.log(`[buildStalbergQuadGrid] After subdivision: ${allQuads.length} quads`);
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
function dissolveEdgesToQuads(triangles, hexPointIndices, points, rng, dissolveProbability = 0.5, debugMode = false) {
  // STEP-BY-STEP DEBUG: Detailed logging
  if (debugMode) {
    console.log(`[dissolveEdgesToQuads] STARTING: ${triangles.length} input triangles, ${points.length} points, dissolveProbability=${dissolveProbability}`);
  }
  
  // Work with a mutable copy of triangles
  const workingTriangles = triangles.map(t => ({ ...t, verts: [...t.verts] }));
  const quads = [];
  const maxAttempts = workingTriangles.length * 3;
  let dissolveCount = 0;
  let attempts = 0;
  let edgesDissolved = 0;
  let invalidEdgeAttempts = 0;
  let degenerateQuadAttempts = 0;
  
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
    const activeTriangles = workingTriangles.filter(t => !t.removed);
    const edgeMap = buildEdgeMap(activeTriangles);
    
    // Get all internal edges (shared by exactly 2 triangles)
    const internalEdges = Array.from(edgeMap.entries())
      .filter(([edgeKey, triIndices]) => triIndices.length === 2)
      .map(([edgeKey]) => edgeKey);
    
    if (internalEdges.length === 0) {
      if (debugMode && attempts === 1) {
        console.log(`[dissolveEdgesToQuads] WARNING: No internal edges found on first attempt! Active triangles: ${activeTriangles.length}`);
      }
      break; // No more internal edges to dissolve
    }
    
    // Randomly select an edge (with probability check)
    if (rng.random() > dissolveProbability) {
      continue; // Skip this attempt based on probability
    }
    
    const randomEdgeIndex = Math.floor(rng.random() * internalEdges.length);
    const selectedEdge = internalEdges[randomEdgeIndex];
    
    // Check if we can dissolve this edge (with detailed failure logging)
    const sharingTriangles = edgeMap.get(selectedEdge);
    let canDissolve = true;
    let failureReason = '';
    
    if (!sharingTriangles || sharingTriangles.length !== 2) {
      canDissolve = false;
      failureReason = `edge shared by ${sharingTriangles?.length || 0} triangles (expected 2)`;
    } else {
      const [tri1Idx, tri2Idx] = sharingTriangles;
      const tri1 = workingTriangles[tri1Idx];
      const tri2 = workingTriangles[tri2Idx];
      
      if (!tri1 || !tri2) {
        canDissolve = false;
        failureReason = 'triangle missing';
      } else if (tri1.removed || tri2.removed) {
        canDissolve = false;
        failureReason = 'triangle already removed';
      } else {
        const allVerts = [...new Set([...tri1.verts, ...tri2.verts])];
        if (allVerts.length !== 4) {
          canDissolve = false;
          failureReason = `${allVerts.length} unique vertices (expected 4), tri1: [${tri1.verts.join(',')}], tri2: [${tri2.verts.join(',')}]`;
        }
      }
    }
    
    if (canDissolve) {
      const [tri1Idx, tri2Idx] = sharingTriangles;
      const tri1 = workingTriangles[tri1Idx];
      const tri2 = workingTriangles[tri2Idx];
      
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
      
      // Mark triangles as removed
      tri1.removed = true;
      tri2.removed = true;
      
      // Add quad
      quads.push(quad);
      dissolveCount++;
      edgesDissolved++;
      
      if (debugMode && edgesDissolved <= 5) {
        console.log(`[dissolveEdgesToQuads] Successfully dissolved edge ${selectedEdge} into quad with verts: [${quad.verts.join(',')}]`);
      }
    } else {
      invalidEdgeAttempts++;
      if (debugMode && invalidEdgeAttempts <= 10) {
        console.log(`[dissolveEdgesToQuads] Cannot dissolve edge ${selectedEdge}: ${failureReason}`);
      }
    }
  }
  
  // Collect remaining triangles (not dissolved)
  const remainingTriangles = workingTriangles
    .filter(t => !t.removed)
    .map(t => ({ type: 'triangle', verts: t.verts }));
  
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
