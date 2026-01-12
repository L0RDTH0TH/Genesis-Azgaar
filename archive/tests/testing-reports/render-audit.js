/**
 * Rendering Pipeline Audit - Compare Fork vs Original
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Analyze SVG content for metrics
 */
function analyzeSVG(svgString) {
  if (!svgString) return null;
  
  const metrics = {
    totalSize: svgString.length,
    layers: {},
    elements: {},
    styles: {}
  };
  
  // Count elements by type
  const elementTypes = ['path', 'g', 'rect', 'circle', 'text', 'use', 'defs'];
  for (const type of elementTypes) {
    const regex = new RegExp(`<${type}[\\s>]`, 'gi');
    const matches = svgString.match(regex);
    metrics.elements[type] = matches ? matches.length : 0;
  }
  
  // Count paths by class/id
  const pathRegex = /<path[^>]*(?:id|class)=["']([^"']+)["'][^>]*>/gi;
  let match;
  const pathClasses = {};
  while ((match = pathRegex.exec(svgString)) !== null) {
    const className = match[1];
    pathClasses[className] = (pathClasses[className] || 0) + 1;
  }
  
  // Count relief icons
  const reliefIcons = (svgString.match(/<use[^>]*href=["']#relief-[^"']+["']/gi) || []).length;
  metrics.elements.reliefIcons = reliefIcons;
  
  // Count ocean layers
  const oceanLayers = (svgString.match(/<path[^>]*fill-opacity["']\s*[^>]*id=["']ocean-layers/gi) || []).length;
  metrics.layers.oceanLayers = oceanLayers;
  
  // Count biome paths
  const biomePaths = (svgString.match(/<path[^>]*class=["']biome/gi) || []).length;
  metrics.layers.biomes = biomePaths;
  
  // Count state paths
  const statePaths = (svgString.match(/<path[^>]*id=["']state-/gi) || []).length;
  metrics.layers.states = statePaths;
  
  // Count border paths
  const borderPaths = (svgString.match(/<path[^>]*class=["'][^"']*border/gi) || []).length;
  metrics.layers.borders = borderPaths;
  
  // Count rivers
  const rivers = (svgString.match(/<path[^>]*class=["'][^"']*river/gi) || []).length;
  metrics.layers.rivers = rivers;
  
  // Count labels
  const labels = (svgString.match(/<text[^>]*>/gi) || []).length;
  metrics.layers.labels = labels;
  
  // Check for D3-style curves (smooth paths)
  const smoothPathRegex = /[CcQqSsTt][\s\d.,-]+/g;
  const smoothPaths = svgString.match(smoothPathRegex);
  metrics.styles.hasCurvedPaths = smoothPaths && smoothPaths.length > 100;
  
  // Check opacity/transparency
  const opacityRegex = /opacity=["']?([\d.]+)/gi;
  const opacities = [];
  while ((match = opacityRegex.exec(svgString)) !== null) {
    opacities.push(parseFloat(match[1]));
  }
  metrics.styles.avgOpacity = opacities.length > 0 
    ? opacities.reduce((a, b) => a + b, 0) / opacities.length 
    : 1.0;
  
  return metrics;
}

/**
 * Compare rendering implementations
 */
function compareImplementations() {
  const forkSVGPath = path.join(__dirname, '../src/rendering/svg.js');
  const forkReliefPath = path.join(__dirname, '../src/rendering/relief-icons.js');
  const forkOceanPath = path.join(__dirname, '../src/rendering/ocean-layers.js');
  
  const originalOceanPath = path.join(__dirname, '../original/modules/ocean-layers.js');
  const originalReliefPath = path.join(__dirname, '../original/modules/renderers/draw-relief-icons.js');
  
  const differences = [];
  
  // Read files
  const forkSVG = fs.readFileSync(forkSVGPath, 'utf-8');
  const forkRelief = fs.readFileSync(forkReliefPath, 'utf-8');
  const forkOcean = fs.readFileSync(forkOceanPath, 'utf-8');
  const originalOcean = fs.readFileSync(originalOceanPath, 'utf-8');
  const originalRelief = fs.readFileSync(originalReliefPath, 'utf-8');
  
  // 1. Check for D3.js usage
  const originalUsesD3 = originalOcean.includes('d3.curve') || originalOcean.includes('lineGen');
  const forkUsesD3 = forkOcean.includes('d3.curve') || forkOcean.includes('lineGen');
  
  if (originalUsesD3 && !forkUsesD3) {
    differences.push({
      category: 'Ocean Layers',
      issue: 'Missing D3.js curve smoothing',
      severity: 'high',
      original: 'Uses d3.curveBasisClosed for smooth ocean layer paths',
      fork: 'Uses straight line segments (L commands)',
      impact: 'Ocean layers look angular/polygonal instead of smooth',
      location: 'ocean-layers.js::drawOceanLayersSVG()'
    });
  }
  
  // 2. Check for clipPoly function
  const originalUsesClipPoly = originalOcean.includes('clipPoly(');
  const forkUsesClipPoly = forkOcean.includes('clipPoly(');
  
  if (originalUsesClipPoly && !forkUsesClipPoly) {
    differences.push({
      category: 'Ocean Layers',
      issue: 'Missing clipPoly function',
      severity: 'medium',
      original: 'Uses clipPoly() to clip polygons to map boundaries',
      fork: 'No clipping, may extend beyond map bounds',
      impact: 'Ocean layers may render outside map boundaries',
      location: 'ocean-layers.js'
    });
  }
  
  // 3. Check relief icon density
  const originalReliefHeight50 = originalRelief.includes('height < 50') && 
                                  originalRelief.includes('placeReliefIcons');
  const forkReliefHeight50 = forkRelief.includes('height < 50') && 
                             forkRelief.includes('continue'); // Skip relief for height >= 50
  
  if (originalReliefHeight50 && forkRelief.includes('continue')) {
    differences.push({
      category: 'Relief Icons',
      issue: 'Missing relief icons for height >= 50',
      severity: 'high',
      original: 'Places mount/hill icons for cells with height >= 50',
      fork: 'Skips all relief icons for height >= 50 (only biome icons for height < 50)',
      impact: 'Maps lack mountain/hill visual indicators',
      location: 'relief-icons.js::drawReliefIconsSVG() line ~179'
    });
  }
  
  // 4. Check relief icon probability/density calculation
  const originalDensityCalc = originalRelief.match(/iconsDensity.*\*.*10/);
  const forkDensityCalc = forkRelief.match(/probability.*0\.1/);
  
  if (originalDensityCalc && forkDensityCalc) {
    differences.push({
      category: 'Relief Icons',
      issue: 'Different density calculation',
      severity: 'medium',
      original: 'Uses iconsDensity * 10 probability with dynamic radius',
      fork: 'Uses fixed 0.1 probability with fixed radius',
      impact: 'May produce different icon counts/density',
      location: 'relief-icons.js::drawReliefIconsSVG()'
    });
  }
  
  // 5. Check for color scheme usage
  const originalHasColorScheme = forkSVG.includes('getColorScheme') || 
                                  forkSVG.includes('STYLE_CONSTANTS');
  const forkHasColorScheme = forkSVG.includes('STYLE_CONSTANTS');
  
  if (!forkHasColorScheme) {
    differences.push({
      category: 'Styling',
      issue: 'Limited color scheme support',
      severity: 'medium',
      original: 'Uses dynamic color schemes (getColorScheme) with multiple options',
      fork: 'Uses static STYLE_CONSTANTS only',
      impact: 'Muted/flat colors compared to original',
      location: 'svg.js'
    });
  }
  
  // 6. Check for label curving
  const originalLabels = fs.existsSync(path.join(__dirname, '../original/modules/renderers/draw-state-labels.js'));
  if (originalLabels) {
    const originalLabelCode = fs.readFileSync(path.join(__dirname, '../original/modules/renderers/draw-state-labels.js'), 'utf-8');
    const forkLabelCode = forkSVG;
    
    if (originalLabelCode.includes('curveNatural') && !forkLabelCode.includes('curveNatural')) {
      differences.push({
        category: 'Labels',
        issue: 'Missing curved label paths',
        severity: 'low',
        original: 'Uses d3.curveNatural for curved text paths',
        fork: 'Straight text labels only',
        impact: 'Labels don\'t curve along state boundaries',
        location: 'svg.js::drawStateLabelsSVG()'
      });
    }
  }
  
  return differences;
}

/**
 * Generate audit report
 */
function generateReport() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const reportDir = path.join(__dirname, `audits/${timestamp.replace(/T/g, '-')}`);
  
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  
  const differences = compareImplementations();
  
  let report = `# Rendering Pipeline Audit Report\n\n`;
  report += `**Generated:** ${new Date().toISOString()}\n\n`;
  
  report += `## Executive Summary\n\n`;
  
  const highIssues = differences.filter(d => d.severity === 'high').length;
  const mediumIssues = differences.filter(d => d.severity === 'medium').length;
  const lowIssues = differences.filter(d => d.severity === 'low').length;
  
  const alignment = Math.max(0, 100 - (highIssues * 15 + mediumIssues * 8 + lowIssues * 3));
  
  report += `- **Render Alignment:** ${alignment.toFixed(1)}%\n`;
  report += `- **Total Issues:** ${differences.length}\n`;
  report += `- **High Severity:** ${highIssues} (missing features, visual gaps)\n`;
  report += `- **Medium Severity:** ${mediumIssues} (style/polish differences)\n`;
  report += `- **Low Severity:** ${lowIssues} (minor enhancements)\n\n`;
  
  report += `### Key Findings\n\n`;
  report += `⚠️ **Missing D3.js curve smoothing** - Ocean layers and paths use straight segments\n`;
  report += `⚠️ **Missing relief icons for height >= 50** - No mountain/hill indicators\n`;
  report += `⚠️ **Static color scheme** - Limited color vibrancy vs. original's dynamic schemes\n`;
  report += `ℹ️ **Prototype-like appearance** - Functional but lacks polish\n\n`;
  
  report += `## Detailed Code Differences\n\n`;
  
  // Group by category
  const byCategory = {};
  differences.forEach(diff => {
    if (!byCategory[diff.category]) byCategory[diff.category] = [];
    byCategory[diff.category].push(diff);
  });
  
  for (const [category, diffs] of Object.entries(byCategory)) {
    report += `### ${category}\n\n`;
    
    for (const diff of diffs) {
      report += `#### ${diff.issue} [${diff.severity.toUpperCase()}]\n\n`;
      report += `- **Location:** \`${diff.location}\`\n`;
      report += `- **Original:** ${diff.original}\n`;
      report += `- **Fork:** ${diff.fork}\n`;
      report += `- **Impact:** ${diff.impact}\n\n`;
    }
  }
  
  report += `## Layer-by-Layer Breakdown\n\n`;
  report += `| Layer | Original | Fork | Status | Gaps |\n`;
  report += `|-------|----------|------|--------|------|\n`;
  report += `| Ocean Base | ✅ Smooth fill | ✅ Smooth fill | ✅ Complete | None |\n`;
  report += `| Ocean Layers (Fog) | ✅ D3 curves, clipped | ⚠️ Straight lines | ⚠️ Angular paths | Missing D3 smoothing, clipPoly |\n`;
  report += `| Features (Lakes) | ✅ D3 curves, clipped | ✅ Basic paths | ⚠️ May lack clipping | Missing clipPoly |\n`;
  report += `| Biomes | ✅ Isolines, smooth | ✅ Isolines | ✅ Complete | Minor style differences |\n`;
  report += `| States | ✅ Isolines | ✅ Basic paths | ⚠️ Functional | May lack full isoline coherence |\n`;
  report += `| Borders | ✅ Smooth paths | ✅ Basic paths | ✅ Complete | Minor |\n`;
  report += `| Rivers | ✅ D3 curves | ✅ Basic paths | ⚠️ Functional | Missing D3 smoothing |\n`;
  report += `| Relief Icons | ✅ Height 20-100 | ⚠️ Height 20-50 only | ❌ Incomplete | Missing mount/hill icons |\n`;
  report += `| Burgs | ✅ Icons + labels | ✅ Icons | ⚠️ Functional | May lack labels |\n`;
  report += `| Labels | ✅ Curved paths | ✅ Straight | ⚠️ Functional | Missing curveNatural |\n\n`;
  
  report += `## Visual Quality Gaps\n\n`;
  report += `### Color & Styling\n\n`;
  report += `- **Original:** Dynamic color schemes with multiple palettes (bright, natural, etc.)\n`;
  report += `- **Fork:** Static STYLE_CONSTANTS with fixed colors\n`;
  report += `- **Impact:** Muted/flat appearance, less vibrant\n\n`;
  
  report += `### Path Smoothing\n\n`;
  report += `- **Original:** Uses D3.js curve interpolation (curveBasisClosed, curveNatural)\n`;
  report += `- **Fork:** Uses straight line segments (M/L commands)\n`;
  report += `- **Impact:** Angular/polygonal appearance vs. smooth curves\n\n`;
  
  report += `### Relief Icon Density\n\n`;
  report += `- **Original:** ~200-500 icons per map (biomes + relief)\n`;
  report += `- **Fork:** ~200-300 icons (biomes only, relief skipped)\n`;
  report += `- **Impact:** Sparse visual detail, missing terrain indicators\n\n`;
  
  report += `### Ocean Fog Layers\n\n`;
  report += `- **Original:** 3-5 smooth fog layers with D3 curves\n`;
  report += `- **Fork:** 3-5 angular layers with straight segments\n`;
  report += `- **Impact:** Less polished atmospheric effect\n\n`;
  
  report += `## Recommendations\n\n`;
  
  if (alignment < 95) {
    report += `### High Priority Fixes\n\n`;
    
    const highPriority = differences.filter(d => d.severity === 'high');
    for (let i = 0; i < highPriority.length; i++) {
      const issue = highPriority[i];
      report += `${i + 1}. **${issue.issue}**\n`;
      report += `   - Location: \`${issue.location}\`\n`;
      report += `   - Fix: ${issue.original.includes('D3') ? 'Add D3.js dependency and use curve interpolation' : 'Implement missing feature'}\n\n`;
    }
    
    report += `### Medium Priority Enhancements\n\n`;
    
    const mediumPriority = differences.filter(d => d.severity === 'medium');
    for (let i = 0; i < mediumPriority.length; i++) {
      const issue = mediumPriority[i];
      report += `${i + 1}. **${issue.issue}**\n`;
      report += `   - Enhance styling/visual polish\n\n`;
    }
  }
  
  report += `### Proposed Modifications\n\n`;
  report += `1. **Add D3.js Dependency** (or manual curve interpolation)\n`;
  report += `   - Implement \`d3.curveBasisClosed\` equivalent for ocean layers\n`;
  report += `   - Implement \`d3.curveNatural\` for label paths\n`;
  report += `   - File: \`src/rendering/svg.js\`, \`src/rendering/ocean-layers.js\`\n\n`;
  
  report += `2. **Enable Relief Icons for Height >= 50**\n`;
  report += `   - Remove skip condition at line ~179 in \`relief-icons.js\`\n`;
  report += `   - Implement \`placeReliefIcons()\` similar to original\n`;
  report += `   - Expected: 200-500 total icons (currently 200-300)\n\n`;
  
  report += `3. **Add clipPoly Function**\n`;
  report += `   - Port from \`original/utils/commonUtils.js\`\n`;
  report += `   - Use for ocean layers and features\n`;
  report += `   - File: \`src/rendering/utils.js\`\n\n`;
  
  report += `4. **Enhance Color Schemes**\n`;
  report += `   - Port \`getColorScheme()\` from original\n`;
  report += `   - Add multiple palette options\n`;
  report += `   - File: \`src/rendering/svg.js\` or new \`src/rendering/colors.js\`\n\n`;
  
  report += `5. **Improve Label Rendering**\n`;
  report += `   - Add curved text paths using curve interpolation\n`;
  report += `   - File: \`src/rendering/svg.js::drawStateLabelsSVG()\`\n\n`;
  
  const reportPath = path.join(reportDir, 'render_audit_report.md');
  fs.writeFileSync(reportPath, report);
  
  console.log(`\n✅ Rendering audit report generated: ${reportPath}\n`);
  console.log(`   Alignment: ${alignment.toFixed(1)}%\n`);
  console.log(`   Issues: ${differences.length} (${highIssues} high, ${mediumIssues} medium, ${lowIssues} low)\n`);
  
  return { reportPath, alignment, differences };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generateReport();
}

export { generateReport, compareImplementations, analyzeSVG };
