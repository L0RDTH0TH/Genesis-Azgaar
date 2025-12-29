/**
 * =============================================================================
 * options.test.js
 * Desc: Unit tests for options module
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

import { describe, test, expect } from '@jest/globals';
import {
  getDefaultOptions,
  mergeOptions,
  getCellsFromPoints,
  getCellsDesired,
} from '../src/options.js';

describe('Options', () => {
  test('getDefaultOptions should return default options object', () => {
    const options = getDefaultOptions();
    expect(options).toBeDefined();
    expect(options.mapWidth).toBe(960);
    expect(options.mapHeight).toBe(540);
    expect(options.points).toBe(4);
    expect(options.statesNumber).toBe(18);
    expect(options.temperatureEquator).toBe(27);
    expect(options.winds).toEqual([225, 45, 225, 315, 135, 315]);
  });

  test('getDefaultOptions should return a deep copy', () => {
    const options1 = getDefaultOptions();
    const options2 = getDefaultOptions();
    expect(options1).not.toBe(options2);
    options1.mapWidth = 999;
    expect(options2.mapWidth).toBe(960); // Original unchanged
  });

  test('mergeOptions should merge user options with defaults', () => {
    const userOptions = {
      mapWidth: 1920,
      mapHeight: 1080,
      statesNumber: 25,
    };
    const merged = mergeOptions(userOptions);
    expect(merged.mapWidth).toBe(1920);
    expect(merged.mapHeight).toBe(1080);
    expect(merged.statesNumber).toBe(25);
    expect(merged.points).toBe(4); // Default preserved
    expect(merged.temperatureEquator).toBe(27); // Default preserved
  });

  test('mergeOptions should clamp out-of-range values', () => {
    const userOptions = {
      mapWidth: 50, // Below minimum (240)
      mapHeight: 50000, // Above maximum (10000)
      statesNumber: -5, // Below minimum (0)
      temperatureEquator: 100, // Above maximum (50)
    };
    const merged = mergeOptions(userOptions);
    expect(merged.mapWidth).toBe(240); // Clamped to minimum
    expect(merged.mapHeight).toBe(10000); // Clamped to maximum
    expect(merged.statesNumber).toBe(0); // Clamped to minimum
    expect(merged.temperatureEquator).toBe(50); // Clamped to maximum
  });

  test('mergeOptions should validate enum values', () => {
    const userOptions = {
      culturesSet: 'invalid',
      stateLabelsMode: 'invalid',
      distanceUnit: 'invalid',
    };
    const merged = mergeOptions(userOptions);
    expect(merged.culturesSet).toBe('world'); // Default restored
    expect(merged.stateLabelsMode).toBe('auto'); // Default restored
    expect(merged.distanceUnit).toBe('km'); // Default restored
  });

  test('mergeOptions should validate valid enum values', () => {
    const userOptions = {
      culturesSet: 'highFantasy',
      stateLabelsMode: 'always',
      distanceUnit: 'mi',
      heightUnit: 'ft',
      temperatureScale: '°F',
    };
    const merged = mergeOptions(userOptions);
    expect(merged.culturesSet).toBe('highFantasy');
    expect(merged.stateLabelsMode).toBe('always');
    expect(merged.distanceUnit).toBe('mi');
    expect(merged.heightUnit).toBe('ft');
    expect(merged.temperatureScale).toBe('°F');
  });

  test('mergeOptions should validate and clamp winds array', () => {
    const userOptions = {
      winds: [100, 200, 300, 400, 500, 600], // Some out of range
    };
    const merged = mergeOptions(userOptions);
    expect(merged.winds).toHaveLength(6);
    expect(merged.winds[0]).toBe(100);
    expect(merged.winds[5]).toBe(360); // Clamped (600 -> 360)
  });

  test('mergeOptions should restore default winds for invalid array', () => {
    const userOptions = {
      winds: [100, 200], // Wrong length
    };
    const merged = mergeOptions(userOptions);
    expect(merged.winds).toEqual([225, 45, 225, 315, 135, 315]);
  });

  test('mergeOptions should handle manors auto value', () => {
    const userOptions = {
      manors: 'auto',
    };
    const merged = mergeOptions(userOptions);
    expect(merged.manors).toBe(1000); // 'auto' converted to 1000
  });

  test('mergeOptions should calculate cellsDesired from points', () => {
    const userOptions = {
      points: 4,
    };
    const merged = mergeOptions(userOptions);
    expect(merged.cellsDesired).toBe(10000);
  });

  test('getCellsFromPoints should return correct cell count', () => {
    expect(getCellsFromPoints(1)).toBe(1000);
    expect(getCellsFromPoints(4)).toBe(10000);
    expect(getCellsFromPoints(13)).toBe(100000);
    expect(getCellsFromPoints(99)).toBe(10000); // Invalid -> default
  });

  test('getCellsDesired should return cellsDesired if present', () => {
    const options = { cellsDesired: 5000, points: 4 };
    expect(getCellsDesired(options)).toBe(5000);
  });

  test('getCellsDesired should calculate from points if cellsDesired not present', () => {
    const options = { points: 3 };
    expect(getCellsDesired(options)).toBe(5000);
  });

  test('getCellsDesired should use default if neither present', () => {
    const options = {};
    expect(getCellsDesired(options)).toBe(10000); // Default points=4 -> 10000
  });

  test('mergeOptions should handle null values correctly', () => {
    const userOptions = {
      seed: null,
      template: null,
      mapSize: null,
      longitude: null,
    };
    const merged = mergeOptions(userOptions);
    expect(merged.seed).toBeNull();
    expect(merged.template).toBeNull();
    expect(merged.mapSize).toBeNull();
    expect(merged.longitude).toBeNull();
  });

  test('mergeOptions should round integer values', () => {
    const userOptions = {
      points: 4.7,
      statesNumber: 18.3,
      manors: 500.9,
    };
    const merged = mergeOptions(userOptions);
    expect(merged.points).toBe(5); // Rounded
    expect(merged.statesNumber).toBe(18); // Rounded
    expect(merged.manors).toBe(501); // Rounded
  });
});
