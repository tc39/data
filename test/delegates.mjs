/* eslint indent: ['error', 2] */

import test from 'tape';
import { readFileSync } from 'fs';

const delegatesURL = new URL('../data/delegates/index.json', import.meta.url);

/*
 * These abbreviations predate the three-letter requirement. New two-letter
 * abbreviations must not be added to this allowlist.
 */
/* eslint-disable array-element-newline -- This static allowlist is clearer when grouped compactly. */
const TWO_LETTER_ABBRS = new Set([
  'AC', 'AH', 'AK', 'AR', 'AS', 'BB', 'BE', 'BG', 'BM', 'BN', 'BS',
  'BT', 'BZ', 'CF', 'CM', 'CP', 'DC', 'DD', 'DE', 'DH', 'DL', 'DS',
  'DT', 'EA', 'EF', 'ET', 'EY', 'FN', 'FP', 'GB', 'GI', 'GN', 'GY',
  'IH', 'IS', 'IT', 'JB', 'JH', 'JK', 'JM', 'JN', 'JP', 'JS', 'JT',
  'KG', 'KM', 'KR', 'KS', 'LB', 'LH', 'LL', 'LM', 'MB', 'MF', 'MH',
  'MM', 'MP', 'MS', 'NC', 'NH', 'NL', 'NM', 'OH', 'PJ', 'PL', 'RB',
  'RH', 'RW', 'RX', 'SC', 'SK', 'SM', 'SP', 'TC', 'TD', 'TS', 'TW',
  'VM', 'WH', 'YK', 'ZB',
]);

const WHITESPACE = /\s/u;

/**
 * Advance past JSON whitespace.
 *
 * @param {string} contents JSON source.
 * @param {number} start Initial source offset.
 * @returns {number} The first non-whitespace offset.
 */
function skipWhitespace(contents, start) {
  let index = start;
  while (WHITESPACE.test(contents[index] || '')) {
    index += 1;
  }
  return index;
}

/**
 * Find an unescaped closing quote and decode the JSON string it terminates.
 *
 * JSON.parse cannot report duplicate object keys, so the top-level keys have
 * to be collected from the source before the parsed object can be trusted.
 *
 * @param {string} contents JSON source.
 * @param {number} start Opening-quote offset.
 * @returns {{ end: number, value: string }} The decoded string and next offset.
 */
function readString(contents, start) {
  let escaped = false;

  for (let index = start + 1; index < contents.length; index += 1) {
    const character = contents[index];
    if (escaped) {
      escaped = false;
    } else if (character === '\\') {
      escaped = true;
    } else if (character === '"') {
      return {
        end: index + 1,
        value: JSON.parse(contents.slice(start, index + 1)),
      };
    }
  }

  // JSON.parse validates the full source before this scanner is called.
  throw new SyntaxError('unterminated JSON string');
}

/**
 * Advance from a property value to its top-level comma or closing brace.
 *
 * @param {string} contents JSON source.
 * @param {number} start Initial value offset.
 * @returns {number} The delimiter offset.
 */
function skipValue(contents, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < contents.length; index += 1) {
    const character = contents[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
    } else if (character === '"') {
      inString = true;
    } else if (character === '{' || character === '[') {
      depth += 1;
    } else if (character === ']' || (character === '}' && depth > 0)) {
      depth -= 1;
    } else if (depth === 0 && (character === ',' || character === '}')) {
      return index;
    }
  }

  // JSON.parse validates the full source before this scanner is called.
  throw new SyntaxError('unterminated JSON object');
}

/**
 * Collect decoded top-level keys without losing duplicates.
 *
 * @param {string} contents JSON source containing a top-level object.
 * @returns {{ line: number, value: string }[]} Decoded keys and source lines.
 */
function topLevelKeys(contents) {
  const keys = [];
  let index = skipWhitespace(contents, 0) + 1;
  let line = 1;
  let scanned = 0;

  while (true) {
    index = skipWhitespace(contents, index);
    if (contents[index] === '}') {
      return keys;
    }

    while (scanned < index) {
      if (contents[scanned] === '\n') {
        line += 1;
      }
      scanned += 1;
    }

    const key = readString(contents, index);
    keys.push({ line, value: key.value });
    index = skipWhitespace(contents, key.end) + 1;
    index = skipValue(contents, index);

    if (contents[index] === '}') {
      return keys;
    }
    index += 1;
  }
}

/**
 * Check the ordering and abbreviation constraints inherited from delegates.txt.
 *
 * @param {string} contents JSON source for the delegates object.
 * @returns {void}
 */
function checkDelegates(contents = readFileSync(delegatesURL, 'utf8')) {
  // The source must be syntactically valid JSON.
  const delegates = JSON.parse(contents);

  // The top-level JSON value must be an object keyed by abbreviations.
  if (delegates === null || typeof delegates !== 'object' || Array.isArray(delegates)) {
    throw new TypeError('delegates data must be a JSON object');
  }

  const keys = topLevelKeys(contents);
  const firstLines = new Map();

  keys.forEach(({ line, value: abbreviation }) => {
    /*
     * Each abbreviation must appear exactly once. Check the raw keys before
     * consulting the parsed object, which retains only the duplicate's value.
     */
    if (firstLines.has(abbreviation)) {
      throw new Error(`Line ${line}: duplicate abbreviation ${JSON.stringify(abbreviation)}; first used on line ${firstLines.get(abbreviation)}.`);
    }
    firstLines.set(abbreviation, line);
  });

  let previousSortKey = '';
  keys.forEach(({ line, value: abbreviation }) => {
    // Abbreviations must contain only uppercase Latin letters.
    if (!(/^[A-Z]+$/u).test(abbreviation)) {
      throw new Error(`Line ${line}: abbreviations must be all uppercase Latin letters.`);
    }

    // Two-letter abbreviations must belong to the legacy allowlist.
    if (abbreviation.length === 2 && !TWO_LETTER_ABBRS.has(abbreviation)) {
      throw new Error(`Line ${line}: 2-letter abbreviation ${JSON.stringify(abbreviation)} is not in the allowlist. New delegate abbreviations must be three letters.`);
    }

    // Every abbreviation not covered by the legacy rule must have three letters.
    if (abbreviation.length !== 2 && abbreviation.length !== 3) {
      throw new Error(`Line ${line}: invalid abbreviation ${JSON.stringify(abbreviation)}. New delegate abbreviations must be three letters.`);
    }

    const delegate = delegates[abbreviation];
    const sortKey = `${delegate.name} (${abbreviation})`;

    // Delegates must appear in lexicographic order by name, then abbreviation.
    if (previousSortKey.localeCompare(sortKey, 'en') > 0) {
      throw new Error(`Line ${line}: not in lexicographic order.`);
    }
    previousSortKey = sortKey;
  });
}

test('data/delegates: satisfies additional constraints', (t) => {
  t.doesNotThrow(() => checkDelegates(), 'the delegate data satisfies the ordering and abbreviation constraints');
  t.end();
});
