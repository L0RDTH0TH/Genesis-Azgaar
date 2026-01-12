/**
 * Layers UI Module - Adapted for Azgaar Genesis Fork
 * Ported from original/modules/ui/layers.js
 * Adapts layer presets and toggles to use fork's renderConfig API
 */

import { getDefaultRenderConfig, mergeRenderConfig } from '../../../dist/azgaar-genesis.esm.js';

// Layer presets (adapted from original)
const defaultPresets = {
  political: [
    "toggleBorders",
    "toggleBurgIcons",
    "toggleIce",
    "toggleLabels",
    "toggleRivers",
    "toggleRoutes",
    "toggleScaleBar",
    "toggleStates",
    "toggleVignette"
  ],
  cultural: [
    "toggleBorders",
    "toggleBurgIcons",
    "toggleCultures",
    "toggleLabels",
    "toggleRivers",
    "toggleRoutes",
    "toggleScaleBar",
    "toggleVignette"
  ],
  religions: [
    "toggleBorders",
    "toggleBurgIcons",
    "toggleLabels",
    "toggleReligions",
    "toggleRivers",
    "toggleRoutes",
    "toggleScaleBar",
    "toggleVignette"
  ],
  provinces: [
    "toggleBorders",
    "toggleBurgIcons",
    "toggleProvinces",
    "toggleRivers",
    "toggleScaleBar",
    "toggleVignette"
  ],
  biomes: ["toggleBiomes", "toggleIce", "toggleRivers", "toggleScaleBar", "toggleVignette"],
  heightmap: ["toggleHeight", "toggleRivers", "toggleVignette"],
  physical: ["toggleCoordinates", "toggleHeight", "toggleIce", "toggleRivers", "toggleScaleBar", "toggleVignette"],
  poi: [
    "toggleBorders",
    "toggleBurgIcons",
    "toggleHeight",
    "toggleIce",
    "toggleMarkers",
    "toggleRivers",
    "toggleRoutes",
    "toggleScaleBar",
    "toggleVignette"
  ],
  military: [
    "toggleBorders",
    "toggleBurgIcons",
    "toggleLabels",
    "toggleMilitary",
    "toggleRivers",
    "toggleRoutes",
    "toggleScaleBar",
    "toggleStates",
    "toggleVignette"
  ],
  emblems: [
    "toggleBorders",
    "toggleBurgIcons",
    "toggleIce",
    "toggleEmblems",
    "toggleRivers",
    "toggleRoutes",
    "toggleScaleBar",
    "toggleStates",
    "toggleVignette"
  ],
  landmass: ["toggleScaleBar"]
};

// Layer definitions mapping to renderConfig paths
const layerConfigMap = {
  toggleBiomes: { path: ['layers', 'biomes', 'enabled'], default: true },
  toggleStates: { path: ['layers', 'states', 'enabled'], default: true },
  toggleRivers: { path: ['layers', 'rivers', 'enabled'], default: true },
  toggleBorders: { path: ['layers', 'borders', 'enabled'], default: true },
  toggleBurgIcons: { path: ['layers', 'burgs', 'enabled'], default: true },
  toggleLabels: { path: ['layers', 'labels', 'enabled'], default: true },
  toggleRoutes: { path: ['layers', 'routes', 'enabled'], default: true },
  toggleRelief: { path: ['layers', 'relief', 'enabled'], default: true },
  toggleCoast: { path: ['layers', 'coast', 'enabled'], default: true },
  // Note: Some layers (ice, cultures, religions, provinces, markers, military, emblems)
  // may not be directly mapped in renderConfig yet - will need to be added later
  toggleIce: { path: ['layers', 'ice', 'enabled'], default: true },
  toggleCultures: { path: ['layers', 'cultures', 'enabled'], default: true },
  toggleReligions: { path: ['layers', 'religions', 'enabled'], default: true },
  toggleProvinces: { path: ['layers', 'provinces', 'enabled'], default: true },
  toggleMarkers: { path: ['layers', 'markers', 'enabled'], default: true },
  toggleMilitary: { path: ['layers', 'military', 'enabled'], default: true },
  toggleEmblems: { path: ['layers', 'emblems', 'enabled'], default: true },
  toggleHeight: { path: ['layers', 'height', 'enabled'], default: true },
  toggleCoordinates: { path: ['layers', 'coordinates', 'enabled'], default: true },
  toggleScaleBar: { path: ['layers', 'scaleBar', 'enabled'], default: true },
  toggleVignette: { path: ['effects', 'vignette', 'enabled'], default: true }
};

// Current layer state
let currentLayers = {};
let currentPreset = 'political';

/**
 * Get layer state from renderConfig
 */
function getLayerStateFromConfig(renderConfig, layerId) {
  const layerDef = layerConfigMap[layerId];
  if (!layerDef) return layerDef?.default ?? true;
  
  let value = renderConfig;
  for (const key of layerDef.path) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key];
    } else {
      return layerDef.default;
    }
  }
  
  return value !== undefined ? value : layerDef.default;
}

/**
 * Set layer state in renderConfig
 */
