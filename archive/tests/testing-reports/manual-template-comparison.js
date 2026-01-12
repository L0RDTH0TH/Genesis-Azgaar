/**
 * Manual template comparison - normalize whitespace and compare line by line
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function normalizeTemplate(template) {
  return template
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n');
}

function compareTemplates() {
  const originalPath = path.join(__dirname, '../original/config/heightmap-templates.js');
  const forkPath = path.join(__dirname, '../src/core/heightmap-templates.js');
  
  const originalContent = fs.readFileSync(originalPath, 'utf-8');
  const forkContent = fs.readFileSync(forkPath, 'utf-8');
  
  // Extract templates from original (camelCase keys)
  const originalTemplates = {};
  const origMatch = originalContent.match(/const\s+(\w+)\s*=\s*`([^`]+)`/gs);
  if (origMatch) {
    for (const match of origMatch) {
      const nameMatch = match.match(/const\s+(\w+)\s*=/);
      const templateMatch = match.match(/`([^`]+)`/s);
      if (nameMatch && templateMatch) {
        const camelName = nameMatch[1];
        const template = normalizeTemplate(templateMatch[1]);
        originalTemplates[camelName] = template;
      }
    }
  }
  
  // Extract templates from fork (capitalized keys)
  const forkTemplates = {};
  const forkMatch = forkContent.match(/['"]([^'"]+)['"]:\s*\{[^}]*template:\s*`([^`]+)`/gs);
  if (forkMatch) {
    for (const match of forkMatch) {
      const nameMatch = match.match(/['"]([^'"]+)['"]/);
      const templateMatch = match.match(/template:\s*`([^`]+)`/s);
      if (nameMatch && templateMatch) {
        const capName = nameMatch[1];
        const template = normalizeTemplate(templateMatch[1]);
        forkTemplates[capName] = template;
      }
    }
  }
  
  // Map original camelCase to fork capitalized
  const nameMap = {
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
  
  const results = {
    identical: [],
    different: [],
    missing: []
  };
  
  // Compare each template
  for (const [origKey, origTemplate] of Object.entries(originalTemplates)) {
    const forkKey = nameMap[origKey];
    const forkTemplate = forkTemplates[forkKey];
    
    if (!forkTemplate) {
      results.missing.push({ original: origKey, fork: forkKey });
      continue;
    }
    
    if (origTemplate === forkTemplate) {
      results.identical.push({ original: origKey, fork: forkKey });
    } else {
      // Find differences
      const origLines = origTemplate.split('\n');
      const forkLines = forkTemplate.split('\n');
      const diffs = [];
      
      const maxLines = Math.max(origLines.length, forkLines.length);
      for (let i = 0; i < maxLines; i++) {
        const origLine = origLines[i] || '';
        const forkLine = forkLines[i] || '';
        if (origLine !== forkLine) {
          diffs.push({
            line: i + 1,
            original: origLine,
            fork: forkLine
          });
        }
      }
      
      results.different.push({
        original: origKey,
        fork: forkKey,
        differences: diffs,
        originalLineCount: origLines.length,
        forkLineCount: forkLines.length
      });
    }
  }
  
  return results;
}

const results = compareTemplates();
console.log('\n=== Template Comparison Results ===\n');
console.log(`✅ Identical: ${results.identical.length}`);
console.log(`⚠️  Different: ${results.different.length}`);
console.log(`❌ Missing: ${results.missing.length}\n`);

if (results.identical.length > 0) {
  console.log('Identical templates:');
  results.identical.forEach(t => console.log(`  - ${t.original} → ${t.fork}`));
  console.log();
}

if (results.different.length > 0) {
  console.log('Different templates:');
  results.different.forEach(t => {
    console.log(`  - ${t.original} → ${t.fork}`);
    console.log(`    Lines: ${t.originalLineCount} vs ${t.forkLineCount}`);
    if (t.differences.length > 0) {
      console.log(`    First difference at line ${t.differences[0].line}:`);
      console.log(`      Original: ${t.differences[0].original}`);
      console.log(`      Fork:     ${t.differences[0].fork}`);
    }
  });
  console.log();
}

if (results.missing.length > 0) {
  console.log('Missing templates:');
  results.missing.forEach(t => console.log(`  - ${t.original} → ${t.fork} (MISSING)`));
  console.log();
}

export { compareTemplates };
