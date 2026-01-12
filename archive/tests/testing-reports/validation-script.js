/**
 * Final Validation Script
 * Generates maps and compares outputs for validation
 */

import { 
  initGenerator, 
  loadOptions, 
  generateMap, 
  getMapData, 
  renderToSVG 
} from '../dist/azgaar-genesis.esm.js';
import Delaunator from 'delaunator';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize generator
initGenerator();

// Test configurations
const testConfigs = [
  {
    name: 'Continents_Seed42',
    options: {
      seed: '42',
      template: 'Continents',
      statesNumber: 18,
      landPercentage: 40,
      showLabels: true,
      showRelief: true,
      fullRendering: true,
      width: 1000,
      height: 600,
      colorScheme: 'bright'
    }
  },
  {
    name: 'Archipelago_Seed42',
    options: {
      seed: '42',
      template: 'Archipelago',
      statesNumber: 18,
      landPercentage: 40,
      showLabels: true,
      showRelief: true,
      fullRendering: true,
      width: 1000,
      height: 600,
      colorScheme: 'bright'
    }
  },
  {
    name: 'Pangea_Seed42',
    options: {
      seed: '42',
      template: 'Pangea',
      statesNumber: 18,
      landPercentage: 40,
      showLabels: true,
      showRelief: true,
      fullRendering: true,
      width: 1000,
      height: 600,
      colorScheme: 'bright'
    }
  },
  {
    name: 'Shattered_Seed42',
    options: {
      seed: '42',
      template: 'Shattered',
      statesNumber: 18,
      landPercentage: 40,
      showLabels: true,
      showRelief: true,
      fullRendering: true,
      width: 1000,
      height: 600,
      colorScheme: 'bright'
    }
  },
  {
    name: 'Continents_Seed100',
    options: {
      seed: '100',
      template: 'Continents',
      statesNumber: 18,
      landPercentage: 40,
      showLabels: true,
      showRelief: true,
      fullRendering: true,
      width: 1000,
      height: 600,
      colorScheme: 'bright'
    }
  }
];

// Output directory
const outputDir = path.join(__dirname, 'validation-outputs');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Results storage
const results = [];

async function runValidation() {
  console.log('Starting Final Validation Tests...\n');
  console.log(`Testing ${testConfigs.length} configurations...\n`);

  for (const config of testConfigs) {
    console.log(`\n=== Testing: ${config.name} ===`);
    
    try {
      // Load options
      loadOptions(config.options);
      
      // Generate map
      console.log('Generating map...');
      const startTime = Date.now();
      await generateMap(Delaunator);
      const generationTime = Date.now() - startTime;
      
      // Get map data
      const data = getMapData();
      
      // Render SVG
      console.log('Rendering SVG...');
      const svgStartTime = Date.now();
      const svgString = renderToSVG({ width: 1000, height: 600 });
      const renderTime = Date.now() - svgStartTime;
      
      // Calculate metrics
      const metrics = calculateMetrics(data);
      
      // Analyze SVG
      const svgAnalysis = analyzeSVG(svgString);
      
      // Save outputs
      const basePath = path.join(outputDir, config.name);
      fs.writeFileSync(`${basePath}.json`, JSON.stringify(data, null, 2));
      fs.writeFileSync(`${basePath}.svg`, svgString);
      
      // Store results
      const result = {
        name: config.name,
        options: config.options,
        metrics,
        svgAnalysis,
        generationTime,
        renderTime,
        success: true
      };
      
      results.push(result);
      
      console.log('✓ Generation:', generationTime, 'ms');
      console.log('✓ Render:', renderTime, 'ms');
      console.log('✓ Metrics:', JSON.stringify(metrics, null, 2));
      console.log('✓ SVG Analysis:', JSON.stringify(svgAnalysis, null, 2));
      
    } catch (error) {
      console.error('✗ Error:', error.message);
      results.push({
        name: config.name,
        success: false,
        error: error.message
      });
    }
  }
  
  // Generate report
  console.log('\n\n=== Generating Validation Report ===');
  generateReport(results);
  
  console.log('\n✓ Validation complete!');
  console.log(`Results saved to: ${outputDir}`);
}

