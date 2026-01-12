/**
 * =============================================================================
 * config.js
 * Desc: Render configuration defaults and presets for Azgaar Genesis Mythos fork
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

import { deepCopy } from '../utils/array.js';

/**
 * Default render configuration (parchment-style aesthetic)
 * Muted sepia tones, low saturation, vintage map appearance
 */
export const defaultRenderConfig = {
  colors: {
    oceanBase: '#d2b48c',           // Tan/sand for ocean (parchment-style)
    landBase: '#f5f5dc',            // Beige for land
    lakeFreshwater: '#d4a574',      // Muted tan for freshwater
    lakeSaltwater: '#c9a671',       // Slightly darker tan for saltwater
    stateBorderStroke: '#654321',   // Dark brown ink for borders (parchment-style)
    provinceBorderStroke: '#654321', // Same for provinces
    riverStroke: '#a0826d',         // Muted brown for rivers
    riverFill: '#d4a574',           // Light tan for river fill
    burgCapitalColor: '#5c4a3a',    // Dark brown for capitals
    burgTownColor: '#7d6b5a',       // Medium brown for towns
    routeStroke: '#8b7355',         // Muted brown for routes
    reliefShadow: '#4a4a3a',        // Dark brown/gray for relief shadows
  },
  
  layers: {
    biomes: {
      opacity: 0.6,                 // Lower opacity for parchment look
      showShadows: true,            // Enable relief shadows
    },
    states: {
      opacity: 0.4,                 // Lower opacity for parchment look (reduced from 0.5)
    },
    borders: {
      stateWidth: 1,
      stateDashArray: '2',
      provinceWidth: 0.5,
      provinceDashArray: '0 2',
    },
    rivers: {
      strokeWidth: 0.5,
      showLabels: false,
    },
    burgs: {
      capitalSize: 1,
      townSize: 0.5,
      showLabels: true,
    },
    relief: {
      density: 1.2,                 // Increased density multiplier for dense shaded mountains
      size: 1,
      shadow: true,                 // Enable shadows for depth
      heightScaling: true,          // Scale relief icons based on height
    },
    coast: {
      enabled: true,                // Enable white glowing coast outline
      stroke: '#ffffff',            // White stroke for glow
      width: 2,                     // Stroke width
      opacity: 0.8,                 // Stroke opacity
      glowWidth: 3,                 // Outer glow width (wider behind main border)
    },
    labels: {
      stateLabelColor: '#5c4a3a',   // Dark brown for text
      stateLabelStroke: '#f5f5dc',  // Beige for text outline
      stateLabelStrokeWidth: 0.3,
    },
  },
  
  effects: {
    parchment: {
      enabled: true,                // Enabled by default with parchment texture
      // Try Azgaar's classic pergamena texture (fallback to transparenttextures if CORS issues)
      textureUrl: 'https://i2.wp.com/azgaar.files.wordpress.com/2019/07/pergamena-small.jpg',
      opacity: 0.65,                // Slightly lower opacity for stronger parchment grain
      blendMode: 'multiply',        // SVG blend mode (ensures multiply for parchment effect)
      // Fallback texture URL (used if primary URL fails to load)
      fallbackTextureUrl: 'https://www.transparenttextures.com/patterns/old-paper.png',
      // Note: If both URLs fail, set textureUrl to null and provide local asset later
    },
    pseudo3D: {
      enabled: true,                // Enabled by default for depth effect
      heightExaggeration: 1.0,
      shadowOffsetX: 2,             // Stronger shadow offset X (increased from 1.5)
      shadowOffsetY: 3,             // Stronger shadow offset Y (increased from 2)
      shadowBlur: 4,                // Stronger shadow blur (increased from 3)
      shadowOpacity: 0.5,           // Stronger shadow opacity (increased from 0.4)
    },
    sepia: {
      enabled: true,                // Enable sepia tone filter by default
      amount: 0.4,                  // 0-1, higher = more sepia
    },
  },
  
  colorScheme: 'parchment',         // Default color scheme name
};

/**
 * Original Azgaar default render configuration (vibrant colors)
 * Preserved for backward compatibility and as a preset option
 */
