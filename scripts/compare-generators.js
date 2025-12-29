/**
 * =============================================================================
 * compare-generators.js
 * Desc: Validation script to compare original and refactored generator outputs
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

/**
 * Compare two map generation outputs and generate a diff report
 * @param {Object} originalOutput - Output from original generator
 * @param {Object} refactoredOutput - Output from refactored generator
 * @param {string} seed - Seed used for generation
 * @returns {Object} Comparison report with metrics and differences
 */
function compareMapOutputs(originalOutput, refactoredOutput, seed) {
  const report = {
    seed,
    timestamp: new Date().toISOString(),
    metrics: {},
    differences: [],
    warnings: [],
    passed: true,
  };

  // Compare cell counts
  const originalCellCount = originalOutput?.pack?.cells?.length || 0;
  const refactoredCellCount = refactoredOutput?.pack?.cells?.length || 0;
  report.metrics.cellCount = {
    original: originalCellCount,
    refactored: refactoredCellCount,
    match: originalCellCount === refactoredCellCount,
  };
  if (originalCellCount !== refactoredCellCount) {
    report.differences.push(
      `Cell count mismatch: original=${originalCellCount}, refactored=${refactoredCellCount}`
    );
    report.passed = false;
  }

  // Compare height distribution
  if (originalOutput?.pack?.cells?.h && refactoredOutput?.pack?.cells?.h) {
    const originalHeights = originalOutput.pack.cells.h;
    const refactoredHeights = refactoredOutput.pack.cells.h;
    const heightStats = compareArrays(originalHeights, refactoredHeights, 'height');
    report.metrics.heightDistribution = heightStats;
    if (!heightStats.match) {
      report.differences.push(`Height distribution mismatch: ${heightStats.diffSummary}`);
      report.passed = false;
    }
  }

  // Compare river count
  const originalRivers = originalOutput?.pack?.rivers?.length || 0;
  const refactoredRivers = refactoredOutput?.pack?.rivers?.length || 0;
  report.metrics.riverCount = {
    original: originalRivers,
    refactored: refactoredRivers,
    match: originalRivers === refactoredRivers,
  };
  if (originalRivers !== refactoredRivers) {
    report.differences.push(
      `River count mismatch: original=${originalRivers}, refactored=${refactoredRivers}`
    );
    report.passed = false;
  }

  // Compare biome distribution
  if (originalOutput?.pack?.cells?.biome && refactoredOutput?.pack?.cells?.biome) {
    const biomeStats = compareBiomeDistribution(
      originalOutput.pack.cells.biome,
      refactoredOutput.pack.cells.biome
    );
    report.metrics.biomeDistribution = biomeStats;
    if (!biomeStats.match) {
      report.warnings.push(`Biome distribution differences: ${biomeStats.diffSummary}`);
      // Biome differences are warnings, not failures (may be acceptable)
    }
  }

  // Compare burg count
  const originalBurgs = originalOutput?.pack?.burgs?.length || 0;
  const refactoredBurgs = refactoredOutput?.pack?.burgs?.length || 0;
  report.metrics.burgCount = {
    original: originalBurgs,
    refactored: refactoredBurgs,
    match: originalBurgs === refactoredBurgs,
  };
  if (originalBurgs !== refactoredBurgs) {
    report.differences.push(
      `Burg count mismatch: original=${originalBurgs}, refactored=${refactoredBurgs}`
    );
    report.passed = false;
  }

  // Compare state count
  const originalStates = originalOutput?.pack?.states?.length || 0;
  const refactoredStates = refactoredOutput?.pack?.states?.length || 0;
  report.metrics.stateCount = {
    original: originalStates,
    refactored: refactoredStates,
    match: originalStates === refactoredStates,
  };
  if (originalStates !== refactoredStates) {
    report.differences.push(
      `State count mismatch: original=${originalStates}, refactored=${refactoredStates}`
    );
    report.passed = false;
  }

  return report;
}

/**
 * Compare two arrays and return statistics
 * @param {Array|TypedArray} arr1 - First array
 * @param {Array|TypedArray} arr2 - Second array
 * @param {string} name - Name for reporting
 * @returns {Object} Comparison statistics
 */
function compareArrays(arr1, arr2, name) {
  if (arr1.length !== arr2.length) {
    return {
      match: false,
      diffSummary: `Length mismatch: ${arr1.length} vs ${arr2.length}`,
    };
  }

  let differences = 0;
  let maxDiff = 0;
  let sumDiff = 0;

  for (let i = 0; i < arr1.length; i++) {
    const diff = Math.abs(arr1[i] - arr2[i]);
    if (diff > 0.001) {
      // Floating point tolerance
      differences++;
      sumDiff += diff;
      maxDiff = Math.max(maxDiff, diff);
    }
  }

  const match = differences === 0;
  return {
    match,
    length: arr1.length,
    differences,
    maxDifference: maxDiff,
    averageDifference: differences > 0 ? sumDiff / differences : 0,
    diffSummary: match
      ? 'Perfect match'
      : `${differences} differences (max: ${maxDiff.toFixed(4)}, avg: ${(sumDiff / differences).toFixed(4)})`,
  };
}

