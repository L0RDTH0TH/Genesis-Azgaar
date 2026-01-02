# PostMessage Protocol - Azgaar Genesis ↔ Godot

This document specifies the exact message format for communication between the Azgaar Genesis library (running in WebView) and Godot.

---

## Message Format

All messages are JavaScript objects (sent as JSON) with a `type` field indicating the message type.

---

## WebView → Godot Messages

### 1. Map Data Message (Success)

**Type**: `azgaar_data`

**Sent when**: Map generation completes successfully

**Format**:
```javascript
{
  type: "azgaar_data",
  payload: {
    seed: "42",                    // String: seed used for generation
    options: { ... },              // Object: generation options used
    grid: { ... },                 // Object: grid data structure
    pack: { ... }                  // Object: pack data structure
  }
}
```

**Payload Structure**:
The `payload` object matches the structure returned by `getMapData()`. See `docs/api-spec.md` for complete JSON schema.

**Key Fields**:
- `payload.seed`: String seed value
- `payload.grid.cells`: Cell data (heights, types, features, etc.)
- `payload.grid.points`: Array of [x, y] coordinates
- `payload.pack.features`: Feature list (lakes, islands, etc.)
- `payload.pack.burgs`: Settlements array
- `payload.pack.states`: States/kingdoms array
- `payload.pack.cultures`: Cultures array

**Example GDScript Handler**:
```gdscript
func _on_webview_message(message: Dictionary):
    if message.has("type") and message["type"] == "azgaar_data":
        var payload = message.get("payload", {})
        var seed = payload.get("seed", "")
        var grid = payload.get("grid", {})
        var pack = payload.get("pack", {})
        
        # Process the data...
        process_map_data(grid, pack, seed)
```

---

### 2. Error Message

**Type**: `azgaar_error`

**Sent when**: An error occurs during generation

**Format**:
```javascript
{
  type: "azgaar_error",
  error: "Error message string"
}
```

**Error Message Examples**:
- `"Generator not initialized"`
- `"Invalid option value: mapWidth must be positive"`
- `"Generation failed: Delaunator is required"`
- `"Rendering failed: Canvas element not found"`

**Example GDScript Handler**:
```gdscript
func _on_webview_message(message: Dictionary):
    if message.has("type") and message["type"] == "azgaar_error":
        var error_msg = message.get("error", "Unknown error")
        push_error("Azgaar generation error: " + error_msg)
        show_error_notification(error_msg)
```

---

## Godot → WebView Messages (Optional)

If you want Godot to trigger generation from GDScript (rather than user clicking a button), you can send messages to the WebView.

**Note**: This requires WebView to listen for messages. The current implementation triggers generation from user interaction, but you can extend it to listen for messages.

**Format** (if implemented):
```javascript
{
  type: "generate_map",
  options: {
    seed: "42",
    mapWidth: 800,
    mapHeight: 600,
    points: 4,
    statesNumber: 18,
    cultures: 12
  }
}
```

**GDScript Example** (if supported):
```gdscript
func trigger_map_generation():
    var message = {
        "type": "generate_map",
        "options": {
            "seed": "42",
            "mapWidth": 800,
            "mapHeight": 600,
            "points": 4,
            "statesNumber": 18,
            "cultures": 12
        }
    }
    webview.post_message(JSON.print(message))
```

---

## PostMessage Methods

The JavaScript code tries multiple postMessage methods for compatibility:

1. **`window.parent.postMessage(message, '*')`** (Standard, most common)
   - Works with most WebView implementations
   - Used by iframe-based WebViews

2. **`window.webkit.messageHandlers.godot.postMessage(JSON.stringify(message))`** (iOS WebView)
   - Used by iOS WKWebView
   - Message must be JSON stringified

3. **`window.godot.postMessage(message)`** (Custom WebView)
   - If WebView exposes a custom `window.godot` object

The JavaScript code will try all available methods and log which one succeeded.

---

## Message Size Considerations

Map data JSON can be large (typically 500KB - 2MB for 10k-20k cells, depending on compression).

**Recommendations**:
- Ensure WebView can handle messages of this size
- Consider implementing progress callbacks for very large maps
- Monitor memory usage in Godot when receiving data

**Typical Sizes**:
- 5k cells: ~200-300KB JSON
- 10k cells: ~500-800KB JSON
- 20k cells: ~1-2MB JSON

---

## Error Handling Best Practices

1. **Always check message type** before processing
2. **Validate payload structure** (check for required fields)
3. **Handle missing fields gracefully** (use `.get()` with defaults)
4. **Log errors** for debugging
5. **Show user-friendly error messages** in UI

---

## Testing

To test the postMessage protocol:

1. Open browser console in WebView (if available)
2. Generate a map
3. Check console logs for "Sent message via..." messages
4. In Godot, add print statements in message handler to verify receipt
5. Test with different map sizes to verify large message handling

---

## Troubleshooting

**Problem**: Messages not received in Godot
- Check WebView signal connection
- Verify message handler function is called
- Check console for JavaScript errors
- Try different postMessage methods

**Problem**: Large messages fail
- Check WebView message size limits
- Verify JSON parsing works for large strings
- Consider chunking for very large maps (future enhancement)

**Problem**: Messages received but structure incorrect
- Verify JSON parsing in GDScript
- Check message format matches specification
- Validate payload structure matches `getMapData()` output

---

**Document Version**: 1.0  
**Last Updated**: 2026-01-01
