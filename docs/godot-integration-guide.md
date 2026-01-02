# Godot Integration Guide

Complete guide for integrating Azgaar Genesis library into Genesis Mythos Godot project's WebView.

---

## Overview

This guide provides step-by-step instructions for integrating the Azgaar Genesis library into your Godot project's WebView-based world builder UI.

**Prerequisites**:
- Godot project with WebView support (godot_wry or similar)
- Existing `world_builder.html` or similar WebView HTML file
- Basic familiarity with HTML, JavaScript, and GDScript

---

## Quick Start

1. **Copy bundle files** to `res://assets/ui_web/js/azgaar/`
2. **Add canvas and status elements** to your HTML
3. **Include Alpine.js integration script**
4. **Connect GDScript message handler**
5. **Test and customize**

---

## Step 1: Deploy Bundle Files

### Copy Files to Godot Project

Copy the following files from `dist/` to your Godot project:

```bash
# From azgaar-genesis-fork directory
mkdir -p /path/to/godot-project/res/assets/ui_web/js/azgaar
cp dist/azgaar-genesis.esm.js /path/to/godot-project/res/assets/ui_web/js/azgaar/
```

**Target Structure**:
```
res/
└── assets/
    └── ui_web/
        └── js/
            └── azgaar/
                ├── azgaar-genesis.esm.js      # Main library bundle
                └── delaunator.esm.js          # Optional: if using local file
```

### Include Delaunator Dependency

Delaunator is a required peer dependency. You have two options:

**Option A: Use CDN (Recommended for Development)**
```javascript
import Delaunator from 'https://cdn.jsdelivr.net/npm/delaunator@5.0.1/+esm';
```

**Option B: Download Locally**
```bash
curl -o /path/to/godot-project/res/assets/ui_web/js/azgaar/delaunator.esm.js \
  https://cdn.jsdelivr.net/npm/delaunator@5.0.1/+esm
```

Then import:
```javascript
import Delaunator from './delaunator.esm.js';
```

---

## Step 2: Update HTML File

### Add Required Elements

Add these elements to your `world_builder.html` (or equivalent):

**Canvas Element** (for map preview):
```html
<canvas id="azgaar-preview" width="800" height="600"></canvas>
```

**Status Display** (optional, for user feedback):
```html
<div id="azgaar-status"></div>
```

### Include Alpine.js (if not already included)

```html
<script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
```

### Include Integration Script

Copy `integration-examples/godot-webview/alpine-integration.js` to your project, then include:

```html
<script type="module" src="./js/azgaar/alpine-integration.js"></script>
```

**Important**: Update the import path in `alpine-integration.js` to match your file structure:
```javascript
import { ... } from './azgaar-genesis.esm.js';  // Path relative to alpine-integration.js location
```

---

## Step 3: Adapt Alpine.js Component

### Use Component in HTML

Wrap your map generation UI in the Alpine.js component:

```html
<div x-data="azgaarGenerator()" x-init="init()">
  <!-- Your form inputs here -->
  <button @click="generateMap()">Generate Map</button>
  
  <canvas id="azgaar-preview"></canvas>
  <div id="azgaar-status"></div>
</div>
```

### Adapt Form Fields

In `alpine-integration.js`, adjust the wizard form field names to match your existing form:

```javascript
// In azgaarGenerator() function, adapt these:
wizardSeed: '',           // Match your seed input
wizardWidth: 800,         // Match your width input
wizardHeight: 600,        // Match your height input
wizardPoints: 4,          // Match your cell density input
// ... etc
```

### Customize Options Collection

In the `generateMap()` function, adapt how options are collected:

```javascript
const options = {
  seed: this.yourSeedInput,      // Adapt to your form
  mapWidth: this.yourWidthInput, // Adapt to your form
  // ... etc
};
```

---

## Step 4: GDScript Integration

### Connect WebView Message Handler

In your WebView controller script (e.g., `WorldBuilder.gd`):

```gdscript
extends Control

@onready var webview: Control = $WebView

func _ready():
    # Connect message signal (signal name may vary)
    if webview.has_signal("message_received"):
        webview.connect("message_received", _on_webview_message)

func _on_webview_message(message):
    var message_dict: Dictionary
    if message is String:
        var json = JSON.new()
        json.parse(message)
        message_dict = json.data
    else:
        message_dict = message
    
    if message_dict.has("type"):
        match message_dict["type"]:
            "azgaar_data":
                handle_azgaar_data(message_dict.get("payload", {}))
            "azgaar_error":
                handle_azgaar_error(message_dict.get("error", ""))
```

### Implement Data Handler

```gdscript
func handle_azgaar_data(payload: Dictionary):
    var seed = payload.get("seed", "")
    var grid = payload.get("grid", {})
    var pack = payload.get("pack", {})
    
    # Process the data...
    # Store in resource, emit signal, etc.
    
    print("Map generated with seed: ", seed)
```

See `integration-examples/godot-webview/gdscript-example.gd` for complete reference implementation.

---