function setLayerStateInConfig(renderConfig, layerId, enabled) {
  const layerDef = layerConfigMap[layerId];
  if (!layerDef) return renderConfig;
  
  // Deep copy config
  const newConfig = JSON.parse(JSON.stringify(renderConfig));
  
  // Navigate to the target path
  let target = newConfig;
  for (let i = 0; i < layerDef.path.length - 1; i++) {
    const key = layerDef.path[i];
    if (!target[key]) {
      target[key] = {};
    }
    target = target[key];
  }
  
  // Set the value
  const lastKey = layerDef.path[layerDef.path.length - 1];
  target[lastKey] = enabled;
  
  return newConfig;
}

/**
 * Initialize layers UI
 */
export async function initializeLayers(onLayerChange, onRender) {
  const layersPreset = document.getElementById('layersPreset');
  const mapLayers = document.getElementById('mapLayers');
  
  if (!layersPreset || !mapLayers) {
    console.warn('Layers UI elements not found');
    return;
  }
  
  // Populate layer list
  const layerNames = {
    toggleBiomes: 'Biomes',
    toggleStates: 'States',
    toggleRivers: 'Rivers',
    toggleBorders: 'Borders',
    toggleBurgIcons: 'Burg Icons',
    toggleLabels: 'Labels',
    toggleRoutes: 'Routes',
    toggleRelief: 'Relief',
    toggleCoast: 'Coast',
    toggleIce: 'Ice',
    toggleCultures: 'Cultures',
    toggleReligions: 'Religions',
    toggleProvinces: 'Provinces',
    toggleMarkers: 'Markers',
    toggleMilitary: 'Military',
    toggleEmblems: 'Emblems',
    toggleHeight: 'Heightmap',
    toggleCoordinates: 'Coordinates',
    toggleScaleBar: 'Scale Bar',
    toggleVignette: 'Vignette'
  };
  
  // Create layer buttons
  Object.entries(layerNames).forEach(([layerId, layerName]) => {
    const li = document.createElement('li');
    li.id = layerId;
    li.textContent = layerName;
    li.addEventListener('click', () => {
      toggleLayer(layerId, onLayerChange);
    });
    mapLayers.appendChild(li);
  });
  
  // Set up preset selector
  layersPreset.addEventListener('change', (e) => {
    applyPreset(e.target.value, onLayerChange);
  });
  
  // Apply default preset
  applyPreset('political', onLayerChange);
  
  // Expose module methods for external use
  window.layersModule = {
    applyPreset: (preset) => applyPreset(preset, onLayerChange),
    resetToDefault: () => applyPreset('political', onLayerChange),
    toggleLayer: (layerId) => toggleLayer(layerId, onLayerChange)
  };
}

/**
 * Toggle a layer
 */
function toggleLayer(layerId, onLayerChange) {
  const layerButton = document.getElementById(layerId);
  if (!layerButton) return;
  
  // Toggle visual state
  const wasOn = !layerButton.classList.contains('buttonoff');
  const nowOn = !wasOn;
  
  if (nowOn) {
    layerButton.classList.remove('buttonoff');
  } else {
    layerButton.classList.add('buttonoff');
  }
  
  // Update renderConfig
  const currentConfig = window.getCurrentRenderConfig();
  const newConfig = setLayerStateInConfig(currentConfig, layerId, nowOn);
  window.setCurrentRenderConfig(newConfig);
  
  // Trigger render
  if (onLayerChange) {
    onLayerChange(newConfig);
  }
  
  // Update preset selector if needed
  updatePresetSelector();
}

/**
 * Apply a preset
 */
function applyPreset(presetName, onLayerChange) {
  const preset = defaultPresets[presetName];
  if (!preset) {
    console.warn(`Unknown preset: ${presetName}`);
    return;
  }
  
  currentPreset = presetName;
  
  // Update preset selector
  const layersPreset = document.getElementById('layersPreset');
  if (layersPreset) {
    layersPreset.value = presetName;
  }
  
  // Get current config
  let newConfig = window.getCurrentRenderConfig();
  
  // Apply preset layers
  Object.keys(layerConfigMap).forEach(layerId => {
    const shouldBeOn = preset.includes(layerId);
    const layerButton = document.getElementById(layerId);
    
    if (layerButton) {
      if (shouldBeOn) {
        layerButton.classList.remove('buttonoff');
      } else {
        layerButton.classList.add('buttonoff');
      }
    }
    
    // Update config
    newConfig = setLayerStateInConfig(newConfig, layerId, shouldBeOn);
  });
  
  // Update and trigger render
  window.setCurrentRenderConfig(newConfig);
  if (onLayerChange) {
    onLayerChange(newConfig);
  }
}

/**
 * Update preset selector based on current layer state
 */
function updatePresetSelector() {
  const activeLayers = Array.from(document.querySelectorAll('#mapLayers > li:not(.buttonoff)'))
    .map(li => li.id)
    .sort();
  
  // Check if current state matches a preset
  for (const [presetName, presetLayers] of Object.entries(defaultPresets)) {
    const sortedPreset = [...presetLayers].sort();
    if (JSON.stringify(sortedPreset) === JSON.stringify(activeLayers)) {
      const layersPreset = document.getElementById('layersPreset');
      if (layersPreset && layersPreset.value !== presetName) {
        layersPreset.value = presetName;
      }
      return;
    }
  }
  
  // No match - set to custom
  const layersPreset = document.getElementById('layersPreset');
  if (layersPreset && layersPreset.value !== 'custom') {
    layersPreset.value = 'custom';
  }
}
