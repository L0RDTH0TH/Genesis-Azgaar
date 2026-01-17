/**
 * =============================================================================
 * partial-gen.test.js
 * Desc: Test script for partial generation functionality
 * Author: Lordthoth
 * =============================================================================
 */

import { initGenerator, loadOptions, generateMap, generatePartial, getMapData, resetGeneratorState } from '../src/generator.js';
import { PHASES } from '../src/utils/constants.js';
import Delaunator from 'delaunator';

/**
 * Simple performance timer
 */
function timeFunction(fn, label) {
  const start = performance.now();
  const result = fn();
  const end = performance.now();
  const duration = end - start;
  console.log(`[${label}] Duration: ${duration.toFixed(2)}ms`);
  return { result, duration };
}

/**
 * Compare two data objects (shallow comparison of key fields)
 */
function compareData(data1, data2, label) {
  const differences = [];
  
  // Compare grid heights
  if (data1.grid?.cells?.h && data2.grid?.cells?.h) {
    const h1 = Array.from(data1.grid.cells.h);
    const h2 = Array.from(data2.grid.cells.h);
    if (h1.length !== h2.length) {
      differences.push(`${label}: grid.cells.h length mismatch (${h1.length} vs ${h2.length})`);
    } else {
      const diff = h1.filter((v, i) => v !== h2[i]).length;
      if (diff > 0) {
        differences.push(`${label}: grid.cells.h has ${diff} different values`);
      }
    }
  }
  
  // Compare pack states
  if (data1.pack?.states && data2.pack?.states) {
    const s1 = data1.pack.states.length;
    const s2 = data2.pack.states.length;
    if (s1 !== s2) {
      differences.push(`${label}: pack.states count mismatch (${s1} vs ${s2})`);
    }
  }
  
  // Compare pack burgs
  if (data1.pack?.burgs && data2.pack?.burgs) {
    const b1 = data1.pack.burgs.length;
    const b2 = data2.pack.burgs.length;
    if (b1 !== b2) {
      differences.push(`${label}: pack.burgs count mismatch (${b1} vs ${b2})`);
    }
  }
  
  return differences;
}

/**
 * Main test function
 */
async function runTests() {
  console.log('=== Partial Generation Test Suite ===\n');
  
  const testSeed = '42';
  const testOptions = {
    seed: testSeed,
    mapWidth: 800,
    mapHeight: 600,
    cellsDesired: 5000,
    skipPhases: [], // No skips for full generation
  };
  
  try {
    // Initialize generator
    initGenerator({ canvas: null, container: null });
    loadOptions(testOptions);
    
    // Test 1: Full generation
    console.log('Test 1: Full generation (all phases)');
    const fullResult = timeFunction(() => {
      return generateMap(Delaunator);
    }, 'Full Generation');
    
    const fullData = getMapData();
    console.log(`  - Grid cells: ${fullData.grid.cells.i.length}`);
    console.log(`  - Pack cells: ${fullData.pack.cells.i.length}`);
    console.log(`  - States: ${fullData.pack.states?.length || 0}`);
    console.log(`  - Burgs: ${fullData.pack.burgs?.length || 0}`);
    console.log(`  - Rivers: ${fullData.pack.rivers?.length || 0}\n`);
    
    // Test 2: Partial generation (skip heightmap and biomes, use fallbacks)
    console.log('Test 2: Partial generation (skip heightmap, biomes)');
    resetGeneratorState(); // Reset instead of re-initializing
    loadOptions({ ...testOptions, skipPhases: [PHASES.HEIGHTMAP, PHASES.BIOMES] });
    
    const partialResult = timeFunction(() => {
      return generateMap(Delaunator);
    }, 'Partial Generation (skip heightmap, biomes)');
    
    const partialData = getMapData();
    console.log(`  - Grid cells: ${partialData.grid.cells.i.length}`);
    console.log(`  - Pack cells: ${partialData.pack.cells.i.length}`);
    console.log(`  - States: ${partialData.pack.states?.length || 0}`);
    console.log(`  - Burgs: ${partialData.pack.burgs?.length || 0}\n`);
    
    // Test 3: generatePartial API (only run states and provinces)
    console.log('Test 3: generatePartial API (only states, provinces)');
    resetGeneratorState();
    loadOptions(testOptions);
    
    // First generate base phases needed for states
    generatePartial([
      PHASES.VORONOI,
      PHASES.HEIGHTMAP,
      PHASES.PACK_CREATION,
      PHASES.BURGS,
    ], Delaunator);
    
    const partialOnlyResult = timeFunction(() => {
      return generatePartial([
        PHASES.STATES,
        PHASES.PROVINCES,
      ], Delaunator);
    }, 'Partial Only (states, provinces)');
    
    const partialOnlyData = getMapData();
    console.log(`  - States: ${partialOnlyData.pack.states?.length || 0}`);
    console.log(`  - Provinces: ${partialOnlyData.pack.provinces?.length || 0}\n`);
    
    // Test 4: Data comparison
    console.log('Test 4: Data comparison (full vs partial with fallbacks)');
    const differences = compareData(fullData, partialData, 'Full vs Partial');
    if (differences.length === 0) {
      console.log('  ✓ No differences detected (expected - fallbacks used)');
    } else {
      console.log('  Differences found:');
      differences.forEach(d => console.log(`    - ${d}`));
    }
    console.log();
    
    // Test 5: Performance comparison
    console.log('Test 5: Performance comparison');
    const fullTime = fullResult.duration;
    const partialTime = partialResult.duration;
    const speedup = ((fullTime - partialTime) / fullTime * 100).toFixed(1);
    console.log(`  - Full generation: ${fullTime.toFixed(2)}ms`);
    console.log(`  - Partial (skip 2 phases): ${partialTime.toFixed(2)}ms`);
    console.log(`  - Speedup: ${speedup}%\n`);
    
    // Test 6: Cache verification
    console.log('Test 6: Cache verification');
    resetGeneratorState();
    loadOptions(testOptions);
    
    // Generate first time
    const cacheTest1 = timeFunction(() => {
      return generateMap(Delaunator);
    }, 'First generation (cache miss)');
    
    // Reset data but keep cache, then regenerate (should use cache)
    resetGeneratorState(); // This clears data but keeps cache
    loadOptions(testOptions);
    
    const cacheTest2 = timeFunction(() => {
      return generateMap(Delaunator);
    }, 'Second generation (cache hit)');
    
    const cacheSpeedup = ((cacheTest1.duration - cacheTest2.duration) / cacheTest1.duration * 100).toFixed(1);
    console.log(`  - Cache speedup: ${cacheSpeedup}%\n`);
    
    console.log('=== All Tests Complete ===');
    
  } catch (error) {
    console.error('Test failed:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error);
}

export { runTests };
