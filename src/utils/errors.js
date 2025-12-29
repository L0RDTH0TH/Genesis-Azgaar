/**
 * =============================================================================
 * errors.js
 * Desc: Custom error classes for Azgaar Genesis Mythos fork
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

/**
 * Base error class for generator errors
 */
export class GeneratorError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Thrown when API methods are called before initGenerator(), 
 * or when initGenerator() is called multiple times
 */
export class InitializationError extends GeneratorError {
  constructor(message = 'Generator not initialized. Call initGenerator() first.') {
    super(message);
  }
}

/**
 * Thrown when loadOptions() receives invalid parameter values
 */
export class InvalidOptionError extends GeneratorError {
  constructor(key, value, message) {
    super(message || `Invalid option value for '${key}': ${value}`);
    this.key = key;
    this.value = value;
  }
}

/**
 * Thrown when map generation fails
 */
export class GenerationError extends GeneratorError {
  constructor(message = 'Map generation failed') {
    super(message);
  }
}

/**
 * Thrown when getMapData() or renderPreview() is called before generateMap()
 */
export class NoDataError extends GeneratorError {
  constructor(message = 'No map data available. Call generateMap() first.') {
    super(message);
  }
}

/**
 * Thrown when renderPreview() is called but no canvas was provided
 */
export class NoCanvasError extends GeneratorError {
  constructor(message = 'No canvas provided. Initialize generator with a canvas element.') {
    super(message);
  }
}
