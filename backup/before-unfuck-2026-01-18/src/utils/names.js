/**
 * =============================================================================
 * names.js
 * Desc: Name generation utilities using Markov chains
 * Author: Lordthoth (based on original by Azgaar)
 * =============================================================================
 */

import { last, vowel } from './array.js';

/**
 * Calculate Markov chain for a namebase
 * @param {string} namebaseString - Comma-separated list of names
 * @returns {Object} Markov chain object
 */
export function calculateChain(namebaseString) {
  const chain = [];
  const array = namebaseString.split(',');

  for (const n of array) {
    let name = n.trim().toLowerCase();
    const basic = !/[^\u0000-\u007f]/.test(name); // basic chars and English rules can be applied

    // split word into pseudo-syllables
    for (let i = -1, syllable = ''; i < name.length; i += syllable.length || 1, syllable = '') {
      let prev = name[i] || ''; // pre-onset letter
      let v = 0; // 0 if no vowels in syllable

      for (let c = i + 1; name[c] && syllable.length < 5; c++) {
        const that = name[c];
        const next = name[c + 1]; // next char
        syllable += that;
        if (syllable === ' ' || syllable === '-') break; // syllable starts with space or hyphen
        if (!next || next === ' ' || next === '-') break; // no need to check

        if (vowel(that)) v = 1; // check if letter is vowel

        // do not split some diphthongs
        if (that === 'y' && next === 'e') continue; // 'ye'
        if (basic) {
          // English-like
          if (that === 'o' && next === 'o') continue; // 'oo'
          if (that === 'e' && next === 'e') continue; // 'ee'
          if (that === 'a' && next === 'e') continue; // 'ae'
          if (that === 'c' && next === 'h') continue; // 'ch'
        }

        if (vowel(that) === next) break; // two same vowels in a row
        if (v && vowel(name[c + 2])) break; // syllable has vowel and additional vowel is expected soon
      }

      if (chain[prev] === undefined) chain[prev] = [];
      chain[prev].push(syllable);
    }
  }

  return chain;
}

/**
 * Generate a name using Markov chain
 * @param {Object} chain - Markov chain object
 * @param {number} min - Minimum name length
 * @param {number} max - Maximum name length
 * @param {string} dupl - Characters that allow duplication
 * @param {Function} randomPick - Function to pick random element from array
 * @param {Array<string>} fallbackNames - Fallback names if generation fails
 * @returns {string} Generated name
 */
export function generateName(chain, min, max, dupl, randomPick, fallbackNames = []) {
  if (!chain || chain[''] === undefined) {
    throw new Error('Invalid chain: chain must have empty string key');
  }

  let v = chain[''];
  let cur = randomPick(v);
  let w = '';

  for (let i = 0; i < 20; i++) {
    if (cur === '') {
      // end of word
      if (w.length < min) {
        cur = '';
        w = '';
        v = chain[''];
      } else break;
    } else {
      if (w.length + cur.length > max) {
        // word too long
        if (w.length < min) w += cur;
        break;
      } else v = chain[last(cur)] || chain[''];
    }

    w += cur;
    cur = randomPick(v);
  }

  // parse word to get a final name
  const l = last(w); // last letter
  if (l === "'" || l === ' ' || l === '-') w = w.slice(0, -1); // not allow some characters at the end

  let name = [...w].reduce(function (r, c, i, d) {
    if (c === d[i + 1] && !dupl.includes(c)) return r; // duplication is not allowed
    if (!r.length) return c.toUpperCase();
    if (r.slice(-1) === '-' && c === ' ') return r; // remove space after hyphen
    if (r.slice(-1) === ' ') return r + c.toUpperCase(); // capitalize letter after space
    if (r.slice(-1) === '-') return r + c.toUpperCase(); // capitalize letter after hyphen
    if (c === 'a' && d[i + 1] === 'e') return r; // "ae" => "e"
    if (i + 2 < d.length && c === d[i + 1] && c === d[i + 2]) return r; // remove three same letters in a row
    return r + c;
  }, '');

  // join the word if any part has only 1 letter
  if (name.split(' ').some((part) => part.length < 2))
    name = name
      .split(' ')
      .map((p, i) => (i ? p.toLowerCase() : p))
      .join('');

  if (name.length < 2) {
    if (fallbackNames.length > 0) {
      name = randomPick(fallbackNames);
    } else {
      throw new Error('Name is too short and no fallback names provided');
    }
  }

  return name;
}
