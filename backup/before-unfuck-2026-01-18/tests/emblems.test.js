/**
 * =============================================================================
 * emblems.test.js
 * Desc: Unit tests for emblem generation
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

import { describe, test, expect } from '@jest/globals';
import {
  generateEmblem,
  generateCultureEmblems,
  generateStateEmblems,
  generateReligionEmblems,
  generateEmblems,
} from '../src/core/emblems.js';
import { getDefaultOptions } from '../src/options.js';
import { RNG } from '../src/utils/rng.js';

describe('Emblem Generation', () => {
  test('generateEmblem should return emblem object', () => {
    const rng = new RNG('42');
    const emblem = generateEmblem({ parentEmblem: null, kinship: 0, dominion: 0, type: 'Generic', rng });

    expect(emblem).toBeDefined();
    expect(emblem.shield).toBeDefined();
    expect(emblem.field).toBeDefined();
  });

  test('generateEmblem should include shield type', () => {
    const rng = new RNG('42');
    const emblem = generateEmblem({ parentEmblem: null, kinship: 0, dominion: 0, type: 'Generic', rng });

    expect(typeof emblem.shield).toBe('string');
    expect(emblem.shield.length).toBeGreaterThan(0);
  });

  test('generateEmblem should include field color', () => {
    const rng = new RNG('42');
    const emblem = generateEmblem({ parentEmblem: null, kinship: 0, dominion: 0, type: 'Generic', rng });

    expect(emblem.field).toBeDefined();
    expect(typeof emblem.field).toBe('string');
  });

  test('generateEmblem should optionally include charge', () => {
    const rng = new RNG('42');
    const emblem = generateEmblem({ parentEmblem: null, kinship: 0, dominion: 0, type: 'Generic', rng });

    // Charge is optional (70% chance)
    if (emblem.charge) {
      expect(typeof emblem.charge).toBe('string');
      expect(emblem.chargeColor).toBeDefined();
    }
  });

  test('generateEmblem should inherit from parent with high kinship', () => {
    const rng = new RNG('42');
    const parentEmblem = {
      shield: 'heater',
      field: 'gules',
      charge: 'lion',
      chargeColor: 'or',
    };

    // With high kinship, should often inherit
    let inherited = 0;
    for (let i = 0; i < 10; i++) {
      const emblem = generateEmblem({ parentEmblem, kinship: 0.9, dominion: 0, type: 'Generic', rng: new RNG(i) });
      if (emblem.shield === parentEmblem.shield || emblem.field === parentEmblem.field) {
        inherited++;
      }
    }
    expect(inherited).toBeGreaterThan(0); // Should inherit at least sometimes
  });

  test('generateCultureEmblems should assign emblems to cultures', () => {
    const options = getDefaultOptions();
    const rng = new RNG('42');
    const pack = {
      cultures: [
        { i: 0, name: 'Wildlands' },
        { i: 1, name: 'Culture1', type: 'Generic' },
        { i: 2, name: 'Culture2', type: 'Naval' },
      ],
    };

    generateCultureEmblems({ pack, options, rng });

    for (const culture of pack.cultures) {
      if (culture.i > 0 && !culture.removed) {
        expect(culture.emblem).toBeDefined();
        expect(culture.emblem.shield).toBeDefined();
        expect(culture.emblem.field).toBeDefined();
      }
    }
  });

  test('generateStateEmblems should assign emblems to states', () => {
    const options = getDefaultOptions();
    const rng = new RNG('42');
    const pack = {
      cultures: [{ i: 1, name: 'Culture1', type: 'Generic', emblem: { shield: 'heater', field: 'gules' } }],
      states: [
        { i: 0, name: 'Neutrals' },
        { i: 1, name: 'State1', culture: 1, type: 'Generic', capital: 1 },
        { i: 2, name: 'State2', culture: 1, type: 'Generic', capital: 0 },
      ],
    };

    generateStateEmblems({ pack, options, rng });

    for (const state of pack.states) {
      if (state.i > 0 && !state.removed) {
        expect(state.emblem).toBeDefined();
        expect(state.emblem.shield).toBeDefined();
        expect(state.emblem.field).toBeDefined();
      }
    }
  });

  test('generateReligionEmblems should assign emblems to religions', () => {
    const options = getDefaultOptions();
    const rng = new RNG('42');
    const pack = {
      cultures: [{ i: 1, name: 'Culture1', type: 'Generic', emblem: { shield: 'heater', field: 'gules' } }],
      religions: [
        { i: 0, name: 'No religion' },
        { i: 1, name: 'Religion1', type: 'Folk', culture: 1 },
        { i: 2, name: 'Religion2', type: 'Organized', culture: 1 },
      ],
    };

    generateReligionEmblems({ pack, options, rng });

    for (const religion of pack.religions) {
      if (religion.i > 0 && !religion.removed) {
        expect(religion.emblem).toBeDefined();
        expect(religion.emblem.shield).toBeDefined();
        expect(religion.emblem.field).toBeDefined();
      }
    }
  });

  test('generateEmblems should generate all emblems', () => {
    const options = getDefaultOptions();
    const rng = new RNG('42');
    const pack = {
      cultures: [
        { i: 0, name: 'Wildlands' },
        { i: 1, name: 'Culture1', type: 'Generic' },
      ],
      states: [
        { i: 0, name: 'Neutrals' },
        { i: 1, name: 'State1', culture: 1, type: 'Generic' },
      ],
      religions: [
        { i: 0, name: 'No religion' },
        { i: 1, name: 'Religion1', type: 'Organized', culture: 1 },
      ],
    };

    generateEmblems({ pack, options, rng });

    const culture = pack.cultures.find((c) => c.i === 1);
    const state = pack.states.find((s) => s.i === 1);
    const religion = pack.religions.find((r) => r.i === 1);

    if (culture) expect(culture.emblem).toBeDefined();
    if (state) expect(state.emblem).toBeDefined();
    if (religion) expect(religion.emblem).toBeDefined();
  });

  test('generateEmblem should throw error without rng', () => {
    expect(() => {
      generateEmblem({ parentEmblem: null, kinship: 0, dominion: 0, type: 'Generic', rng: null });
    }).toThrow('RNG instance is required');
  });

  test('generateCultureEmblems should throw error without pack', () => {
    const options = getDefaultOptions();
    const rng = new RNG('42');

    expect(() => {
      generateCultureEmblems({ pack: null, options, rng });
    }).toThrow('Pack object with cultures is required');
  });
});