function calculateMetrics(data) {
  const pack = data.pack;
  const cells = pack.cells;
  const states = pack.states || [];
  const burgs = pack.burgs || [];
  const rivers = pack.rivers || [];
  
  // Count land cells
  const landCells = cells.h ? cells.h.filter(h => h >= 20).length : 0;
  const totalCells = cells.i ? cells.i.length : 0;
  const landPercentage = totalCells > 0 ? (landCells / totalCells * 100).toFixed(2) : 0;
  
  // Count states (excluding neutral)
  const activeStates = states.filter(s => s && !s.removed && s.i !== 0).length;
  
  // Count burgs
  const activeBurgs = burgs.filter(b => b && !b.removed).length;
  
  // Count rivers
  const riverCount = rivers ? rivers.length : 0;
  
  // Count biomes
  const uniqueBiomes = new Set();
  if (cells.biome) {
    for (let i = 0; i < cells.biome.length; i++) {
      if (cells.biome[i] !== undefined) {
        uniqueBiomes.add(cells.biome[i]);
      }
    }
  }
  
  return {
    totalCells,
    landCells,
    landPercentage: parseFloat(landPercentage),
    activeStates,
    activeBurgs,
    riverCount,
    uniqueBiomes: uniqueBiomes.size
  };
}

function analyzeSVG(svgString) {
  // Parse SVG (simplified - using regex for basic analysis)
  const pathMatches = svgString.match(/<path[^>]*>/g) || [];
  const borderMatches = svgString.match(/<path[^>]*stroke[^>]*>/g) || [];
  const textPathMatches = svgString.match(/<textPath[^>]*>/g) || [];
  const tspanMatches = svgString.match(/<tspan[^>]*>/g) || [];
  const gradientMatches = svgString.match(/<linearGradient[^>]*>/g) || [];
  const circleMatches = svgString.match(/<circle[^>]*>/g) || [];
  const polygonMatches = svgString.match(/<polygon[^>]*>/g) || [];
  
  // Count unique fill colors
  const fillMatches = svgString.match(/fill="([^"]+)"/g) || [];
  const uniqueFills = new Set();
  fillMatches.forEach(match => {
    const fill = match.match(/fill="([^"]+)"/)[1];
    if (fill && fill !== 'none' && !fill.startsWith('url(')) {
      uniqueFills.add(fill);
    }
  });
  
  // Count border paths (paths with stroke but no fill, or fill="none")
  const borderPaths = borderMatches.filter(match => {
    const hasFill = match.includes('fill=');
    const fillNone = match.includes('fill="none"');
    return !hasFill || fillNone;
  }).length;
  
  // Count multi-line labels (textPath with multiple tspan)
  const textPathSections = svgString.split(/<textPath[^>]*>/);
  let multiLineLabels = 0;
  textPathSections.forEach((section, index) => {
    if (index > 0) {
      const tspanCount = (section.match(/<tspan[^>]*>/g) || []).length;
      if (tspanCount > 1) {
        multiLineLabels++;
      }
    }
  });
  
  return {
    totalPaths: pathMatches.length,
    borderPaths: borderPaths,
    textPaths: textPathMatches.length,
    multiLineLabels: multiLineLabels,
    tspanElements: tspanMatches.length,
    gradients: gradientMatches.length,
    circles: circleMatches.length,
    polygons: polygonMatches.length,
    uniqueColors: uniqueFills.size
  };
}

