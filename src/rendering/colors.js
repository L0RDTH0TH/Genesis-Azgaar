/**
 * =============================================================================
 * colors.js
 * Desc: Dynamic color schemes for map rendering (ported from original/ui/style.js)
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

import { scaleSequential } from 'd3-scale';
import { interpolateRgbBasis, interpolateRgb } from 'd3-interpolate';

/**
 * Simplified spectral interpolator (red-yellow-green-blue-purple spectrum)
 */
function interpolateSpectral(t) {
  // Simplified spectral: red -> yellow -> green -> cyan -> blue -> purple
  if (t < 0.2) {
    const s = t / 0.2;
    return interpolateRgb("#d7191c", "#fdae61")(s);
  } else if (t < 0.4) {
    const s = (t - 0.2) / 0.2;
    return interpolateRgb("#fdae61", "#abdda4")(s);
  } else if (t < 0.6) {
    const s = (t - 0.4) / 0.2;
    return interpolateRgb("#abdda4", "#2b83ba")(s);
  } else {
    const s = (t - 0.6) / 0.4;
    return interpolateRgb("#2b83ba", "#5e4fa2")(s);
  }
}

/**
 * Simplified RdYlGn (Red-Yellow-Green) interpolator
 */
function interpolateRdYlGn(t) {
  if (t < 0.5) {
    return interpolateRgb("#d7191c", "#ffffbf")(t * 2);
  } else {
    return interpolateRgb("#ffffbf", "#1a9641")((t - 0.5) * 2);
  }
}

/**
 * Simplified Greens interpolator
 */
function interpolateGreens(t) {
  return interpolateRgb("#f7fcf5", "#00441b")(t);
}

/**
 * Simplified Greys interpolator
 */
function interpolateGreys(t) {
  return interpolateRgb("#ffffff", "#000000")(t);
}

/**
 * Parchment-style interpolator (muted sepia tones, low saturation)
 * Vintage map aesthetic: light beige → tan → brown → dark brown
 */
function interpolateParchment(t) {
  // Parchment colors: light beige → tan → sienna → dark brown
  // Heights: low (coastal) → medium (plains) → high (mountains)
  if (t < 0.33) {
    const s = t / 0.33;
    return interpolateRgb("#f5f5dc", "#d2b48c")(s); // Beige → Tan
  } else if (t < 0.67) {
    const s = (t - 0.33) / 0.34;
    return interpolateRgb("#d2b48c", "#a0826d")(s); // Tan → Brown
  } else {
    const s = (t - 0.67) / 0.33;
    return interpolateRgb("#a0826d", "#5c4a3a")(s); // Brown → Dark Brown
  }
}

/**
 * Color scheme definitions
 * Ported from original/modules/ui/style.js (with simplified interpolators)
 */
const colorSchemes = {
  bright: scaleSequential(interpolateSpectral),
  light: scaleSequential(interpolateRdYlGn),
  natural: scaleSequential(interpolateRgbBasis(["white", "#EEEECC", "tan", "green", "teal"])),
  green: scaleSequential(interpolateGreens),
  olive: scaleSequential(interpolateRgbBasis(["#ffffff", "#cea48d", "#d5b085", "#0c2c19", "#151320"])),
  livid: scaleSequential(interpolateRgbBasis(["#BBBBDD", "#2A3440", "#17343B", "#0A1E24"])),
  monochrome: scaleSequential(interpolateGreys),
  parchment: scaleSequential(interpolateParchment) // Parchment-style muted earth tones
};

/**
 * Get color scheme by name
 * @param {string} scheme - Scheme name ('bright', 'natural', etc.)
 * @returns {Function} D3 scaleSequential function
 */
export function getColorScheme(scheme = "bright") {
  if (scheme in colorSchemes) {
    return colorSchemes[scheme];
  }
  
  // Custom scheme: parse comma-separated colors
  if (scheme.includes(',')) {
    const colors = scheme.split(',').map(c => c.trim());
    if (!(scheme in colorSchemes)) {
      colorSchemes[scheme] = scaleSequential(interpolateRgbBasis(colors));
    }
    return colorSchemes[scheme];
  }
  
  // Default to bright if scheme not found
  return colorSchemes.bright;
}

/**
 * Get color for a value using a color scheme
 * Ported from original/modules/ui/style.js:getColor()
 * @param {number} value - Value to colorize (typically height 0-100)
 * @param {Function|string} scheme - Color scheme function or name
 * @returns {string} Hex color string
 */
export function getColor(value, scheme = "bright") {
  const colorScale = typeof scheme === 'function' ? scheme : getColorScheme(scheme);
  
  // Match original logic: invert and normalize to [0, 1]
  // Original: scheme(1 - (value < 20 ? value - 5 : value) / 100)
  const normalized = 1 - (value < 20 ? value - 5 : value) / 100;
  return colorScale(Math.max(0, Math.min(1, normalized)));
}

/**
 * Get biome color with optional color scheme enhancement (Phase 4: Advanced blending)
 * @param {number} biomeIndex - Biome index
 * @param {Array<string>} defaultColors - Default biome colors array
 * @param {string|Function} colorScheme - Optional color scheme name or function
 * @param {number} height - Optional height value for height-based coloring
 * @param {number} moisture - Optional moisture/flux value (0-100)
 * @param {number} temperature - Optional temperature value (-50 to 50)
 * @returns {string} Hex color string
 */