/**
 * Compare biome distribution between two outputs
 * @param {Array|TypedArray} biomes1 - First biome array
 * @param {Array|TypedArray} biomes2 - Second biome array
 * @returns {Object} Biome comparison statistics
 */
function compareBiomeDistribution(biomes1, biomes2) {
  if (biomes1.length !== biomes2.length) {
    return {
      match: false,
      diffSummary: `Length mismatch: ${biomes1.length} vs ${biomes2.length}`,
    };
  }

  // Count biome occurrences
  const count1 = {};
  const count2 = {};
  let mismatches = 0;

  for (let i = 0; i < biomes1.length; i++) {
    const b1 = biomes1[i];
    const b2 = biomes2[i];
    count1[b1] = (count1[b1] || 0) + 1;
    count2[b2] = (count2[b2] || 0) + 1;
    if (b1 !== b2) mismatches++;
  }

  // Compare distributions
  const allBiomes = new Set([...Object.keys(count1), ...Object.keys(count2)]);
  const distributionDiff = {};

  for (const biome of allBiomes) {
    const c1 = count1[biome] || 0;
    const c2 = count2[biome] || 0;
    if (c1 !== c2) {
      distributionDiff[biome] = { original: c1, refactored: c2, diff: c2 - c1 };
    }
  }

  const match = mismatches === 0 && Object.keys(distributionDiff).length === 0;
  return {
    match,
    mismatches,
    distributionDifferences: distributionDiff,
    diffSummary: match
      ? 'Perfect match'
      : `${mismatches} cell mismatches, ${Object.keys(distributionDiff).length} biome distribution differences`,
  };
}

/**
 * Generate a formatted report string
 * @param {Object} report - Comparison report
 * @returns {string} Formatted report
 */
function formatReport(report) {
  let output = '\n' + '='.repeat(80) + '\n';
  output += `COMPARISON REPORT - Seed: ${report.seed}\n`;
  output += `Timestamp: ${report.timestamp}\n`;
  output += '='.repeat(80) + '\n\n';

  output += 'METRICS:\n';
  output += '-'.repeat(80) + '\n';
  for (const [key, value] of Object.entries(report.metrics)) {
    if (typeof value === 'object' && value.match !== undefined) {
      output += `  ${key}: ${value.match ? '✓' : '✗'} `;
      if (value.original !== undefined && value.refactored !== undefined) {
        output += `(original: ${value.original}, refactored: ${value.refactored})`;
      }
      output += '\n';
    } else {
      output += `  ${key}: ${JSON.stringify(value, null, 2)}\n`;
    }
  }
  output += '\n';

  if (report.differences.length > 0) {
    output += 'DIFFERENCES (FAILURES):\n';
    output += '-'.repeat(80) + '\n';
    report.differences.forEach((diff) => {
      output += `  ✗ ${diff}\n`;
    });
    output += '\n';
  }

  if (report.warnings.length > 0) {
    output += 'WARNINGS:\n';
    output += '-'.repeat(80) + '\n';
    report.warnings.forEach((warning) => {
      output += `  ⚠ ${warning}\n`;
    });
    output += '\n';
  }

  output += '='.repeat(80) + '\n';
  output += `OVERALL: ${report.passed ? '✓ PASSED' : '✗ FAILED'}\n`;
  output += '='.repeat(80) + '\n\n';

  return output;
}

/**
 * Main comparison function
 * This will be called once we have both generators working
 * For now, it's a placeholder that documents the expected interface
 */
async function runComparison(seed = '12345') {
  console.log('Comparison utility initialized.');
  console.log('This script will compare original and refactored generator outputs.');
  console.log('Once Phase 2.10 is complete, this will run both generators and compare results.\n');

  // TODO: Once generators are implemented:
  // 1. Load and run original generator with seed
  // 2. Load and run refactored generator with seed
  // 3. Compare outputs using compareMapOutputs()
  // 4. Generate and save report

  const report = {
    seed,
    timestamp: new Date().toISOString(),
    metrics: {},
    differences: [],
    warnings: [],
    passed: true,
    status: 'placeholder',
    message: 'Comparison will be implemented once both generators are available',
  };

  console.log('\n' + '='.repeat(80) + '\n');
  console.log(`COMPARISON UTILITY - Seed: ${report.seed}`);
  console.log(`Timestamp: ${report.timestamp}\n`);
  console.log('STATUS: Placeholder');
  console.log('MESSAGE: Comparison will be implemented once both generators are available');
  console.log('='.repeat(80) + '\n');
  return report;
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const seed = process.argv[2] || '12345';
  runComparison(seed).catch((error) => {
    console.error('Comparison failed:', error);
    process.exit(1);
  });
}

export { compareMapOutputs, formatReport, runComparison };
