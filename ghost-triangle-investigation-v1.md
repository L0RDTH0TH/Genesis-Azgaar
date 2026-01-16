# Ghost Triangle Investigation Report v1 – Invisible Survivors in Stage 3 Rendering

**Report Generated:** 2026-01-15  
**Author:** Edward (via Cursor analysis)  
**Status:** Active Investigation - Iteration 38

---

## Executive Summary

This investigation report documents the "ghost triangle" phenomenon: remaining triangles after Stage 3 dissolution that are **not being visually highlighted in red** despite clearly surviving the dissolution process. These invisible survivors appear as blue-outlined triangles (with 3 edges visible) but are not marked with the diagnostic red highlighting implemented in Iteration 36.

**Key Problem:**
- Some remaining triangles are rendered in blue (default quads color) instead of red (remaining triangles color)
- Visual count of red-highlighted triangles **underestimates** the true remaining triangle count
- Adjacent red + blue triangles share edges but were not dissolved, indicating missed merge opportunities

**Impact:**
- **Visual Analysis Inaccuracy:** Underestimation of remaining triangles leads to false confidence in dissolution completeness
- **Diagnostic Blindness:** Ghost triangles hide true dissolution incompleteness, making it harder to identify root causes
- **Debugging Confusion:** Mixed blue/red survivors suggest inconsistent state tracking (removed flags, type fields, or rendering logic)

**Root Cause Hypothesis:**
The ghost triangle phenomenon likely stems from one or more of:
1. **Type Field Loss:** Surviving triangles lose their `type: 'triangle'` field during/after dissolution
2. **Rendering Filter Mismatch:** Rendering logic checks `shape.type === 'triangle'` but survivors may have `type: undefined` or `type: 'quad'`
3. **Filtering Inconsistency:** `workingTriangles.filter(t => !t.removed)` used in rendering differs from dissolution logic
4. **Render Order Issue:** Blue quads drawn after red triangles, overwriting highlights
5. **Partial Removal State:** Some triangles in intermediate states (partially processed but not fully removed)

---

## 1. Problem Evidence

### 1.1 Visual Observations from Latest Screenshot

**From Stage 3: After Dissolution/Cull (zoomed border cluster analysis):**

**Expected Behavior:**
- All remaining triangles should be highlighted in red (thicker stroke, `stroke-width="3"`, `stroke="#ff0000"`)
- Tooltips showing vertex indices (e.g., `title="Triangle: [107,111,106]"`)

**Observed Behavior:**
- ✅ Many red-highlighted triangles correctly marked (28 visible with tooltips)
- ⚠️ **One or more blue triangles** (3 full blue edges visible) that behave like survivors:
  - Has not been merged (internal triangle structure still present)
  - Surrounded by red triangles and/or merged blue quads
  - Shares edges with red-highlighted triangles (indicating missed merge opportunity)
  - **Not highlighted in red** (rendered with default blue `stroke="#4488ff"`, `stroke-width="2"`)

**Example Ghost Triangle Pattern:**
- Blue triangle visible with vertices `[X, Y, Z]` (exact indices from screenshot analysis)
- Adjacent red triangle with vertices `[Y, Z, W]`
- Shared edge `Y-Z` exists but pair was not dissolved
- Both triangles should have been merged into a quad

**Visual Count Discrepancy:**
- **Red-highlighted count:** 28 triangles (tooltip-visible)
- **Total survivor count (from logs):** 28 triangles (`[dissolveEdgesToQuads] RESULT: 131 total shapes (103 quads, 28 triangles)`)
- **Ghost triangles:** Unknown (need diagnostic logging to count)

**Note:** Visual count matches log count (28), but this may be coincidental. Ghost triangles may exist but be hidden by render order or type mismatch.

### 1.2 Expected vs. Observed for Highlighted Survivors

**Expected (Iteration 36 Visual Debugging):**
```javascript
// All remaining triangles should be:
- Rendered with red stroke (`stroke="#ff0000"`)
- Thicker stroke width (`stroke-width="3"`)
- Tooltip showing vertex indices (`title="Triangle: [107,111,106]"`)
- Console logged: `[renderPipelineStage] ITERATION 36: Highlighted remaining triangle: [107,111,106]`
```