## Step 5: PostMessage Protocol

### Message Format

**WebView → Godot (Success)**:
```javascript
{
  type: "azgaar_data",
  payload: {
    seed: "42",
    options: { ... },
    grid: { ... },
    pack: { ... }
  }
}
```

**WebView → Godot (Error)**:
```javascript
{
  type: "azgaar_error",
  error: "Error message string"
}
```

See `integration-examples/godot-webview/postmessage-protocol.md` for complete protocol documentation.

---

## Step 6: Testing

### Test Checklist

- [ ] Bundle files copied to correct location
- [ ] HTML includes canvas and status elements
- [ ] Alpine.js component loads without errors
- [ ] Generator initializes (check console for "Generator initialized")
- [ ] Generate button triggers generation
- [ ] Preview canvas displays (ocean + sparse land - expected for Phase 3)
- [ ] Status messages update during generation
- [ ] JSON data sent via postMessage (check console logs)
- [ ] GDScript receives messages
- [ ] Data parsing works correctly

### Browser Testing (Before Godot)

Test the HTML file in a browser first:

```bash
cd azgaar-genesis-fork
python3 -m http.server 8000
# Open http://localhost:8000/integration-examples/godot-webview/godot-webview-demo.html
```

Verify:
- No JavaScript errors in console
- Map generates successfully
- Preview renders
- Console shows "Sent message via..." log

---

## Troubleshooting

### Common Issues

#### "Generator not initialized"
**Cause**: Canvas element not found or `init()` not called  
**Solution**: Ensure `<canvas id="azgaar-preview">` exists and `x-init="init()"` is present

#### "Delaunator is required"
**Cause**: Delaunator not imported or import path incorrect  
**Solution**: Verify Delaunator import path, check CDN access or local file exists

#### "Canvas element not found"
**Cause**: Canvas ID mismatch or element not in DOM  
**Solution**: Ensure canvas has `id="azgaar-preview"` and exists when component initializes

#### Messages not received in Godot
**Cause**: Signal not connected or WebView doesn't support postMessage  
**Solution**: 
- Check WebView signal connection
- Verify postMessage method (try different methods in console)
- Check WebView plugin documentation

#### Import errors
**Cause**: Incorrect file paths or module resolution  
**Solution**:
- Verify file paths are correct relative to HTML file
- Check WebView supports ES6 modules
- Ensure `res://` paths resolve correctly

#### Large maps cause memory issues
**Cause**: Very large maps (20k+ cells) use significant memory  
**Solution**:
- Reduce cell density for testing
- Monitor memory usage
- Consider smaller map sizes for initial testing

### Debug Tips

1. **Console Logging**: Check browser/WebView console for JavaScript errors
2. **GDScript Debugging**: Add `print()` statements in message handler
3. **Message Inspection**: Log received messages to verify format
4. **Step-by-Step**: Test initialization → generation → rendering → postMessage separately

---

## File Structure Reference

### Required Files

```
res/assets/ui_web/
├── world_builder.html              # Your main HTML file
└── js/
    └── azgaar/
        ├── azgaar-genesis.esm.js   # Main library (required)
        ├── alpine-integration.js   # Alpine component (required)
        └── delaunator.esm.js       # Peer dependency (optional if using CDN)
```

### Reference Files (in fork repo)

```
azgaar-genesis-fork/
├── integration-examples/
│   └── godot-webview/
│       ├── godot-webview-demo.html      # Complete working demo
│       ├── alpine-integration.js        # Alpine component (copy to project)
│       ├── postmessage-protocol.md      # Protocol documentation
│       └── gdscript-example.gd          # GDScript reference
└── docs/
    └── godot-integration-guide.md       # This file
```

---

## Performance Considerations

### Expected Performance

- **5k cells**: ~1-2 seconds generation + render
- **10k cells**: ~2-3 seconds generation + render
- **20k cells**: ~4-6 seconds generation + render

### Optimization Tips

- Use appropriate cell density for your use case
- Consider showing loading indicator during generation
- Test on target hardware/platform
- Monitor memory usage for large maps

---

## Known Limitations (Phase 3)

- **Sparse circle-based land rendering** - Expected limitation, will be improved in Phase 5
- **Basic visual layers only** - Ocean, lakes, sparse land (no biomes, rivers, borders yet)
- **Focus on data pipeline** - Visual quality is secondary to data accuracy

---

## Next Steps

1. Complete integration using this guide
2. Test with various map sizes and seeds
3. Customize UI to match your project's style
4. Implement data processing in GDScript for your needs
5. Consider Phase 5 enhancements for better visual rendering

---

## Additional Resources

- **API Specification**: `docs/api-spec.md` - Complete API reference
- **Data Structures**: `docs/data-structures.md` - JSON schema details
- **Examples**: `examples/` - Additional usage examples
- **Phase 3 Status**: `PHASE3_COMPLETE.md` - Current capabilities

---

**Guide Version**: 1.0  
**Last Updated**: 2026-01-01  
**Compatible With**: Phase 3 production-ready library