function generateReport(results) {
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    },
    results: results.map(r => ({
      name: r.name,
      success: r.success,
      metrics: r.metrics || null,
      svgAnalysis: r.svgAnalysis || null,
      generationTime: r.generationTime || null,
      renderTime: r.renderTime || null,
      error: r.error || null
    })),
    validation: {
      borderCoverage: validateBorders(results),
      labelQuality: validateLabels(results),
      colorComplexity: validateColors(results),
      performance: validatePerformance(results)
    }
  };
  
  // Save report
  const reportPath = path.join(__dirname, 'final_validation_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  
  // Generate markdown report
  generateMarkdownReport(report);
}

function validateBorders(results) {
  const successful = results.filter(r => r.success && r.svgAnalysis);
  if (successful.length === 0) return { status: 'unknown', message: 'No successful results' };
  
  // Check that borders are present (should be > 0 for all maps)
  const allHaveBorders = successful.every(r => r.svgAnalysis.borderPaths > 0);
  const avgBorders = successful.reduce((sum, r) => sum + r.svgAnalysis.borderPaths, 0) / successful.length;
  
  return {
    status: allHaveBorders ? 'pass' : 'fail',
    message: allHaveBorders 
      ? `All maps have borders (avg: ${avgBorders.toFixed(1)})`
      : 'Some maps missing borders',
    averageBorders: avgBorders.toFixed(1),
    allHaveBorders
  };
}

function validateLabels(results) {
  const successful = results.filter(r => r.success && r.svgAnalysis);
  if (successful.length === 0) return { status: 'unknown', message: 'No successful results' };
  
  // Check for multi-line labels
  const hasMultiLine = successful.some(r => r.svgAnalysis.multiLineLabels > 0);
  const avgMultiLine = successful.reduce((sum, r) => sum + r.svgAnalysis.multiLineLabels, 0) / successful.length;
  const avgTextPaths = successful.reduce((sum, r) => sum + r.svgAnalysis.textPaths, 0) / successful.length;
  
  return {
    status: avgTextPaths > 0 ? 'pass' : 'fail',
    message: `Labels present (avg: ${avgTextPaths.toFixed(1)}), Multi-line: ${avgMultiLine.toFixed(1)}`,
    averageTextPaths: avgTextPaths.toFixed(1),
    averageMultiLine: avgMultiLine.toFixed(1),
    hasMultiLine
  };
}

function validateColors(results) {
  const successful = results.filter(r => r.success && r.svgAnalysis);
  if (successful.length === 0) return { status: 'unknown', message: 'No successful results' };
  
  // Check color complexity (should be high with advanced blending)
  const avgColors = successful.reduce((sum, r) => sum + r.svgAnalysis.uniqueColors, 0) / successful.length;
  const hasGradients = successful.some(r => r.svgAnalysis.gradients > 0);
  
  return {
    status: avgColors > 50 ? 'pass' : 'warning',
    message: `Color complexity: ${avgColors.toFixed(1)} unique colors, Gradients: ${hasGradients ? 'Yes' : 'No'}`,
    averageColors: avgColors.toFixed(1),
    hasGradients
  };
}

function validatePerformance(results) {
  const successful = results.filter(r => r.success && r.generationTime && r.renderTime);
  if (successful.length === 0) return { status: 'unknown', message: 'No successful results' };
  
  const avgGenTime = successful.reduce((sum, r) => sum + r.generationTime, 0) / successful.length;
  const avgRenderTime = successful.reduce((sum, r) => sum + r.renderTime, 0) / successful.length;
  
  return {
    status: avgGenTime < 5000 && avgRenderTime < 1000 ? 'pass' : 'warning',
    message: `Generation: ${avgGenTime.toFixed(0)}ms, Render: ${avgRenderTime.toFixed(0)}ms`,
    averageGenerationTime: avgGenTime.toFixed(0),
    averageRenderTime: avgRenderTime.toFixed(0)
  };
}

