/*
 * Grid Garden Daily (v1) — deterministic daily puzzle helper for Grid Garden.
 *
 * UMD: exposes window.GridDaily in the browser and module.exports in Node.
 * Dependency-free: no imports, no network, no dynamic evaluation, no workers,
 * no platform-specific browser APIs. Math.random is never used; every result
 * derives only from the UTC calendar day.
 *
 * Grid Garden is an original browser puzzle by Nilo, supplied under the MIT
 * licence (see LICENSE). This helper is part of the same work and credits.
 *
 * ── Daily generation algorithm (frozen as v1) ─────────────────────────────
 *
 *   Day validation: create(day) accepts only a strict Gregorian calendar
 *   date string "YYYY-MM-DD" (zero-padded; leap years use the proleptic
 *   Gregorian rule: divisible by 4, except by 100 unless by 400). No loose
 *   rollover: "2026-02-30" is rejected, never reinterpreted.
 *
 *   For attempt = 0..31:
 *     1. Hash the ASCII string "grid-garden-daily-v1:<day>:<attempt>" with
 *        32-bit FNV-1a (over UTF-16 code units, offset basis 0x811c9dc5,
 *        prime 0x01000193).
 *     2. Seed a mulberry32 PRNG with that hash.
 *     3. Draw order: first Fisher–Yates shuffle the indices [0..15],
 *        consuming 15 uniform draws (i from 15 down to 1, each
 *        j = floor(rng() * (i + 1))); then one further draw picks the press
 *        count = 8 + floor(rng() * 5), i.e. 8..12 presses.
 *     4. The presses are the first `count` shuffled indices — unique and
 *        legal (0..15) by construction.
 *     5. Apply each press to a fully blooming 4x4 board using exactly the
 *        rules of game.js: a press toggles the tile itself plus its
 *        in-bounds orthogonal neighbours (row-major index, size 4).
 *     6. Accept the board only if at least 5 tiles are sleeping. This
 *        rejects already-solved boards and very sparse ones; otherwise the
 *        next attempt is hashed.
 *
 *   If all 32 attempts are rejected, a fixed nontrivial fallback is used:
 *   [0, 3, 5, 6, 9, 10, 12, 15] (8 presses, leaves 8 sleeping tiles).
 *
 *   Solvability: toggling is its own inverse and press order does not
 *   matter, so applying the recorded presses to the puzzle board again
 *   always restores full bloom — the returned seed is one valid solution.
 *   Its length is the construction size, NOT a claimed optimal move count;
 *   shorter solutions may exist.
 *
 * ── Best-score storage ────────────────────────────────────────────────────
 *
 *   readBest / recordBest use the caller-supplied storage (e.g.
 *   localStorage) under the key "grid-garden:daily-best:v1:<canonical code>"
 *   where the canonical code is "GG1-YYYYMMDD" (trimmed, uppercased).
 *   Values are stored as plain decimal integer strings; only integers in
 *   1..4096 are valid. Invalid, corrupt or blocked storage never throws:
 *   reads return null, and recordBest still returns the resulting score
 *   even when persistence is unavailable. Hint-assisted runs are the
 *   game's concern — it simply does not call recordBest; no game state is
 *   tracked here.
 */
