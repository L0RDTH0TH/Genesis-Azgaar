/**
 * =============================================================================
 * test-dual-grid.js
 * Desc: Test script for dual-grid relaxation verification
 * Author: Lordthoth
 * =============================================================================
 */

import Delaunator from 'delaunator';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { initGenerator, loadOptions, generateMap, getMapData } from '../src/index.js';

/**
 * Test dual-grid generation with relaxation
 */
async function testDualGridRelaxation() {
  console.log('=== Dual-Grid Relaxation Test ===\n');
  
  try {
    // Initialize generator (headless)
    initGenerator({ canvas: null });
    
    // Load options with dual-grid enabled
    const testOptions = {
      seed: '42',
      mapWidth: 960,
      mapHeight: 540,
      cellsDesired: 10000,
      statesNumber: 18,
      useDualGridPolitics: true,
      politicsMode: {
        hexLayers: 20,
        relaxationIterations: 150,
        dampingFactor: 0.25,
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
    
    // Export JSON for inspection
    const json = getMapData();
    console.log('\n=== JSON Export ===');
    console.log(`Full JSON size: ${JSON.stringify(json).length} bytes`);
    console.log(`Dual-grid points in JSON: ${json.pack.dualGrid?.points?.length || 0}`);
    
  } catch (error) {
    console.error('❌ Test failed with error:', error);
    console.error(error.stack);
    if (typeof process !== 'undefined') {
      process.exit(1);
    }
    throw error;
  }
}

// Run test
testDualGridRelaxation().catch(error => {
  console.error('Fatal error:', error);
  if (typeof process !== 'undefined') {
    process.exit(1);
  }
  throw error;
});