function generateMarkdownReport(report) {
  const mdPath = path.join(__dirname, 'final_validation_report.md');
  
  let md = `# Final Validation Report\n\n`;
  md += `**Generated:** ${report.timestamp}\n`;
  md += `**Status:** ${report.summary.successful}/${report.summary.total} tests passed\n\n`;
  
  md += `## Summary\n\n`;
  md += `- **Total Tests:** ${report.summary.total}\n`;
  md += `- **Successful:** ${report.summary.successful}\n`;
  md += `- **Failed:** ${report.summary.failed}\n\n`;
  
  md += `## Validation Results\n\n`;
  
  // Border validation
  md += `### Border Coverage\n`;
  md += `- **Status:** ${report.validation.borderCoverage.status}\n`;
  md += `- **Message:** ${report.validation.borderCoverage.message}\n`;
  md += `- **Average Borders:** ${report.validation.borderCoverage.averageBorders}\n\n`;
  
  // Label validation
  md += `### Label Quality\n`;
  md += `- **Status:** ${report.validation.labelQuality.status}\n`;
  md += `- **Message:** ${report.validation.labelQuality.message}\n`;
  md += `- **Average Text Paths:** ${report.validation.labelQuality.averageTextPaths}\n`;
  md += `- **Average Multi-Line:** ${report.validation.labelQuality.averageMultiLine}\n\n`;
  
  // Color validation
  md += `### Color Complexity\n`;
  md += `- **Status:** ${report.validation.colorComplexity.status}\n`;
  md += `- **Message:** ${report.validation.colorComplexity.message}\n`;
  md += `- **Average Unique Colors:** ${report.validation.colorComplexity.averageColors}\n\n`;
  
  // Performance validation
  md += `### Performance\n`;
  md += `- **Status:** ${report.validation.performance.status}\n`;
  md += `- **Message:** ${report.validation.performance.message}\n`;
  md += `- **Average Generation Time:** ${report.validation.performance.averageGenerationTime}ms\n`;
  md += `- **Average Render Time:** ${report.validation.performance.averageRenderTime}ms\n\n`;
  
  md += `## Detailed Results\n\n`;
  
  report.results.forEach(result => {
    md += `### ${result.name}\n\n`;
    if (!result.success) {
      md += `**Status:** ❌ Failed\n`;
      md += `**Error:** ${result.error}\n\n`;
    } else {
      md += `**Status:** ✅ Success\n\n`;
      md += `**Metrics:**\n`;
      md += `- Total Cells: ${result.metrics.totalCells}\n`;
      md += `- Land Cells: ${result.metrics.landCells}\n`;
      md += `- Land %: ${result.metrics.landPercentage}%\n`;
      md += `- States: ${result.metrics.activeStates}\n`;
      md += `- Burgs: ${result.metrics.activeBurgs}\n`;
      md += `- Rivers: ${result.metrics.riverCount}\n`;
      md += `- Biomes: ${result.metrics.uniqueBiomes}\n\n`;
      
      md += `**SVG Analysis:**\n`;
      md += `- Total Paths: ${result.svgAnalysis.totalPaths}\n`;
      md += `- Border Paths: ${result.svgAnalysis.borderPaths}\n`;
      md += `- Text Paths: ${result.svgAnalysis.textPaths}\n`;
      md += `- Multi-Line Labels: ${result.svgAnalysis.multiLineLabels}\n`;
      md += `- Tspan Elements: ${result.svgAnalysis.tspanElements}\n`;
      md += `- Gradients: ${result.svgAnalysis.gradients}\n`;
      md += `- Unique Colors: ${result.svgAnalysis.uniqueColors}\n\n`;
      
      md += `**Performance:**\n`;
      md += `- Generation: ${result.generationTime}ms\n`;
      md += `- Render: ${result.renderTime}ms\n\n`;
    }
  });
  
  fs.writeFileSync(mdPath, md);
  console.log(`Markdown report saved to: ${mdPath}`);
}

// Run validation
runValidation().catch(console.error);