export function getBiomeColor(biomeIndex, defaultColors, colorScheme = null, height = null, moisture = null, temperature = null) {
  // Use default biome color if no scheme provided
  if (!colorScheme && biomeIndex >= 0 && biomeIndex < defaultColors.length) {
    return defaultColors[biomeIndex];
  }
  
  // Phase 4: Advanced 3-way blending (height 30%, moisture 30%, temp 40%)
  if (height !== null && moisture !== null && temperature !== null && colorScheme) {
    return getAdvancedBiomeColor(biomeIndex, defaultColors, colorScheme, height, moisture, temperature);
  }
  
  // Fallback to height-based only (Phase 3)
  if (height !== null && colorScheme) {
    return getColor(height, colorScheme);
  }
  
  // Default to biome's default color
  return biomeIndex >= 0 && biomeIndex < defaultColors.length 
    ? defaultColors[biomeIndex] 
    : '#cccccc';
}

/**
 * Get advanced biome color with 3-way blending (Phase 4: height + moisture + temperature)
 * Target influence: 30% height, 30% moisture, 40% temperature.
 *
 * Implementation detail:
 * - First blend height + moisture with a 50/50 mix
 * - Then blend that result with temperature so the final weights are:
 *   height ≈ 30%, moisture ≈ 30%, temperature ≈ 40%.
 * - Finally, softly mix in the default biome color to keep palette fidelity.
 *
 * @param {number} biomeIndex - Biome index
 * @param {Array<string>} defaultColors - Default biome colors array
 * @param {string|Function} colorScheme - Color scheme
 * @param {number} height - Height value (0-100)
 * @param {number} moisture - Moisture/flux value (0-100)
 * @param {number} temperature - Temperature value (-50 to 50)
 * @returns {string} Hex color string
 */
function getAdvancedBiomeColor(biomeIndex, defaultColors, colorScheme, height, moisture, temperature) {
  const baseColor =
    biomeIndex >= 0 && biomeIndex < defaultColors.length
      ? defaultColors[biomeIndex]
      : '#cccccc';

  // Height color (influenced by global color scheme)
  const heightColor = getColor(height, colorScheme);

  // Moisture color: wetter = greener
  const moistureNormalized = Math.max(0, Math.min(1, moisture / 100));
  const moistureColor = interpolateRgb('#d4a574', '#2d8659')(moistureNormalized); // Tan → green

  // Temperature color: colder = blue/white, hotter = red
  const tempNormalized = Math.max(0, Math.min(1, (temperature + 50) / 100)); // -50..50 → 0..1
  const tempColor = interpolateRgb('#b3d9ff', '#ff6b6b')(tempNormalized); // Blue → red

  // Step 1: 50/50 blend of height & moisture → each 0.3 of final (before base mix)
  const heightMoisture = blendColors(heightColor, moistureColor, 0.5);

  // Step 2: blend with temperature so temp gets 40% influence:
  // ratio = (height+moisture) / (height+moisture+temp) = 0.6 / 1.0 = 0.6
  // => height: 0.3, moisture: 0.3, temp: 0.4
  const climateBlend = blendColors(heightMoisture, tempColor, 0.6);

  // Step 3: gently pull towards the base biome palette (pastel, not washed out)
  // 70% climate-driven color, 30% default biome color.
  const finalColor = blendColors(climateBlend, baseColor, 0.7);

  return finalColor;
}

/**
 * Blend two hex colors (utility for advanced blending)
 * @param {string} color1 - First hex color
 * @param {string} color2 - Second hex color
 * @param {number} ratio - Blend ratio (0-1, 0 = all color1, 1 = all color2)
 * @returns {string} Blended hex color
 */
function blendColors(color1, color2, ratio) {
  const hex1 = color1.replace('#', '');
  const hex2 = color2.replace('#', '');
  
  const r1 = parseInt(hex1.substr(0, 2), 16);
  const g1 = parseInt(hex1.substr(2, 2), 16);
  const b1 = parseInt(hex1.substr(4, 2), 16);
  
  const r2 = parseInt(hex2.substr(0, 2), 16);
  const g2 = parseInt(hex2.substr(2, 2), 16);
  const b2 = parseInt(hex2.substr(4, 2), 16);
  
  const r = Math.round(r1 * ratio + r2 * (1 - ratio));
  const g = Math.round(g1 * ratio + g2 * (1 - ratio));
  const b = Math.round(b1 * ratio + b2 * (1 - ratio));
  
  return `#${[r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('')}`;
}

/**
 * Get ocean color with depth-based gradient
 * @param {number} depth - Ocean depth (negative value, e.g., -1 to -9)
 * @param {string|Function} colorScheme - Optional color scheme
 * @returns {string} Hex color string
 */
export function getOceanColor(depth, colorScheme = null) {
  // Base ocean color
  const baseColor = '#b4d2f3';
  
  if (!colorScheme || depth >= 0) {
    return baseColor;
  }
  
  // Darken based on depth (depth is negative, so -9 is deepest)
  const depthNormalized = Math.abs(depth) / 9; // 0 to 1
  const colorScale = typeof colorScheme === 'function' ? colorScheme : getColorScheme(colorScheme);
  
  // Use blue tones for ocean depth
  const oceanInterpolator = interpolateRgbBasis([baseColor, '#7fa8d9', '#4a7fb0', '#2a4f7f']);
  return oceanInterpolator(depthNormalized);
}

/**
 * List available color schemes
 * @returns {Array<string>} Array of scheme names
 */
export function listColorSchemes() {
  return Object.keys(colorSchemes);
}
