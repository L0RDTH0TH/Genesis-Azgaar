/**
 * Generate baseline sample maps for the dual-grid experiment branch
 * This script generates full maps to establish baseline for comparison
 */

import Delaunator from 'delaunator';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initGenerator, loadOptions, generateMap, getMapData, renderPreviewSVG } from '../src/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const samplesDir = join(__dirname, '..', 'samples');

async function generateBaselineSamples() {
  console.log('=== Generating Baseline Samples ===\n');

  // Initialize generator (headless mode)
  initGenerator({ canvas: null });

  // Generate full map with default options
  console.log('1. Generating full map with default options...');
  loadOptions({
    seed: 'baseline-full-2026-01-12',
    mapWidth: 960,
    mapHeight: 540,
    points: 4, // Maps to 10000 cells
    statesNumber: 18,
    cultures: 12,
  });

  const fullStartTime = Date.now();
  const fullData = generateMap(Delaunator);
  const fullGenerateTime = Date.now() - fullStartTime;
  console.log(`   Generated in ${fullGenerateTime}ms (seed: ${fullData.seed})`);

  const fullJson = getMapData();
  const fullJsonPath = join(samplesDir, 'baseline-full.json');
  writeFileSync(fullJsonPath, JSON.stringify(fullJson, null, 2));
  console.log(`   Saved to: ${fullJsonPath}`);
  console.log(`   Grid cells: ${fullData.grid.cells.i.length}`);
  console.log(`   Pack cells: ${fullData.pack.cells.i.length}`);
  console.log(`   States: ${fullData.pack.states?.length || 0}`);
  console.log(`   Provinces: ${fullData.pack.provinces?.length || 0}`);
  console.log(`   Burgs: ${fullData.pack.burgs?.length || 0}\n`);

  // Generate second map with same seed for politics baseline
  // Note: generatePartial doesn't exist yet, so we generate a full map
  // but focus on the politics data (states, provinces)
  console.log('2. Generating second full map (for politics comparison)...');
  loadOptions({
    seed: 'baseline-politics-2026-01-12',
    mapWidth: 960,
    mapHeight: 540,
    points: 4, // Maps to 10000 cells
    statesNumber: 18,
    cultures: 12,
  });

  const politicsStartTime = Date.now();
  const politicsData = generateMap(Delaunator);
  const politicsGenerateTime = Date.now() - politicsStartTime;
  console.log(`   Generated in ${politicsGenerateTime}ms (seed: ${politicsData.seed})`);

  const politicsJson = getMapData();
  const politicsJsonPath = join(samplesDir, 'baseline-partial-politics.json');
  
  // Extract just the politics-relevant data structure for comparison
  const politicsOnlyJson = {
    seed: politicsJson.seed,
    pack: {
      states: politicsJson.pack.states,
      provinces: politicsJson.pack.provinces,
      burgs: politicsJson.pack.burgs,
      cells: {
        state: politicsJson.pack.cells?.state || [],
        province: politicsJson.pack.cells?.province || [],
      },
    },
  };

  writeFileSync(politicsJsonPath, JSON.stringify(politicsOnlyJson, null, 2));
  console.log(`   Saved to: ${politicsJsonPath}`);
  console.log(`   States: ${politicsData.pack.states?.length || 0}`);
  console.log(`   Provinces: ${politicsData.pack.provinces?.length || 0}`);
  console.log(`   Burgs: ${politicsData.pack.burgs?.length || 0}\n`);

  // Test SVG rendering (headless, just verify it doesn't crash)
  console.log('3. Testing SVG rendering...');
  try {
    const svgString = renderPreviewSVG({ width: 960, height: 540 });
    if (svgString && svgString.includes('<svg')) {
      console.log('   SVG rendering successful (length: ' + svgString.length + ' chars)');
    } else {
      console.log('   SVG rendering returned invalid output');
    }
  } catch (error) {
    console.log('   SVG rendering failed (pre-existing issue):', error.message);
    console.log('   Note: This is a known rendering issue, not blocking for baseline setup');
  }

  console.log('\n=== Baseline Samples Generated Successfully ===');
  console.log(`\nFiles created:`);
  console.log(`  - ${fullJsonPath}`);
  console.log(`  - ${politicsJsonPath}`);
}

generateBaselineSamples().catch((error) => {
  console.error('Error generating baseline samples:', error);
  process.exit(1);
});