**Observed:**
- ✅ Red highlighting works for most survivors (28 visible)
- ⚠️ Some survivors rendered in blue (default quads color)
- ⚠️ No tooltip on blue survivors (indicates `isTriangle` check failed)
- ⚠️ No console log for blue survivors (indicates condition `quad.type === 'triangle' || quad.verts.length === 3` failed)

**Conclusion:** The rendering logic's condition for detecting remaining triangles is missing some survivors.

---

## 2. Code Areas to Investigate (Prioritized)

### 2.1 Rendering Logic in `generate-interactive-terrain.js` (HIGH PRIORITY)

**Location:** `scripts/generate-interactive-terrain.js` lines ~659-713 (Stage 3 rendering loop)

**Current Implementation:**
```javascript
// Stage 3: Quad outlines (blue) - like cull-triangles.jpg
if (stageKey === '3' && stage.data) {
  stage.data.forEach((quad, quadIdx) => {
    if (quad && quad.verts && Array.isArray(quad.verts) && quad.verts.length >= 3) {
      // ... vertex validation ...
      
      // ITERATION 36 FIX: Highlight remaining triangles in red for visual debugging
      const isTriangle = quad.type === 'triangle' || (quad.verts && quad.verts.length === 3);
      const strokeColor = isTriangle ? '#ff0000' : stage.color; // Red for triangles
      const strokeWidth = isTriangle ? '3' : '2'; // Thicker for triangles
      const path = renderVerts.map((v, i) => `${i === 0 ? 'M' : 'L'} ${v.x.toFixed(2)} ${v.y.toFixed(2)}`).join(' ') + ' Z';
      const titleAttr = isTriangle ? ` title="Triangle: [${quad.verts.join(',')}]" ` : '';
      layers.push(`<path d="${path}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}" opacity="0.9"${titleAttr} />`);
      if (isTriangle) {
        console.log(`[renderPipelineStage] ITERATION 36: Highlighted remaining triangle: [${quad.verts.join(',')}]`);
      }
    }
  });
}
```

**Issues to Investigate:**
1. **Condition Logic:** `quad.type === 'triangle' || (quad.verts && quad.verts.length === 3)`
   - What if `quad.type` is `undefined` but `quad.verts.length === 3`?
   - What if `quad.type` is `'quad'` but `quad.verts.length === 3` (invalid quad)?
   - Should we check `!quad.type || quad.type === 'triangle'` first?

2. **Data Source:** Where does `stage.data` come from?
   - Is it `pipelineStages.stage3_quads`?
   - Does it include all `remainingTriangles` or only `workingTriangles.filter(t => !t.removed)`?
   - Are triangles converted to quads representation somewhere?

3. **Shape Classification:** When is `type: 'triangle'` set?
   - During `dissolveEdgesToQuads()` return: `{ type: 'triangle', verts: [...] }`
   - But what if a triangle is partially processed and loses its type?

**Hypothesis:** Ghost triangles may have `type: undefined` or `type: 'quad'` despite having `verts.length === 3`, causing the condition to fail.

### 2.2 How `currentShapes` / `shapesToRender` is Built for Stage 3 (HIGH PRIORITY)

**Location:** `src/core/dualGridStates.js` lines ~2540-2552 (collecting remaining triangles)

**Current Implementation:**
```javascript
// Collect remaining triangles (not dissolved)
const remainingTriangles = workingTriangles
  .filter(t => !t.removed)
  .map(t => ({ type: 'triangle', verts: t.verts }));
```

**Issues to Investigate:**
1. **Filter Condition:** `t => !t.removed`
   - Are there triangles with `removed: false` but in intermediate states?
   - What if a triangle's `removed` flag is not set correctly during dissolution?

2. **Type Assignment:** `{ type: 'triangle', verts: t.verts }`
   - This explicitly sets `type: 'triangle'` for remaining triangles
   - But what if `t.verts` is modified during dissolution attempts?
   - What if `t.verts.length !== 3` for some survivors?

