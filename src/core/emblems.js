/**
 * =============================================================================
 * emblems.js
 * Desc: Procedural emblem/coat of arms generation
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

/**
 * Shield shapes/types
 */
const shieldTypes = [
  'heater',
  'round',
  'oval',
  'spanish',
  'french',
  'oldFrench',
  'swiss',
  'wedged',
  'horsehead',
  'banner',
  'square',
  'pavise',
  'roman',
  'boeotian',
];

/**
 * Simple colors for emblems
 */
const colors = {
  metals: ['argent', 'or'],
  colours: ['gules', 'azure', 'sable', 'vert', 'purpure'],
};

/**
 * Simple charges (symbols) for emblems
 */
const charges = [
  'lion',
  'eagle',
  'cross',
  'star',
  'crown',
  'sword',
  'shield',
  'tree',
  'sun',
  'moon',
];

/**
 * Generate a simple emblem/coat of arms
 * @param {Object} params - Generation parameters
 * @param {Object} params.parentEmblem - Parent emblem to derive from (optional)
 * @param {number} params.kinship - Kinship factor (0-1) for similarity to parent
 * @param {number} params.dominion - Dominion factor (0-1) for independence
 * @param {string} params.type - Entity type (culture, state, religion, etc.)
 * @param {Object} params.rng - RNG instance
 * @returns {Object} Emblem object
 */
export function generateEmblem({ parentEmblem = null, kinship = 0.25, dominion = 0, type = 'Generic', rng }) {
  if (!rng) {
    throw new Error('RNG instance is required');
  }

  const emblem = {
    shield: parentEmblem && rng.probability(kinship) ? parentEmblem.shield : rng.pick(shieldTypes),
    field: null,
    division: null,
    charge: null,
    chargeColor: null,
  };

  // Generate field (background)
  if (parentEmblem && rng.probability(kinship)) {
    emblem.field = parentEmblem.field;
  } else {
    const allColors = [...colors.metals, ...colors.colours];
    emblem.field = rng.pick(allColors);
  }

  // Generate division (optional pattern)
  if (rng.probability(0.3)) {
    const divisions = ['perPale', 'perFess', 'perBend', 'perCross'];
    emblem.division = rng.pick(divisions);
  }

  // Generate charge (symbol)
  if (rng.probability(0.7)) {
    if (parentEmblem && rng.probability(kinship)) {
      emblem.charge = parentEmblem.charge;
      emblem.chargeColor = parentEmblem.chargeColor;
    } else {
      emblem.charge = rng.pick(charges);
      const allColors = [...colors.metals, ...colors.colours];
      emblem.chargeColor = rng.pick(allColors);
    }
  }

  return emblem;
}

/**
 * Generate emblems for cultures
 * @param {Object} params - Generation parameters
 * @param {Object} params.pack - Pack object (will be modified)
 * @param {Object} params.options - Generation options
 * @param {Object} params.rng - RNG instance
 */
export function generateCultureEmblems({ pack, options, rng }) {
  if (!pack || !pack.cultures) {
    throw new Error('Pack object with cultures is required');
  }
  if (!rng) {
    throw new Error('RNG instance is required');
  }

  pack.cultures.forEach((culture) => {
    if (!culture.i || culture.removed) return;

    if (!culture.emblem) {
      culture.emblem = generateEmblem({
        parentEmblem: null,
        kinship: 0,
        dominion: 0,
        type: culture.type || 'Generic',
        rng,
      });
    }
  });
}

/**
 * Generate emblems for states
 * @param {Object} params - Generation parameters
 * @param {Object} params.pack - Pack object (will be modified)
 * @param {Object} params.options - Generation options
 * @param {Object} params.rng - RNG instance
 */
export function generateStateEmblems({ pack, options, rng }) {
  if (!pack || !pack.states) {
    throw new Error('Pack object with states is required');
  }
  if (!rng) {
    throw new Error('RNG instance is required');
  }

  pack.states.forEach((state) => {
    if (!state.i || state.removed) return;

    if (!state.emblem) {
      // Get culture emblem as parent if available
      const culture = pack.cultures && pack.cultures[state.culture] ? pack.cultures[state.culture] : null;
      const parentEmblem = culture && culture.emblem ? culture.emblem : null;

      state.emblem = generateEmblem({
        parentEmblem,
        kinship: 0.3,
        dominion: state.capital ? 0.1 : 0,
        type: state.type || 'Generic',
        rng,
      });
    }
  });
}

/**
 * Generate emblems for religions
 * @param {Object} params - Generation parameters
 * @param {Object} params.pack - Pack object (will be modified)
 * @param {Object} params.options - Generation options
 * @param {Object} params.rng - RNG instance
 */
export function generateReligionEmblems({ pack, options, rng }) {
  if (!pack || !pack.religions) {
    throw new Error('Pack object with religions is required');
  }
  if (!rng) {
    throw new Error('RNG instance is required');
  }

  pack.religions.forEach((religion) => {
    if (!religion.i || religion.removed) return;

    if (!religion.emblem) {
      // Get culture emblem as parent if available
      const culture = pack.cultures && pack.cultures[religion.culture] ? pack.cultures[religion.culture] : null;
      const parentEmblem = culture && culture.emblem ? culture.emblem : null;

      religion.emblem = generateEmblem({
        parentEmblem,
        kinship: religion.type === 'Folk' ? 0.8 : 0.4,
        dominion: religion.type === 'Heresy' ? 0.5 : 0.2,
        type: religion.type || 'Generic',
        rng,
      });
    }
  });
}

/**
 * Generate all emblems (cultures, states, religions)
 * @param {Object} params - Generation parameters
 * @param {Object} params.pack - Pack object (will be modified)
 * @param {Object} params.options - Generation options
 * @param {Object} params.rng - RNG instance
 */
export function generateEmblems({ pack, options, rng }) {
  if (!pack) {
    throw new Error('Pack object is required');
  }
  if (!rng) {
    throw new Error('RNG instance is required');
  }

  generateCultureEmblems({ pack, options, rng });
  generateStateEmblems({ pack, options, rng });
  generateReligionEmblems({ pack, options, rng });
}
