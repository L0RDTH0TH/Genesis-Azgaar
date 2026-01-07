# Bundle and Render API Config Exposure Report

## 1. Overview

This report analyzes the current state of the Azgaar Genesis bundle (`dist/azgaar-genesis.esm.js`) and identifies issues preventing render configuration functions (`getDefaultRenderConfig`, `mergeRenderConfig`, `getOriginalRenderConfig`) from being properly exposed and functioning correctly. The goal is to ensure the bundle includes these functions with the latest parchment-style defaults and that they work correctly when imported from the bundle.

### Problem Statement

Despite successful exports in source code (`src/index.js`) and successful bundle builds, the render configuration functions may not be working correctly when imported from the bundle. Users report that parchment-style rendering is not being applied, suggesting that either:

1. The bundle's internal `mergeRenderConfig` uses outdated defaults
2. The functions are not properly exported/accessible
3. Config passing through the rendering pipeline is broken
4. Browser caching is serving old bundle versions

## 2. Current Bundle State

### 2.1 Source Code Analysis

**`src/index.js`** (Lines 26-30):
```javascript
// Render configuration exports
export { 
  getDefaultRenderConfig, 
  getOriginalRenderConfig, 
  mergeRenderConfig 
} from './rendering/config.js';
```
✅ **Status**: Exports are correctly defined in source

**`src/rendering/config.js`**:
- ✅ `defaultRenderConfig` exported (parchment-style defaults)
- ✅ `getDefaultRenderConfig()` function exported (returns deep copy)
- ✅ `mergeRenderConfig()` function exported (with full config detection)
- ✅ `getOriginalRenderConfig()` function exported

### 2.2 Bundle Analysis

**Bundle Export Structure** (`dist/azgaar-genesis.esm.js`, Line 10411):
```javascript
export {
  // ... other exports ...
  getDefaultRenderConfig,
  getOriginalRenderConfig,
  mergeRenderConfig,
  // ... more exports ...
};
```
✅ **Status**: Functions ARE exported in the bundle

**Function Definitions in Bundle**:
- Line 8520: `function mergeRenderConfig(...)`
- Line 8551: `function getDefaultRenderConfig()`
- Line 8554: `function getOriginalRenderConfig()`
- ✅ **Status**: Functions ARE included in bundle

**`defaultRenderConfig` in Bundle** (Line 8324):
```javascript
const defaultRenderConfig = {
  oceanBase: "#d2b48c",  // ✅ Parchment tan color
  // ... rest of config ...
};
```
✅ **Status**: Parchment defaults ARE in bundle

### 2.3 Example HTML Import Strategy

**`examples/parchment-rendering.html`** (Lines 160-177):
- Imports bundle for core functions (`../dist/azgaar-genesis.esm.js`)
- **Workaround**: Imports config functions directly from source (`../src/rendering/config.js`)
- Reason: "bundle may not have these exports or may have outdated config"

⚠️ **Issue**: This workaround suggests uncertainty about bundle exports, even though bundle DOES export these functions.

## 3. Issues Identified

### Issue #1: Internal `mergeRenderConfig` Call May Use Stale Defaults

**Location**: `src/rendering/svg.js` (Line 1829)

**Problem**: When `renderMapSVG` is called from the bundle, it uses the bundle's internal `mergeRenderConfig` function. If a partial config is passed, `mergeRenderConfig` merges it with `defaultRenderConfig`, which SHOULD be the latest parchment defaults, but:

1. If bundle was built before latest config changes, it has old defaults
2. Even if bundle has latest defaults, the merge logic might override user-provided full configs

**Code Flow**:
```javascript
// In svg.js (bundled)
renderMapSVG(data, options = {}) {
  let renderConfig;
  if (options.renderConfig && /* full config check */) {
    renderConfig = options.renderConfig;  // Direct use (good)
  } else {
    renderConfig = mergeRenderConfig(options.renderConfig || {});  
    // ^ Uses bundle's mergeRenderConfig with bundle's defaultRenderConfig
  }
}
```

**Impact**: Medium - Only affects partial configs, but full configs should bypass this

### Issue #2: Example Uses Source Import Instead of Bundle Export

**Location**: `examples/parchment-rendering.html` (Lines 163-177)

**Problem**: The example bypasses bundle exports and imports directly from source:
```javascript
const configModule = await import('../src/rendering/config.js');
getDefaultRenderConfig = configModule.getDefaultRenderConfig;
```

**Impact**: High - This suggests the bundle exports weren't trusted, even though they exist. This creates inconsistency:
- Users following the example will use source imports
- Users importing from bundle get different behavior
- Source imports require import maps for dependencies (d3, etc.)

### Issue #3: Diagnostic Logs Not Appearing

**Observation**: Despite added logging in `svg.js`, diagnostic logs like `[renderMapSVG] Config check:` are not appearing in browser console when using the bundle.

**Possible Causes**:
1. Browser caching old bundle version
2. Logs being stripped/minified (unlikely, non-minified build)
3. Code path not executing (but rendering works, so unlikely)

**Impact**: Medium - Prevents debugging and verification

### Issue #4: No Explicit Verification of Bundle Exports

**Problem**: There's no automated test or verification that:
1. Bundle exports include render config functions
2. Exported functions work correctly
3. Exported functions use latest defaults

**Impact**: Low - Manual verification exists, but automated would be better

## 4. Recommended Adjustments

### Fix #1: Ensure Bundle Always Has Latest Config

**Action**: 
1. Verify bundle rebuild includes latest `defaultRenderConfig`
2. Add build-time verification that bundle has parchment defaults
3. Update build script to warn if config is outdated

