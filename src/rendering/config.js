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
      density: 0.3,
      size: 1,
      shadow: true,                 // Enable shadows for depth
    },
    labels: {
      stateLabelColor: '#5c4a3a',   // Dark brown for text
      stateLabelStroke: '#f5f5dc',  // Beige for text outline
      stateLabelStrokeWidth: 0.3,
    },
  },
  
  effects: {
    parchment: {
      enabled: true,                // Enabled by default with CORS-friendly texture
      // Using transparenttextures.com for seamless old paper texture (CORS-friendly)
      textureUrl: 'https://www.transparenttextures.com/patterns/old-paper.png',
      opacity: 0.7,                 // Lower opacity for subtle texture
      blendMode: 'multiply',        // SVG blend mode
      // Note: If texture URL fails, set textureUrl to null and provide local asset later
    },
    pseudo3D: {
      enabled: true,                // Enabled by default for depth effect
      heightExaggeration: 1.0,
      shadowOffsetX: 1.5,           // Shadow offset X
      shadowOffsetY: 2,             // Shadow offset Y
      shadowBlur: 3,                // Shadow blur radius
      shadowOpacity: 0.4,           // Shadow opacity
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
 * Merge user render configuration with defaults
 * @param {Object} userConfig - Partial render configuration
 * @param {Object} baseConfig - Base configuration (defaults to parchment)
 * @returns {Object} Merged configuration
 */
export function mergeRenderConfig(userConfig = {}, baseConfig = defaultRenderConfig) {
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
