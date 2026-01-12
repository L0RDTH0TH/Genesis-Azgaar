/**
 * =============================================================================
 * comprehensive-audit.js
 * Desc: Comprehensive audit script comparing fork vs original Azgaar
 * Author: Lordthoth
 * =============================================================================
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test parameters
const TEST_PARAMS = {
  seed: '42',
  statesNumber: 18,
  template: 'Continents',
  landPercentage: 40,
  showLabels: true,
  showRelief: true,
  fullRendering: true
};

const ADDITIONAL_TEMPLATES = ['Archipelago', 'Pangea', 'Shattered'];

// Audit results structure
const auditResults = {
  timestamp: new Date().toISOString(),
  testParams: TEST_PARAMS,
  codeDiffs: [],
  dataComparisons: [],
  visualComparisons: [],
  templateFidelity: [],
  missingFeatures: [],
  metrics: {
    original: {},
    fork: {},
    differences: {}
  }
};

/**
 * Compare two template files line by line
 */
function compareTemplateFiles() {
  const originalPath = path.join(__dirname, '../original/config/heightmap-templates.js');
  const forkPath = path.join(__dirname, '../src/core/heightmap-templates.js');
  
  const originalContent = fs.readFileSync(originalPath, 'utf-8');
  const forkContent = fs.readFileSync(forkPath, 'utf-8');
  
  // Extract template definitions
  const originalTemplates = extractTemplates(originalContent);
  const forkTemplates = extractTemplates(forkContent);
  
  const diffs = [];
  
  // Compare each template
  for (const [key, originalTemplate] of Object.entries(originalTemplates)) {
    const forkTemplate = forkTemplates[key];
    
    if (!forkTemplate) {
      diffs.push({
        type: 'missing_template',
        template: key,
        severity: 'high',
        description: `Template "${key}" is missing in fork`
      });
      continue;
    }
    
    // Compare template strings
    const originalLines = originalTemplate.template.split('\n').map(l => l.trim()).filter(l => l);
    const forkLines = forkTemplate.template.split('\n').map(l => l.trim()).filter(l => l);
    
    if (originalLines.length !== forkLines.length) {
      diffs.push({
        type: 'line_count_mismatch',
        template: key,
        severity: 'high',
        originalLines: originalLines.length,
        forkLines: forkLines.length,
        description: `Template "${key}" has ${originalLines.length} lines in original but ${forkLines.length} in fork`
      });
    }
    
    // Compare line by line
    const maxLines = Math.max(originalLines.length, forkLines.length);
    for (let i = 0; i < maxLines; i++) {
      const origLine = originalLines[i] || '';
      const forkLine = forkLines[i] || '';
      
      if (origLine !== forkLine) {
        diffs.push({
          type: 'line_mismatch',
          template: key,
          lineNumber: i + 1,
          severity: origLine.includes('Hill') || origLine.includes('Range') ? 'high' : 'medium',
          original: origLine,
          fork: forkLine,
          description: `Template "${key}" line ${i + 1} differs`
        });
      }
    }
    
    // Compare other properties
    if (originalTemplate.id !== forkTemplate.id) {
      diffs.push({
        type: 'id_mismatch',
        template: key,
        severity: 'low',
        original: originalTemplate.id,
        fork: forkTemplate.id
      });
    }
    
    if (originalTemplate.probability !== forkTemplate.probability) {
      diffs.push({
        type: 'probability_mismatch',
        template: key,
        severity: 'low',
        original: originalTemplate.probability,
        fork: forkTemplate.probability
      });
    }
  }
  
  return diffs;
}

/**
 * Extract template definitions from file content
 */
