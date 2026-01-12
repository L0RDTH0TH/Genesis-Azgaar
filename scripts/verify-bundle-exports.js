#!/usr/bin/env node

/**
 * Verify bundle exports for render config functions
 * 
 * This script ensures the bundle always includes latest render config exports
 * and parchment defaults. It prevents staleness by checking post-rebuild and
 * failing the build if issues are found.
 * 
 * Checks performed:
 * 1. Exports exist as callable functions (prevents missing exports)
 * 2. Parchment defaults are correct at runtime (prevents outdated defaults)
 * 3. All critical config values match expected parchment style
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
  // First, verify bundle file exists
  const bundleContent = readFileSync(bundlePath, 'utf-8');
  
  // Check 1: Verify render config functions are exported as functions
  // This prevents cases where exports exist but aren't callable
  console.log('1. Checking exports exist and are functions...');
  const requiredExports = [
    'getDefaultRenderConfig',
    'getOriginalRenderConfig',
    'mergeRenderConfig'
  ];
  
  // Dynamic import the bundle to test actual runtime behavior
  const bundle = await import(`file://${bundlePath}`);
  
  let allExportsValid = true;
  requiredExports.forEach(exportName => {
    if (typeof bundle[exportName] !== 'function') {
      console.error(`   ❌ Missing or invalid export: ${exportName}`);
      console.error(`      Expected: function, Got: ${typeof bundle[exportName]}`);
      allExportsValid = false;
    } else {
      console.log(`   ✅ ${exportName} - function available`);
    }
  });
  
  if (!allExportsValid) {
    console.error('\n❌ FAILED: Some render config exports missing or invalid!');
    process.exit(1);
  }
  
  // Check 2: Verify parchment defaults are correct at runtime
  // This ensures the bundle has the latest config values, not stale ones
  // Critical for preventing bundle default override issues
  console.log('\n2. Verifying parchment defaults at runtime...');
  
  const config = bundle.getDefaultRenderConfig();
  
  // Define expected parchment defaults (prevents staleness)
  const expectedDefaults = {
    'colors.oceanBase': { value: '#d2b48c', description: 'Ocean color (parchment tan)' },
    'effects.parchment.enabled': { value: true, description: 'Parchment effect enabled' },
    'effects.pseudo3D.enabled': { value: true, description: 'Pseudo-3D shadows enabled' },
    'layers.relief.density': { value: 1.2, description: 'Relief density multiplier' },
    'layers.coast.enabled': { value: true, description: 'Coast outline enabled' }
  };
  
  let allDefaultsValid = true;
  
  for (const [key, expected] of Object.entries(expectedDefaults)) {
    // Navigate nested object path
    const keys = key.split('.');
    let actual = config;
    for (const k of keys) {
      actual = actual?.[k];
    }
    
    if (actual === expected.value) {
      console.log(`   ✅ ${expected.description}: ${JSON.stringify(actual)}`);
    } else {
      console.error(`   ❌ ${expected.description}`);
      console.error(`      Expected: ${JSON.stringify(expected.value)}`);
      console.error(`      Got: ${JSON.stringify(actual)}`);
      allDefaultsValid = false;
    }
  }
  
  if (!allDefaultsValid) {
    console.error('\n❌ FAILED: Parchment defaults do not match expected values!');
    console.error('   The bundle may have outdated defaults. Rebuild and verify source config.');
    process.exit(1);
  }
  
  // Check 3: Verify defaultRenderConfig object exists in source (string check)
  // Secondary verification that the config object is in the bundle code
  console.log('\n3. Verifying defaultRenderConfig object in bundle...');
  const hasDefaultConfig = bundleContent.includes('const defaultRenderConfig = {') ||
                          bundleContent.includes('defaultRenderConfig = {');
  if (!hasDefaultConfig) {
    console.error('   ❌ defaultRenderConfig object not found in bundle source');
    process.exit(1);
  }
  console.log('   ✅ defaultRenderConfig object present in bundle');
  
  // Check 4: Verify mergeRenderConfig has full config detection logic
  // Ensures Step 2 enhancements are present in bundle
  console.log('\n4. Verifying mergeRenderConfig full config detection...');
  const hasFullConfigCheck = bundleContent.includes('isFullConfig') ||
                            (bundleContent.includes('userConfig.colors') &&
                             bundleContent.includes('userConfig.layers') &&
                             bundleContent.includes('userConfig.effects'));
  if (!hasFullConfigCheck) {
    console.warn('   ⚠️  Full config detection may be missing (not critical but recommended)');
  } else {
    console.log('   ✅ Full config detection logic present');
  }
  
  console.log('\n✅ Bundle verification passed ✓');
  console.log('   Bundle is ready for use.\n');
  
} catch (error) {
  if (error.code === 'ENOENT') {
    console.error(`❌ Bundle not found: ${bundlePath}`);
    console.error('   Run: npm run build:dev');
  } else if (error.code === 'ERR_MODULE_NOT_FOUND') {
    console.error(`❌ Bundle module could not be loaded: ${bundlePath}`);
    console.error('   Error:', error.message);
    console.error('   Ensure bundle was built successfully.');
  } else {
    console.error('❌ Error verifying bundle:', error.message);
    if (error.stack) {
      console.error('   Stack:', error.stack.split('\n').slice(0, 3).join('\n'));
    }
  }
  process.exit(1);
}
