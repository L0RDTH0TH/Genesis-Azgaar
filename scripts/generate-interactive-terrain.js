/**
 * =============================================================================
 * generate-interactive-terrain.js
 * Desc: Generate interactive HTML page with click-to-generate terrain
 * Author: Lordthoth
 * =============================================================================
 */

import Delaunator from 'delaunator';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import { initGenerator, loadOptions, generateMap } from '../src/index.js';
import { buildStalbergQuadGrid } from '../src/core/dualGridStates.js';
import { RNG } from '../src/utils/rng.js';

/**
 * Generate interactive HTML page with click-to-generate terrain
 */
async function generateInteractiveTerrain() {
  console.log('=== Generating Interactive Terrain Test ===\n');
  
  try {
    // Initialize generator
    initGenerator({ canvas: null });
    
    // Fix 5: Small-grid mode via command-line argument (--small forces 9 rings)
    const isSmallMode = process.argv.includes('--small');
    const defaultRings = 12; // Default ring count
    const ringCount = isSmallMode ? 9 : defaultRings;
    console.log(`Grid mode: ${isSmallMode ? `Small (${ringCount} rings - fast debug)` : `Normal (${ringCount} rings)`}`);
    
    // Load options with smaller grid for fast iteration
    const testOptions = {
      seed: 'interactive-42',
      mapWidth: 960,
      mapHeight: 540,
      statesNumber: 18,
      fullRendering: true,
      useDualGridPolitics: true,
      logRelaxation: false, // Disable verbose logging for interactive
      politicsMode: {
        baseHexRings: ringCount, // Fix 5: Use ringCount from command-line arg (not used for elliptical)
        numStates: 10,
        earlyTerminationThreshold: 0.0001,
        lockBoundaries: true, // Lock boundary points during relaxation (immutable hex border)
        progressiveDamping: true,
        dissolveProbability: 0.95, // INCREASED: From 0.85 to 0.95 per audit recommendation to reduce probability skips (was 15.4%, target <10%)
        relaxationIterations: 100, // Optimized for convergence without over-movement (prevents line crossings)
        dampingFactor: 0.5, // Increased damping for stability (prevents oscillation/crossing)
        dualOffsetFactor: 0.35, // Reduced offset for less aggressive rounding (prevents edge crossings)
        hexLayers: 18, // Aggressively reduced for chunky quads (~1400 initial points, target ~5-6k final)
        skipTriangleSubdivision: false, // FIX: Enable triangle subdivision for Stage 4 visualization (was true, causing triangles to be skipped)
        hexSize: 12, // Size of hex cells (tuned for target radius ~500px)
        aspectRatio: 1.15, // Reduced from 1.22 for more uniform cell sizes (less distortion)
        softBoundary: true, // Enable soft boundary locking (near-boundary points move partially)
        testLowRelaxation: false, // DIAGNOSTIC: Test with minimal relaxation (1 iteration) - disabled for step-by-step debug
        testEarlyRelax: false, // EARLY RELAX TEST: Disabled for step-by-step debug
        earlyRelaxIterations: 5, // Low iterations for early relax test
        stepByStepRender: true, // STEP-BY-STEP DEBUG: Render each pipeline stage separately for visual debugging
        stepByStepRelaxIterations: 1, // EXACT iterations for step-by-step debug (1 or 0 to isolate structural issues)
        stepByStepDensityMultiplier: 0.125, // DENSITY REDUCTION: 0.125 = 12.5% density (4x spacing, ~8x larger triangles) - PRIORITY over targetPoints
        targetPoints: null, // Disabled - using densityMultiplier instead for spacing-based reduction
        skipDissolution: false, // FIX 5: Enable dissolution for quad rendering
        dissolveProbability: 0.85, // REFINEMENT FIX 1: Higher probability threshold (0.85) for better conversion rate
        skipLevel1Subdivision: true, // Skip Level 1 to reduce density (preview mode)
      },
    };
    
    console.log('Generating elliptical dual-grid...');
    const startTime = Date.now();
    
    // Use direct elliptical dual grid generation (skip full Azgaar generation)
    // This gives us clean ~6500 elliptical points instead of 27k blobby Voronoi points
    const dualGridRng = new RNG(testOptions.seed + '-dual');
    // Pass Delaunator for fast triangulation (O(n log n) instead of O(n²))
    const dualGridOptions = { ...testOptions, DelaunatorClass: Delaunator };
    const dualGrid = buildStalbergQuadGrid(null, dualGridRng, dualGridOptions);
    
    const generateTime = Date.now() - startTime;
    console.log(`✅ Generated in ${generateTime.toFixed(2)}ms\n`);
    
    // Extract dual-grid data directly
    const { points, level0Quads, level1Quads, dualPoints, rawDelaunayTriangles, pipelineStages } = dualGrid;
    
    // Diagnose dualPoints generation
    console.log('dualGrid exists?', !!dualGrid);
    console.log('dualPoints in dualGrid?', !!dualGrid?.dualPoints);
    console.log('dualPoints length:', dualGrid?.dualPoints?.length || 0);
    console.log('Sample dual point:', dualGrid?.dualPoints?.[0]);
    
    console.log(`Dual-grid structure:`);
    console.log(`  Points: ${points.length}`);
    console.log(`  Level 0 quads: ${level0Quads.length}`);
    console.log(`  Level 1 quads: ${level1Quads.length}`);
    console.log(`  Dual points: ${dualPoints ? dualPoints.length : 0} (offset for rounded corners)`);
    console.log('');
    
    // Get output directory
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const outputDir = join(__dirname, '..', 'samples');
    mkdirSync(outputDir, { recursive: true });
    
    // Prepare data for export (simplify for browser)
    // Create data structure matching what renderSVG expects
    const exportData = {
      points: points.map(p => ({ x: p.x, y: p.y })),
      dualPoints: dualPoints ? dualPoints.map(p => ({ x: p.x, y: p.y })) : null,
      level0Quads: level0Quads.map(q => ({
        i: q.i,
        verts: q.verts,
        center: q.center,
      })),
      rawDelaunayTriangles: rawDelaunayTriangles || null, // Raw triangle indices for wireframe rendering
      pipelineStages: pipelineStages || null, // Step-by-step pipeline stages for visual debugging
      mapWidth: testOptions.mapWidth,
      mapHeight: testOptions.mapHeight,
      seed: testOptions.seed,
    };
    
    // Debug: Verify dualPoints exist and differ from points
    console.log(`Exporting ${dualPoints ? dualPoints.length : 0} dual points`);
    if (dualPoints && dualPoints.length > 0 && points.length > 0) {
      const sampleIdx = 0;
      const original = points[sampleIdx];
      const offset = dualPoints[sampleIdx];
      const diff = Math.sqrt((offset.x - original.x) ** 2 + (offset.y - original.y) ** 2);
      console.log(`Sample point ${sampleIdx}: original (${original.x.toFixed(3)}, ${original.y.toFixed(3)}), offset (${offset.x.toFixed(3)}, ${offset.y.toFixed(3)}), diff: ${diff.toFixed(3)}`);
    }
    
    // Generate HTML with embedded data and JavaScript
    const htmlContent = generateInteractiveHTML(exportData);
    
    // Write HTML file
    const htmlPath = join(outputDir, 'interactive-terrain.html');
    writeFileSync(htmlPath, htmlContent, 'utf8');
    
    console.log(`✅ Interactive HTML generated: ${htmlPath}`);
    console.log(`✅ All fixes (1-5 simplified) applied — small-grid mode available via --small flag`);
    console.log('\nTo test:');
    console.log(`  1. Open ${htmlPath} in your browser`);
    console.log('  2. Click anywhere on the grid');
    console.log('  3. Watch terrain generate and shade quads!');
    console.log(`\nNote: Run with --small flag for fast 9-ring testing (current: ${ringCount} rings)`);
    console.log('');
    
    return htmlPath;
  } catch (error) {
    console.error('❌ Error:', error);
    console.error(error.stack);
    throw error;
  }
}

