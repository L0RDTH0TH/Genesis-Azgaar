# Phase 4: Godot Integration Testing & Production Hookup

**Status**: Planning Complete  
**Date**: 2026-01-01  
**Goal**: Fully integrate the Phase 3 production-ready Azgaar Genesis library into the Genesis Mythos world builder WebView

---

## Executive Summary

This phase focuses on integrating the Azgaar Genesis library into the Genesis Mythos project, establishing a stable end-to-end workflow from the world builder wizard UI through WebView JavaScript execution to Godot data processing.

**Key Objectives**:
- Deploy production bundle to Genesis Mythos assets
- Establish postMessage bridge between WebView and Godot
- Implement Alpine.js wizard integration
- Create Godot-side JSON import handler
- Validate complete data pipeline

**Success Criteria**:
- ✅ User can trigger map generation from wizard UI
- ✅ Map generates successfully in WebView
- ✅ Canvas preview displays (ocean + lakes + sparse circle land - expected for Phase 3)
- ✅ JSON data successfully exported and received by Godot
- ✅ Godot parses JSON and creates basic world representation
- ✅ No crashes, memory leaks, or unhandled errors
- ✅ Full round-trip works with various map sizes (5k, 10k, 20k cells) within <10s

---

## Phase 4 Sub-Phases & Detailed Tasks

### Sub-Phase 4.1: Bundle Deployment & WebView Setup

**Objective**: Deploy the production bundle to the Genesis Mythos project and set up the WebView HTML structure.

#### Tasks

1. **Copy Production Bundle**
   - Copy `dist/azgaar-genesis.esm.js` (or `azgaar-genesis.min.js` for production) to `res://assets/ui_web/js/azgaar/`
   - Create directory if it doesn't exist: `res://assets/ui_web/js/azgaar/`
   - Verify file permissions and accessibility

2. **Include Delaunator Dependency**
   - Download or copy Delaunator ESM bundle
   - Recommended: Use CDN version `https://cdn.jsdelivr.net/npm/delaunator@5.0.1/+esm`
   - Alternative: Download and place `delaunator.esm.js` in `res://assets/ui_web/js/azgaar/`
   - Note: Delaunator is a required peer dependency

3. **Create/Update `world_builder.html`**
   - Ensure file exists at: `res://assets/ui_web/world_builder.html`
   - Add canvas element: `<canvas id="azgaar-preview" width="800" height="600"></canvas>`
   - Add status/error display container: `<div id="azgaar-status"></div>`
   - Include library script (module import - see Sub-Phase 4.2 for code)

4. **Verify WebView Configuration**
   - Confirm WebView (godot_wry) supports ES6 modules
   - Verify `res://` path resolution works
   - Test basic HTML loading in WebView
   - Confirm postMessage is enabled

**Deliverables**:
- ✅ Bundle files in correct location
- ✅ Delaunator dependency accessible
- ✅ HTML structure with canvas and status container
- ✅ WebView loading HTML successfully

**Estimated Time**: 30-60 minutes

---

### Sub-Phase 4.2: Alpine.js Integration (Wizard → JS Library)

**Objective**: Integrate Azgaar library calls into the Alpine.js wizard component, handling the complete generation workflow.

#### Tasks

1. **Locate Alpine.js Wizard Component**
   - Find the Alpine.js component handling world builder wizard (likely in `world_builder.html` or separate JS file)
   - Identify the "Generate Map" button/action
   - Note current state management structure

2. **Add Alpine.js State Variables**
   ```javascript
   azgaarReady: false,
   generating: false,
   previewCanvas: null,
   mapData: null,
   status: '',
   error: null
   ```

3. **Import Library in Module Script**
   ```javascript
   import Delaunator from './js/azgaar/delaunator.esm.js';  // or CDN URL
   import { 
     initGenerator, 
     loadOptions, 
     generateMap, 
     getMapData, 
     renderPreview 
   } from './js/azgaar/azgaar-genesis.esm.js';
   ```

4. **Initialize Generator (On Mount/Ready)**
   ```javascript
   // In Alpine.js component initialization
   x-init="
     previewCanvas = document.getElementById('azgaar-preview');
     if (previewCanvas) {
       try {
         initGenerator({ canvas: previewCanvas });
         azgaarReady = true;
         status = 'Ready';
       } catch (error) {
         error = 'Failed to initialize: ' + error.message;
       }
     }
   "
   ```

