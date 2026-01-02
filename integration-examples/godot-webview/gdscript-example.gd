# =============================================================================
# gdscript-example.gd
# Desc: Example GDScript for handling Azgaar Genesis messages from WebView
# Author: Lordthoth (based on original by Azgaar)
# =============================================================================
#
# NOTE: This is a REFERENCE EXAMPLE only. Adapt to your actual project structure.
#
# This shows the expected pattern for:
# - Connecting WebView message signals
# - Handling azgaar_data messages
# - Parsing JSON payload
# - Extracting key data structures
#
# INTEGRATION STEPS:
# 1. Add this code to your WebView controller script (e.g., WorldBuilder.gd)
# 2. Connect the WebView's message signal to _on_webview_message
# 3. Adapt data processing to your project's needs
# 4. Emit signals or store data as required by your architecture
#

extends Control
# Or extend whatever node type your WebView controller uses

# Signal definitions
signal map_generated(map_data: Dictionary)
signal map_generation_error(error: String)

# WebView reference (adapt to your actual WebView node path)
@onready var webview: Control = $WebView  # Adjust path as needed

# Called when the node enters the scene tree
func _ready():
	# Connect WebView message signal
	# NOTE: Signal name may vary based on your WebView plugin
	# Common names: "message_received", "script_message_received", "js_message"
	if webview.has_signal("message_received"):
		webview.connect("message_received", _on_webview_message)
	elif webview.has_signal("script_message_received"):
		webview.connect("script_message_received", _on_webview_message)
	else:
		push_error("Azgaar: WebView message signal not found. Check WebView plugin documentation.")
	
	print("Azgaar: Message handler connected")

# =============================================================================
# Message Handler
# =============================================================================

func _on_webview_message(message):
	"""
	Handle messages from WebView.
	
	Args:
		message: Dictionary or String - Message from WebView
		        If String, will attempt JSON parsing
	"""
	# Parse message if it's a string
	var message_dict: Dictionary
	if message is String:
		var json = JSON.new()
		var parse_error = json.parse(message)
		if parse_error != OK:
			push_error("Azgaar: Failed to parse message JSON: " + message)
			return
		message_dict = json.data
	elif message is Dictionary:
		message_dict = message
	else:
		push_error("Azgaar: Unknown message type: " + str(typeof(message)))
		return
	
	# Filter for Azgaar messages
	if not message_dict.has("type"):
		return  # Not an Azgaar message, ignore
	
	match message_dict["type"]:
		"azgaar_data":
			handle_azgaar_data(message_dict.get("payload", {}))
		"azgaar_error":
			handle_azgaar_error(message_dict.get("error", "Unknown error"))
		_:
			# Unknown message type, ignore
			pass

# =============================================================================
# Data Handlers
# =============================================================================

func handle_azgaar_data(payload: Dictionary):
	"""
	Handle successful map generation data.
	
	Args:
		payload: Dictionary containing seed, options, grid, pack
	"""
	if payload.is_empty():
		push_error("Azgaar: Received empty payload")
		return
	
	# Validate basic structure
	if not payload.has("grid") or not payload.has("pack"):
		push_error("Azgaar: Invalid payload structure - missing grid or pack")
		return
	
	# Extract top-level data
	var seed: String = payload.get("seed", "")
	var options: Dictionary = payload.get("options", {})
	var grid: Dictionary = payload.get("grid", {})
	var pack: Dictionary = payload.get("pack", {})
	
	print("Azgaar: Map data received - Seed: ", seed)
	
	# Extract key data structures
	var heightmap_data = extract_heightmap(grid, pack)
	var biomes_data = extract_biomes(pack)
	var features_data = extract_features(pack)
	var burgs_data = extract_burgs(pack)
	var states_data = extract_states(pack)
	var cultures_data = extract_cultures(pack)
	
	# Create map data dictionary for storage/passing
	var map_data = {
		"seed": seed,
		"options": options,
		"grid": grid,
		"pack": pack,
		"heightmap": heightmap_data,
		"biomes": biomes_data,
		"features": features_data,
		"burgs": burgs_data,
		"states": states_data,
		"cultures": cultures_data
	}
	
	# Emit signal for other systems to consume
	map_generated.emit(map_data)
	
	# Show success notification (adapt to your UI system)
	show_notification("Map generated successfully! Seed: " + seed)
	
	# Log statistics
	log_map_statistics(grid, pack)

