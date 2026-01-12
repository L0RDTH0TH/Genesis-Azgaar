/**
 * Styles UI Module - Adapted for Azgaar Genesis Fork
 * Ported from original/modules/ui/style-presets.js
 * Adapts style presets to use fork's renderConfig API
 */

import { getDefaultRenderConfig, mergeRenderConfig } from '../../../dist/azgaar-genesis.esm.js';

// System style presets
const systemPresets = [
  "default",
  "ancient",
  "gloom",
  "pale",
  "light",
  "watercolor",
  "clean",
  "atlas",
  "darkSeas",
  "cyberpunk",
  "night",
  "monochrome"
];

// Mapping from original style JSON selectors to renderConfig paths
const styleToConfigMap = {
  "#oceanBase": { colors: "oceanBase" },
  "#landmass": { colors: "landBase" },
  "#freshwater": { colors: "lakeFreshwater" },
  "#salt": { colors: "lakeSaltwater" },
  "#stateBorders": { colors: "stateBorderStroke" },
  "#provinceBorders": { colors: "provinceBorderStroke" },
  "#rivers": { colors: "riverStroke" },
  "#biomes": { layers: { biomes: "opacity" } },
  "#statesBody": { layers: { states: "opacity" } },
  "#ice": { layers: { ice: { opacity: "opacity" } } },
  "#texture": { effects: { parchment: { enabled: "data-href", opacity: "opacity" } } }
};

/**
 * Convert original style JSON to renderConfig
 */
function convertStyleToConfig(styleJson) {
  const config = getDefaultRenderConfig();
  
  // Map colors
  if (styleJson["#oceanBase"]?.fill) {
    config.colors.oceanBase = styleJson["#oceanBase"].fill;
  }
  if (styleJson["#landmass"]?.fill) {
    config.colors.landBase = styleJson["#landmass"].fill;
  }
  if (styleJson["#freshwater"]?.fill) {
    config.colors.lakeFreshwater = styleJson["#freshwater"].fill;
  }
  if (styleJson["#salt"]?.fill) {
    config.colors.lakeSaltwater = styleJson["#salt"].fill;
  }
  if (styleJson["#stateBorders"]?.stroke) {
    config.colors.stateBorderStroke = styleJson["#stateBorders"].stroke;
  }
  if (styleJson["#provinceBorders"]?.stroke) {
    config.colors.provinceBorderStroke = styleJson["#provinceBorders"].stroke;
  }
  if (styleJson["#rivers"]?.fill) {
    config.colors.riverStroke = styleJson["#rivers"].fill;
  }
  
  // Map layer opacities
  if (styleJson["#biomes"]?.opacity !== null && styleJson["#biomes"]?.opacity !== undefined) {
    config.layers.biomes.opacity = styleJson["#biomes"].opacity || config.layers.biomes.opacity;
  }
  if (styleJson["#statesBody"]?.opacity !== null && styleJson["#statesBody"]?.opacity !== undefined) {
    config.layers.states.opacity = styleJson["#statesBody"].opacity || config.layers.states.opacity;
  }
  
  // Map effects (parchment texture)
  if (styleJson["#texture"]) {
    const texture = styleJson["#texture"];
    if (texture["data-href"]) {
      config.effects.parchment.enabled = !!texture["data-href"];
      config.effects.parchment.textureUrl = texture["data-href"];
    }
    if (texture.opacity !== null && texture.opacity !== undefined) {
      config.effects.parchment.opacity = texture.opacity;
    }
  }
  
  // Special handling for "ancient" preset (parchment-like)
  // Check if this is the ancient preset by looking for sepia filter usage
  if (styleJson["#compass"]?.filter === "url(#filter-sepia)" || 
      styleJson["#statesBody"]?.filter === "url(#filter-sepia)") {
    config.effects.sepia.enabled = true;
    config.effects.sepia.amount = 0.4;
    config.effects.pseudo3D.enabled = true;
  }
  
  // Map vignette
  if (styleJson["#vignette"]) {
    const vignette = styleJson["#vignette"];
    if (vignette.opacity !== null && vignette.opacity !== undefined) {
      config.effects.vignette = config.effects.vignette || {};
      config.effects.vignette.enabled = vignette.opacity > 0;
      config.effects.vignette.opacity = vignette.opacity;
    }
  }
  
  return config;
}