**Implementation**:
- Add a build verification step that checks `dist/azgaar-genesis.esm.js` contains `oceanBase: "#d2b48c"`
- Add timestamp/comments in config.js indicating last update

### Fix #2: Update Example to Use Bundle Exports

**Action**: 
1. Change `parchment-rendering.html` to import config functions from bundle
2. Remove direct source import workaround
3. Add fallback only if bundle import fails

**Implementation**:
```javascript
// Try bundle first (preferred)
try {
  const lib = await import('../dist/azgaar-genesis.esm.js');
  getDefaultRenderConfig = lib.getDefaultRenderConfig;
  getOriginalRenderConfig = lib.getOriginalRenderConfig;
  mergeRenderConfig = lib.mergeRenderConfig;
  console.log('Render config functions imported from bundle');
} catch (error) {
  // Fallback to source only if bundle fails
  const configModule = await import('../src/rendering/config.js');
  // ...
}
```

### Fix #3: Add Export Verification to Build Process

**Action**:
1. Add post-build script that verifies bundle exports
2. Check that all expected exports are present
3. Verify config functions return expected values

**Implementation**:
- Create `scripts/verify-bundle-exports.js`
- Run after build to check exports
- Fail build if critical exports missing

### Fix #4: Improve Config Passing Robustness

**Action**:
1. Ensure `renderMapSVG` always prioritizes user-provided full configs
2. Add more defensive checks in `mergeRenderConfig`
3. Document expected config structure

**Implementation**:
- Already implemented in `mergeRenderConfig` (full config detection)
- Add JSDoc with config structure examples
- Add runtime validation warnings

### Fix #5: Add Bundle Version/Timestamp

**Action**:
1. Include build timestamp in bundle
2. Export version info
3. Help identify if bundle is stale

**Implementation**:
- Add `__BUILD_TIME__` constant in bundle
- Export `getBuildInfo()` function
- Display in examples

## 5. Implementation Steps

### Step 1: Update Example HTML to Prefer Bundle Exports

1. Modify `examples/parchment-rendering.html`
2. Change import strategy to prefer bundle
3. Keep source import as fallback only
4. Test both paths

### Step 2: Add Bundle Export Verification Script

1. Create `scripts/verify-bundle-exports.js`
2. Check for expected exports
3. Verify config function behavior
4. Integrate into build process (optional)

### Step 3: Add Build-Time Config Verification

1. Add simple check in build script
2. Verify parchment defaults in bundle
3. Warn if outdated

### Step 4: Rebuild Bundle

1. Run `npm run build:dev`
2. Verify bundle includes latest changes
3. Check file timestamps

### Step 5: Update Simple Test to Use Bundle

1. Modify `examples/simple-parchment-test.html`
2. Remove direct source imports (use bundle)
3. Add proper import map for dependencies
4. Test rendering

### Step 6: Test and Verify

1. Clear browser cache completely
2. Test `parchment-rendering.html` with bundle imports
3. Verify diagnostic logs appear
4. Verify parchment style applies correctly
5. Capture screenshots

## 6. Verification Plan

### 6.1 Bundle Export Verification

**Test**: Verify bundle exports render config functions
```javascript
import * as lib from '../dist/azgaar-genesis.esm.js';
console.assert(typeof lib.getDefaultRenderConfig === 'function');
console.assert(typeof lib.mergeRenderConfig === 'function');
console.assert(typeof lib.getOriginalRenderConfig === 'function');
```

**Expected**: All assertions pass

### 6.2 Config Defaults Verification

**Test**: Verify bundle's default config has parchment values
```javascript
const config = lib.getDefaultRenderConfig();
console.assert(config.colors.oceanBase === '#d2b48c');
console.assert(config.effects.parchment.enabled === true);
console.assert(config.layers.relief.density === 1.2);
```

**Expected**: All assertions pass

### 6.3 Rendering Verification

**Test**: Render map with bundle's config functions
1. Generate map with seed 42
2. Get default config from bundle
3. Render with that config
4. Verify rendered SVG has:
   - Ocean color: `#d2b48c` (tan)
   - Texture overlay present
   - Relief icons with shadows
   - Coast outline present

**Expected**: All visual elements match parchment style

### 6.4 Console Logs Verification

**Test**: Verify diagnostic logs appear
1. Open browser console
2. Generate and render map
3. Check for logs:
   - `[renderMapSVG] Config check:`
   - `[renderMapSVG] Using ocean color:`
   - `[renderMapSVG] Relief config:`
   - `[renderMapSVG] Rivers config:`

**Expected**: All diagnostic logs appear

### 6.5 Comparison Test

**Test**: Compare bundle vs source imports
1. Render with bundle config functions
2. Render with source config functions
3. Compare rendered SVGs
4. Verify they match exactly

**Expected**: Both produce identical output

## 7. Conclusion

The bundle **DOES** export render config functions and **DOES** include parchment defaults. However, the example HTML uses source imports instead of bundle exports, creating inconsistency. The main issues are:

1. **Trust Issue**: Example doesn't trust bundle exports (but should)
2. **Verification Gap**: No automated verification that bundle is up-to-date
3. **Cache Issue**: Browser caching may serve old bundle versions

**Recommended Priority**:
1. **High**: Update example to use bundle exports (Fix #2)
2. **Medium**: Add bundle verification script (Fix #3)
3. **Medium**: Improve diagnostic logging visibility (Fix #3)
4. **Low**: Add build timestamp (Fix #5)

Once fixes are applied, users should be able to reliably import and use render config functions from the bundle, and parchment-style rendering should work correctly.