5. **Implement Generate Map Function**
   ```javascript
   async generateMap() {
     if (!azgaarReady) {
       error = 'Generator not ready';
       return;
     }
     
     generating = true;
     status = 'Generating...';
     error = null;
     
     try {
       // Collect options from wizard form
       const options = {
         seed: this.wizardSeed || String(Math.floor(Math.random() * 1000000)),
         mapWidth: this.wizardWidth || 800,
         mapHeight: this.wizardHeight || 600,
         points: this.wizardPoints || 4, // Maps to cellsDesired
         statesNumber: this.wizardStates || 18,
         cultures: this.wizardCultures || 12,
         // Add other options from wizard form
       };
       
       // Load and validate options
       loadOptions(options);
       status = 'Creating Voronoi diagram...';
       
       // Generate map
       const data = generateMap(Delaunator);
       status = 'Rendering preview...';
       
       // Render to canvas
       renderPreview();
       
       // Export JSON
       mapData = getMapData();
       status = 'Sending to Godot...';
       
       // Send to Godot via postMessage
       if (window.godot && window.godot.postMessage) {
         window.godot.postMessage({
           type: 'azgaar_data',
           payload: mapData
         });
       } else if (window.parent && window.parent.postMessage) {
         window.parent.postMessage({
           type: 'azgaar_data',
           payload: mapData
         }, '*');
       }
       
       status = 'Complete!';
       generating = false;
       
     } catch (err) {
       error = err.message || 'Generation failed';
       status = 'Error occurred';
       generating = false;
       console.error('Azgaar generation error:', err);
     }
   }
   ```

6. **Wire Up Generate Button**
   - Connect "Generate Map" button to `generateMap()` function
   - Disable button while `generating === true`
   - Show loading indicator/spinner

7. **Add Status Display**
   ```html
   <div id="azgaar-status" x-show="status" x-text="status"></div>
   <div x-show="error" x-text="error" class="error"></div>
   ```

8. **Error Handling**
   - Wrap all library calls in try/catch
   - Display user-friendly error messages
   - Log detailed errors to console for debugging

**Deliverables**:
- ✅ Alpine.js component integrated with library
- ✅ Generate button triggers full workflow
- ✅ Status updates displayed to user
- ✅ Errors caught and displayed
- ✅ JSON data sent to Godot via postMessage

**Estimated Time**: 2-3 hours

**Notes**:
- Actual postMessage API may vary based on Godot WebView implementation
- May need to use `window.webkit.messageHandlers.godot.postMessage()` or similar
- Test with console.log to verify message sending

---

### Sub-Phase 4.3: Godot-Side Message Handling & JSON Import

**Objective**: Implement GDScript handlers to receive and parse map data from WebView.

#### Tasks

1. **Locate WebView GDScript Controller**
   - Find the GDScript file controlling the WebView (e.g., `WorldBuilder.gd`, `MapGenerator.gd`, `WebViewManager.gd`)
   - Identify signal/slot system for WebView messages
   - Note current message handling pattern (if any)

2. **Implement Message Handler Function**
   ```gdscript
   func _on_webview_script_message(message: Dictionary):
       # Filter for Azgaar messages
       if message.has("type") and message["type"] == "azgaar_data":
           handle_azgaar_data(message.get("payload", {}))
       elif message.has("type") and message["type"] == "azgaar_error":
           handle_azgaar_error(message.get("error", "Unknown error"))

   func handle_azgaar_data(payload: Dictionary):
       if payload.is_empty():
           push_error("Azgaar: Received empty payload")
           return
       
       # Validate basic structure
       if not payload.has("grid") or not payload.has("pack"):
           push_error("Azgaar: Invalid payload structure - missing grid or pack")
           return
       
       # Parse JSON structure
       var grid = payload.get("grid", {})
       var pack = payload.get("pack", {})
       var seed = payload.get("seed", "")
       var options = payload.get("options", {})
       
       # Store imported data (create resource or dictionary)
       var map_data = {
           "seed": seed,
           "options": options,
           "grid": grid,
           "pack": pack
       }
       
       # Extract key data structures
       var heightmap = extract_heightmap(grid, pack)
       var biomes = extract_biomes(pack)
       var features = extract_features(pack)
       var burgs = extract_burgs(pack)
       var states = extract_states(pack)
       var cultures = extract_cultures(pack)
       
       # Emit signal for other systems
       emit_signal("map_generated", map_data)
       
       # Show success notification
       show_notification("Map generated successfully! Seed: " + seed)
       
       print("Azgaar: Map imported successfully")
       print("  - Seed: ", seed)
       print("  - Grid cells: ", grid.get("cells", {}).get("i", []).size())
       print("  - Features: ", pack.get("features", []).size())
       print("  - Burgs: ", pack.get("burgs", []).size())
       print("  - States: ", pack.get("states", []).size())
   ```