/**
 * Fetch system style preset
 */
async function fetchSystemPreset(preset) {
  try {
    // Try to load from styles directory
    const response = await fetch(`./styles/${preset}.json`);
    if (!response.ok) {
      throw new Error(`Failed to fetch style preset: ${preset}`);
    }
    return await response.json();
  } catch (err) {
    console.warn(`Cannot fetch style preset ${preset}, using default:`, err);
    // Fallback to default
    if (preset !== 'default') {
      return fetchSystemPreset('default');
    }
    throw err;
  }
}

/**
 * Get style preset (with fallback to default)
 */
async function getStylePreset(desiredPreset) {
  let presetToLoad = desiredPreset;
  
  // Check if it's a system preset
  if (!systemPresets.includes(desiredPreset)) {
    // Custom preset - try localStorage
    const storedStyleJSON = localStorage.getItem(`fmgStyle_${desiredPreset}`);
    if (storedStyleJSON) {
      try {
        const style = JSON.parse(storedStyleJSON);
        return [desiredPreset, style];
      } catch (e) {
        console.warn(`Invalid custom style ${desiredPreset}, falling back to default`);
        presetToLoad = 'default';
      }
    } else {
      presetToLoad = 'default';
    }
  }
  
  const style = await fetchSystemPreset(presetToLoad);
  return [presetToLoad, style];
}

/**
 * Apply style preset
 */
async function applyStylePreset(presetName, onStyleChange) {
  try {
    const [appliedPreset, styleJson] = await getStylePreset(presetName);
    
    // Convert style JSON to renderConfig
    const newConfig = convertStyleToConfig(styleJson);
    
    // Update current config
    window.setCurrentRenderConfig(newConfig);
    
    // Update preset selector
    const stylePreset = document.getElementById('stylePreset');
    if (stylePreset) {
      stylePreset.value = appliedPreset;
      localStorage.setItem('presetStyle', appliedPreset);
    }
    
    // Trigger render
    if (onStyleChange) {
      onStyleChange(newConfig);
    }
    
    console.log(`Applied style preset: ${appliedPreset}`, newConfig);
  } catch (error) {
    console.error(`Failed to apply style preset ${presetName}:`, error);
    throw error;
  }
}

/**
 * Initialize styles UI
 */
export async function initializeStyles(onStyleChange, onRender) {
  const stylePreset = document.getElementById('stylePreset');
  
  if (!stylePreset) {
    console.warn('Style preset selector not found');
    return;
  }
  
  // Set up preset selector
  stylePreset.addEventListener('change', async (e) => {
    try {
      await applyStylePreset(e.target.value, onStyleChange);
    } catch (error) {
      console.error('Style change error:', error);
      // Reset to previous value
      const previousPreset = localStorage.getItem('presetStyle') || 'default';
      stylePreset.value = previousPreset;
    }
  });
  
  // Load saved preset or default
  const savedPreset = localStorage.getItem('presetStyle') || 'default';
  stylePreset.value = savedPreset;
  
  // Apply initial preset
  try {
    await applyStylePreset(savedPreset, onStyleChange);
  } catch (error) {
    console.error('Initial style application error:', error);
    // Fallback to default renderConfig
    const defaultConfig = getDefaultRenderConfig();
    window.setCurrentRenderConfig(defaultConfig);
    if (onStyleChange) {
      onStyleChange(defaultConfig);
    }
  }
  
  // Expose module methods for external use
  window.stylesModule = {
    applyPreset: (preset) => applyStylePreset(preset, onStyleChange),
    getStylePreset: (preset) => getStylePreset(preset)
  };
}