function extractTemplates(content) {
  const templates = {};
  
  // For original: match const templateName = `...`
  const originalRegex = /const\s+(\w+)\s*=\s*`([^`]+)`/gs;
  let match;
  
  while ((match = originalRegex.exec(content)) !== null) {
    const name = match[1];
    const template = match[2].trim();
    // Map camelCase to capitalized names
    const mappedName = mapTemplateName(name);
    templates[mappedName] = { template, originalKey: name };
  }
  
  // For fork: match object definitions with template property
  const forkRegex = /['"]([^'"]+)['"]:\s*\{[^}]*template:\s*`([^`]+)`/gs;
  while ((match = forkRegex.exec(content)) !== null) {
    const name = match[1];
    const template = match[2].trim();
    templates[name] = { template, originalKey: name };
  }
  
  return templates;
}

/**
 * Map original camelCase template names to fork capitalized names
 */
function mapTemplateName(camelCase) {
  const mapping = {
    'volcano': 'Volcano',
    'highIsland': 'High Island',
    'lowIsland': 'Low Island',
    'continents': 'Continents',
    'archipelago': 'Archipelago',
    'atoll': 'Atoll',
    'mediterranean': 'Mediterranean',
    'peninsula': 'Peninsula',
    'pangea': 'Pangea',
    'isthmus': 'Isthmus',
    'shattered': 'Shattered',
    'taklamakan': 'Taklamakan',
    'oldWorld': 'Old World',
    'fractious': 'Fractious'
  };
  return mapping[camelCase] || camelCase;
}

/**
 * Compare heightmap generator implementations
 */
function compareHeightmapGenerators() {
  const originalPath = path.join(__dirname, '../original/modules/heightmap-generator.js');
  const forkPath = path.join(__dirname, '../src/core/heightmap.js');
  
  const originalContent = fs.readFileSync(originalPath, 'utf-8');
  const forkContent = fs.readFileSync(forkPath, 'utf-8');
  
  const diffs = [];
  
  // Check for key functions
  // Original uses standalone functions, fork uses class methods
  const keyFunctions = [
    { name: 'addHill', original: 'const addHill', fork: 'addHill(' },
    { name: 'addPit', original: 'const addPit', fork: 'addPit(' },
    { name: 'addRange', original: 'const addRange', fork: 'addRange(' },
    { name: 'addTrough', original: 'const addTrough', fork: 'addTrough(' },
    { name: 'addStrait', original: 'const addStrait', fork: 'addStrait(' },
    { name: 'mask', original: 'function mask', fork: 'mask(' },
    { name: 'smooth', original: 'function smooth', fork: 'smooth(' },
    { name: 'getBlobPower', original: 'function getBlobPower', fork: 'getBlobPower(' },
    { name: 'getLinePower', original: 'function getLinePower', fork: 'getLinePower(' }
  ];
  
  for (const func of keyFunctions) {
    const originalHas = originalContent.includes(func.original);
    const forkHas = forkContent.includes(func.fork);
    
    if (originalHas && !forkHas) {
      diffs.push({
        type: 'missing_function',
        function: func.name,
        severity: 'high',
        description: `Function "${func.name}" exists in original but not in fork`
      });
    }
  }
  
  // Compare blobPower calculation
  const originalBlobPower = extractBlobPowerMap(originalContent);
  const forkBlobPower = extractBlobPowerMap(forkContent);
  
  if (JSON.stringify(originalBlobPower) !== JSON.stringify(forkBlobPower)) {
    diffs.push({
      type: 'blob_power_mismatch',
      severity: 'medium',
      original: originalBlobPower,
      fork: forkBlobPower,
      description: 'BlobPower calculation differs'
    });
  }
  
  return diffs;
}

/**
 * Extract blobPower map from content
 */
function extractBlobPowerMap(content) {
  const map = {};
  const regex = /(\d+):\s*([\d.]+)/g;
  let match;
  
  while ((match = regex.exec(content)) !== null) {
    map[match[1]] = parseFloat(match[2]);
  }
  
  return map;
}

/**
 * Generate audit report
 */
function generateReport() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportDir = path.join(__dirname, `audit-${timestamp}`);
  
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }
  
  const reportPath = path.join(reportDir, 'audit_report.md');
  
  let report = `# Comprehensive Audit: Fork vs Original Azgaar\n\n`;
  report += `**Generated:** ${auditResults.timestamp}\n\n`;
  report += `## Executive Summary\n\n`;
  
  // Calculate alignment percentage
  const totalIssues = auditResults.codeDiffs.length + 
                      auditResults.missingFeatures.length;
  const highSeverityIssues = auditResults.codeDiffs.filter(d => d.severity === 'high').length +
                             auditResults.missingFeatures.filter(f => f.severity === 'high').length;
  
  const alignment = totalIssues === 0 ? 100 : 
    Math.max(0, 100 - (highSeverityIssues * 10 + (totalIssues - highSeverityIssues) * 2));
  
  report += `- **Overall Alignment:** ${alignment.toFixed(1)}%\n`;
  report += `- **Total Issues Found:** ${totalIssues}\n`;
  report += `- **High Severity Issues:** ${highSeverityIssues}\n`;
  report += `- **Medium Severity Issues:** ${auditResults.codeDiffs.filter(d => d.severity === 'medium').length}\n`;
  report += `- **Low Severity Issues:** ${auditResults.codeDiffs.filter(d => d.severity === 'low').length}\n\n`;
  
  report += `## Test Parameters\n\n`;
  report += `\`\`\`json\n${JSON.stringify(TEST_PARAMS, null, 2)}\n\`\`\`\n\n`;
  
  report += `## Code Differences\n\n`;
  
  if (auditResults.codeDiffs.length === 0) {
    report += `✅ No code differences found.\n\n`;
  } else {
    // Group by type
    const byType = {};
    auditResults.codeDiffs.forEach(diff => {
      if (!byType[diff.type]) byType[diff.type] = [];
      byType[diff.type].push(diff);
    });
    
    for (const [type, diffs] of Object.entries(byType)) {
      report += `### ${type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}\n\n`;
      
      for (const diff of diffs) {
        report += `- **${diff.severity.toUpperCase()}**: ${diff.description || diff.template || diff.function || 'Unknown'}\n`;
        if (diff.original && diff.fork) {
          report += `  - Original: \`${diff.original}\`\n`;
          report += `  - Fork: \`${diff.fork}\`\n`;
        }
        if (diff.lineNumber) {
          report += `  - Line: ${diff.lineNumber}\n`;
        }
      }
      report += `\n`;
    }
  }
  
  report += `## Missing Features\n\n`;
  
  if (auditResults.missingFeatures.length === 0) {
    report += `✅ No missing features identified.\n\n`;
  } else {
    for (const feature of auditResults.missingFeatures) {
      report += `- **${feature.severity.toUpperCase()}**: ${feature.name}\n`;
      report += `  - Location: ${feature.location}\n`;
      report += `  - Description: ${feature.description}\n\n`;
    }
  }
  
  report += `## Recommendations\n\n`;
  
  if (alignment >= 95) {
    report += `✅ **Fork is ≥95% aligned with original.** Ready for commit.\n\n`;
  } else {
    report += `⚠️ **Fork needs fixes before commit.**\n\n`;
    report += `### Priority Fixes:\n\n`;
    
    const highPriority = [...auditResults.codeDiffs, ...auditResults.missingFeatures]
      .filter(i => i.severity === 'high')
      .slice(0, 10);
    
    for (const issue of highPriority) {
      report += `1. ${issue.description || issue.name || 'Unknown issue'}\n`;
    }
  }
  
  fs.writeFileSync(reportPath, report);
  console.log(`\n✅ Audit report generated: ${reportPath}\n`);
  
  return { reportPath, alignment };
}

/**
 * Main audit function
 */
function runAudit() {
  console.log('🔍 Starting comprehensive audit...\n');
  
  // Phase 1: Code comparison
  console.log('📝 Phase 1: Comparing code files...');
  const templateDiffs = compareTemplateFiles();
  auditResults.codeDiffs.push(...templateDiffs);
  
  const generatorDiffs = compareHeightmapGenerators();
  auditResults.codeDiffs.push(...generatorDiffs);
  
  console.log(`   Found ${templateDiffs.length} template differences`);
  console.log(`   Found ${generatorDiffs.length} generator differences`);
  
  // Phase 2: Generate report
  console.log('\n📊 Phase 2: Generating audit report...');
  const { reportPath, alignment } = generateReport();
  
  console.log(`\n✅ Audit complete!`);
  console.log(`   Alignment: ${alignment.toFixed(1)}%`);
  console.log(`   Report: ${reportPath}\n`);
  
  return { alignment, reportPath };
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAudit();
}

export { runAudit, compareTemplateFiles, compareHeightmapGenerators };