3. **Implement Data Extraction Functions**
   ```gdscript
   func extract_heightmap(grid: Dictionary, pack: Dictionary) -> Dictionary:
       var grid_cells = grid.get("cells", {})
       var pack_cells = pack.get("cells", {})
       
       return {
           "heights": grid_cells.get("h", []),  # Array of heights 0-100
           "points": grid.get("points", []),     # Array of [x, y] coordinates
           "dimensions": {
               "width": grid.get("cellsDesired", 0),
               "height": grid.get("cellsDesired", 0)
           }
       }
   
   func extract_biomes(pack: Dictionary) -> Array:
       var cells = pack.get("cells", {})
       return cells.get("biome", [])
   
   func extract_features(pack: Dictionary) -> Array:
       return pack.get("features", [])
   
   func extract_burgs(pack: Dictionary) -> Array:
       return pack.get("burgs", [])
   
   func extract_states(pack: Dictionary) -> Array:
       return pack.get("states", [])
   
   func extract_cultures(pack: Dictionary) -> Array:
       return pack.get("cultures", [])
   ```

4. **Connect WebView Signal**
   - Ensure WebView node has signal connected: `webview.connect("script_message_received", self, "_on_webview_script_message")`
   - Or use equivalent signal name for your WebView implementation
   - Test signal connection with simple message

5. **Add Error Handler**
   ```gdscript
   func handle_azgaar_error(error_msg: String):
       push_error("Azgaar generation error: " + error_msg)
       show_notification("Map generation failed: " + error_msg)
       emit_signal("map_generation_error", error_msg)
   ```

6. **Create Signal Definitions**
   ```gdscript
   signal map_generated(map_data: Dictionary)
   signal map_generation_error(error: String)
   ```

**Deliverables**:
- ✅ Message handler function implemented
- ✅ JSON parsing and validation
- ✅ Data extraction functions
- ✅ Signal emission for other systems
- ✅ Error handling

**Estimated Time**: 2-3 hours

**Notes**:
- Actual signal names may vary based on WebView plugin
- May need to parse JSON string if WebView sends strings instead of Dictionary
- Consider creating a custom Resource class for map data storage

---

### Sub-Phase 4.4: Basic Godot-Side Visual Validation

**Objective**: Create a simple debug visualizer to confirm data arrived correctly.

#### Tasks

1. **Create Debug Visualizer Scene**
   - Create new scene: `res://scenes/debug/MapVisualizer.tscn`
   - Add root Node2D or Control node
   - Add child nodes for different visualization layers

2. **Create Visualizer Script**
   ```gdscript
   extends Node2D
   
   var map_data: Dictionary = {}
   
   func _ready():
       pass
   
   func visualize_map(data: Dictionary):
       map_data = data
       update()
   
   func _draw():
       if map_data.is_empty():
           return
       
       var grid = map_data.get("grid", {})
       var points = grid.get("points", [])
       var heights = grid.get("cells", {}).get("h", [])
       
       if points.size() != heights.size():
           return
       
       # Draw simple height-based visualization
       for i in range(points.size()):
           var point = points[i]
           var height = heights[i]
           var color = Color.WHITE
           
           if height < 20:
               # Ocean - blue
               color = Color(0.71, 0.82, 0.95)  # #b4d2f3
           else:
               # Land - light beige
               color = Color(0.93, 0.96, 0.98)  # #eef6fb
           
           # Draw small circle for each cell
           draw_circle(Vector2(point[0] * 0.1, point[1] * 0.1), 2.0, color)
   ```