3. **Pipeline Stage Data:** How are `remainingTriangles` added to `pipelineStages.stage3_quads`?
   - Are they merged with dissolved quads?
   - Is there any type conversion or filtering before rendering?

**Hypothesis:** The `remainingTriangles` array may be correct, but somewhere between `dissolveEdgesToQuads()` return and `stage.data` rendering, the `type` field is lost or overwritten.

### 2.3 `workingTriangles.filter(t => !t.removed)` Usage in Rendering vs. Dissolution (MEDIUM PRIORITY)

**Location:** `src/core/dualGridStates.js` multiple locations

**Issues to Investigate:**
1. **Dissolution Logic:** Uses `workingTriangles.filter(t => !t.removed)` for edge map building
2. **Return Logic:** Uses `workingTriangles.filter(t => !t.removed)` for collecting remaining triangles
3. **Pipeline Stage Capture:** May use different filtering logic

**Hypothesis:** Inconsistent filtering between dissolution and rendering may cause some triangles to be included in edge map but excluded from rendering (or vice versa).

### 2.4 Type, Removed, or IsRemaining Flags Set During/After `dissolveEdgesToQuads()` (MEDIUM PRIORITY)

**Location:** `src/core/dualGridStates.js` lines ~2514-2553 (return logic)

**Current Implementation:**
```javascript
// Collect remaining triangles (not dissolved)
const remainingTriangles = workingTriangles
  .filter(t => !t.removed)
  .map(t => ({ type: 'triangle', verts: t.verts }));

// Return quads + remaining triangles
return [...quads, ...remainingTriangles];
```

**Issues to Investigate:**
1. **Quads Array:** What `type` field do dissolved quads have?
   - Are they `{ type: 'quad', verts: [...] }`?
   - What if a merge fails and a triangle is added to `quads` array instead of `remainingTriangles`?

2. **Mixed Array:** `[...quads, ...remainingTriangles]`
   - Does this preserve type fields correctly?
   - What if `quads` array contains triangles (failed merge attempts)?

3. **Pipeline Stage Capture:** When is `pipelineStages.stage3_quads` set?
   - Does it use the return value directly?
   - Is there any filtering or transformation?

**Hypothesis:** Some triangles may end up in the `quads` array instead of `remainingTriangles`, causing them to be rendered as blue quads instead of red triangles.

### 2.5 Post-Dissolution Shape Classification Logic (LOW PRIORITY)

**Location:** `src/core/dualGridStates.js` lines ~499-529 (pipeline stage capture)

**Issues to Investigate:**
1. **Stage 3 Capture:** How are shapes classified for `pipelineStages.stage3_quads`?
2. **Type Preservation:** Is the `type` field preserved through the pipeline?
3. **Validation:** Are there any validation checks that change `type` fields?

**Hypothesis:** Post-dissolution classification logic may incorrectly classify some remaining triangles as quads.

---

## 3. Diagnostic Additions to Recommend

### 3.1 Console Logging Before Stage 3 Render (URGENT)

**Location:** `scripts/generate-interactive-terrain.js` before Stage 3 rendering loop

**Recommended Code:**
```javascript
// GHOST HUNT: Diagnostic logging before Stage 3 render
if (stageKey === '3' && stage.data) {
  // Count potential remaining triangles (3-vert shapes)
  const survivors = stage.data.filter(shape => 
    shape && shape.verts && Array.isArray(shape.verts) && shape.verts.length === 3
  );
  console.log(`[GHOST HUNT] ${survivors.length} potential remaining triangles (3-vert shapes) in stage.data`);
  
  // Log detailed info for each survivor
  survivors.forEach((shape, i) => {
    console.log(`[GHOST HUNT] Survivor ${i}: verts=[${shape.verts.join(',')}], type=${shape.type || 'undefined'}, removed=${shape.removed || 'N/A'}`);
  });
  
  // Count by type
  const byType = survivors.reduce((acc, shape) => {
    const type = shape.type || 'undefined';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});
  console.log(`[GHOST HUNT] Survivors by type:`, byType);
}
```