func handle_azgaar_error(error_msg: String):
	"""
	Handle generation error.
	
	Args:
		error_msg: String error message
	"""
	push_error("Azgaar generation error: " + error_msg)
	map_generation_error.emit(error_msg)
	
	# Show error notification (adapt to your UI system)
	show_notification("Map generation failed: " + error_msg)

# =============================================================================
# Data Extraction Functions
# =============================================================================

func extract_heightmap(grid: Dictionary, pack: Dictionary) -> Dictionary:
	"""
	Extract heightmap data for terrain generation.
	
	Returns: Dictionary with heights array and points array
	"""
	var grid_cells = grid.get("cells", {})
	
	return {
		"heights": grid_cells.get("h", []),  # Array of heights 0-100
		"points": grid.get("points", []),     # Array of [x, y] coordinates
		"types": grid_cells.get("t", []),     # Array of cell types (-2 to 1)
		"dimensions": {
			"width": grid.get("cellsDesired", 0),
			"height": grid.get("cellsDesired", 0)
		}
	}

func extract_biomes(pack: Dictionary) -> Array:
	"""
	Extract biome data.
	
	Returns: Array of biome IDs (one per pack cell)
	"""
	var cells = pack.get("cells", {})
	return cells.get("biome", [])

func extract_features(pack: Dictionary) -> Array:
	"""
	Extract feature data (lakes, islands, etc.).
	
	Returns: Array of feature objects
	"""
	return pack.get("features", [])

func extract_burgs(pack: Dictionary) -> Array:
	"""
	Extract burgs (settlements) data.
	
	Returns: Array of burg objects with x, y, name, type, etc.
	"""
	return pack.get("burgs", [])

func extract_states(pack: Dictionary) -> Array:
	"""
	Extract states/kingdoms data.
	
	Returns: Array of state objects
	"""
	return pack.get("states", [])

func extract_cultures(pack: Dictionary) -> Array:
	"""
	Extract cultures data.
	
	Returns: Array of culture objects
	"""
	return pack.get("cultures", [])

# =============================================================================
# Utility Functions
# =============================================================================

func log_map_statistics(grid: Dictionary, pack: Dictionary):
	"""
	Log map statistics for debugging/verification.
	"""
	var grid_cells = grid.get("cells", {})
	var cell_count = grid_cells.get("i", []).size()
	var features = pack.get("features", [])
	var burgs = pack.get("burgs", [])
	var states = pack.get("states", [])
	var cultures = pack.get("cultures", [])
	
	print("Azgaar: Map Statistics")
	print("  - Grid cells: ", cell_count)
	print("  - Features: ", features.size())
	print("  - Burgs: ", burgs.size())
	print("  - States: ", states.size())
	print("  - Cultures: ", cultures.size())

func show_notification(message: String):
	"""
	Show notification to user (adapt to your UI system).
	
	This is a placeholder - replace with your actual notification system.
	"""
	print("Notification: ", message)
	# Example: $NotificationLabel.text = message
	# Example: $NotificationLabel.show()
	# Example: notification_timer.start()

# =============================================================================
# Optional: Trigger Generation from Godot
# =============================================================================

func trigger_map_generation(seed: String = "", width: int = 800, height: int = 600):
	"""
	Optional: Trigger map generation from GDScript.
	
	NOTE: This requires the WebView JavaScript to listen for messages.
	Current implementation triggers from user interaction, but you can extend it.
	
	Args:
		seed: String seed value (empty = random)
		width: Map width in pixels
		height: Map height in pixels
	"""
	var message = {
		"type": "generate_map",
		"options": {
			"seed": seed,
			"mapWidth": width,
			"mapHeight": height,
			"points": 4,  # ~10k cells
			"statesNumber": 18,
			"cultures": 12
		}
	}
	
	# Send message to WebView (method depends on WebView plugin)
	if webview.has_method("post_message"):
		webview.post_message(JSON.stringify(message))
	elif webview.has_method("evaluate_javascript"):
		var js_code = "window.dispatchEvent(new MessageEvent('message', {data: " + JSON.stringify(message) + "}));"
		webview.evaluate_javascript(js_code)
	else:
		push_warning("Azgaar: Cannot send message to WebView - method not available")