3. **Connect to Map Generated Signal**
   - In main scene/controller, connect: `world_builder.map_generated.connect(map_visualizer.visualize_map)`
   - Or instantiate visualizer and connect manually

4. **Add Simple Controls**
   - Add button to toggle visualization
   - Add label showing map stats (cell count, seed, etc.)

**Deliverables**:
- ✅ Visualizer scene and script
- ✅ Basic height-based coloring
- ✅ Connected to map_generated signal
- ✅ Visible confirmation that data arrived

**Estimated Time**: 1-2 hours

**Notes**:
- This is a minimal debug visualizer - doesn't need to be pretty
- Purpose is to verify data pipeline, not create final visualization
- Can be expanded in future phases

---

### Sub-Phase 4.5: Testing & Validation

**Objective**: Comprehensive testing of the complete integration.

#### Tasks

1. **Manual Functional Tests**
   - **Small Map (5k cells)**: Generate, verify speed (<2s), check preview
   - **Medium Map (10k cells)**: Generate, verify speed (<5s), check data
   - **Large Map (20k cells)**: Generate, verify speed (<10s), check stability
   - **Fixed Seed**: Generate twice with same seed, verify identical JSON
   - **Random Seed**: Generate multiple times, verify uniqueness

2. **Error Case Tests**
   - Invalid options (negative width, etc.)
   - Missing canvas element
   - Network/CDN failure (if using CDN for Delaunator)
   - Generation timeout (very large maps)

3. **Performance Profiling**
   - Measure total time: wizard click → Godot receives data
   - Break down: generation time, rendering time, JSON serialization, postMessage
   - Monitor memory usage during generation
   - Check for memory leaks (generate → clear → repeat)

4. **Cross-Platform Testing**
   - Test in Godot editor (development)
   - Test exported build (Windows/Linux if applicable)
   - Test HTML5 export if supported
   - Verify WebView behavior on different platforms

5. **Data Validation Tests**
   - Verify JSON structure matches expected schema
   - Check all required fields present
   - Validate data ranges (heights 0-100, etc.)
   - Compare sample data against known good output

**Test Checklist**:
- [ ] Small map generation works
- [ ] Medium map generation works
- [ ] Large map generation works
- [ ] Fixed seed produces identical results
- [ ] Preview canvas displays (even if sparse)
- [ ] JSON data received in Godot
- [ ] Data parsing successful
- [ ] Visualizer displays data
- [ ] Error messages displayed correctly
- [ ] No crashes on invalid input
- [ ] Performance within targets
- [ ] No memory leaks detected

**Deliverables**:
- ✅ Test results documented
- ✅ Performance metrics recorded
- ✅ Known issues documented
- ✅ All critical tests passing

**Estimated Time**: 3-4 hours

---

### Sub-Phase 4.6: Documentation & Polish

**Objective**: Document the integration and polish user experience.

#### Tasks

1. **Create Integration Guide**
   - Create `docs/godot-integration-guide.md` in fork repo
   - Document postMessage pattern
   - Document expected JSON schema
   - Include code examples
   - Troubleshooting section

2. **Update Fork Documentation**
   - Update `README.md` with Phase 4 completion status
   - Add link to integration guide
   - Document any Godot-specific considerations

3. **Code Comments**
   - Add comments in GDScript explaining bridge
   - Add comments in HTML/Alpine.js explaining workflow
   - Document message format

4. **User-Facing Improvements**
   - Improve loading indicators
   - Better error messages
   - Progress feedback during generation
   - "Regenerate Map" button with proper state reset

5. **Create Phase 4 Completion Document**
   - Create `PHASE4_COMPLETE.md`
   - Summarize results
   - Document performance numbers
   - List known issues
   - Sign-off on completion

**Deliverables**:
- ✅ Integration guide document
- ✅ Updated README
- ✅ Code comments added
   - ✅ User-facing polish
   - ✅ Phase 4 completion document

**Estimated Time**: 2-3 hours

---

## Known Limitations (Accepted - Do NOT Fix in Phase 4)