**Expected Output:**
```
[GHOST HUNT] 28 potential remaining triangles (3-vert shapes) in stage.data
[GHOST HUNT] Survivor 0: verts=[107,111,106], type=triangle, removed=N/A
[GHOST HUNT] Survivor 1: verts=[121,85,107], type=triangle, removed=N/A
...
[GHOST HUNT] Survivors by type: { triangle: 28 }
```

**If Ghost Triangles Exist:**
```
[GHOST HUNT] 30 potential remaining triangles (3-vert shapes) in stage.data
[GHOST HUNT] Survivor 28: verts=[X,Y,Z], type=undefined, removed=N/A  <-- GHOST!
[GHOST HUNT] Survivor 29: verts=[A,B,C], type=quad, removed=N/A      <-- GHOST!
[GHOST HUNT] Survivors by type: { triangle: 28, undefined: 1, quad: 1 }
```

### 3.2 Force-Highlight All 3-Vert Non-Removed Shapes in Red (HIGH PRIORITY)

**Location:** `scripts/generate-interactive-terrain.js` Stage 3 rendering loop

**Recommended Code:**
```javascript
// ITERATION 38 FIX: Force-highlight all 3-vert shapes in red, regardless of type
const vertCount = quad.verts ? quad.verts.length : 0;
const is3VertShape = vertCount === 3;
const isTriangleType = quad.type === 'triangle';
const isTriangle = isTriangleType || is3VertShape; // ITERATION 38: More aggressive detection

if (is3VertShape && !isTriangleType) {
  // GHOST DETECTED: 3-vert shape without type='triangle'
  console.warn(`[GHOST HUNT] Ghost triangle detected: verts=[${quad.verts.join(',')}], type=${quad.type || 'undefined'}`);
}

const strokeColor = isTriangle ? '#ff0000' : stage.color; // Red for triangles (force)
const strokeWidth = isTriangle ? '3' : '2'; // Thicker for triangles
const titleAttr = isTriangle ? ` title="Triangle: [${quad.verts.join(',')}] (type=${quad.type || 'undefined'})" ` : '';
layers.push(`<path d="${path}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}" opacity="0.9"${titleAttr} />`);
```

**Impact:** This will catch ghost triangles even if `type` field is missing or incorrect.

### 3.3 Separate Purple Highlight Pass for Uncaught 3-Vert Shapes (MEDIUM PRIORITY)

**Location:** `scripts/generate-interactive-terrain.js` after Stage 3 rendering loop

**Recommended Code:**
```javascript
// ITERATION 38 FIX: Purple highlight pass for uncaught 3-vert shapes
if (stageKey === '3' && stage.data) {
  // ... existing rendering ...
  
  // Second pass: Purple highlight for shapes that should be triangles but weren't caught
  stage.data.forEach((shape, idx) => {
    if (shape && shape.verts && Array.isArray(shape.verts) && shape.verts.length === 3) {
      const isTriangleType = shape.type === 'triangle';
      if (!isTriangleType) {
        // This is a ghost triangle - highlight in purple
        const verts = shape.verts.map(vIdx => {
          const p = centeredPoints[vIdx];
          return p && isFinite(p.x) && isFinite(p.y) ? p : null;
        }).filter(v => v !== null);
        
        if (verts.length === 3) {
          const path = verts.map((v, i) => `${i === 0 ? 'M' : 'L'} ${v.x.toFixed(2)} ${v.y.toFixed(2)}`).join(' ') + ' Z';
          layers.push(`<path d="${path}" fill="none" stroke="#ff00ff" stroke-width="4" opacity="0.8" 
            title="GHOST: [${shape.verts.join(',')}] (type=${shape.type || 'undefined'})" 
            stroke-dasharray="5,5" />`);
          console.warn(`[GHOST HUNT] Ghost triangle rendered in purple: verts=[${shape.verts.join(',')}], type=${shape.type || 'undefined'}`);
        }
      }
    }
  });
}
```

**Visual Impact:** Purple dashed outline will clearly distinguish ghost triangles from normal red-highlighted survivors.

### 3.4 Pre-Dissolution Survivor Count Logging (MEDIUM PRIORITY)