/**
 * Generate interactive HTML content with embedded JavaScript
 */
function generateInteractiveHTML(data) {
  const { points, level0Quads, mapWidth, mapHeight, seed, dualPoints, pipelineStages } = data;
  
  return `<!DOCTYPE html>
<!-- All Stålberg-inspired fixes applied: stable relaxation, async terrain, connectivity/area stability, debug logging/SVG export, small-grid test mode -->
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Interactive Dual-Grid Terrain - Click to Generate</title>
  <style>
    body {
      margin: 0;
      padding: 20px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1a1a1a;
      color: #fff;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    h1 {
      margin: 0 0 10px 0;
      font-size: 24px;
    }
    .controls {
      margin-bottom: 15px;
      padding: 10px;
      background: #2a2a2a;
      border-radius: 5px;
    }
    .status {
      margin-top: 10px;
      padding: 10px;
      background: #2a2a2a;
      border-radius: 5px;
      font-size: 14px;
    }
    .status.generating {
      background: #3a3a3a;
      color: #ffaa00;
    }
    .loading-overlay {
      display: none;
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      color: #fff;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      font-size: 16px;
    }
    .loading-overlay.active {
      display: flex;
    }
    #svg-container {
      position: relative;
      background: #e8f4f8;
      border: 2px solid #4a4a4a;
      border-radius: 5px;
      cursor: crosshair;
      box-shadow: 0 4px 8px rgba(0,0,0,0.3);
    }
    #svg-container svg {
      display: block;
    }
    button {
      padding: 8px 16px;
      margin-right: 10px;
      background: #4CAF50;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
    }
    button:hover {
      background: #45a049;
    }
    button:disabled {
      background: #666;
      cursor: not-allowed;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎮 Interactive Dual-Grid Terrain Generator</h1>
    <div class="controls">
      <button id="resetBtn">Reset Grid</button>
      <button id="clearBtn">Clear Terrain</button>
      ${pipelineStages ? `
      <div style="margin-left: 20px; display: inline-block;">
        <label for="stageSelect" style="color: #aaa; margin-right: 8px; font-weight: bold;">Pipeline Stage:</label>
        <select id="stageSelect" style="padding: 6px 12px; font-size: 14px; border-radius: 4px; border: 1px solid #666; background: #2a2a2a; color: #fff;">
          <option value="1">Stage 1: Raw Points</option>
          <option value="2">Stage 2: After Triangulation</option>
          <option value="3">Stage 3: After Dissolution/Cull</option>
          <option value="4">Stage 4: After Subdivide Triangles</option>
          <option value="5">Stage 5: After Subdivide Quads</option>
          <option value="final" selected>Stage 6: Final (Relax + Dual Offset)</option>
        </select>
      </div>
      ` : ''}
      <span style="margin-left: 20px; color: #aaa;">Click anywhere on the grid to generate terrain!</span>
    </div>
    <div id="status" class="status">Ready - Click on the grid to generate terrain</div>
    <p style="color: #666; font-size: 0.9em; margin-top: 10px;">
      Debug tip: Run the generator with <code>--small</code> flag for fast 9-ring testing (prevents long generation times)
    </p>
    <div id="svg-container">
      <div id="loading-overlay" class="loading-overlay">Generating terrain...</div>
    </div>
  </div>

  <script>
    // Embedded dual-grid data
    const DUAL_GRID_DATA = ${JSON.stringify(data, null, 2)};
    const PIPELINE_STAGES = ${pipelineStages ? JSON.stringify(pipelineStages, null, 2) : 'null'};
    let currentStage = 'final'; // Current pipeline stage being displayed
    
    // Terrain generation state
    let quadTerrain = new Map(); // quadIndex -> {avgHeight, biomeId, cellCount}
    let isGenerating = false; // Flag to prevent multiple simultaneous clicks
    
    // ============================================================
    // Simplified RNG for browser (deterministic seeded PRNG)
    // ============================================================
    class SimpleRNG {
      constructor(seed) {
        this.seed = String(seed);
        this.state = this.hash(seed);
      }
      
      hash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
          hash = ((hash << 5) - hash) + str.charCodeAt(i);
          hash = hash & hash;
        }
        return Math.abs(hash);
      }
      
      random() {
        this.state = (this.state * 1103515245 + 12345) & 0x7fffffff;
        return this.state / 0x7fffffff;
      }
      
      randInt(min, max) {
        return Math.floor(this.random() * (max - min + 1)) + min;
      }
      
      randFloat(min, max) {
        return this.random() * (max - min) + min;
      }
      
      probability(p) {
        return this.random() < p;
      }
    }
    
    // ============================================================
    // Point-in-polygon (ray-casting)
    // ============================================================
    function pointInQuad(point, quad, points) {
      const quadVerts = quad.verts.map(vIdx => points[vIdx]);
      if (quadVerts.length < 3) return false;
      
      // Fast reject: bounding box
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const v of quadVerts) {
        minX = Math.min(minX, v.x);
        minY = Math.min(minY, v.y);
        maxX = Math.max(maxX, v.x);
        maxY = Math.max(maxY, v.y);
      }
      
      if (point.x < minX || point.x > maxX || point.y < minY || point.y > maxY) {
        return false;
      }
      
      // Ray-casting
      const EPSILON = 1e-10;
      let inside = false;
      const numVerts = quadVerts.length;
      
      for (let i = 0, j = numVerts - 1; i < numVerts; j = i++) {
        const vi = quadVerts[i];
        const vj = quadVerts[j];
        
        if (Math.abs(vi.y - vj.y) < EPSILON) continue;
        
        const yMin = Math.min(vi.y, vj.y);
        const yMax = Math.max(vi.y, vj.y);
        if (point.y < yMin || point.y >= yMax) continue;
        
        const xIntersect = vj.x + (vi.x - vj.x) * (point.y - vj.y) / (vi.y - vj.y);
        
        if (xIntersect > point.x + EPSILON) {
          if (Math.abs(point.y - vi.y) < EPSILON) {
            if (vi.y > vj.y) inside = !inside;
          } else if (Math.abs(point.y - vj.y) < EPSILON) {
            if (vj.y > vi.y) inside = !inside;
          } else {
            inside = !inside;
          }
        }
      }
      
      return inside;
    }
    
    // ============================================================
    // Simplified noise generation (for terrain)
    // ============================================================
    function noise2D(x, y, scale, rng) {
      const nx = Math.floor(x * scale);
      const ny = Math.floor(y * scale);
      const hash = (nx * 73856093) ^ (ny * 19349663);
      const noiseRng = new SimpleRNG(rng.seed + '_' + hash);
      return noiseRng.random();
    }
    
    function fractalNoise(x, y, octaves, persistence, scale, rng) {
      let value = 0, amplitude = 1, frequency = scale, maxValue = 0;
      for (let i = 0; i < octaves; i++) {
        value += noise2D(x, y, frequency, rng) * amplitude;
        maxValue += amplitude;
        amplitude *= persistence;
        frequency *= 2;
      }
      return value / maxValue;
    }
    
    // ============================================================
    // Regional terrain generation (simplified for browser)
    // ============================================================
    function generateRegionalTerrain(center, radius, rng, mapHeight) {
      const width = radius * 2;
      const height = radius * 2;
      const cellSize = 10;
      const numCellsX = Math.ceil(width / cellSize);
      const numCellsY = Math.ceil(height / cellSize);
      const cells = [];
      
      const regionMinX = center.x - width / 2;
      const regionMinY = center.y - height / 2;
      
      // Generate height for each cell
      for (let cy = 0; cy < numCellsY; cy++) {
        for (let cx = 0; cx < numCellsX; cx++) {
          const cellX = regionMinX + (cx + 0.5) * cellSize;
          const cellY = regionMinY + (cy + 0.5) * cellSize;
          
          let heightValue = fractalNoise(cellX, cellY, 4, 0.5, 0.02, rng);
          
          // Ocean bias
          if (rng.probability(0.6)) {
            heightValue = heightValue * 0.4; // Ocean: 0-40
          } else {
            heightValue = 20 + heightValue * 80; // Land: 20-100
          }
          
          // Edge masking
          const dx = (cx / numCellsX - 0.5) * 2;
          const dy = (cy / numCellsY - 0.5) * 2;
          const distFromCenter = Math.sqrt(dx * dx + dy * dy);
          const edgeFactor = 1 - Math.min(distFromCenter, 1);
          heightValue *= (0.5 + 0.5 * edgeFactor);
          
          cells.push({
            x: cellX,
            y: cellY,
            height: Math.max(0, Math.min(100, Math.round(heightValue))),
          });
        }
      }
      
      // Simple smoothing
      const smoothed = [...cells];
      for (let cy = 0; cy < numCellsY; cy++) {
        for (let cx = 0; cx < numCellsX; cx++) {
          const idx = cy * numCellsX + cx;
          const neighbors = [cells[idx].height];
          if (cx > 0) neighbors.push(cells[cy * numCellsX + (cx - 1)].height);
          if (cx < numCellsX - 1) neighbors.push(cells[cy * numCellsX + (cx + 1)].height);
          if (cy > 0) neighbors.push(cells[(cy - 1) * numCellsX + cx].height);
          if (cy < numCellsY - 1) neighbors.push(cells[(cy + 1) * numCellsX + cx].height);
          smoothed[idx].height = Math.round(neighbors.reduce((a, b) => a + b, 0) / neighbors.length);
        }
      }
      
      return { cells: smoothed, width: numCellsX, height: numCellsY };
    }
    
    // ============================================================
    // Map terrain to quads
    // ============================================================
    function mapTerrainToQuads(terrainData, quads, points) {
      const result = new Map();
      
      for (let quadIdx = 0; quadIdx < quads.length; quadIdx++) {
        const quad = quads[quadIdx];
        if (!quad || !quad.verts) continue;
        
        const containedCells = [];
        for (const cell of terrainData.cells) {
          if (pointInQuad({ x: cell.x, y: cell.y }, quad, points)) {
            containedCells.push(cell);
          }
        }
        
        if (containedCells.length > 0) {
          const avgHeight = containedCells.reduce((sum, c) => sum + c.height, 0) / containedCells.length;
          result.set(quadIdx, {
            avgHeight: Math.round(avgHeight),
            cellCount: containedCells.length,
          });
        }
      }
      
      return result;
    }
    
    // ============================================================
    // Height to color mapping
    // ============================================================
    function heightToColor(height) {
      if (height < 20) {
        // Ocean: blue gradient
        const t = height / 20;
        return \`rgb(\${Math.round(70 * t)}, \${Math.round(110 * t)}, \${Math.round(171 * t)})\`;
      } else if (height < 50) {
        // Beach/Lowland: sandy/tan
        const t = (height - 20) / 30;
        return \`rgb(\${Math.round(200 + 55 * t)}, \${Math.round(180 + 75 * t)}, \${Math.round(140 + 115 * t)})\`;
      } else if (height < 70) {
        // Grassland: green
        const t = (height - 50) / 20;
        return \`rgb(\${Math.round(100 + 100 * t)}, \${Math.round(150 + 50 * t)}, \${Math.round(50)})\`;
      } else if (height < 85) {
        // Hills: brown/green
        const t = (height - 70) / 15;
        return \`rgb(\${Math.round(100 + 50 * t)}, \${Math.round(120 - 20 * t)}, \${Math.round(60 - 20 * t)})\`;
      } else {
        // Mountains: gray/brown
        const t = (height - 85) / 15;
        return \`rgb(\${Math.round(150 - 30 * t)}, \${Math.round(100 - 30 * t)}, \${Math.round(40 - 20 * t)})\`;
      }
    }
    
    // ============================================================
    // Step-by-Step Pipeline Rendering
    // ============================================================
    function renderPipelineStage(stageKey) {
      if (!PIPELINE_STAGES) {
        console.warn('PIPELINE_STAGES not available');
        return null;
      }
      
      console.log('Rendering pipeline stage:', stageKey, 'Available stages:', Object.keys(PIPELINE_STAGES));
      
      const stages = {
        '1': { 
          data: PIPELINE_STAGES.stage1_rawPoints, 
          label: 'Stage 1: Raw Points', 
          color: '#ffaa00',
          type: 'points'
        },
        '2': { 
          data: PIPELINE_STAGES.stage2_triangles, 
          points: PIPELINE_STAGES.stage2_points, 
          label: 'Stage 2: After Triangulation', 
          color: '#888',
          type: 'triangles'
        },
        '3': { 
          data: PIPELINE_STAGES.stage3_quads, 
          points: PIPELINE_STAGES.stage3_points, 
          label: 'Stage 3: After Dissolution/Cull', 
          color: '#4488ff',
          type: 'quads'
        },
        '4': { 
          data: PIPELINE_STAGES.stage4_subdividedTriangles, 
          points: PIPELINE_STAGES.stage4_points, 
          label: 'Stage 4: After Subdivide Triangles', 
          color: '#ff4488',
          type: 'shapes'
        },
        '5': { 
          data: PIPELINE_STAGES.stage5_subdividedQuads, 
          points: PIPELINE_STAGES.stage5_points, 
          label: 'Stage 5: After Subdivide Quads', 
          color: '#ff8844',
          type: 'subdivided'
        },
        'final': { 
          data: PIPELINE_STAGES.stage6_final, 
          label: 'Stage 6: Final (Relax + Dual Offset)', 
          color: '#333',
          type: 'final'
        },
      };
      
      const stage = stages[stageKey];
      if (!stage) {
        console.error('Invalid stage key:', stageKey);
        return null;
      }
      
      if (!stage.data) {
        console.warn('Stage data not available for:', stageKey, 'stage object:', stage);
        // Still render placeholder
      }
      
      const viewBoxX = -550, viewBoxY = -550, viewBoxWidth = 1100, viewBoxHeight = 1100;
      const layers = [];
      
      // Background
      layers.push(\`<rect x="\${viewBoxX}" y="\${viewBoxY}" width="\${viewBoxWidth}" height="\${viewBoxHeight}" fill="#e8f4f8" />\`);
      
      // Stage label - BIG and prominent
      layers.push(\`<text x="0" y="\${viewBoxY + 40}" font-size="28" font-weight="bold" fill="\${stage.color}" text-anchor="middle" stroke="#000" stroke-width="0.5">\${stage.label}</text>\`);
      
      // Reference boundary (yellow)
      const refPoints = [
        {x:0,y:-480}, {x:-380,y:-460}, {x:380,y:-460},
        {x:460,y:-320}, {x:510,y:-140}, {x:520,y:20},
        {x:460,y:280}, {x:380,y:420}, {x:220,y:480}, {x:0,y:490},
        {x:-220,y:480}, {x:-380,y:420}, {x:-460,y:280}, {x:-520,y:20},
        {x:-510,y:-140}, {x:-460,y:-320}, {x:-380,y:-460}, {x:0,y:-480}
      ];
      const refPath = refPoints.map((p, i) => \`\${i === 0 ? 'M' : 'L'} \${p.x} \${p.y}\`).join(' ') + ' Z';
      layers.push(\`<path d="\${refPath}" fill="none" stroke="yellow" stroke-width="2" opacity="0.6" />\`);
      
      // Get points for this stage
      let stagePoints = null;
      if (stageKey === '1') {
        stagePoints = stage.data; // Raw points array
      } else if (stage.points) {
        stagePoints = stage.points;
      } else if (stage.data && stage.data.points) {
        stagePoints = stage.data.points;
      } else if (stageKey === 'final' && stage.data) {
        stagePoints = stage.data.dualPoints || stage.data.points;
      }
      
      if (!stagePoints || !Array.isArray(stagePoints) || stagePoints.length === 0) {
        console.warn('No points available for stage:', stageKey);
        // Render placeholder
        layers.push(\`<text x="0" y="0" font-size="24" fill="red" text-anchor="middle">No data for \${stage.label}</text>\`);
        return \`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="\${viewBoxX} \${viewBoxY} \${viewBoxWidth} \${viewBoxHeight}">\${layers.join('\\n')}</svg>\`;
      }
      
      // Center points
      const centroidX = stagePoints.reduce((sum, p) => sum + (p.x || 0), 0) / stagePoints.length;
      const centroidY = stagePoints.reduce((sum, p) => sum + (p.y || 0), 0) / stagePoints.length;
      const centeredPoints = stagePoints.map(p => ({ 
        x: (p.x || 0) - centroidX, 
        y: (p.y || 0) - centroidY 
      }));
      
      console.log(\`Stage \${stageKey}: \${stagePoints.length} points, centroid: (\${centroidX.toFixed(2)}, \${centroidY.toFixed(2)})\`);
      
      // Render based on stage type
      if (stageKey === '1') {
        // Stage 1: Raw points (yellow dots only) - like point-spawn.jpg
        let dotCount = 0;
        centeredPoints.forEach((p, idx) => {
          if (isFinite(p.x) && isFinite(p.y)) {
            layers.push(\`<circle cx="\${p.x.toFixed(2)}" cy="\${p.y.toFixed(2)}" r="4" fill="\${stage.color}" opacity="0.9" stroke="#cc8800" stroke-width="0.5" />\`);
            dotCount++;
          }
        });
        console.log(\`Rendered \${dotCount} yellow dots for Stage 1 (Raw Points)\`);
      } else if (stageKey === '2' && stage.data) {
        // Stage 2: Wireframe triangles (gray) - like connect-points.jpg
        let triangleCount = 0;
        if (Array.isArray(stage.data)) {
          stage.data.forEach(tri => {
            if (tri && tri.verts && Array.isArray(tri.verts) && tri.verts.length >= 3) {
              const verts = tri.verts.map(vIdx => {
                const p = centeredPoints[vIdx];
                return p && isFinite(p.x) && isFinite(p.y) ? p : null;
              }).filter(v => v !== null);
              if (verts.length >= 3) {
                const path = verts.map((v, i) => \`\${i === 0 ? 'M' : 'L'} \${v.x.toFixed(2)} \${v.y.toFixed(2)}\`).join(' ') + ' Z';
                layers.push(\`<path d="\${path}" fill="none" stroke="\${stage.color}" stroke-width="1.5" opacity="0.7" />\`);
                triangleCount++;
              }
            }
          });
        }
        console.log(\`Rendered \${triangleCount} gray triangles for Stage 2 (After Triangulation)\`);
      } else if (stageKey === '3' && stage.data) {
        // Stage 3: Quad outlines (blue) - like cull-triangles.jpg
        let quadCount = 0;
        let invalidQuadCount = 0;
        let selfIntersectingCount = 0;
        
        if (Array.isArray(stage.data)) {
          stage.data.forEach((quad, quadIdx) => {
            if (quad && quad.verts && Array.isArray(quad.verts) && quad.verts.length >= 3) {
              const verts = quad.verts.map(vIdx => {
                const p = centeredPoints[vIdx];
                return p && isFinite(p.x) && isFinite(p.y) ? p : null;
              }).filter(v => v !== null);
              
              if (verts.length < 3) {
                invalidQuadCount++;
                if (quadIdx < 5) {
                  console.log(\`[renderPipelineStage] Stage 3: Invalid quad \${quadIdx} - less than 3 valid vertices: [\${quad.verts.join(',')}]\`);
                }
                return;
              }
              
              // AUDIT: Check for duplicate vertices (would cause self-intersection)
              const uniqueVerts = [];
              const seenCoords = new Set();
              for (const v of verts) {
                const coordKey = \`\${v.x.toFixed(2)},\${v.y.toFixed(2)}\`;
                if (!seenCoords.has(coordKey)) {
                  seenCoords.add(coordKey);
                  uniqueVerts.push(v);
                }
              }
              
              if (uniqueVerts.length !== verts.length) {
                selfIntersectingCount++;
                if (quadIdx < 5) {
                  console.log(\`[renderPipelineStage] Stage 3: Quad \${quadIdx} has duplicate vertices - \${verts.length} input, \${uniqueVerts.length} unique\`);
                }
              }
              
              // Use unique vertices for rendering
              const renderVerts = uniqueVerts.length < verts.length ? uniqueVerts : verts;
              
              if (renderVerts.length >= 3) {
                const path = renderVerts.map((v, i) => \`\${i === 0 ? 'M' : 'L'} \${v.x.toFixed(2)} \${v.y.toFixed(2)}\`).join(' ') + ' Z';
                layers.push(\`<path d="\${path}" fill="none" stroke="\${stage.color}" stroke-width="2" opacity="0.9" />\`);
                quadCount++;
              }
            }
          });
        }
        console.log(\`Rendered \${quadCount} blue quads for Stage 3 (After Dissolution/Cull)\`);
        if (invalidQuadCount > 0 || selfIntersectingCount > 0) {
          console.log(\`[renderPipelineStage] Stage 3 AUDIT: \${invalidQuadCount} invalid quads, \${selfIntersectingCount} quads with duplicate vertices\`);
        }
      } else if (stageKey === '4' && stage.data) {
        // Stage 4: Subdivided triangles (red) - like subdivide-triangles-to-quads.jpg
        // ENHANCED VALIDATION: Render quads from subdivision separately (different color for debug)
        let shapeCount = 0;
        let quadsFromSubdivision = 0;
        let quadsFromDissolution = 0;
        
        if (Array.isArray(stage.data)) {
          stage.data.forEach(shape => {
            if (shape && shape.verts && Array.isArray(shape.verts) && shape.verts.length >= 3) {
              const verts = shape.verts.map(vIdx => {
                const p = centeredPoints[vIdx];
                return p && isFinite(p.x) && isFinite(p.y) ? p : null;
              }).filter(v => v !== null);
              if (verts.length >= 3) {
                const path = verts.map((v, i) => \`\${i === 0 ? 'M' : 'L'} \${v.x.toFixed(2)} \${v.y.toFixed(2)}\`).join(' ') + ' Z';
                
                // ENHANCED VALIDATION: Different color for quads from triangle subdivision
                const isFromSubdivision = shape.fromTriangleSubdivision === true;
                const strokeColor = isFromSubdivision ? '#ff4488' : '#ff8844'; // Pink for subdivision, orange for dissolution
                const strokeWidth = isFromSubdivision ? '2' : '1.5';
                
                layers.push(\`<path d="\${path}" fill="none" stroke="\${strokeColor}" stroke-width="\${strokeWidth}" opacity="0.8" />\`);
                shapeCount++;
                
                if (isFromSubdivision) {
                  quadsFromSubdivision++;
                } else if (shape.type === 'quad') {
                  quadsFromDissolution++;
                }
              }
            }
          });
        }
        console.log(\`Rendered \${shapeCount} shapes for Stage 4 (After Subdivide Triangles): \${quadsFromSubdivision} from subdivision (pink), \${quadsFromDissolution} from dissolution (orange)\`);
      } else if (stageKey === '5' && stage.data) {
        // Stage 5: Subdivided quads (orange) - like subdivide-quads.jpg
        let quadCount = 0;
        const allQuads = [];
        if (stage.data.level0 && Array.isArray(stage.data.level0)) {
          allQuads.push(...stage.data.level0);
        }
        if (stage.data.level1 && Array.isArray(stage.data.level1)) {
          allQuads.push(...stage.data.level1);
        }
        allQuads.forEach(quad => {
          if (quad && quad.verts && Array.isArray(quad.verts) && quad.verts.length >= 3) {
            const verts = quad.verts.map(vIdx => {
              const p = centeredPoints[vIdx];
              return p && isFinite(p.x) && isFinite(p.y) ? p : null;
            }).filter(v => v !== null);
            if (verts.length >= 3) {
              const path = verts.map((v, i) => \`\${i === 0 ? 'M' : 'L'} \${v.x.toFixed(2)} \${v.y.toFixed(2)}\`).join(' ') + ' Z';
              layers.push(\`<path d="\${path}" fill="none" stroke="\${stage.color}" stroke-width="1.5" opacity="0.8" />\`);
              quadCount++;
            }
          }
        });
        console.log(\`Rendered \${quadCount} orange subdivided quads for Stage 5 (After Subdivide Quads)\`);
      } else if (stageKey === 'final' && stage.data) {
        // Stage 6: Final (black rounded quads after 1 iter relaxation + dual offset)
        const finalPoints = stage.data.dualPoints || stage.data.points;
        if (!finalPoints || !Array.isArray(finalPoints) || finalPoints.length === 0) {
          console.warn('No final points available');
          layers.push(\`<text x="0" y="0" font-size="24" fill="red" text-anchor="middle">No final data</text>\`);
        } else {
          const finalCentroidX = finalPoints.reduce((sum, p) => sum + (p.x || 0), 0) / finalPoints.length;
          const finalCentroidY = finalPoints.reduce((sum, p) => sum + (p.y || 0), 0) / finalPoints.length;
          const finalCentered = finalPoints.map(p => ({ 
            x: (p.x || 0) - finalCentroidX, 
            y: (p.y || 0) - finalCentroidY 
          }));
          
          let finalQuadCount = 0;
          if (stage.data.level0Quads && Array.isArray(stage.data.level0Quads)) {
            stage.data.level0Quads.forEach(quad => {
              if (quad && quad.verts && Array.isArray(quad.verts) && quad.verts.length >= 3) {
                const verts = quad.verts.map(vIdx => {
                  const p = finalCentered[vIdx];
                  return p && isFinite(p.x) && isFinite(p.y) ? p : null;
                }).filter(v => v !== null);
                if (verts.length >= 3) {
                  const path = verts.map((v, i) => \`\${i === 0 ? 'M' : 'L'} \${v.x.toFixed(2)} \${v.y.toFixed(2)}\`).join(' ') + ' Z';
                  layers.push(\`<path d="\${path}" fill="none" stroke="\${stage.color}" stroke-width="1.5" opacity="0.9" />\`);
                  finalQuadCount++;
                }
              }
            });
          }
          console.log(\`Rendered \${finalQuadCount} black final quads for Stage 6 (Final: Relax + Dual Offset)\`);
        }
      }
      
      return \`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="\${viewBoxX} \${viewBoxY} \${viewBoxWidth} \${viewBoxHeight}">\${layers.join('\\n')}</svg>\`;
    }
    
    // ============================================================
    // SVG Rendering
    // ============================================================
    function renderSVG() {
      try {
        // Fix 1: Comprehensive logging
        console.log('Starting render...');
        
        // STEP-BY-STEP DEBUG: Render selected stage if pipeline stages available
        if (PIPELINE_STAGES && typeof currentStage !== 'undefined') {
          console.log('Showing stage:', currentStage);
          const stageSVG = renderPipelineStage(currentStage);
          if (stageSVG) {
            const container = document.getElementById('svg-container');
            if (container) {
              container.innerHTML = stageSVG;
              console.log('Successfully rendered pipeline stage:', currentStage);
              return;
            } else {
              console.error('Container not found for stage rendering');
            }
          } else {
            console.warn('Failed to render pipeline stage:', currentStage, 'PIPELINE_STAGES:', PIPELINE_STAGES);
          }
        }
        
        // Fallback to normal rendering if no stages or stage rendering failed
        const { points, level0Quads, mapWidth, mapHeight, dualPoints } = DUAL_GRID_DATA;
        
        // Debug: Log data availability
        console.log('points length:', points?.length || 'MISSING');
        console.log('dualPoints length:', dualPoints?.length || 'MISSING');
        console.log('level0Quads length:', level0Quads?.length || 'MISSING');
        
        const container = document.getElementById('svg-container');
        if (!container) {
          throw new Error('Container #svg-container not found');
        }
        
        // Step 1: Switch to dual points (remove forced original points)
        const activePoints = dualPoints && dualPoints.length === points.length ? dualPoints : points;
        console.log('Active points chosen:', dualPoints && dualPoints.length === points.length ? 'DUAL (rounded corners)' : 'ORIGINAL (fallback)', 'length:', activePoints.length);
        
        // Safety check
        if (!activePoints || activePoints.length === 0) {
          throw new Error('No points available for rendering');
        }
        
        // Validate point coordinates (check for NaN/Infinity)
        let invalidPointsCount = 0;
        for (let i = 0; i < activePoints.length; i++) {
          const p = activePoints[i];
          if (!p || !isFinite(p.x) || !isFinite(p.y)) {
            invalidPointsCount++;
            if (invalidPointsCount <= 5) { // Log first 5 invalid points
              console.warn('[renderSVG] Invalid point at index ' + i + ':', p);
            }
          }
        }
        if (invalidPointsCount > 0) {
          console.error('[renderSVG] Found ' + invalidPointsCount + ' invalid points (NaN/Infinity/undefined) out of ' + activePoints.length);
          // Filter out invalid points or use fallback
          const validPoints = activePoints.filter(p => p && isFinite(p.x) && isFinite(p.y));
          if (validPoints.length === 0) {
            throw new Error('All ' + activePoints.length + ' points are invalid (NaN/Infinity/undefined)');
          }
          console.warn('[renderSVG] Using ' + validPoints.length + ' valid points (filtered ' + invalidPointsCount + ' invalid)');
          activePoints.splice(0, activePoints.length, ...validPoints); // Replace array contents
        }
        
        // ============================================================
        // Recenter to origin for rendering (scaling already done in createTransformedHexPoints)
        // ============================================================
        let sumX = 0, sumY = 0;
        let validCount = 0;
        for (const p of activePoints) {
          if (p && isFinite(p.x) && isFinite(p.y)) {
            sumX += p.x;
            sumY += p.y;
            validCount++;
          }
        }
        if (validCount === 0) {
          throw new Error('No valid points after filtering');
        }
        const centroidX = sumX / validCount;
        const centroidY = sumY / validCount;
        
        // Center to origin and validate
        const renderPoints = [];
        for (const p of activePoints) {
          if (p && isFinite(p.x) && isFinite(p.y)) {
            const centeredX = p.x - centroidX;
            const centeredY = p.y - centroidY;
            if (isFinite(centeredX) && isFinite(centeredY)) {
              renderPoints.push({ x: centeredX, y: centeredY });
            } else {
              console.warn('[renderSVG] Centering produced invalid coordinates, skipping point');
            }
          }
        }
        
        if (renderPoints.length === 0) {
          throw new Error('No valid render points after centering');
        }
        
        console.log(\`Centered for rendering: \${renderPoints.length} points, final centroid offset: (\${centroidX.toFixed(2)}, \${centroidY.toFixed(2)})\`);
        
        // Step 5: Use fixed centered viewBox
        const viewBoxX = -550;
        const viewBoxY = -550;
        const viewBoxWidth = 1100;
        const viewBoxHeight = 1100;
        console.log(\`ViewBox: \${viewBoxX} \${viewBoxY} \${viewBoxWidth} \${viewBoxHeight} (centered, elliptical preview)\`);
        
        // Build SVG
        const layers = [];
        
        // Background
        layers.push(\`<rect x="\${viewBoxX}" y="\${viewBoxY}" width="\${viewBoxWidth}" height="\${viewBoxHeight}" fill="#e8f4f8" />\`);
        
        // Step 6: Add debug overlay showing target elliptical shape
        const refPoints = [
          {x:0,y:-480}, {x:-380,y:-460}, {x:380,y:-460},
          {x:460,y:-320}, {x:510,y:-140}, {x:520,y:20},
          {x:460,y:280}, {x:380,y:420}, {x:220,y:480}, {x:0,y:490},
          {x:-220,y:480}, {x:-380,y:420}, {x:-460,y:280}, {x:-520,y:20},
          {x:-510,y:-140}, {x:-460,y:-320}, {x:-380,y:-460}, {x:0,y:-480}
        ];
        
        // Draw yellow reference boundary polyline
        const refPath = refPoints.map((p, i) => \`\${i === 0 ? 'M' : 'L'} \${p.x} \${p.y}\`).join(' ') + ' Z';
        layers.push(\`<path d="\${refPath}" fill="none" stroke="yellow" stroke-width="2" opacity="0.6" />\`);
        
        // Draw small yellow circles at each reference point
        refPoints.forEach(p => {
          layers.push(\`<circle cx="\${p.x}" cy="\${p.y}" r="3" fill="yellow" opacity="0.8" />\`);
        });
        
        // Draw faint blue circle r=500 at origin
        layers.push(\`<circle cx="0" cy="0" r="500" fill="none" stroke="blue" stroke-width="1" opacity="0.3" />\`);
        
        // Keep red 100×100 origin debug rect
        layers.push(\`<rect x="0" y="0" width="100" height="100" fill="red" opacity="0.8" stroke="black" stroke-width="2" />\`);
        console.log('Debug red rect added at (0,0)');
        
        // Debug: Add colored dots for first point (using transformed coordinates)
        if (renderPoints.length > 0) {
          const firstTransformed = renderPoints[0];
          layers.push(\`<circle cx="\${firstTransformed.x}" cy="\${firstTransformed.y}" r="8" fill="green" opacity="0.9" />\`);
        }
        if (dualPoints && dualPoints.length > 0) {
          // Show original dual point position (before transform) for comparison
          const firstDualOriginal = dualPoints[0];
          const firstDualTransformed = renderPoints[0];
          layers.push(\`<circle cx="\${firstDualTransformed.x}" cy="\${firstDualTransformed.y}" r="6" fill="lime" opacity="0.9" />\`);
          console.log(\`Debug markers: Green dot = first transformed point, Lime dot = first dual (transformed)\`);
        }
        
        // FIX 5: Enable quad rendering with rounded dual corners
        // Render dual quads instead of wireframe triangles for better visual and Azgaar integration
        const { rawDelaunayTriangles } = DUAL_GRID_DATA;
        const useQuads = level0Quads && level0Quads.length > 0;
        
        if (useQuads) {
          // Render dual quads with rounded corners (from dualPoints)
          const quadPolygons = [];
          for (let i = 0; i < level0Quads.length; i++) {
            const quad = level0Quads[i];
            if (!quad || !quad.verts) continue;
            
            // Use renderPoints (which are dualPoints after scaling) for rounded corners
            const quadVerts = quad.verts.map(vIdx => renderPoints[vIdx]).filter(v => v && isFinite(v.x) && isFinite(v.y));
            if (quadVerts.length < 3) {
              if (typeof console !== 'undefined' && console.warn && i < 5) { // Log first 5 invalid quads
                console.warn('[renderSVG] Quad ' + i + ' has insufficient valid vertices (' + quadVerts.length + '), skipping');
              }
              continue;
            }
            
            // Validate all vertices are valid numbers
            const hasInvalidVerts = quadVerts.some(v => !isFinite(v.x) || !isFinite(v.y));
            if (hasInvalidVerts) {
              if (typeof console !== 'undefined' && console.warn && i < 5) {
                console.warn('[renderSVG] Quad ' + i + ' has invalid vertex coordinates, skipping');
              }
              continue;
            }
            
            // Get terrain color if available
            const terrain = quadTerrain.get(i);
            // Black wireframe quads (no fills, original style)
            let fillColor = terrain ? heightToColor(terrain.avgHeight) : 'none';
            let fillOpacity = terrain ? 0.8 : 0;
            let strokeColor = terrain ? '#222' : '#333'; // Dark gray/black stroke
            let strokeWidth = '1'; // Original stroke width
            
            // Build path with validated coordinates
            const pathData = quadVerts.map((v, idx) => {
              const x = isFinite(v.x) ? v.x.toFixed(6) : '0';
              const y = isFinite(v.y) ? v.y.toFixed(6) : '0';
              return (idx === 0 ? 'M' : 'L') + ' ' + x + ' ' + y;
            }).join(' ') + ' Z';
            
            quadPolygons.push(
              \`<path d="\${pathData}" fill="\${fillColor}" fill-opacity="\${fillOpacity}" stroke="\${strokeColor}" stroke-width="\${strokeWidth}" data-quad-index="\${i}" />\`
            );
          }
          
          if (quadPolygons.length > 0) {
            layers.push(\`<g id="quads">\${quadPolygons.join('\\n')}</g>\`);
            console.log(\`Rendered \${quadPolygons.length} dual quads with rounded corners\`);
          }
        } else if (rawDelaunayTriangles && rawDelaunayTriangles.length > 0) {
          // Fallback: render wireframe triangles if quads not available
          console.log(\`Fallback: Rendering raw triangles: \${rawDelaunayTriangles.length / 3}\`);
          const trianglePaths = [];
          
          for (let i = 0; i < rawDelaunayTriangles.length; i += 3) {
            const i0 = rawDelaunayTriangles[i];
            const i1 = rawDelaunayTriangles[i + 1];
            const i2 = rawDelaunayTriangles[i + 2];
            
            const p0 = renderPoints[i0];
            const p1 = renderPoints[i1];
            const p2 = renderPoints[i2];
            
            if (!p0 || !p1 || !p2) continue;
            
            // Validate coordinates before building path
            if (!isFinite(p0.x) || !isFinite(p0.y) || !isFinite(p1.x) || !isFinite(p1.y) || !isFinite(p2.x) || !isFinite(p2.y)) {
              continue; // Skip invalid triangle
            }
            
            const pathData = 'M ' + p0.x.toFixed(6) + ' ' + p0.y.toFixed(6) + ' L ' + p1.x.toFixed(6) + ' ' + p1.y.toFixed(6) + ' L ' + p2.x.toFixed(6) + ' ' + p2.y.toFixed(6) + ' Z';
            trianglePaths.push(
              \`<path d="\${pathData}" fill="none" stroke="#4488ff" stroke-width="1" opacity="0.6" data-triangle-index="\${i / 3}" />\`
            );
          }
          
          if (trianglePaths.length > 0) {
            layers.push(\`<g id="triangles">\${trianglePaths.join('\\n')}</g>\`);
          }
        }
        
        // Build complete SVG (use mapWidth/mapHeight for container size, viewBox for scaling)
        const svg = \`<svg xmlns="http://www.w3.org/2000/svg" width="\${mapWidth}" height="\${mapHeight}" viewBox="\${viewBoxX} \${viewBoxY} \${viewBoxWidth} \${viewBoxHeight}" preserveAspectRatio="xMidYMid meet" overflow="visible">
\${layers.join('\\n')}
</svg>\`;
        
        // Clear container fully before rendering
        container.innerHTML = '';
        
        // Create and append SVG element
        try {
          container.innerHTML = svg;
          
          // Attach click handler to SVG
          const svgElement = container.querySelector('svg');
          
          if (!svgElement) {
            throw new Error('SVG element not found after setting innerHTML');
          }
          
          // Force visibility
          svgElement.style.display = 'block';
          svgElement.style.visibility = 'visible';
          
          // Validate SVG structure
          if (svgElement.children.length === 0) {
            console.warn('[renderSVG] SVG has no children - rendering may have failed');
          }
        } catch (svgError) {
          console.error('[renderSVG] Error creating SVG element:', svgError);
          throw svgError;
        }
        
        const svgElement = container.querySelector('svg');
        
        // === DUAL GRID RENDER DEBUG ===
        console.log("=== DUAL GRID RENDER DEBUG ===");
        console.log("=== DUAL GRID RENDER DEBUG ===");
        console.log("Points:", points?.length || "MISSING");
        console.log("Mode:", useQuads ? "QUADS" : "TRIANGLES");
        console.log("Quads count:", level0Quads?.length || "MISSING");
        // Relaxation parameters are logged during generation - see "Relaxation parameters:" in console
        console.log("For relaxation params, check generation logs above (iterations=100, damping=0.5, offsetFactor=0.35)");
        console.log("Final rendered point count:", points?.length || dualPoints?.length || "MISSING");
        console.log("Dual points count:", dualPoints?.length || "MISSING");
        console.log("Active points count:", activePoints?.length || "MISSING");
        console.log("Render points count:", renderPoints?.length || "MISSING");
        console.log("ViewBox:", svgElement.getAttribute("viewBox"));
        console.log("SVG children count:", svgElement.children.length);
        console.log("First 3 rendered elements:", Array.from(svgElement.children).slice(0,3).map(el => {
          const tag = el.tagName;
          const hasPath = el.getAttribute('d') ? ' path' : '';
          const id = el.getAttribute('id') || '';
          return tag + hasPath + (id ? ' (id:' + id + ')' : '');
        }));
        console.log("SVG display:", svgElement.style.display);
        console.log("SVG visibility:", svgElement.style.visibility);
        console.log("Container display:", container.style.display);
        console.log("Container visibility:", container.style.visibility);
        console.log("=== END RENDER DEBUG ===");
        
        svgElement.addEventListener('click', handleClick);
        
        // Step 7: Enable click detection on the SVG for dual point detection
        svgElement.addEventListener('click', function onGridClick(e) {
          // Get click coordinates in SVG space
          const pointInSVG = svgElement.createSVGPoint();
          pointInSVG.x = e.clientX;
          pointInSVG.y = e.clientY;
          const svgPoint = pointInSVG.matrixTransform(svgElement.getScreenCTM().inverse());
          
          const clickX = svgPoint.x;
          const clickY = svgPoint.y;
          
          // Find nearest dual point (simple distance check)
          let nearestPoint = null;
          let nearestIndex = -1;
          let minDist = Infinity;
          
          for (let i = 0; i < renderPoints.length; i++) {
            const p = renderPoints[i];
            const dist = Math.sqrt((p.x - clickX) ** 2 + (p.y - clickY) ** 2);
            if (dist < minDist) {
              minDist = dist;
              nearestPoint = p;
              nearestIndex = i;
            }
          }
          
          console.log(\`Clicked at SVG coords: (\${clickX.toFixed(1)}, \${clickY.toFixed(1)}), nearest dual point index: \${nearestIndex}, distance: \${minDist.toFixed(1)}\`);
          console.log(\`Nearest dual point: (\${nearestPoint.x.toFixed(2)}, \${nearestPoint.y.toFixed(2)})\`);
          
          // TEMP: Find triangle containing this point and highlight it (until quad dissolution is fixed)
          const { rawDelaunayTriangles } = DUAL_GRID_DATA;
          let clickedTriangleIdx = -1;
          
          if (rawDelaunayTriangles && rawDelaunayTriangles.length > 0) {
            // Simple point-in-triangle test
            function isPointInTriangle(point, p0, p1, p2) {
              const dX = point.x - p2.x;
              const dY = point.y - p2.y;
              const dX21 = p2.x - p1.x;
              const dY12 = p1.y - p2.y;
              const D = dY12 * (p0.x - p2.x) + dX21 * (p0.y - p2.y);
              const s = dY12 * dX + dX21 * dY;
              const t = (p2.y - p0.y) * dX + (p0.x - p2.x) * dY;
              if (D < 0) return s <= 0 && t <= 0 && s + t >= D;
              return s >= 0 && t >= 0 && s + t <= D;
            }
            
            // Find triangle containing click point
            for (let i = 0; i < rawDelaunayTriangles.length; i += 3) {
              const i0 = rawDelaunayTriangles[i];
              const i1 = rawDelaunayTriangles[i + 1];
              const i2 = rawDelaunayTriangles[i + 2];
              
              const p0 = renderPoints[i0];
              const p1 = renderPoints[i1];
              const p2 = renderPoints[i2];
              
              if (p0 && p1 && p2 && isPointInTriangle({ x: clickX, y: clickY }, p0, p1, p2)) {
                clickedTriangleIdx = i / 3;
                break;
              }
            }
            
            // Visual feedback: highlight the clicked triangle with red stroke
            if (clickedTriangleIdx >= 0) {
              // Remove previous highlights
              const prevHighlights = svgElement.querySelectorAll('.click-highlight');
              prevHighlights.forEach(el => el.remove());
              
              // Add highlight to clicked triangle
              const triIdx = clickedTriangleIdx * 3;
              const i0 = rawDelaunayTriangles[triIdx];
              const i1 = rawDelaunayTriangles[triIdx + 1];
              const i2 = rawDelaunayTriangles[triIdx + 2];
              
              const p0 = renderPoints[i0];
              const p1 = renderPoints[i1];
              const p2 = renderPoints[i2];
              
              if (p0 && p1 && p2) {
                const highlightPath = \`M \${p0.x} \${p0.y} L \${p1.x} \${p1.y} L \${p2.x} \${p2.y} Z\`;
                
                const highlight = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                if (highlight) {
                  highlight.setAttribute('d', highlightPath);
                  highlight.setAttribute('fill', 'none');
                  highlight.setAttribute('stroke', 'red');
                  highlight.setAttribute('stroke-width', '3');
                  highlight.setAttribute('opacity', '0.8');
                  // FIX 4: Add null check for classList
                  if (highlight.classList) {
                    highlight.classList.add('click-highlight');
                  }
                  svgElement.appendChild(highlight);
                  
                  console.log(\`Highlighted triangle \${clickedTriangleIdx}\`);
                }
              }
            }
          } else {
            // Fallback: find quad (if triangles not available)
            let clickedQuadIdx = -1;
            for (let i = 0; i < level0Quads.length; i++) {
              const quad = level0Quads[i];
              if (!quad || !quad.verts) continue;
              if (quad.verts.includes(nearestIndex)) {
                clickedQuadIdx = i;
                break;
              }
            }
            
            if (clickedQuadIdx >= 0) {
              const prevHighlights = svgElement.querySelectorAll('.click-highlight');
              prevHighlights.forEach(el => el.remove());
              
              const quad = level0Quads[clickedQuadIdx];
              if (quad && quad.verts) {
                const quadVerts = quad.verts.map(vIdx => renderPoints[vIdx]);
                if (quadVerts.length >= 3) {
                  const highlightPath = quadVerts.map((v, idx) => 
                    \`\${idx === 0 ? 'M' : 'L'} \${v.x} \${v.y}\`
                  ).join(' ') + ' Z';
                  
                  const highlight = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                  highlight.setAttribute('d', highlightPath);
                  highlight.setAttribute('fill', 'none');
                  highlight.setAttribute('stroke', 'red');
                  highlight.setAttribute('stroke-width', '3');
                  highlight.setAttribute('opacity', '0.8');
                  // FIX 4: Add null check for classList
                  if (highlight.classList) {
                    highlight.classList.add('click-highlight');
                  }
                  svgElement.appendChild(highlight);
                }
              }
            }
          }
        });
        
        // Fix 1: Log completion
        console.log('Render completed successfully');
      } catch (err) {
        console.error('Render crashed:', err.message, err.stack);
        const container = document.getElementById('svg-container');
        if (container) {
          container.innerHTML = \`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
            <rect x="0" y="0" width="960" height="540" fill="#f8e8e8" />
            <text x="480" y="270" font-family="Arial" font-size="24" fill="red" text-anchor="middle">Render Error - check console</text>
          </svg>\`;
        }
      }
    }
    
    // Force minimal visible render (test pattern) - always draw something
    function drawTestPattern() {
      const container = document.getElementById('svg-container');
      if (!container) {
        console.error('Container not found for test pattern');
        return;
      }
      
      // Create a simple SVG test pattern
      const testSVG = \`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" style="background: rgba(0,255,0,0.2);">
        <rect x="50" y="50" width="860" height="440" fill="rgba(0,255,0,0.2)" stroke="green" stroke-width="2" />
        <text x="100" y="270" font-family="Arial" font-size="30" fill="blue">TEST RENDER - GRID SHOULD BE HERE</text>
      </svg>\`;
      container.innerHTML = testSVG;
      console.log('Test pattern drawn - canvas should show green rect + blue text');
    }
    
    // ============================================================
    // Click Handler (async with loading UI and error handling)
    // ============================================================
    async function handleClick(event) {
      // Prevent multiple simultaneous clicks
      if (isGenerating) {
        return;
      }
      
      try {
        isGenerating = true;
        const loadingOverlay = document.getElementById('loading-overlay');
        const statusEl = document.getElementById('status');
        const svg = event.currentTarget;
        const rect = svg.getBoundingClientRect();
        
        // Get click coordinates relative to SVG viewBox
        const viewBox = svg.viewBox.baseVal;
        const x = ((event.clientX - rect.left) / rect.width) * viewBox.width + viewBox.x;
        const y = ((event.clientY - rect.top) / rect.height) * viewBox.height + viewBox.y;
        
        // Show loading UI immediately
        statusEl.textContent = \`Generating terrain at (\${x.toFixed(1)}, \${y.toFixed(1)})...\`;
        statusEl.className = 'status generating';
        loadingOverlay.classList.add('active');
        
        // Disable pointer events on SVG during generation
        svg.style.pointerEvents = 'none';
        
        // Allow UI to update
        await new Promise(resolve => setTimeout(resolve, 0));
        
        const startTime = performance.now();
        
        // Find containing quad
        const { points, level0Quads } = DUAL_GRID_DATA;
        let clickedQuad = null;
        let clickedQuadIdx = -1;
        
        // Try to find quad containing the point
        for (let i = 0; i < level0Quads.length; i++) {
          const quad = level0Quads[i];
          if (pointInQuad({ x, y }, quad, points)) {
            clickedQuad = quad;
            clickedQuadIdx = i;
            break;
          }
        }
        
        // Fallback: find nearest quad center
        if (!clickedQuad) {
          let minDist = Infinity;
          for (let i = 0; i < level0Quads.length; i++) {
            const quad = level0Quads[i];
            if (!quad.center) continue;
            const dist = Math.hypot(quad.center.x - x, quad.center.y - y);
            if (dist < minDist) {
              minDist = dist;
              clickedQuad = quad;
              clickedQuadIdx = i;
            }
          }
        }
        
        if (!clickedQuad || clickedQuadIdx < 0) {
          statusEl.textContent = 'No quad found at click location';
          statusEl.className = 'status';
          loadingOverlay.classList.remove('active');
          svg.style.pointerEvents = 'auto';
          isGenerating = false;
          return;
        }
        
        const center = clickedQuad.center || { x, y };
        const radius = 100; // World units
        
        // Generate terrain (wrap in Promise for async behavior)
        await new Promise(resolve => setTimeout(resolve, 0)); // Allow UI update
        const rng = new SimpleRNG(DUAL_GRID_DATA.seed + '_terrain_' + clickedQuadIdx);
        const terrainData = generateRegionalTerrain(center, radius, rng, DUAL_GRID_DATA.mapHeight);
        const terrainTime = performance.now() - startTime;
        
        // Map terrain to quads (wrap in Promise for async behavior)
        await new Promise(resolve => setTimeout(resolve, 0)); // Allow UI update
        const mappingStart = performance.now();
        const newTerrain = mapTerrainToQuads(terrainData, level0Quads, points);
        
        // Merge with existing terrain (accumulate)
        for (const [quadIdx, terrain] of newTerrain) {
          quadTerrain.set(quadIdx, terrain);
        }
        
        const mappingTime = performance.now() - mappingStart;
        const totalTime = performance.now() - startTime;
        
        // Re-render SVG (wrap in Promise for async behavior)
        await new Promise(resolve => setTimeout(resolve, 0)); // Allow UI update
        renderSVG();
        
        statusEl.textContent = \`✅ Terrain generated! (\${newTerrain.size} quads, \${totalTime.toFixed(0)}ms total, \${terrainTime.toFixed(0)}ms gen, \${mappingTime.toFixed(0)}ms map)\`;
        statusEl.className = 'status';
        loadingOverlay.classList.remove('active');
        svg.style.pointerEvents = 'auto';
        
      } catch (err) {
        console.error('Terrain generation error:', err);
        const statusEl = document.getElementById('status');
        const loadingOverlay = document.getElementById('loading-overlay');
        const svg = event.currentTarget;
        
        statusEl.textContent = \`❌ Error: \${err.message}\`;
        statusEl.className = 'status';
        loadingOverlay.classList.remove('active');
        svg.style.pointerEvents = 'auto';
        
        // Show alert for user feedback
        alert(\`Terrain generation failed: \${err.message}\`);
      } finally {
        isGenerating = false;
      }
    }
    
    // ============================================================
    // Controls
    // ============================================================
    document.getElementById('resetBtn').addEventListener('click', () => {
      quadTerrain.clear();
      renderSVG();
      document.getElementById('status').textContent = 'Grid reset - Click to generate terrain';
    });
    
    document.getElementById('clearBtn').addEventListener('click', () => {
      quadTerrain.clear();
      renderSVG();
      document.getElementById('status').textContent = 'Terrain cleared - Click to generate terrain';
    });
    
    // STEP-BY-STEP DEBUG: Stage selector
    if (PIPELINE_STAGES) {
      console.log('Pipeline stages available:', Object.keys(PIPELINE_STAGES));
      const stageSelect = document.getElementById('stageSelect');
      if (stageSelect) {
        // Initialize to show final stage
        currentStage = 'final';
        stageSelect.value = 'final';
        console.log('Initialized stage selector, showing:', currentStage);
        
        stageSelect.addEventListener('change', (e) => {
          currentStage = e.target.value;
          console.log('Switching to pipeline stage:', currentStage);
          renderSVG();
        });
        
        // Initial render will happen after DOM is ready
      } else {
        console.error('Stage selector element not found');
      }
    } else {
      console.log('No pipeline stages available - using normal rendering');
    }
    
    // ============================================================
    // Initialize
    // ============================================================
    // Wrap entire script initialization in try/catch
    try {
      console.log('Script initialization starting...');
      
      // Check if dualPoints are missing
      if (!DUAL_GRID_DATA.dualPoints || DUAL_GRID_DATA.dualPoints.length === 0) {
        console.warn('dualPoints MISSING - using original points');
      }
      
      // Initial render
      renderSVG();
      
      // If render failed silently, draw test pattern as fallback
      setTimeout(() => {
        const container = document.getElementById('svg-container');
        if (container && (!container.innerHTML || container.innerHTML.trim() === '')) {
          console.warn('Container empty after render - drawing test pattern');
          drawTestPattern();
        }
      }, 100);
      
      console.log('Script initialization completed');
    } catch (err) {
      console.error('Script initialization crashed:', err.message, err.stack);
      drawTestPattern(); // Always show something
    }
    
    console.log('Interactive terrain test ready! Click on the grid to generate terrain.');
  </script>
</body>
</html>`;
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  generateInteractiveTerrain().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { generateInteractiveTerrain };
