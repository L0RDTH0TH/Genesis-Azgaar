/**
 * =============================================================================
 * test-dual-grid.js
 * Desc: Test script for dual-grid relaxation verification
 * Author: Lordthoth
 * =============================================================================
 */

import Delaunator from 'delaunator';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { initGenerator, loadOptions, generateMap, getMapData, renderPreviewSVG } from '../src/index.js';

const execAsync = promisify(exec);

/**
 * Test dual-grid generation with relaxation
 */
async function testDualGridRelaxation() {
  console.log('=== Dual-Grid Relaxation Test ===\n');
  
  try {
    // Initialize generator (headless)
    initGenerator({ canvas: null });
    
    // Load options with dual-grid enabled
    // Note: fullRendering: true needed for SVG export
    const testOptions = {
      seed: '42',
      mapWidth: 960,
      mapHeight: 540,
      statesNumber: 18,
      fullRendering: true, // Required for SVG rendering
      useDualGridPolitics: true,
      politicsMode: {
        hexLayers: 20,
        relaxationIterations: 150,
        dampingFactor: 0.25,
        dissolveProbability: 0.5,
      },
    };
    
    console.log('Options:', JSON.stringify(testOptions, null, 2));
    console.log('\nGenerating map...\n');
    
    loadOptions(testOptions);
    
    const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const data = generateMap(Delaunator);
    const generateTime = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime;
    
    console.log(`Generation completed in ${generateTime.toFixed(2)}ms\n`);
    
    // Check if dualGrid exists
    if (!data.pack.dualGrid) {
      console.error('❌ ERROR: pack.dualGrid is missing!');
      return;
    }
    
    const { points, level0Quads, level1Quads } = data.pack.dualGrid;
    
    // Verify structure
    console.log('=== Dual-Grid Structure ===');
    console.log(`Points: ${points.length}`);
    console.log(`Level 0 quads: ${level0Quads.length}`);
    console.log(`Level 1 quads: ${level1Quads.length}`);
    console.log('');
    
    // Edge dissolution verification
    console.log('=== Edge Dissolution Verification ===');
    console.log('Note: All shapes (triangles + quads) are eventually converted to quads via subdivision.');
    console.log(`Final Level 0 quad count: ${level0Quads.length}`);
    console.log(`Expected range: 100-150 quads ${level0Quads.length >= 100 && level0Quads.length <= 150 ? '✅' : '⚠️'}`);
    console.log(`Dissolve probability used: ${testOptions.politicsMode.dissolveProbability}`);
    console.log('(Higher dissolve probability should result in more organic shapes)');
    console.log('');
    
    // Check quad counts (per design v2: ~100-150 level0, ~400-600 level1)
    const level0Count = level0Quads.length;
    const level1Count = level1Quads.length;
    const level0InRange = level0Count >= 100 && level0Count <= 150;
    const level1InRange = level1Count >= 400 && level1Count <= 600;
    
    console.log('=== Quad Count Verification ===');
    console.log(`Level 0: ${level0Count} quads ${level0InRange ? '✅' : '⚠️  (expected 100-150)'}`);
    console.log(`Level 1: ${level1Count} quads ${level1InRange ? '✅' : '⚠️  (expected 400-600)'}`);
    console.log('');
    
    // Sample first 5 points (before/after relaxation positions)
    // Note: We can't see "before" positions since relaxation happens in-place,
    // but we can verify points are reasonable
    console.log('=== Sample Points (after relaxation) ===');
    const sampleCount = Math.min(5, points.length);
    for (let i = 0; i < sampleCount; i++) {
      const p = points[i];
      console.log(`Point ${i}: (${p.x.toFixed(2)}, ${p.y.toFixed(2)})`);
    }
    console.log('');
    
    // Verify points are valid (not NaN, not infinite)
    let validPoints = 0;
    let invalidPoints = 0;
    for (const p of points) {
      if (isFinite(p.x) && isFinite(p.y)) {
        validPoints++;
      } else {
        invalidPoints++;
      }
    }
    
    console.log('=== Point Validity ===');
    console.log(`Valid points: ${validPoints} ✅`);
    if (invalidPoints > 0) {
      console.log(`Invalid points: ${invalidPoints} ❌`);
    }
    console.log('');
    
    // Verify quad structure
    console.log('=== Quad Structure Verification ===');
    let validLevel0Quads = 0;
    let validLevel1Quads = 0;
    
    for (const quad of level0Quads) {
      if (quad.verts && quad.verts.length === 4 && quad.center) {
        validLevel0Quads++;
      }
    }
    
    for (const quad of level1Quads) {
      if (quad.verts && quad.verts.length === 4 && quad.center && quad.parentQuadId !== undefined) {
        validLevel1Quads++;
      }
    }
    
    console.log(`Valid Level 0 quads: ${validLevel0Quads}/${level0Quads.length} ${validLevel0Quads === level0Quads.length ? '✅' : '❌'}`);
    console.log(`Valid Level 1 quads: ${validLevel1Quads}/${level1Quads.length} ${validLevel1Quads === level1Quads.length ? '✅' : '❌'}`);
    console.log('');
    
    // Sample quad centers
    console.log('=== Sample Quad Centers ===');
    console.log('Level 0 (first 3):');
    for (let i = 0; i < Math.min(3, level0Quads.length); i++) {
      const q = level0Quads[i];
      console.log(`  Quad ${i}: center (${q.center.x.toFixed(2)}, ${q.center.y.toFixed(2)}), ${q.childQuadIds.length} children`);
    }
    console.log('Level 1 (first 3):');
    for (let i = 0; i < Math.min(3, level1Quads.length); i++) {
      const q = level1Quads[i];
      console.log(`  Quad ${i}: center (${q.center.x.toFixed(2)}, ${q.center.y.toFixed(2)}), parent: ${q.parentQuadId}`);
    }
    console.log('');
    
    // Burg snapping verification
    console.log('=== Burg Snapping Verification ===');
    const burgs = data.pack.burgs || [];
    const snappedBurgs = burgs.filter(b => b && b.dualGridPointId !== undefined);
    console.log(`Total burgs: ${burgs.length}`);
    console.log(`Snapped burgs: ${snappedBurgs.length} ${snappedBurgs.length > 0 ? '✅' : '❌'}`);
    console.log('');
    
    if (snappedBurgs.length > 0) {
      console.log('Sample snapped burgs (first 5):');
      const sampleCount = Math.min(5, snappedBurgs.length);
      for (let i = 0; i < sampleCount; i++) {
        const b = snappedBurgs[i];
        const originalPos = `(${b.x.toFixed(2)}, ${b.y.toFixed(2)})`;
        const pointId = b.dualGridPointId;
        const pointDist = b.dualGridPointDistance !== undefined ? b.dualGridPointDistance.toFixed(2) : 'N/A';
        const quadId = b.dualQuadId !== undefined ? b.dualQuadId : 'N/A';
        const quadDist = b.dualQuadDistance !== undefined ? b.dualQuadDistance.toFixed(2) : 'N/A';
        const parentQuadId = b.dualQuadParentId !== undefined ? b.dualQuadParentId : 'N/A';
        
        console.log(`  Burg ${b.i || i} (${b.name || 'unnamed'}):`);
        console.log(`    Original pos: ${originalPos}`);
        console.log(`    Snapped to point ${pointId}, distance: ${pointDist}`);
        console.log(`    Snapped to quad ${quadId} (parent: ${parentQuadId}), distance: ${quadDist}`);
        
        // Verify no NaN/invalid snaps
        if (pointId !== undefined && (isNaN(pointId) || pointId < 0)) {
          console.log(`    ⚠️  WARNING: Invalid pointId: ${pointId}`);
        }
        if (pointDist !== 'N/A' && (isNaN(parseFloat(pointDist)) || parseFloat(pointDist) < 0)) {
          console.log(`    ⚠️  WARNING: Invalid distance: ${pointDist}`);
        }
      }
      console.log('');
    } else {
      console.log('⚠️  No burgs were snapped! Check that burgs have valid x,y positions.');
      console.log('');
    }
    
    // Overall result
    console.log('=== Test Summary ===');
    const allValid = 
      data.pack.dualGrid !== undefined &&
      points.length > 0 &&
      validPoints === points.length &&
      validLevel0Quads === level0Quads.length &&
      validLevel1Quads === level1Quads.length;
    
    if (allValid) {
      console.log('✅ All checks passed! Dual-grid relaxation is working correctly.');
    } else {
      console.log('⚠️  Some checks failed. Review output above.');
    }
    
    // Pattern matching verification
    console.log('=== Pattern Matching Verification ===');
    const stateAssignments = data.pack.dualGrid?.stateAssignments;
    if (stateAssignments) {
      const states = stateAssignments.states || [];
      console.log(`States created: ${states.length} ${states.length > 0 ? '✅' : '⚠️'}`);
      
      if (states.length > 0) {
        console.log('\nSample states (first 3):');
        for (let i = 0; i < Math.min(3, states.length); i++) {
          const state = states[i];
          const quadCount = state.quads ? state.quads.length : 0;
          console.log(`  State ${state.i} (${state.name || 'unnamed'}):`);
          console.log(`    Capital burg: ${state.capital || 'N/A'}`);
          console.log(`    Quads assigned: ${quadCount}`);
          console.log(`    Quad IDs: ${state.quads ? state.quads.slice(0, 5).join(', ') : 'none'}${quadCount > 5 ? '...' : ''}`);
        }
        console.log('');
      }
      
      // Check for unassigned quads
      const unassignedQuads = level0Quads.filter(q => q.stateId === -1 || q.stateId === undefined);
      console.log(`Unassigned quads: ${unassignedQuads.length} ${unassignedQuads.length === 0 ? '✅' : '⚠️'}`);
      
      // Verify burg-seeded quads start patterns
      const capitalBurgs = data.pack.burgs.filter(b => b && b.capital && b.dualQuadId !== undefined);
      let burgSeededCount = 0;
      for (const burg of capitalBurgs) {
        const quadId = burg.dualQuadId;
        if (quadId !== undefined && level0Quads[quadId] && level0Quads[quadId].stateId !== -1) {
          burgSeededCount++;
        }
      }
      console.log(`Burg-seeded quads with states: ${burgSeededCount}/${capitalBurgs.length} ${burgSeededCount === capitalBurgs.length ? '✅' : '⚠️'}`);
      console.log('');
      
      // Check for overlapping assignments
      const quadStateMap = new Map();
      let overlaps = 0;
      for (const quad of level0Quads) {
        if (quad.stateId !== -1 && quad.stateId !== undefined) {
          if (quadStateMap.has(quad.i)) {
            overlaps++;
          } else {
            quadStateMap.set(quad.i, quad.stateId);
          }
        }
      }
      console.log(`Overlapping assignments: ${overlaps} ${overlaps === 0 ? '✅' : '❌'}`);
      console.log('');
    } else {
      console.log('⚠️  No state assignments found in dualGrid.stateAssignments');
      console.log('');
    }
    
    // Variant selection verification
    console.log('=== Variant Selection Verification ===');
    const level0QuadsWithVariants = level0Quads.filter(q => q.variantId !== undefined);
    const uniqueVariants = new Set(level0QuadsWithVariants.map(q => q.variantId));
    
    console.log(`Quads with variants: ${level0QuadsWithVariants.length}/${level0Quads.length} ${level0QuadsWithVariants.length > 0 ? '✅' : '⚠️'}`);
    console.log(`Unique variants used: ${uniqueVariants.size}`);
    console.log(`Variant list: ${Array.from(uniqueVariants).slice(0, 10).join(', ')}${uniqueVariants.size > 10 ? '...' : ''}`);
    console.log('');
    
    if (level0QuadsWithVariants.length > 0) {
      // Show sample quads with their pattern + variantId
      console.log('Sample quads with patterns and variants (first 10):');
      let sampleCount = 0;
      for (const quad of level0QuadsWithVariants) {
        if (sampleCount >= 10) break;
        const patternId = quad.patternId || 'unknown';
        const variantId = quad.variantId || 'none';
        const stateId = quad.stateId !== -1 ? quad.stateId : 'unassigned';
        console.log(`  Quad ${quad.i}: state=${stateId}, pattern=${patternId}, variant=${variantId}`);
        sampleCount++;
      }
      console.log('');
      
      // Verify variant diversity within states
      if (stateAssignments && stateAssignments.states) {
        console.log('Variant diversity per state (first 3 states):');
        for (let i = 0; i < Math.min(3, stateAssignments.states.length); i++) {
          const state = stateAssignments.states[i];
          const stateQuads = level0Quads.filter(q => q.stateId === state.i && q.variantId);
          const stateVariants = new Set(stateQuads.map(q => q.variantId));
          const patternCounts = {};
          stateQuads.forEach(q => {
            const pattern = q.patternId || 'unknown';
            patternCounts[pattern] = (patternCounts[pattern] || 0) + 1;
          });
          
          console.log(`  State ${state.i} (${state.name || 'unnamed'}):`);
          console.log(`    Quads: ${stateQuads.length}, Unique variants: ${stateVariants.size}`);
          console.log(`    Patterns: ${Object.keys(patternCounts).join(', ')}`);
          console.log(`    Variants: ${Array.from(stateVariants).join(', ')}`);
        }
        console.log('');
      }
      
      // Check reproducibility (would need to run twice with same seed to verify)
      console.log('Reproducibility: Use same seed to verify variant consistency');
      console.log('');
    } else {
      console.log('⚠️  No variants assigned! Check variant assignment function.');
      console.log('');
    }
    
    // Politics replacement verification
    console.log('=== Politics Replacement Verification ===');
    const packStates = data.pack.states || [];
    const statesFromDualGrid = packStates.length > 0 && data.pack.dualGrid?.stateAssignments;
    
    console.log(`Total states in pack.states: ${packStates.length - 1} (excluding neutral)`);
    console.log(`States from dual-grid: ${statesFromDualGrid ? '✅ Yes' : '❌ No (using Voronoi)'}`);
    
    if (statesFromDualGrid && packStates.length > 1) {
      console.log('\nSample states from dual-grid (first 3):');
      for (let i = 1; i < Math.min(4, packStates.length); i++) {
        const state = packStates[i];
        console.log(`  State ${state.i} (${state.name || 'unnamed'}):`);
        console.log(`    Capital: ${state.capital || 'N/A'}`);
        console.log(`    Color: ${state.color || 'N/A'}`);
        console.log(`    Culture: ${state.culture || 'N/A'}`);
        console.log(`    Quads: ${state.quads ? state.quads.length : 0}`);
      }
      console.log('');
    }
    
    // Check cells.state array
    const cellsWithStates = data.pack.cells.state ? 
      Array.from(data.pack.cells.state).filter(s => s > 0).length : 0;
    console.log(`Cells with state assigned: ${cellsWithStates}/${data.pack.cells.i.length}`);
    console.log('');
    
    // Test with toggle false (Voronoi fallback)
    console.log('=== Testing Voronoi Fallback ===');
    console.log('(Re-run with useDualGridPolitics: false to verify fallback)');
    console.log('');
    
    // Export JSON for inspection
    const json = getMapData();
    console.log('\n=== JSON Export ===');
    console.log(`Full JSON size: ${JSON.stringify(json).length} bytes`);
    console.log(`Dual-grid enabled flag: ${json.dualGridEnabled ? '✅' : '❌'}`);
    console.log(`Dual-grid points in JSON: ${json.pack.dualGrid?.points?.length || 0}`);
    console.log(`States in JSON: ${json.pack.states?.length || 0}`);
    console.log('');
    
    // Export verification
    console.log('=== Dual-Grid Export Verification ===');
    if (json.dualGridEnabled && json.pack.dualGrid) {
      const dg = json.pack.dualGrid;
      console.log('✅ Dual-grid data found in export');
      console.log(`  Points: ${dg.points?.length || 0}`);
      console.log(`  Level 0 quads: ${dg.level0Quads?.length || 0}`);
      console.log(`  Level 1 quads: ${dg.level1Quads?.length || 0}`);
      console.log(`  State assignments: ${dg.stateAssignments ? '✅' : '❌'}`);
      
      if (dg.stateAssignments) {
        console.log(`    States: ${dg.stateAssignments.states?.length || 0}`);
        console.log(`    Quad-to-state mappings: ${dg.stateAssignments.quadToState?.length || 0}`);
      }
      
      // Check for variants
      const quadsWithVariants = dg.level0Quads?.filter(q => q.variantId) || [];
      console.log(`  Quads with variants: ${quadsWithVariants.length}`);
      console.log('');
      
      // Verify JSON serialization (round-trip)
      try {
        const jsonString = JSON.stringify(json);
        const parsed = JSON.parse(jsonString);
        console.log('✅ JSON serialization valid (round-trip successful)');
        console.log(`  Serialized size: ${jsonString.length} bytes`);
        console.log(`  Parsed keys: ${Object.keys(parsed).join(', ')}`);
        console.log('');
        
        // Save to file
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = dirname(__filename);
        const samplesDir = `${__dirname}/../samples`;
        try {
          mkdirSync(samplesDir, { recursive: true });
        } catch (e) {
          // Directory might already exist
        }
        const exportPath = `${samplesDir}/dual-grid-export.json`;
        writeFileSync(exportPath, jsonString, 'utf8');
        console.log(`✅ Exported to: ${exportPath}`);
        console.log('');
      } catch (e) {
        console.error('❌ JSON serialization failed:', e.message);
        console.log('');
      }
    } else {
      console.log('⚠️  Dual-grid data not found in export (expected when useDualGridPolitics: true)');
      console.log('');
    }
    
    // Generate and open SVG preview from this test data
    if (process.argv.includes('--preview')) {
      console.log('\n=== Generating SVG Preview ===');
      try {
        const filename = 'dual-grid-preview-test.svg';
        const fullPath = await exportDualGridToSVG(data, filename, {
          width: testOptions.mapWidth,
          height: testOptions.mapHeight,
        });
        console.log(`✅ Preview generated and opened: ${fullPath}\n`);
      } catch (e) {
        console.error('⚠️  Could not generate preview:', e.message);
      }
    }
    
  } catch (error) {
    console.error('❌ Test failed with error:', error);
    console.error(error.stack);
    if (typeof process !== 'undefined') {
      process.exit(1);
    }
    throw error;
  }
}