- ⚠️ **Sparse circle-based land rendering** in preview (Phase 3 limitation - expected)
- ⚠️ **Missing advanced visual layers** (biomes, rivers, borders, etc.) - future phases
- ⚠️ **Focus on data pipeline stability**, not visual beauty

These limitations are documented and expected. Phase 4 focuses on integration, not rendering improvements.

---

## File Structure

### Genesis Mythos Project Structure (Expected)

```
res://
├── assets/
│   └── ui_web/
│       ├── world_builder.html          # Main WebView HTML
│       └── js/
│           └── azgaar/
│               ├── azgaar-genesis.esm.js    # Main library bundle
│               └── delaunator.esm.js        # Peer dependency (or CDN)
├── scenes/
│   └── debug/
│       └── MapVisualizer.tscn          # Debug visualizer scene
└── scripts/
    └── world_builder/
        └── WorldBuilder.gd             # WebView controller (or similar)
```

### Fork Repository Structure

```
azgaar-genesis-fork/
├── dist/
│   ├── azgaar-genesis.esm.js          # Source for deployment
│   ├── azgaar-genesis.min.js          # Alternative: minified
│   └── azgaar-genesis.umd.js          # Alternative: UMD format
├── docs/
│   └── godot-integration-guide.md     # New: Integration guide
└── PHASE4_COMPLETE.md                 # New: Completion document
```

---

## PostMessage Protocol

### WebView → Godot

```javascript
// Success
{
  type: "azgaar_data",
  payload: {
    seed: "42",
    options: { ... },
    grid: { ... },
    pack: { ... }
  }
}

// Error
{
  type: "azgaar_error",
  error: "Error message string"
}
```

### Godot → WebView (Optional)

```gdscript
# Trigger generation
{
  "type": "generate_map",
  "options": {
    "seed": "42",
    "mapWidth": 800,
    "mapHeight": 600,
    ...
  }
}
```

---

## Estimated Total Effort

- **Sub-Phase 4.1**: 30-60 minutes
- **Sub-Phase 4.2**: 2-3 hours
- **Sub-Phase 4.3**: 2-3 hours
- **Sub-Phase 4.4**: 1-2 hours
- **Sub-Phase 4.5**: 3-4 hours
- **Sub-Phase 4.6**: 2-3 hours

**Total**: 10.5 - 15.5 hours

---

## Risk Mitigation

### Potential Issues

1. **WebView postMessage API Differences**
   - **Risk**: Different WebView implementations use different APIs
   - **Mitigation**: Test early, document actual API used, adapt code

2. **ES6 Module Support**
   - **Risk**: WebView may not support ES6 imports
   - **Mitigation**: Fall back to UMD bundle if needed, use global variable

3. **Path Resolution**
   - **Risk**: `res://` paths may not resolve in WebView
   - **Mitigation**: Use absolute paths, verify WebView configuration

4. **Performance in WebView**
   - **Risk**: WebView may be slower than browser
   - **Mitigation**: Profile early, optimize if needed, adjust targets

5. **Memory Constraints**
   - **Risk**: Large maps may exceed memory limits
   - **Mitigation**: Test with various sizes, add memory monitoring

---

## Success Metrics

### Must Have (Phase 4 Success)
- ✅ End-to-end workflow functional
- ✅ Data successfully imported to Godot
- ✅ No crashes on normal operation
- ✅ Performance within acceptable limits (<10s for 20k cells)

### Nice to Have (Can Defer)
- Polished UI/UX
- Advanced error recovery
- Detailed progress indicators
- Multiple map size presets

---

## Next Steps After Phase 4

**Phase 5: Advanced Rendering Enhancements** (Future)
- Implement proper Voronoi polygon rendering
- Add missing visual layers (biomes, rivers, borders, etc.)
- Improve visual quality

**Phase 6: Production Polish** (Future)
- Optimize performance
- Add caching
- Improve error handling
- User experience enhancements

---

## Conclusion

This plan provides a comprehensive roadmap for integrating the Azgaar Genesis library into Genesis Mythos. The phased approach ensures stability and allows for iterative testing and refinement.

**Status**: Ready for execution  
**Start Date**: TBD  
**Target Completion**: TBD

---

**Plan Created**: 2026-01-01  
**Last Updated**: 2026-01-01
