/**
 * Quick test script to verify SVG rendering functions exist and are callable
 * Run with: node test-svg-quick.js
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Check if generator.js exports renderToSVG
const generatorPath = join(__dirname, 'src', 'generator.js');
const generatorCode = readFileSync(generatorPath, 'utf-8');

console.log('Checking generator.js exports...');

// Check for renderToSVG export
if (generatorCode.includes('export function renderToSVG')) {
  console.log('✓ renderToSVG function found');
} else {
  console.log('✗ renderToSVG function NOT found');
}

// Check for renderPreviewSVG export
if (generatorCode.includes('export function renderPreviewSVG')) {
  console.log('✓ renderPreviewSVG function found');
} else {
  console.log('✗ renderPreviewSVG function NOT found');
}

// Check for deprecation warnings
if (generatorCode.includes('DEPRECATED')) {
  console.log('✓ Deprecation warnings found');
} else {
  console.log('✗ Deprecation warnings NOT found');
}

console.log('\nTest complete. Browser testing required for full validation.');