(function (root, factory) {
  if (typeof module === 'object' && module !== null && typeof module.exports === 'object') {
    module.exports = factory();
  } else {
    root.GridDaily = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SIZE = 4;                 // 4x4 board, row-major indices 0..15
  var TILES = SIZE * SIZE;
  var MIN_PRESSES = 8;          // inclusive
  var PRESS_SPAN = 5;           // 8..12 presses
  var MIN_SLEEPING = 5;         // reject solved or very sparse boards
  var MAX_ATTEMPTS = 32;        // bounded retries before the fallback
  var SEED_PREFIX = 'grid-garden-daily-v1:';
  var BEST_KEY_PREFIX = 'grid-garden:daily-best:v1:';
  var MAX_BEST = 4096;
  // Fixed nontrivial fallback: 8 unique presses leaving 8 sleeping tiles.
  var FALLBACK_SEED = [0, 3, 5, 6, 9, 10, 12, 15];

  var DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
  var CODE_RE = /^GG1-(\d{4})(\d{2})(\d{2})$/;
  var STORED_RE = /^\d{1,4}$/;

  function isLeapYear(year) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  }

  function isValidDay(day) {
    if (typeof day !== 'string') return false;
    var m = DAY_RE.exec(day);
    if (!m) return false;
    var year = Number(m[1]);
    var month = Number(m[2]);
    var date = Number(m[3]);
    if (month < 1 || month > 12 || date < 1) return false;
    var lengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return date <= lengths[month - 1];
  }

  // Normalise a code string (trim + uppercase) and validate it strictly as
  // GG1-YYYYMMDD with a real Gregorian date. Returns { code, day } or null.
  function parseCode(text) {
    if (typeof text !== 'string') return null;
    var m = CODE_RE.exec(text.trim().toUpperCase());
    if (!m) return null;
    var day = m[1] + '-' + m[2] + '-' + m[3];
    if (!isValidDay(day)) return null;
    return { code: 'GG1-' + m[1] + m[2] + m[3], day: day };
  }

  // 32-bit FNV-1a over UTF-16 code units (input is ASCII by construction).
  function fnv1a(text) {
    var h = 0x811c9dc5;
    for (var i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // One press, exactly the toggle rule of game.js change(): the tile itself
  // plus its in-bounds orthogonal neighbours flip state.
  function press(board, index) {
    var row = Math.floor(index / SIZE);
    var col = index % SIZE;
    for (var k = 0; k < 5; k++) {
      var r = row + [0, -1, 1, 0, 0][k];
      var c = col + [0, 0, 0, -1, 1][k];
      if (r >= 0 && r < SIZE && c >= 0 && c < SIZE) board[r * SIZE + c] = !board[r * SIZE + c];
    }
  }

  function sleepingCount(presses) {
    var board = new Array(TILES);
    for (var i = 0; i < TILES; i++) board[i] = true;
    for (var p = 0; p < presses.length; p++) press(board, presses[p]);
    var sleeping = 0;
    for (var b = 0; b < TILES; b++) if (!board[b]) sleeping++;
    return sleeping;
  }

  function generateSeed(day) {
    for (var attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      var rng = mulberry32(fnv1a(SEED_PREFIX + day + ':' + attempt));
      var picks = new Array(TILES);
      for (var i = 0; i < TILES; i++) picks[i] = i;
      // Draw 1..15: Fisher–Yates shuffle (same shape as game.js growGarden).
      for (var j = TILES - 1; j > 0; j--) {
        var k = Math.floor(rng() * (j + 1));
        var tmp = picks[j]; picks[j] = picks[k]; picks[k] = tmp;
      }
      // Draw 16: press count, 8..12. Unique presses via the shuffled prefix.
      var count = MIN_PRESSES + Math.floor(rng() * PRESS_SPAN);
      var presses = picks.slice(0, count);
      if (sleepingCount(presses) >= MIN_SLEEPING) return presses;
    }
    return FALLBACK_SEED.slice();
  }

  function utcDay(date) {
    if (date === undefined) date = new Date();
    if (!(date instanceof Date) || date.getTime() !== date.getTime()) {
      throw new TypeError('utcDay(date) expects a valid Date');
    }
    var year = String(date.getUTCFullYear());
    while (year.length < 4) year = '0' + year;
    var month = String(date.getUTCMonth() + 1);
    if (month.length < 2) month = '0' + month;
    var day = String(date.getUTCDate());
    if (day.length < 2) day = '0' + day;
    return year + '-' + month + '-' + day;
  }

  function create(day) {
    if (!isValidDay(day)) {
      throw new TypeError('create(day) expects a strict Gregorian date string "YYYY-MM-DD"');
    }
    return {
      day: day,
      code: 'GG1-' + day.slice(0, 4) + day.slice(5, 7) + day.slice(8, 10),
      seed: generateSeed(day) // freshly generated on every call
    };
  }

  function parse(text) {
    var parsed = parseCode(text);
    if (!parsed) {
      throw new TypeError('parse(text) expects a string code "GG1-YYYYMMDD" with a real calendar date');
    }
    return create(parsed.day);
  }

  function isValidScore(n) {
    return typeof n === 'number' && n % 1 === 0 && n >= 1 && n <= MAX_BEST;
  }

  function readBest(storage, code) {
    var parsed = parseCode(code);
    if (!parsed) return null;
    var raw;
    try {
      if (!storage || typeof storage.getItem !== 'function') return null;
      raw = storage.getItem(BEST_KEY_PREFIX + parsed.code);
    } catch (error) {
      return null; // blocked storage must never break play
    }
    if (typeof raw !== 'string' || !STORED_RE.test(raw)) return null;
    var value = Number(raw);
    return isValidScore(value) ? value : null;
  }

  function recordBest(storage, code, moves) {
    var parsed = parseCode(code);
    if (!parsed) return null;
    var existing = readBest(storage, parsed.code);
    if (!isValidScore(moves)) return existing;
    var best = existing === null ? moves : Math.min(existing, moves);
    try {
      if (storage && typeof storage.setItem === 'function') {
        storage.setItem(BEST_KEY_PREFIX + parsed.code, String(best));
      }
    } catch (error) {
      // persistence unavailable: the in-memory result still stands
    }
    return best;
  }

  return {
    utcDay: utcDay,
    create: create,
    parse: parse,
    readBest: readBest,
    recordBest: recordBest
  };
}));