**Location:** `src/core/dualGridStates.js` before `dissolveEdgesToQuads()` return

**Recommended Code:**
```javascript
// Collect remaining triangles (not dissolved)
const remainingTriangles = workingTriangles
  .filter(t => !t.removed)
  .map(t => ({ type: 'triangle', verts: t.verts }));

// GHOST HUNT: Log remaining triangles with type verification
console.log(`[GHOST HUNT] Pre-return: ${remainingTriangles.length} remaining triangles`);
remainingTriangles.forEach((tri, i) => {
  if (!tri.type || tri.type !== 'triangle') {
    console.warn(`[GHOST HUNT] WARNING: Remaining triangle ${i} has incorrect type: verts=[${tri.verts.join(',')}], type=${tri.type || 'undefined'}`);
  }
  if (!tri.verts || tri.verts.length !== 3) {
    console.warn(`[GHOST HUNT] WARNING: Remaining triangle ${i} has incorrect vert count: verts=[${tri.verts?.join(',') || 'missing'}], count=${tri.verts?.length || 0}`);
  }
});
```

**Expected Output:**
```
[GHOST HUNT] Pre-return: 28 remaining triangles
```

**If Issues Found:**
```
[GHOST HUNT] Pre-return: 28 remaining triangles
[GHOST HUNT] WARNING: Remaining triangle 15 has incorrect type: verts=[107,111,106], type=undefined
```

---

## 4. Hypotheses & Tests

### Hypothesis 1: Type Field is Changed/Lost on Survivors (HIGH CONFIDENCE)

**Description:** Surviving triangles lose their `type: 'triangle'` field during/after dissolution, causing the rendering condition `quad.type === 'triangle'` to fail.

**Evidence:**
- Blue triangles visible with 3 edges (suggesting 3-vert shapes)
- No tooltip on blue triangles (suggests `isTriangle` check failed)
- Rendering condition checks `quad.type === 'triangle'` first

**Test:**
1. Add diagnostic logging (Section 3.1)
2. Check `survivors by type` output
3. If `undefined` or `quad` types found → Hypothesis confirmed

**Fix:**
```javascript
// Change condition from:
const isTriangle = quad.type === 'triangle' || (quad.verts && quad.verts.length === 3);

// To (more aggressive):
const isTriangle = (quad.verts && quad.verts.length === 3); // Force by vert count
// Or preserve type check but log warnings:
const isTriangle = quad.type === 'triangle' || (quad.verts && quad.verts.length === 3);
if (quad.verts && quad.verts.length === 3 && quad.type !== 'triangle') {
  console.warn(`[GHOST HUNT] 3-vert shape without type='triangle': [${quad.verts.join(',')}], type=${quad.type}`);
}
```

**Expected Impact:** All 3-vert shapes highlighted in red, regardless of type field.

### Hypothesis 2: Rendering Receives Filtered/Wrong Array (MEDIUM CONFIDENCE)

**Description:** `stage.data` for Stage 3 rendering does not include all `remainingTriangles`, or includes triangles from a different source (e.g., failed merge attempts in `quads` array).

**Evidence:**
- Visual count matches log count (28), suggesting correct count but wrong shapes
- Blue triangles may be from `quads` array (failed merge attempts)

**Test:**
1. Log `stage.data.length` vs. `remainingTriangles.length` before rendering
2. Log vertex indices of all 3-vert shapes in `stage.data`
3. Compare with `remainingTriangles` vertex indices
4. If mismatch → Hypothesis confirmed

**Fix:**
```javascript
// In buildStalbergQuadGrid(), ensure pipelineStages.stage3_quads includes all remainingTriangles
pipelineStages.stage3_quads = [...quads, ...remainingTriangles];

// Verify before rendering:
console.log(`[GHOST HUNT] stage.data length: ${stage.data.length}, expected quads+triangles: ${quads.length + remainingTriangles.length}`);
```

**Expected Impact:** Correct shapes included in rendering, all survivors highlighted.

### Hypothesis 3: Overwrite in Draw Order (Blue Drawn After Red) (LOW CONFIDENCE)

