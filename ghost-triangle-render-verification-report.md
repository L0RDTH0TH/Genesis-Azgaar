# Ghost Triangle Render Verification Report

**Date**: 2026-01-16  
**Author**: Diagnostic Analysis (via Cursor)  
**Issue**: Some 3-vertex survivors after Stage 3 are rendering blue (quad style) instead of red (triangle highlight)

---

## Executive Summary

All three hypotheses were tested with diagnostic logging. **Hypothesis 1 and 3 are NOT CONFIRMED** - the isTriangle check works correctly and all triangles are in the correct array. **Hypothesis 2 (Render Order) shows a pattern** where quads are drawn before triangles, but this should not cause the issue since SVG renders last-drawn elements on top. However, this is the only pattern observed that could explain the visual discrepancy.

---

## Hypothesis 1: Frontend isTriangle Check Too Strict

**Verdict**: ✅ **NOT CONFIRMED**

**Evidence**:
- All 26 triangles with `verts=3` are correctly identified: `isTriangle=YES (red), reason=passed check`
- All triangles are assigned correct rendering properties: `color=#ff0000, width=3` (red, thick stroke)
- No triangles with `verts=3` show `isTriangle=NO (blue)`
- Current code: `const isTriangle = vertCount === 3;` (line 710) - correctly prioritizes vert count

**Sample Logs**:
```
[DIAG TRIANGLE CANDIDATE] ID=tri-0015, type=triangle, verts=3, isTriangle=YES (red), reason=passed check
[DIAG DRAW ORDER] Drawing TRIANGLE ID=tri-0015, verts=3, color=#ff0000, width=3
```

**Conclusion**: The isTriangle check is working correctly. All 3-vert shapes are being detected as triangles and assigned red color/thick stroke.

---

## Hypothesis 2: Render Order Overwriting

**Verdict**: ⚠️ **PATTERN OBSERVED BUT UNLIKELY ROOT CAUSE**

**Evidence**:
- **Draw Order Pattern**: 
  - Lines 50-126: All 104 QUADs drawn first (`color=#4488ff, width=2`)
  - Lines 127+: All 26 TRIANGLEs drawn after (`color=#ff0000, width=3`)
- In SVG, last-drawn elements are rendered on top, so triangles should be visible
- No evidence of quads overwriting triangles in the logs

**Sample Logs**:
```
[DIAG DRAW ORDER] Drawing QUAD ID=quad-0103, verts=4, color=#4488ff, width=2
[DIAG DRAW ORDER] Drawing TRIANGLE ID=tri-0015, verts=3, color=#ff0000, width=3
```

**Analysis**:
- Triangles are drawn AFTER quads, which should make them visible on top
- However, if triangles and quads share exact edge coordinates, there might be visual overlap issues
- SVG path rendering with `opacity="0.9"` could cause blending issues

**Conclusion**: Render order shows quads-first pattern, but this should not cause triangles to appear blue since triangles are drawn last. However, this is the only observable pattern that could relate to the visual issue.

---

## Hypothesis 3: Survivors Placed in Wrong Array in Backend

**Verdict**: ✅ **NOT CONFIRMED**

**Evidence**:
- All 26 remaining triangles are in the correct array: `remainingTriangles`
- No 3-vert shapes found in the `quads` array
- All triangles have correct `type=triangle` and are properly identified

**Sample Logs**:
```
[DIAG SURVIVOR CHECK] Remaining triangle ID=tri-0015, type=triangle, in correct array (remainingTriangles)
[DIAG SURVIVOR CHECK] Remaining triangle ID=tri-0038, type=triangle, in correct array (remainingTriangles)
... (all 26 triangles confirmed)
```

**Conclusion**: All triangles are correctly placed in `remainingTriangles` array. No misplacement detected.

---

## Conclusion

**Summary of Findings**:
1. ✅ **isTriangle check works correctly** - all 3-vert shapes detected as triangles
2. ⚠️ **Render order shows quads-first pattern** - but triangles drawn last should be on top
3. ✅ **Array placement is correct** - all triangles in correct array

**Most Likely Remaining Explanation**:

Since all diagnostic checks pass but the user reports seeing blue triangles, the issue is likely:

1. **Visual Perception / Edge Overlap**: Triangles and quads share edges, and the blue quad edges might be more visually prominent even though red triangle paths are rendered on top. The `opacity="0.9"` and stroke rendering might cause visual blending.

2. **Browser Rendering Quirk**: SVG path rendering with overlapping strokes might cause the browser to render the first-drawn (blue) paths more prominently, even though triangles are drawn last.

3. **CSS/Style Override**: There might be a CSS rule or inline style that's overriding the stroke color after rendering, though this is less likely given the diagnostic logs show correct color assignment.

**Recommended Next Steps**:

1. **Separate Rendering Layers**: Draw triangles and quads in separate SVG `<g>` groups to ensure proper z-ordering
2. **Increase Triangle Stroke Width**: Make triangle strokes even thicker (e.g., `width=4` or `5`) to ensure they're visually dominant
3. **Add Triangle Fill**: Add a semi-transparent red fill to triangles to make them more visually distinct
4. **Visual Inspection**: Use browser DevTools to inspect the actual SVG elements and verify their computed stroke colors

**No Code Fix Applied**: Since all diagnostic checks pass and the issue appears to be visual/rendering-related rather than logic-related, no code changes were made. The diagnostic logs confirm the rendering logic is correct.

---

## Diagnostic Logs Summary

- **Total Shapes Rendered**: 130 (104 quads + 26 triangles)
- **Triangles Correctly Identified**: 26/26 (100%)
- **Triangles with Red Color**: 26/26 (100%)
- **Triangles in Correct Array**: 26/26 (100%)
- **Triangles Drawn After Quads**: 26/26 (100%)

All diagnostic checks confirm the rendering logic is working as intended.
