#!/usr/bin/env node

/**
 * Verify bundle exports for render config functions
 * Checks that dist/azgaar-genesis.esm.js includes expected exports
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = join(__dirname, '..');
const bundlePath = join(repoRoot, 'dist', 'azgaar-genesis.esm.js');

console.log('🔍 Verifying bundle exports...\n');

try {
  const bundleContent = readFileSync(bundlePath, 'utf-8');
  
  // Check 1: Verify render config functions are exported
  console.log('1. Checking exports...');
  const requiredExports = [
    'getDefaultRenderConfig',
    'getOriginalRenderConfig',
    'mergeRenderConfig'
  ];
  
  const exportsPresent = requiredExports.every(exp => {
    const inExportList = bundleContent.includes(`  ${exp},`) || bundleContent.includes(`  ${exp}`);
    const hasFunction = bundleContent.includes(`function ${exp}(`);
    return inExportList && hasFunction;
  });
  
  if (!exportsPresent) {
    console.error('❌ FAILED: Some render config exports missing!');
    requiredExports.forEach(exp => {
      const inExportList = bundleContent.includes(`  ${exp},`) || bundleContent.includes(`  ${exp}`);
      const hasFunction = bundleContent.includes(`function ${exp}(`);
      console.log(`   ${exp}: export=${inExportList ? '✓' : '✗'}, function=${hasFunction ? '✓' : '✗'}`);
    });
    process.exit(1);
  }
  console.log('   ✅ All render config exports present');
  
  // Check 2: Verify parchment defaults are in bundle
  console.log('\n2. Checking parchment defaults...');
  const parchmentChecks = [
    { key: 'oceanBase.*#d2b48c', value: true, name: 'Ocean color (parchment tan)', regex: true },
    { key: 'parchment', value: 'enabled', name: 'Parchment effect enabled' },
    { key: 'pergamena-small.jpg', value: true, name: 'Parchment texture URL' },
    { key: 'density.*1.2', value: true, name: 'Relief density multiplier', regex: true },
    { key: 'coast', value: true, name: 'Coast layer config', optional: true }
  ];
  
  let allDefaultsPresent = true;
  parchmentChecks.forEach(check => {
    let found;
    if (check.regex) {
      const regex = new RegExp(check.key);
      found = regex.test(bundleContent);
    } else {
      found = bundleContent.includes(check.key);
    }
    
    if (found) {
      console.log(`   ✅ ${check.name}`);
    } else if (check.optional) {
      console.log(`   ⚠️  ${check.name} - Not found (optional)`);
    } else {
      console.error(`   ❌ ${check.name} - NOT FOUND`);
      allDefaultsPresent = false;
    }
  });
  
  if (!allDefaultsPresent) {
    console.error('\n❌ FAILED: Parchment defaults may be missing from bundle!');
    console.error('   Run: npm run build:dev');
    process.exit(1);
  }
  
  // Check 3: Verify defaultRenderConfig object exists
  console.log('\n3. Checking defaultRenderConfig object...');
  const hasDefaultConfig = bundleContent.includes('const defaultRenderConfig = {') ||
                          bundleContent.includes('defaultRenderConfig = {');
  if (!hasDefaultConfig) {
    console.error('   ❌ defaultRenderConfig object not found');
    process.exit(1);
  }
  console.log('   ✅ defaultRenderConfig object present');
  
  // Check 4: Verify mergeRenderConfig has full config detection
  console.log('\n4. Checking mergeRenderConfig logic...');
  const hasFullConfigCheck = bundleContent.includes('userConfig.colors') &&
                            bundleContent.includes('userConfig.layers') &&
                            bundleContent.includes('userConfig.effects');
  if (!hasFullConfigCheck) {
    console.warn('   ⚠️  Full config detection may be missing (not critical)');
  } else {
    console.log('   ✅ Full config detection present');
  }
  
  console.log('\n✅ All bundle verification checks passed!');
  console.log('   Bundle is ready for use.\n');
  
} catch (error) {
  if (error.code === 'ENOENT') {
    console.error(`❌ Bundle not found: ${bundlePath}`);
    console.error('   Run: npm run build:dev');
  } else {
    console.error('❌ Error verifying bundle:', error.message);
  }
  process.exit(1);
}