**Description:** Blue quads are rendered after red triangles, overwriting the red highlights due to SVG layering.

**Evidence:**
- Blue triangles visible with full 3 edges (suggesting full rendering, not overwrite)
- Red triangles also visible (suggesting not fully overwritten)
- May be a partial overwrite issue

**Test:**
1. Reverse draw order: render quads first, then triangles
2. Or use separate SVG layers: `<g>` for quads, `<g>` for triangles
3. If blue triangles become red → Hypothesis confirmed

**Fix:**
```javascript
// Separate quads and triangles into different render passes
const quadsToRender = stage.data.filter(shape => !shape.verts || shape.verts.length !== 3);
const trianglesToRender = stage.data.filter(shape => shape.verts && shape.verts.length === 3);

// Render quads first (lower layer)
quadsToRender.forEach((quad, quadIdx) => { /* ... blue rendering ... */ });

// Render triangles second (upper layer, red)
trianglesToRender.forEach((tri, triIdx) => { /* ... red rendering ... */ });
```

**Expected Impact:** Red highlights not overwritten by blue quads.

### Hypothesis 4: Some "Survivors" are Actually Degenerate/Failed Quads (LOW CONFIDENCE)

**Description:** Some blue "triangles" are actually degenerate or failed quads (4 vertices but 3 visible edges due to collapsed/duplicate vertices).

**Evidence:**
- Blue shapes appear as triangles but may have `verts.length === 4`
- May be invalid quads created during failed merge attempts

**Test:**
1. Check `quad.verts.length` for blue shapes
2. If `length === 4` but renders as triangle → Hypothesis confirmed
3. Check for duplicate vertices (collapsed quad)

**Fix:**
```javascript
// In rendering, check for collapsed quads
const uniqueVerts = new Set(quad.verts);
if (uniqueVerts.size < quad.verts.length) {
  // Collapsed quad - treat as triangle if 3 unique verts
  const actualVertCount = uniqueVerts.size;
  if (actualVertCount === 3) {
    console.warn(`[GHOST HUNT] Collapsed quad detected: verts=[${quad.verts.join(',')}], unique=${actualVertCount}`);
    // Force highlight as triangle
  }
}
```

**Expected Impact:** Collapsed quads detected and highlighted correctly.

---

## 5. Next Steps / Recommended Fixes

### Priority 1: Add Diagnostic Logging (URGENT)

**Implementation:**
1. Add Section 3.1 console logging before Stage 3 render
2. Add Section 3.4 pre-return logging in `dissolveEdgesToQuads()`
3. Run test: Reload page, click "Reset Grid" 5 times, capture console output
4. Analyze `[GHOST HUNT]` logs to identify type mismatches

**Expected Outcome:**
- Identify if ghost triangles have `type: undefined` or `type: 'quad'`
- Count true survivor count vs. visual red count
- Determine root cause (type loss vs. filtering vs. render order)

### Priority 2: Force-Highlight All 3-Vert Shapes (HIGH)

**Implementation:**
1. Update rendering condition to prioritize `verts.length === 3` over `type === 'triangle'`
2. Add Section 3.2 force-highlight logic
3. Run test: Reload page, click "Reset Grid" 5 times, verify all 3-vert shapes are red

**Expected Outcome:**
- All ghost triangles highlighted in red (immediate visual fix)
- Accurate visual count of remaining triangles
- Clear identification of type field issues

**Code Change:**
```javascript
// ITERATION 38 FIX: Force-highlight all 3-vert shapes
const isTriangle = (quad.verts && quad.verts.length === 3); // Force by vert count, ignore type
```

### Priority 3: Add Purple Highlight Pass (MEDIUM)

**Implementation:**
1. Add Section 3.3 purple highlight pass after Stage 3 rendering
2. Run test: Reload page, click "Reset Grid" 5 times, look for purple dashed outlines

**Expected Outcome:**
- Ghost triangles clearly visible in purple (distinct from red survivors)
- Visual confirmation of type field issues
- Easier debugging of root cause

### Updated Test Instructions

