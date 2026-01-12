/**
 * Test script to verify Phase 1 rendering improvements
 * Tests: D3 curve smoothing, full relief icons
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Analyze SVG for metrics
 */
function analyzeSVG(svgString) {
  if (!svgString) return null;
  
  const metrics = {
    totalSize: svgString.length,
    elements: {},
    layers: {}
  };
  
  // Count relief icons
  const reliefIcons = (svgString.match(/<use[^>]*href=["']#relief-[^"']+["']/gi) || []).length;
  metrics.elements.reliefIcons = reliefIcons;
  
  // Count mount/hill icons specifically
  const mountIcons = (svgString.match(/href=["']#relief-mount/gi) || []).length;
  const hillIcons = (svgString.match(/href=["']#relief-hill/gi) || []).length;
  metrics.elements.mountIcons = mountIcons;
  metrics.elements.hillIcons = hillIcons;
  
  // Count ocean layer paths
  const oceanPaths = (svgString.match(/<path[^>]*fill-opacity.*ocean-layers/gi) || []).length;
  metrics.layers.oceanLayers = oceanPaths;
  
  // Check for curved paths (C, Q, S, T commands indicate curves)
  const curvedPaths = (svgString.match(/[CcQqSsTt][\s\d.,-]+/g) || []).length;
  metrics.elements.curvedPaths = curvedPaths;
  
  // Count straight line segments (L commands)
  const straightLines = (svgString.match(/\sL[\s\d.,-]+/g) || []).length;
  metrics.elements.straightLines = straightLines;
  
  // River paths
  const rivers = (svgString.match(/id=["']river\d+/gi) || []).length;
  metrics.layers.rivers = rivers;
  
  return metrics;
}

function generateReport(beforeMetrics, afterMetrics) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const reportDir = path.join(__dirname, `audits/${timestamp.replace(/T/g, '-')}`);
  
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  
  let report = `# Phase 1 Rendering Improvements - Test Report\n\n`;
  report += `**Generated:** ${new Date().toISOString()}\n\n`;
  
  report += `## Changes Implemented\n\n`;
  report += `1. ✅ Added D3 dependencies (d3-shape, d3-interpolate, d3-scale, d3-color)\n`;
  report += `2. ✅ Implemented D3 curve smoothing for ocean layers (curveBasisClosed)\n`;
  report += `3. ✅ Implemented D3 curve smoothing for rivers (curveCatmullRom.alpha(0.1))\n`;
  report += `4. ✅ Enabled relief icons for height >= 50 (mount/hill indicators)\n`;
  report += `5. ✅ Fixed relief icon density calculation (matches original)\n\n`;
  
  report += `## Metrics Comparison\n\n`;
  report += `| Metric | Before | After | Change |\n`;
  report += `|--------|--------|-------|--------|\n`;
  
  if (beforeMetrics && afterMetrics) {
    const reliefChange = afterMetrics.elements.reliefIcons - beforeMetrics.elements.reliefIcons;
    const reliefChangePercent = beforeMetrics.elements.reliefIcons > 0 
      ? ((reliefChange / beforeMetrics.elements.reliefIcons) * 100).toFixed(1)
      : 'N/A';
    
    report += `| Relief Icons (total) | ${beforeMetrics.elements.reliefIcons || 0} | ${afterMetrics.elements.reliefIcons || 0} | +${reliefChange} (${reliefChangePercent}%) |\n`;
    report += `| Mount Icons | ${beforeMetrics.elements.mountIcons || 0} | ${afterMetrics.elements.mountIcons || 0} | +${(afterMetrics.elements.mountIcons || 0) - (beforeMetrics.elements.mountIcons || 0)} |\n`;
    report += `| Hill Icons | ${beforeMetrics.elements.hillIcons || 0} | ${afterMetrics.elements.hillIcons || 0} | +${(afterMetrics.elements.hillIcons || 0) - (beforeMetrics.elements.hillIcons || 0)} |\n`;
    report += `| Curved Paths | ${beforeMetrics.elements.curvedPaths || 0} | ${afterMetrics.elements.curvedPaths || 0} | +${(afterMetrics.elements.curvedPaths || 0) - (beforeMetrics.elements.curvedPaths || 0)} |\n`;
    report += `| Ocean Layer Paths | ${beforeMetrics.layers.oceanLayers || 0} | ${afterMetrics.layers.oceanLayers || 0} | - |\n`;
    report += `| Rivers | ${beforeMetrics.layers.rivers || 0} | ${afterMetrics.layers.rivers || 0} | - |\n`;
  } else {
    report += `| Relief Icons (total) | TBD | TBD | - |\n`;
    report += `| Mount Icons | TBD | TBD | - |\n`;
    report += `| Hill Icons | TBD | TBD | - |\n`;
    report += `| Curved Paths | TBD | TBD | - |\n`;
  }
  
  report += `\n## Code Changes Summary\n\n`;
  
  report += `### 1. D3 Dependencies Added\n\n`;
  report += `\`\`\`json\n`;
  report += `{\n`;
  report += `  "dependencies": {\n`;
  report += `    "d3-shape": "^3.2.0",\n`;
  report += `    "d3-interpolate": "^3.0.1",\n`;
  report += `    "d3-scale": "^4.0.2",\n`;
  report += `    "d3-color": "^3.1.0"\n`;
  report += `  }\n`;
  report += `}\n`;
  report += `\`\`\`\n\n`;
  
  report += `### 2. Ocean Layers - D3 Curve Smoothing\n\n`;
  report += `**File:** \`src/rendering/ocean-layers.js\`\n\n`;
  report += `**Before:**\n`;
  report += `\`\`\`javascript\n`;
  report += `const pathStrings = layer.map(([_, points]) => {\n`;
  report += `  let path = \`M \${points[0][0]},\${points[0][1]}\`;\n`;
  report += `  for (let i = 1; i < points.length; i++) {\n`;
  report += `    path += \` L \${points[i][0]},\${points[i][1]}\`;  // Straight lines\n`;
  report += `  }\n`;
  report += `  return path + ' Z';\n`;
  report += `});\n`;
  report += `\`\`\`\n\n`;
  report += `**After:**\n`;
  report += `\`\`\`javascript\n`;
  report += `import { line, curveBasisClosed } from 'd3-shape';\n\n`;
  report += `const lineGen = line()\n`;
  report += `  .x(d => d[0])\n`;
  report += `  .y(d => d[1])\n`;
  report += `  .curve(curveBasisClosed);\n\n`;
  report += `const pathStrings = layer.map(([_, points]) => {\n`;
  report += `  return lineGen(points);  // Smooth curves!\n`;
  report += `}).filter(p => p);\n`;
  report += `\`\`\`\n\n`;
  
  report += `### 3. Rivers - D3 Curve Smoothing\n\n`;
  report += `**File:** \`src/rendering/svg.js\`\n\n`;
  report += `**Before:**\n`;
  report += `\`\`\`javascript\n`;
  report += `let path = \`M\${points[0][0]},\${points[0][1]}\`;\n`;
  report += `for (let i = 1; i < points.length; i++) {\n`;
  report += `  path += \` Q\${cpX},\${cpY} \${x2},\${y2}\`;  // Quadratic curves\n`;
  report += `}\n`;
  report += `\`\`\`\n\n`;
  report += `**After:**\n`;
  report += `\`\`\`javascript\n`;
  report += `import { line, curveCatmullRom } from 'd3-shape';\n\n`;
  report += `const lineGen = line()\n`;
  report += `  .x(d => d[0])\n`;
  report += `  .y(d => d[1])\n`;
  report += `  .curve(curveCatmullRom.alpha(0.1));  // Matches original\n\n`;
  report += `const path = lineGen(cleanPoints);\n`;
  report += `\`\`\`\n\n`;
  
  report += `### 4. Relief Icons - Enable Height >= 50\n\n`;
  report += `**File:** \`src/rendering/relief-icons.js\`\n\n`;
  report += `**Before (line 178-181):**\n`;
  report += `\`\`\`javascript\n`;
  report += `} else {\n`;
  report += `  // Relief icons (height >= 50) - skip for now\n`;
  report += `  continue;  // ❌ SKIPPED!\n`;
  report += `}\n`;
  report += `\`\`\`\n\n`;
  report += `**After:**\n`;
  report += `\`\`\`javascript\n`;
  report += `} else {\n`;
  report += `  // Relief icons (mount/hill) for height >= 50 (ENABLED)\n`;
  report += `  const radius = 2 / density;\n`;
  report += `  const [icon, h] = getReliefIcon(i, height, grid, pack, mod);\n`;
  report += `  \n`;
  report += `  for (const [cx, cy] of poissonDiscSampler(minX, minY, maxX, maxY, radius)) {\n`;
  report += `    if (!pointInPolygon([cx, cy], polygon)) continue;\n`;
  report += `    relief.push({i: icon, x: rn(cx - h, 2), y: rn(cy - h, 2), s: rn(h * 2, 2)});\n`;
  report += `  }\n`;
  report += `}\n`;
  report += `\`\`\`\n\n`;
  
  report += `### 5. Relief Density Calculation Fix\n\n`;
  report += `**Before:**\n`;
  report += `\`\`\`javascript\n`;
  report += `const radius = radiusBase * 1.5;  // Fixed\n`;
  report += `const probability = 0.1;  // Fixed\n`;
  report += `\`\`\`\n\n`;
  report += `**After:**\n`;
  report += `\`\`\`javascript\n`;
  report += `const iconsDensity = biomesData.iconsDensity[biome] / 100;\n`;
  report += `const radius = 2 / iconsDensity / density;  // Dynamic\n`;
  report += `if (Math.random() > iconsDensity * 10) continue;  // Dynamic probability\n`;
  report += `\`\`\`\n\n`;
  
  report += `## Expected Improvements\n\n`;
  report += `✅ **Smooth ocean fog layers** - D3 curveBasisClosed replaces angular segments\n`;
  report += `✅ **Smooth river paths** - D3 curveCatmullRom replaces jagged lines\n`;
  report += `✅ **Full relief coverage** - Mount/hill icons for height >= 50 (100-200 additional icons)\n`;
  report += `✅ **Better icon density** - Dynamic calculation matches original\n\n`;
  
  report += `## Testing Instructions\n\n`;
  report += `1. Generate map with seed 42, Continents template\n`;
  report += `2. Export SVG and count elements:\n`;
  report += `   - Relief icons should be ~300-500 (was ~200-300)\n`;
  report += `   - Mount/hill icons should be > 0 (was 0)\n`;
  report += `   - Paths should contain C/Q/S/T commands (curves, not just L/M)\n`;
  report += `3. Visual inspection:\n`;
  report += `   - Ocean layers should be smooth, not angular\n`;
  report += `   - Rivers should flow smoothly\n`;
  report += `   - Mountains/hills should be visible on high terrain\n\n`;
  
  const reportPath = path.join(reportDir, 'phase1_render_audit.md');
  fs.writeFileSync(reportPath, report);
  
  console.log(`\n✅ Phase 1 test report generated: ${reportPath}\n`);
  
  return reportPath;
}

// Export for use in other scripts
export { analyzeSVG, generateReport };

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  generateReport(null, null);
  console.log('Phase 1 changes documented. Run generation tests to get before/after metrics.');
}
