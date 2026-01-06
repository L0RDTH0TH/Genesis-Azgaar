/**
 * Compile test report from browser-extracted data
 * Usage: node compile-report.js <timestamp> <json-data>
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const timestamp = process.argv[2] || new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const resultsDir = path.join(__dirname, 'results', timestamp);
fs.mkdirSync(resultsDir, { recursive: true });

// Data will be passed as JSON string in process.argv[3] or read from file
const dataJson = process.argv[3] || fs.readFileSync(path.join(resultsDir, 'data.json'), 'utf8');
const data = JSON.parse(dataJson);

const { summary, maps } = data;

let report = `# Full 14-Template Validation Report\n\n`;
report += `**Generated:** ${new Date().toISOString()}\n`;
report += `**Total Maps:** ${maps.length}\n`;
report += `**Templates:** 14\n`;
report += `**Seeds per Template:** 3 (fixed 42 + 2 random)\n\n`;

report += `## Summary Statistics\n\n`;
report += `| Template | Avg Land % | Avg Clusters | Min/Max Clusters | Avg Isolines % | Avg Relief Icons |\n`;
report += `|----------|------------|--------------|------------------|----------------|-------------------|\n`;
Object.entries(summary).forEach(([template, stats]) => {
  report += `| ${template} | ${stats.avgLand} | ${stats.avgClusters} | ${stats.minMaxClusters} | ${stats.avgIsolines} | ${stats.avgRelief} |\n`;
});

// Group maps by template
const byTemplate = {};
maps.forEach(m => {
  if (!byTemplate[m.template]) {
    byTemplate[m.template] = [];
  }
  byTemplate[m.template].push(m);
});

report += `\n## Per-Map Details\n\n`;
Object.entries(byTemplate).forEach(([template, templateMaps]) => {
  report += `### Template: ${template}\n\n`;
  report += `**Average Statistics:**\n`;
  if (summary[template]) {
    report += `- Land %: ${summary[template].avgLand}\n`;
    report += `- Clusters: ${summary[template].avgClusters} (${summary[template].minMaxClusters})\n`;
    report += `- Isolines: ${summary[template].avgIsolines}\n`;
    report += `- Relief Icons: ${summary[template].avgRelief}\n\n`;
  }
  
  templateMaps.forEach(m => {
    const filename = `${m.seed}_${template.replace(/\s+/g, '_')}.png`;
    report += `#### Seed ${m.seed}\n\n`;
    report += `- **Land %:** ${m.diagnostics['Land %']}\n`;
    report += `- **Clusters:** ${m.diagnostics['Clusters']}\n`;
    report += `- **Isolines:** ${m.diagnostics['Isolines']}\n`;
    report += `- **Relief Icons:** ${m.diagnostics['Relief Icons']}\n`;
    report += `- **Screenshot:** \`${filename}\`\n\n`;
  });
});

report += `\n## Screenshot Files\n\n`;
maps.forEach(m => {
  const filename = `${m.seed}_${m.template.replace(/\s+/g, '_')}.png`;
  report += `- \`${filename}\` - ${m.template} (Seed ${m.seed})\n`;
});

const reportPath = path.join(resultsDir, 'test_report.md');
fs.writeFileSync(reportPath, report);
console.log(`Report saved: ${reportPath}`);

// Save data JSON for reference
const dataPath = path.join(resultsDir, 'data.json');
fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
console.log(`Data saved: ${dataPath}`);
