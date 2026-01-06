/**
 * Script to save screenshots from test page and compile report
 * Run this after test-full-14-templates.html completes
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get timestamp from command line or use current
const timestamp = process.argv[2] || new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const resultsDir = path.join(__dirname, 'results', timestamp);
fs.mkdirSync(resultsDir, { recursive: true });

console.log(`Saving results to: ${resultsDir}`);

// This script would be called from browser console or Node.js automation
// For now, it's a template for manual execution

export function saveScreenshotFromDataUrl(dataUrl, filename) {
  const base64Data = dataUrl.replace(/^data:image\/svg\+xml;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');
  const filepath = path.join(resultsDir, filename);
  fs.writeFileSync(filepath, buffer);
  console.log(`Saved: ${filename}`);
  return filepath;
}

export function compileReport(results) {
  const reportPath = path.join(resultsDir, 'test_report.md');
  
  // Group by template
  const byTemplate = {};
  results.forEach(r => {
    if (!byTemplate[r.template]) {
      byTemplate[r.template] = [];
    }
    byTemplate[r.template].push(r);
  });

  // Calculate averages
  const summary = Object.entries(byTemplate).map(([template, maps]) => {
    const diags = maps.map(m => m.diagnostics);
    const avgLand = (diags.reduce((s, d) => s + parseFloat(d['Land %']), 0) / diags.length).toFixed(1);
    const avgClusters = (diags.reduce((s, d) => s + parseInt(d['Clusters']), 0) / diags.length).toFixed(1);
    const minClusters = Math.min(...diags.map(d => parseInt(d['Clusters'])));
    const maxClusters = Math.max(...diags.map(d => parseInt(d['Clusters'])));
    const avgIsolines = (diags.reduce((s, d) => s + parseFloat(d['Isolines']), 0) / diags.length).toFixed(1);
    const avgRelief = (diags.reduce((s, d) => s + parseInt(d['Relief Icons']), 0) / diags.length).toFixed(0);

    return {
      template,
      avgLand,
      avgClusters,
      minClusters,
      maxClusters,
      avgIsolines,
      avgRelief,
      maps
    };
  });

  let report = `# Full 14-Template Validation Report\n\n`;
  report += `**Generated:** ${new Date().toISOString()}\n`;
  report += `**Total Maps:** ${results.length}\n`;
  report += `**Templates:** 14\n`;
  report += `**Seeds per Template:** 3 (fixed 42 + 2 random)\n\n`;

  report += `## Summary Statistics\n\n`;
  report += `| Template | Avg Land % | Avg Clusters | Min/Max Clusters | Avg Isolines % | Avg Relief Icons |\n`;
  report += `|----------|------------|--------------|------------------|----------------|-------------------|\n`;
  summary.forEach(s => {
    report += `| ${s.template} | ${s.avgLand}% | ${s.avgClusters} | ${s.minClusters}/${s.maxClusters} | ${s.avgIsolines}% | ${s.avgRelief} |\n`;
  });

  report += `\n## Per-Map Details\n\n`;
  summary.forEach(s => {
    report += `### Template: ${s.template}\n\n`;
    report += `**Average Statistics:**\n`;
    report += `- Land %: ${s.avgLand}%\n`;
    report += `- Clusters: ${s.avgClusters} (Min: ${s.minClusters}, Max: ${s.maxClusters})\n`;
    report += `- Isolines: ${s.avgIsolines}%\n`;
    report += `- Relief Icons: ${s.avgRelief}\n\n`;
    
    s.maps.forEach(m => {
      const filename = `${m.seed}_${s.template.replace(/\s+/g, '_')}.png`;
      report += `#### Seed ${m.seed}\n\n`;
      report += `- **Land %:** ${m.diagnostics['Land %']}\n`;
      report += `- **Clusters:** ${m.diagnostics['Clusters']}\n`;
      report += `- **Isolines:** ${m.diagnostics['Isolines']}\n`;
      report += `- **Relief Icons:** ${m.diagnostics['Relief Icons']}\n`;
      report += `- **Screenshot:** \`${filename}\`\n\n`;
    });
  });

  fs.writeFileSync(reportPath, report);
  console.log(`Report saved: ${reportPath}`);
  return reportPath;
}
