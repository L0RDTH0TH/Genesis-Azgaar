/**
 * Extract SVG defs from original HTML and convert to JS module
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the extracted defs
const defsPath = '/tmp/svg_defs_extract.html';
const defs = fs.readFileSync(defsPath, 'utf8').trim();

// Escape backticks and template literals
const escaped = defs
  .replace(/\\/g, '\\\\')
  .replace(/`/g, '\\`')
  .replace(/\${/g, '\\${');

// Generate JS module
const jsContent = `/**
 * SVG Definitions - Auto-generated from original/index.html
 * Contains all filters, patterns, symbols, masks, and hatching patterns
 * Total: ~7900 lines
 * 
 * Generated: ${new Date().toISOString()}
 */

export function getSVGDefs() {
  return \`${escaped}\`;
}
`;

// Write to destination
const outputPath = path.join(__dirname, '../src/rendering/svg-defs.js');
fs.writeFileSync(outputPath, jsContent, 'utf8');

console.log(`Created ${outputPath}`);
console.log(`Defs length: ${defs.length} characters`);
console.log(`Lines: ${defs.split('\n').length}`);
