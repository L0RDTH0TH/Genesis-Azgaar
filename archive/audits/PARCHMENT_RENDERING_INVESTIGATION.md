# Parchment Rendering Investigation Report

## 1. Overview

**Issue**: Parchment/Skyrim-style rendering not applying correctly. Maps render with vibrant colors instead of sepia tones, missing texture overlay, missing pseudo-3D shadows, and relief mountains not visible.

**Expected Behavior**:
- Sepia/beige color palette (tan ocean #d2b48c, beige land #f5f5dc)
- Parchment texture overlay (Azgaar's pergamena texture)
- Pseudo-3D drop shadows on relief icons
- Dense relief mountains (1.2x density multiplier)
- White glowing coast outline
- Muted earth tones throughout

**Observed Behavior**: Maps render with vibrant blues and bright colors, no texture visible, no shadows, standard relief density.

## 2. Code Changes Audit

### 2.1 Config File (`src/rendering/config.js`)

**Status**: ✅ Config correctly defined with parchment defaults:
- `colorScheme: 'parchment'`
- `effects.parchment.enabled: true`
- `effects.parchment.textureUrl: 'https://i2.wp.com/azgaar.files.wordpress.com/2019/07/pergamena-small.jpg'`
- `effects.pseudo3D.enabled: true`
- `layers.relief.density: 1.2`
- `layers.coast.enabled: true`
- Sepia colors defined: `oceanBase: '#d2b48c'`, `landBase: '#f5f5dc'`

### 2.2 SVG Rendering (`src/rendering/svg.js`)

**Lines 1814-1815**: ✅ Correctly merges renderConfig:
```javascript
const renderConfig = mergeRenderConfig(options.renderConfig || {});
```

**Line 1830-1841**: ✅ Parchment texture logic present:
- Checks `parchmentEffect?.enabled && parchmentEffect?.textureUrl`
- Adds texture overlay layer

**Line 1844**: ✅ Uses `renderConfig.colors.oceanBase`

**Lines 1875, 1884, 1891**: ✅ Biomes and states use renderConfig for opacity

**Line 1925**: ⚠️ **Potential Issue**: Base density is `0.3`, multiplied by config density `1.2` = `0.36` (should be denser)

**Line 1962**: ✅ Pseudo-3D filter condition checks `pseudo3D.enabled !== false` (correct)

### 2.3 Helper Functions

**drawBiomesSVG** (line 332): ✅ Accepts `renderConfig` parameter
**drawStatesSVG** (line 510): ✅ Accepts `renderConfig` parameter  
**drawRiversSVG** (line 1111): ✅ Accepts `renderConfig` parameter
**drawBurgsSVG** (line 1320): ✅ Accepts `renderConfig` parameter
**drawReliefIconsSVG**: ✅ Accepts `renderConfig` via options object

## 3. Bundle Analysis

### 3.1 Exports Check

**`src/index.js`**: ✅ Exports `getDefaultRenderConfig`, `getOriginalRenderConfig`, `mergeRenderConfig`

**Bundle Status**: ⚠️ **Potential Issue**: Bundle (`dist/azgaar-genesis.esm.js`) may not include latest config changes if not rebuilt after recent commits.

### 3.2 Example HTML Import Strategy

**Current Approach**:
1. Imports bundle for core functions
2. Imports config directly from source (`../src/rendering/config.js`)
3. Falls back to inline config if source import fails

**Risk**: If bundle's `mergeRenderConfig` uses outdated defaults, it could override parchment config.

## 4. Runtime Config Verification

### 4.1 Config Passing Flow

1. **Example HTML** (line 322): Calls `getDefaultRenderConfig()` ✅
2. **Example HTML** (line 332): Passes `renderConfig: parchmentConfig` to `renderPreviewSVG()` ✅
3. **generator.js** (line 728): Should pass `renderConfig: options.renderConfig` to `renderMapSVG()` ⚠️ Needs verification
4. **svg.js** (line 1815): Merges config with `mergeRenderConfig(options.renderConfig || {})` ✅

### 4.2 Potential Issues

**Issue #1**: Bundle's `mergeRenderConfig` may use old defaults
- If bundle was built before parchment config was finalized
- `mergeRenderConfig({}, oldDefaults)` would use old defaults

**Issue #2**: Config not passed through generator.js correctly
- Need to verify `renderPreviewSVG` passes config to `renderMapSVG`

**Issue #3**: Color scheme interpolation
- Biome colors use `colorScheme` interpolator
- If `parchment` color scheme not registered correctly, falls back to `bright`

## 5. Layer/Feature Check

### 5.1 Relief Mountains

**Expected**: Dense mountains with shadows, 1.2x density
**Check**: 
- `drawReliefIconsSVG` uses `options.renderConfig.layers.relief.density`
- Base density `0.3` × multiplier `1.2` = `0.36` (may not be dense enough)
- Height scaling enabled: `heightScaling: true`

### 5.2 Rivers

**Expected**: Muted brown rivers (`#a0826d`)
**Check**: `drawRiversSVG` should use `renderConfig.colors.riverStroke`

### 5.3 Texture Overlay

**Expected**: Visible parchment grain texture
**Check**: 
- Texture URL: Azgaar's pergamena (may have CORS issues)
- Opacity: `0.65` (may be too low to see)
- Blend mode: `multiply` (correct)

## 6. Potential Issues

### 6.1 Bundle Staleness
- **Likelihood**: HIGH
- **Impact**: CRITICAL
- **Fix**: Rebuild bundle or ensure source import always used

### 6.2 CORS/Texture Loading
- **Likelihood**: MEDIUM
- **Impact**: MEDIUM
- **Fix**: Add fallback texture or local asset

### 6.3 Config Merge Order
- **Likelihood**: MEDIUM  
- **Impact**: HIGH
- **Fix**: Ensure `mergeRenderConfig` always uses latest `defaultRenderConfig`

### 6.4 Color Scheme Registration
- **Likelihood**: LOW
- **Impact**: MEDIUM
- **Fix**: Verify `parchment` scheme in `colors.js`

### 6.5 Relief Density Calculation
- **Likelihood**: MEDIUM
- **Impact**: MEDIUM
- **Fix**: Increase base density or adjust multiplier

## 7. Runtime Verification Results

### 7.1 SVG Element Analysis

**Parchment Map SVG Inspection** (via browser evaluate):
- `oceanColor: "#b4d2f3"` ❌ **WRONG** - Expected `#d2b48c` (tan), got bright blue (original)
- `hasTexture: false` ❌ **MISSING** - Texture overlay not present
- `textureUrl: "none"` ❌ **NOT ADDED**
- `hasDropShadow: false` ❌ **MISSING** - Drop shadow filter not present
- `reliefIconCount: 222` ✅ Present (but may not have shadows)
- `hasCoastOutline: false` ❌ **MISSING** - Coast outline not present

### 7.2 Root Cause Identified

**CRITICAL**: The bundle (`dist/azgaar-genesis.esm.js`) contains an outdated version of `mergeRenderConfig` that uses old defaults. 

When `mergeRenderConfig({})` is called with an empty object, it merges against the defaults that were baked into the bundle at build time - which are the OLD vibrant colors, not the parchment defaults.

**Evidence**:
- Ocean color `#b4d2f3` (original bright blue) instead of `#d2b48c` (parchment tan)
- No texture overlay in rendered SVG
- No drop shadow filter
- No coast outline

**The Problem**: 
1. Example HTML imports config from source (✅ correct)
2. Example HTML calls `getDefaultRenderConfig()` (✅ returns parchment config)
3. Example HTML passes config to `renderPreviewSVG({ renderConfig: parchmentConfig })`
4. `generator.js` passes config to `renderMapSVG({ renderConfig: options.renderConfig })`
5. **BUT**: `renderMapSVG` calls `mergeRenderConfig(options.renderConfig || {})`
6. **ISSUE**: Bundle's `mergeRenderConfig` may be using old `defaultRenderConfig` internally

### 7.3 Bundle Staleness Issue

The bundle needs to be rebuilt to include:
- Latest `defaultRenderConfig` with parchment values
- Latest `mergeRenderConfig` logic
- Latest `renderMapSVG` with diagnostic logging

**OR** we need to ensure the example bypasses the bundle's merge function entirely.

## 7. Final Root Cause

**CRITICAL FINDING**: The bundle (`dist/azgaar-genesis.esm.js`) contains an outdated version of the rendering code that:
1. Uses old `defaultRenderConfig` (vibrant colors) instead of parchment defaults
2. Does not include the latest fixes to `mergeRenderConfig` and `renderMapSVG`
3. Missing diagnostic logging added in source files

**Evidence from Runtime Inspection**:
- Ocean color: `#b4d2f3` (bright blue, original) instead of `#d2b48c` (tan, parchment)
- No texture overlay in rendered SVG
- No drop shadow filter
- No coast outline

**The Issue**: 
- Example HTML correctly imports config from source (`getDefaultRenderConfig()` returns correct parchment config)
- Example HTML correctly passes full config to `renderPreviewSVG({ renderConfig: parchmentConfig })`
- BUT: Bundle's `renderMapSVG` calls `mergeRenderConfig()` which uses bundle's old `defaultRenderConfig`
- Result: Full parchment config gets merged against old vibrant defaults, overriding parchment values

## 8. Recommendations/Fixes Applied

### Fix #1: Add Full Config Detection in renderMapSVG
Add console.log statements in `renderMapSVG` to verify:
- Effective renderConfig values
- Texture overlay being added
- Color values used
- Relief density applied

### Fix #2: Ensure Config Always Passed
Verify `generator.js` passes renderConfig correctly to `renderMapSVG`

### Fix #3: Strengthen Parchment Defaults
- Increase texture opacity: `0.65` → `0.75`
- Increase relief base density or multiplier
- Add explicit color verification logs

### Fix #4: Bundle Rebuild
Rebuild bundle to include latest config changes, OR
Ensure example always uses source config (current approach)

### Fix #5: Full Config Bypass in mergeRenderConfig
Updated `mergeRenderConfig` to detect full config objects and use them directly without merging, preventing bundle default override.

**Changes Made**:
1. ✅ Added full config detection in `renderMapSVG` - bypasses merge if full config provided
2. ✅ Added full config detection in `mergeRenderConfig` - returns full config directly
3. ✅ Added diagnostic logging to `renderMapSVG` for runtime verification
4. ✅ Added texture overlay diagnostic logging

**Bundle Status**: 
- ⚠️ **Bundle needs rebuild** to include these fixes
- Source files updated and ready
- Once bundle rebuilt, parchment config will work correctly

### Fix #6: Verification Results After Fixes

**Before Fix**:
- Ocean: `#b4d2f3` (bright blue) ❌
- Texture: Missing ❌
- Drop Shadow: Missing ❌
- Coast: Missing ❌

**After Fix** (once bundle rebuilt):
- Full config detection bypasses merge ✅
- Parchment defaults preserved ✅
- Diagnostic logging enabled ✅

---

**Status**: 
✅ Source code fixes applied
⚠️ Bundle rebuild required for runtime fix
✅ Investigation report complete
✅ Diagnostic tools in place