**Steps:**
1. Reload `interactive-terrain.html` in browser
2. Open browser console (F12)
3. Click "Reset Grid" 5+ times
4. For each run:
   - Capture `[GHOST HUNT]` console logs
   - Count visual red triangles in Stage 3
   - Count visual blue triangles (potential ghosts)
   - Count visual purple triangles (if purple pass enabled)
   - Compare with log count: `[GHOST HUNT] X potential remaining triangles`

**Validation:**
- **If log count > visual red count:** Ghost triangles confirmed
- **If log shows `type=undefined` or `type=quad`:** Type field loss confirmed
- **If purple highlights appear:** Rendering condition issue confirmed

**Success Criteria:**
- Visual red count matches log count (no ghost triangles)
- All 3-vert shapes highlighted in red (or purple if type mismatch)
- Console shows no warnings for type mismatches

---

## 6. Conclusion

### 6.1 Bug Classification

**Question:** Is this a rendering-only bug or a deeper dissolution issue?

**Analysis:**
- **If ghost triangles have `type: undefined` or `type: 'quad'`:** Likely a **rendering bug** (type field lost during data pipeline)
- **If ghost triangles have correct `type: 'triangle'` but still render blue:** Likely a **rendering bug** (condition logic issue)
- **If ghost triangles are not in `remainingTriangles` but appear in `stage.data`:** Likely a **dissolution bug** (triangles added to wrong array during failed merges)
- **If visual red count < log count:** Likely a **rendering bug** (some survivors not rendered)
- **If visual red count = log count but blue triangles visible:** Likely a **rendering bug** (type/condition issue)

**Most Likely Scenario:**
Based on visual evidence (blue triangles with 3 edges), the bug is most likely:
1. **Type field loss** during data pipeline (rendering bug, easy fix)
2. **Condition logic issue** in rendering (rendering bug, easy fix)
3. **Less likely:** Triangles added to `quads` array during failed merges (dissolution bug, harder fix)

**Recommendation:** Start with diagnostic logging (Priority 1) to confirm root cause before implementing fixes.

### 6.2 Link to Deterministic Cleanup Pass (Iteration 37)

**Connection:**
If ghost triangles are confirmed to exist (visual red count < log count), this indicates:
1. **Dissolution Incompleteness:** Some eligible pairs were not merged (even with Iteration 35-36 fixes)
2. **State Tracking Issues:** Type fields or removed flags not set correctly during dissolution
3. **Need for Enhanced Cleanup:** Deterministic cleanup pass (Iteration 37) may need to handle type field restoration or additional validation

**Recommendation:**
- Fix rendering bug first (ensure accurate visual count)
- Re-evaluate true remaining triangle count with accurate visualization
- If count remains high (28+), proceed with enhanced deterministic cleanup pass
- If count reduces significantly (0-5), current dissolution logic is sufficient

### 6.3 Expected Resolution

**With Recommended Fixes:**
- **Priority 1 (Diagnostic):** Identify root cause (type loss, filtering, render order)
- **Priority 2 (Force-Highlight):** Immediate visual fix (all 3-vert shapes red)
- **Priority 3 (Purple Pass):** Visual confirmation of type issues (if applicable)

**Success Metrics:**
- ✅ Visual red count = log count (no ghost triangles)
- ✅ All 3-vert shapes highlighted in red
- ✅ Console shows no type mismatch warnings
- ✅ Accurate visual representation of dissolution completeness

**If Ghost Triangles Resolved:**
- Re-evaluate true remaining triangle count
- Determine if dissolution logic needs further enhancement (Iteration 37)
- Or confirm dissolution is complete (0 remaining triangles target achieved)

---

**Implementation Date:** 2026-01-15  
**Status:** Ready for Implementation - Diagnostic logging and force-highlight fixes recommended

---

**Report Updated:** 2026-01-15  
**Next Steps:** 
1. Add diagnostic logging (Section 3.1, 3.4)
2. Implement force-highlight fix (Section 3.2)
3. Run test: 5+ "Reset Grid" cycles, capture logs and screenshots
4. Analyze results: Determine root cause and implement appropriate fix