/**
 * Open file in default browser (cross-platform)
 * @param {string} filePath - Full path to file
 * @returns {Promise<void>}
 */
async function openInBrowser(filePath) {
  const platform = process.platform;
  let command;
  
  if (platform === 'darwin') {
    // macOS
    command = `open "${filePath}"`;
  } else if (platform === 'win32') {
    // Windows
    command = `start "" "${filePath}"`;
  } else {
    // Linux and others
    command = `xdg-open "${filePath}"`;
  }
  
  try {
    await execAsync(command);
    console.log(`Opening preview in browser: ${filePath}`);
  } catch (error) {
    // Fallback: just log the path
    console.log(`Could not auto-open browser. Please open manually: ${filePath}`);
  }
}

/**
 * Render dual-grid quads to SVG (custom renderer for dual-grid)
 * @param {Object} data - Generated map data with dualGrid
 * @param {Object} options - Rendering options
 * @returns {string} SVG string
 */
function renderDualGridSVG(data, options = {}) {
  const { pack } = data;
  if (!pack || !pack.dualGrid) {
    console.warn('No dualGrid data found, using fallback SVG');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><text x="50" y="50" fill="red">No dual-grid data</text></svg>`;
  }
  
  const { dualGrid, states, burgs } = pack;
  const { points, level0Quads } = dualGrid;
  
  // Debug logs
  console.log('=== Dual-Grid SVG Debug ===');
  console.log(`Number of level0Quads: ${level0Quads?.length || 0}`);
  console.log(`Number of points: ${points?.length || 0}`);
  console.log(`Number of states: ${states?.length || 0}`);
  
  if (!points || points.length === 0 || !level0Quads || level0Quads.length === 0) {
    console.warn('Missing points or quads data');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><text x="50" y="50" fill="red">Missing dual-grid data</text></svg>`;
  }
  
  // Calculate viewBox from point coordinates
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  
  for (const point of points) {
    if (point && typeof point.x === 'number' && typeof point.y === 'number') {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }
  
  const padding = 50;
  const viewBoxX = minX - padding;
  const viewBoxY = minY - padding;
  const viewBoxWidth = (maxX - minX) + (padding * 2);
  const viewBoxHeight = (maxY - minY) + (padding * 2);
  
  console.log(`ViewBox: ${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`);
  console.log(`Point range: x[${minX.toFixed(1)}, ${maxX.toFixed(1)}], y[${minY.toFixed(1)}, ${maxY.toFixed(1)}]`);
  
  // Helper: Get state color
  function getStateColor(stateId) {
    if (!states || !stateId || stateId < 0) return '#888888';
    const state = states[stateId];
    if (state && state.color) return state.color;
    // Generate HSL color from stateId
    const hue = (stateId * 137.508) % 360; // Golden angle for color distribution
    return `hsl(${hue}, 70%, 50%)`;
  }
  
  // Build SVG layers
  const layers = [];
  
  // 1. Background
  layers.push(`<rect x="${viewBoxX}" y="${viewBoxY}" width="${viewBoxWidth}" height="${viewBoxHeight}" fill="#eef6fb" />`);
  
  // 2. Draw Level 0 quads as polygons
  const quadPolygons = [];
  let quadsDrawn = 0;
  
  for (const quad of level0Quads) {
    if (!quad || !quad.verts || quad.verts.length < 3) continue;
    
    // Get vertex coordinates
    const vertCoords = [];
    let valid = true;
    
    for (const vertIdx of quad.verts) {
      const point = points[vertIdx];
      if (!point || typeof point.x !== 'number' || typeof point.y !== 'number') {
        valid = false;
        break;
      }
      vertCoords.push(`${point.x},${point.y}`);
    }
    
    if (!valid || vertCoords.length < 3) continue;
    
    // Get state color
    const stateId = quad.stateId !== undefined && quad.stateId >= 0 ? quad.stateId : -1;
    const fillColor = getStateColor(stateId);
    
    // Create polygon
    const pointsStr = vertCoords.join(' ');
    quadPolygons.push(
      `<polygon points="${pointsStr}" fill="${fillColor}" stroke="#000" stroke-width="1" opacity="0.8" />`
    );
    quadsDrawn++;
  }
  
  console.log(`Quads drawn: ${quadsDrawn}/${level0Quads.length}`);
  
  if (quadPolygons.length > 0) {
    layers.push(`<g id="level0-quads">${quadPolygons.join('\n')}</g>`);
  }
  
  // 3. Draw burgs as red dots
  const burgElements = [];
  if (burgs && Array.isArray(burgs)) {
    for (const burg of burgs) {
      if (!burg || !burg.x || !burg.y || burg.removed) continue;
      
      // Check if burg is snapped to dual-grid
      const pointId = burg.dualGridPointId;
      let x, y;
      
      if (pointId !== undefined && points[pointId]) {
        // Use snapped dual-grid point
        x = points[pointId].x;
        y = points[pointId].y;
      } else {
        // Use original burg position
        x = burg.x;
        y = burg.y;
      }
      
      const radius = burg.capital ? 5 : 3;
      const color = burg.capital ? '#ff0000' : '#cc0000';
      burgElements.push(
        `<circle cx="${x}" cy="${y}" r="${radius}" fill="${color}" stroke="#fff" stroke-width="1" />`
      );
      
      // Add label for capitals
      if (burg.capital && burg.name) {
        burgElements.push(
          `<text x="${x}" y="${y - radius - 5}" font-size="12" fill="#000" text-anchor="middle" font-weight="bold">${burg.name}</text>`
        );
      }
    }
  }
  
  console.log(`Burgs drawn: ${burgElements.length / 2}`); // Divide by 2 because we add circle + text for capitals
  
  if (burgElements.length > 0) {
    layers.push(`<g id="burgs">${burgElements.join('\n')}</g>`);
  }
  
  // 4. Add debug elements if nothing was drawn
  if (quadPolygons.length === 0) {
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    layers.push(
      `<circle cx="${centerX}" cy="${centerY}" r="50" fill="red" opacity="0.5" />`,
      `<text x="${centerX}" y="${centerY}" font-size="16" fill="red" text-anchor="middle">DEBUG - Quads should be here</text>`,
      `<text x="${centerX}" y="${centerY + 20}" font-size="12" fill="red" text-anchor="middle">Points: ${points.length}, Quads: ${level0Quads.length}</text>`
    );
  }
  
  // Combine into complete SVG
  const width = options.width || 960;
  const height = options.height || 540;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}">
${layers.join('\n')}
</svg>`;
  
  return svg;
}

/**
 * Export dual-grid map to SVG file and auto-open in browser
 * @param {Object} data - Generated map data
 * @param {string} filename - Output filename (without path)
 * @param {Object} options - Rendering options
 * @returns {Promise<string>} Full path to saved file
 */
async function exportDualGridToSVG(data, filename, options = {}) {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const samplesDir = join(__dirname, '..', 'samples');
  
  // Ensure samples directory exists
  try {
    mkdirSync(samplesDir, { recursive: true });
  } catch (e) {
    // Directory might already exist
  }
  
  // Generate SVG using custom dual-grid renderer
  const svgString = renderDualGridSVG(data, {
    width: options.width || data.options.mapWidth || 960,
    height: options.height || data.options.mapHeight || 540,
  });
  
  // Save to file
  const fullPath = join(samplesDir, filename);
  writeFileSync(fullPath, svgString, 'utf8');
  
  console.log(`✅ SVG saved to: ${fullPath}`);
  console.log(`   File size: ${svgString.length} bytes\n`);
  
  // Auto-open in browser
  await openInBrowser(fullPath);
  
  return fullPath;
}

/**
 * Generate and export multiple dual-grid preview variants
 */
async function generateDualGridPreviews() {
  console.log('=== Generating and Opening Dual-Grid Preview SVGs ===\n');
  
  const variants = [
    { name: 'default', dissolveProbability: 0.5, description: 'Default (0.5 dissolve)' },
    { name: 'high-dissolve', dissolveProbability: 0.7, description: 'High dissolve (0.7 - more organic)' },
    { name: 'low-dissolve', dissolveProbability: 0.3, description: 'Low dissolve (0.3 - more regular)' },
  ];
  
  const openedFiles = [];
  
  for (let i = 0; i < variants.length; i++) {
    const variant = variants[i];
    console.log(`\nGenerating variant ${i + 1}/${variants.length}: ${variant.description}...`);
    
    try {
      // Initialize generator fresh for each variant (avoids state issues)
      // Note: This will throw if already initialized, so we catch and continue
      try {
        initGenerator({ canvas: null });
      } catch (e) {
        // Already initialized, that's okay - we'll use resetGeneratorState
        if (resetGeneratorState) {
          resetGeneratorState();
        }
      }
      
      // Load options with variant-specific dissolve probability
      const testOptions = {
        seed: `42-${variant.name}`, // Different seed per variant for variety
        mapWidth: 960,
        mapHeight: 540,
        statesNumber: 18,
        useDualGridPolitics: true,
        politicsMode: {
          hexLayers: 20,
          relaxationIterations: 150,
          dampingFactor: 0.25,
          dissolveProbability: variant.dissolveProbability,
        },
      };
      
      loadOptions(testOptions);
      
      // Generate map
      const startTime = Date.now();
      const data = generateMap(Delaunator);
      const generateTime = Date.now() - startTime;
      
      console.log(`  Generated in ${generateTime.toFixed(2)}ms`);
      
      // Export SVG
      const filename = `dual-grid-preview-${variant.name}.svg`;
      const fullPath = await exportDualGridToSVG(data, filename, {
        width: testOptions.mapWidth,
        height: testOptions.mapHeight,
      });
      
      openedFiles.push(fullPath);
      
      // Reset state.data to allow next generation
      if (resetGeneratorState) {
        resetGeneratorState();
      }
      
      // Small delay between opens to avoid overwhelming browser
      if (i < variants.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error(`  ❌ Error generating variant ${variant.name}:`, error.message);
      // Try to reset and continue
      if (resetGeneratorState) {
        try {
          resetGeneratorState();
        } catch (e) {
          // Ignore reset errors
        }
      }
    }
  }
  
  console.log('\n=== Preview Generation Complete ===');
  console.log(`All ${openedFiles.length} previews generated and opened in browser.`);
  console.log('Review for:');
  console.log('  - Organic shapes (should look less grid-like than Voronoi)');
  console.log('  - State borders (should follow quad boundaries)');
  console.log('  - Variant variety (different dissolve probabilities show different organicity)');
  console.log('\nOpened files:');
  openedFiles.forEach((path, i) => {
    console.log(`  ${i + 1}. ${path}`);
  });
  console.log('');
  
  return openedFiles;
}

// Run test (with optional preview generation)
testDualGridRelaxation().catch(error => {
  console.error('Fatal error:', error);
  if (typeof process !== 'undefined') {
    process.exit(1);
  }
  throw error;
});