export const originalRenderConfig = {
  colors: {
    oceanBase: '#b4d2f3',
    landBase: '#eef6fb',
    lakeFreshwater: '#a8c8e0',
    lakeSaltwater: '#9bb5d1',
    stateBorderStroke: '#56566d',
    provinceBorderStroke: '#56566d',
    riverStroke: '#6b93d6',
    riverFill: '#a8c8e0',
    burgCapitalColor: '#333',
    burgTownColor: '#666',
    routeStroke: '#8b7355',
    reliefShadow: '#666666',
  },
  
  layers: {
    biomes: {
      opacity: 0.7,
      showShadows: false,
    },
    states: {
      opacity: 0.5,
    },
    borders: {
      stateWidth: 1,
      stateDashArray: '2',
      provinceWidth: 0.5,
      provinceDashArray: '0 2',
    },
    rivers: {
      strokeWidth: 0.5,
      showLabels: false,
    },
    burgs: {
      capitalSize: 1,
      townSize: 0.5,
      showLabels: true,
    },
    relief: {
      density: 0.3,
      size: 1,
      shadow: false,
    },
    labels: {
      stateLabelColor: '#000000',
      stateLabelStroke: '#ffffff',
      stateLabelStrokeWidth: 0.3,
    },
  },
  
  effects: {
    parchment: {
      enabled: false,
      textureUrl: null,
      opacity: 0.8,
      blendMode: 'multiply',
    },
    pseudo3D: {
      enabled: false,
      heightExaggeration: 1.0,
    },
    sepia: {
      enabled: false,
      amount: 0.4,
    },
  },
  
  colorScheme: 'bright',
};

/**
 * Check if a config object is a full render configuration
 * A full config must have all top-level keys (colors, layers, effects, colorScheme)
 * AND at least one parchment-specific value (to distinguish from partial configs)
 * @param {Object} config - Config object to check
 * @returns {boolean} True if config appears to be a complete render config
 */
function isFullConfig(config) {
  if (!config || typeof config !== 'object') {
    return false;
  }
  
  // Must have all top-level keys from defaultRenderConfig
  const requiredKeys = ['colors', 'layers', 'effects'];
  const hasAllKeys = requiredKeys.every(key => 
    config[key] && typeof config[key] === 'object'
  );
  
  if (!hasAllKeys) {
    return false;
  }
  
  // Must have at least one parchment-specific value to be considered "full"
  // This helps distinguish full configs from partial configs that happen to have all keys
  const hasParchmentIndicator = 
    // Parchment tan ocean color
    config.colors?.oceanBase === '#d2b48c' ||
    // Parchment effect enabled
    config.effects?.parchment?.enabled === true ||
    // Or original style (bright ocean color)
    config.colors?.oceanBase === '#b4d2f3' ||
    // Or explicitly set colorScheme
    (config.colorScheme && ['parchment', 'bright'].includes(config.colorScheme)) ||
    // Or relief density set to parchment value (1.2)
    config.layers?.relief?.density === 1.2;
  
  return hasParchmentIndicator;
}

/**
 * Merge user render configuration with defaults
 * @param {Object} userConfig - Partial render configuration (or full config to use directly)
 * @param {Object} baseConfig - Base configuration (defaults to parchment)
 * @returns {Object} Merged configuration
 */
export function mergeRenderConfig(userConfig = {}, baseConfig = defaultRenderConfig) {
  // FIRST: Check if userConfig is a full config object
  // Full config detection prevents bundle-baked defaults from overriding user-provided full configs
  // This is critical when bundle has outdated defaults but user passes complete config
  if (isFullConfig(userConfig)) {
    // Full config provided - bypass merge and use directly
    // This prevents stale bundle defaults from overriding user's complete config
    if (typeof console !== 'undefined' && console.log) {
      console.log('[mergeRenderConfig] Using: FULL USER CONFIG (bypass)');
    }
    return deepCopy(userConfig);
  }
  
  // Partial config - merge with defaults
  // Fallback/default logic: deep merge user partial config over base defaults
  if (typeof console !== 'undefined' && console.log) {
    console.log('[mergeRenderConfig] Using: MERGED CONFIG');
  }
  
  const merged = deepCopy(baseConfig);
  
  // Deep merge user config
  if (userConfig.colors) {
    Object.assign(merged.colors, userConfig.colors);
  }
  
  if (userConfig.layers) {
    for (const layerKey in userConfig.layers) {
      if (merged.layers[layerKey] && typeof merged.layers[layerKey] === 'object') {
        Object.assign(merged.layers[layerKey], userConfig.layers[layerKey]);
      } else {
        merged.layers[layerKey] = userConfig.layers[layerKey];
      }
    }
  }
  
  if (userConfig.effects) {
    for (const effectKey in userConfig.effects) {
      if (merged.effects[effectKey] && typeof merged.effects[effectKey] === 'object') {
        Object.assign(merged.effects[effectKey], userConfig.effects[effectKey]);
      } else {
        merged.effects[effectKey] = userConfig.effects[effectKey];
      }
    }
  }
  
  if (userConfig.colorScheme !== undefined) {
    merged.colorScheme = userConfig.colorScheme;
  }
  
  return merged;
}

/**
 * Get default render configuration
 * @returns {Object} Deep copy of default render config
 */
export function getDefaultRenderConfig() {
  return deepCopy(defaultRenderConfig);
}

/**
 * Get original render configuration (for backward compatibility)
 * @returns {Object} Deep copy of original render config
 */
export function getOriginalRenderConfig() {
  return deepCopy(originalRenderConfig);
}
