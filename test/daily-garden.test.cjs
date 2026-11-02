'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const GridDaily = require('../daily-garden.js');

// Verification mirror of the game rule in game.js change() (tile + in-bounds
// orthogonal neighbours toggle). Used only to check puzzle outcomes, never
// to reimplement the module's generation algorithm.
function applyPresses(board, presses) {
  for (const index of presses) {
    const row = Math.floor(index / 4), col = index % 4;
    for (const [r, c] of [[row, col], [row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]]) {
      if (r >= 0 && r < 4 && c >= 0 && c < 4) board[r * 4 + c] = !board[r * 4 + c];
    }
  }
  return board;
}

function makeStorage() {
  const data = new Map();
  return {
    data,
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); }
  };
}

const DAY = '2026-11-02';
const CODE = 'GG1-20261102';
const BEST_KEY = 'grid-garden:daily-best:v1:' + CODE;

test('exposes the expected API', () => {
  for (const name of ['utcDay', 'create', 'parse', 'readBest', 'recordBest']) {
    assert.equal(typeof GridDaily[name], 'function', name);
  }
});

test('utcDay formats a Date as UTC YYYY-MM-DD', () => {
  assert.equal(GridDaily.utcDay(new Date(Date.UTC(2026, 10, 2, 12, 34, 56))), '2026-11-02');
  assert.equal(GridDaily.utcDay(new Date(Date.UTC(2026, 0, 5))), '2026-01-05');
  assert.match(GridDaily.utcDay(), /^\d{4}-\d{2}-\d{2}$/); // default: today
});

test('utcDay throws TypeError on invalid input', () => {
  for (const bad of [null, '2026-11-02', 0, NaN, {}, [], new Date(NaN)]) {
    assert.throws(() => GridDaily.utcDay(bad), TypeError, String(bad));
  }
});

test('utcDay uses the UTC day at midnight and across timezones', () => {
  // Same UTC instant, one second either side of midnight.
  assert.equal(GridDaily.utcDay(new Date(Date.UTC(2026, 10, 2, 23, 59, 59))), '2026-11-02');
  assert.equal(GridDaily.utcDay(new Date(Date.UTC(2026, 10, 3, 0, 0, 0))), '2026-11-03');
  // Local evening behind UTC is already the next UTC day, and vice versa.
  assert.equal(GridDaily.utcDay(new Date('2026-11-02T23:30:00-08:00')), '2026-11-03');
  assert.equal(GridDaily.utcDay(new Date('2026-11-03T01:30:00+05:00')), '2026-11-02');
  // Leap day formats correctly.
  assert.equal(GridDaily.utcDay(new Date(Date.UTC(2024, 1, 29))), '2024-02-29');
});

test('create returns day, code and a fresh seed each call', () => {
  const a = GridDaily.create(DAY);
  const b = GridDaily.create(DAY);
  assert.equal(a.day, DAY);
  assert.equal(a.code, CODE);
  assert.deepEqual(a, b); // deterministic
  assert.notStrictEqual(a.seed, b.seed);
  assert.notStrictEqual(a, b);
  a.seed[0] = (a.seed[0] + 1) % 16; // mutating one result must not affect another
  assert.notDeepEqual(a.seed, GridDaily.create(DAY).seed);
});

test('v1 reference fixture is frozen', () => {
  // If this fails, the deterministic v1 algorithm changed.
  assert.deepEqual(GridDaily.create('2026-11-02'), {
    day: '2026-11-02',
    code: 'GG1-20261102',
    seed: [4, 11, 13, 6, 3, 0, 7, 12, 8, 9, 2, 1]
  });
  assert.deepEqual(GridDaily.create('2026-11-03').seed, [0, 14, 15, 10, 7, 1, 11, 5, 12]);
  assert.deepEqual(GridDaily.create('2027-01-01').seed, [0, 10, 1, 5, 12, 14, 11, 6, 8, 4]);
});

test('different days give different codes and seeds', () => {
  const a = GridDaily.create('2026-11-02');
  const b = GridDaily.create('2026-11-03');
  assert.notEqual(a.code, b.code);
  assert.notDeepEqual(a.seed, b.seed);
});

test('re-applying the returned seed solves the puzzle', () => {
  for (const day of ['2026-11-02', '2024-02-29', '2027-01-01']) {
    const { seed } = GridDaily.create(day);
    const puzzle = applyPresses(new Array(16).fill(true), seed);
    assert.ok(!puzzle.every(Boolean), 'not already solved');
    assert.ok(puzzle.filter(b => !b).length >= 5, 'at least 5 sleeping tiles');
    const solved = applyPresses(puzzle.slice(), seed);
    assert.ok(solved.every(Boolean), 'recorded presses solve the board');
  }
});

test('seeds stay valid, unique, nontrivial and varied over 730 days', () => {
  const signatures = new Set();
  for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2028, 0, 1); t += 86400000) {
    const { seed } = GridDaily.create(GridDaily.utcDay(new Date(t)));
    assert.ok(Array.isArray(seed) && seed.length >= 8 && seed.length <= 12);
    assert.equal(new Set(seed).size, seed.length, 'unique presses');
    for (const index of seed) {
      assert.ok(Number.isInteger(index) && index >= 0 && index <= 15);
    }
    const board = applyPresses(new Array(16).fill(true), seed);
    assert.ok(!board.every(Boolean), 'not already solved');
    assert.ok(board.filter(b => !b).length >= 5, 'at least 5 sleeping tiles');
    assert.ok(applyPresses(board.slice(), seed).every(Boolean), 'solvable by seed');
    signatures.add(JSON.stringify([...seed].sort((x, y) => x - y)));
  }
  assert.ok(signatures.size > 500, `expected varied seeds, got ${signatures.size}`);
});

test('Math.random never influences generation', () => {
  const original = Math.random;
  Math.random = () => { throw new Error('Math.random must not be called'); };
  try {
    assert.deepEqual(GridDaily.create(DAY).seed, GridDaily.create(DAY).seed);
    assert.equal(GridDaily.parse(CODE).code, CODE);
  } finally {
    Math.random = original;
  }
});

test('parse trims and uppercases, then matches create', () => {
  assert.deepEqual(GridDaily.parse('  gg1-20261102  '), GridDaily.create('2026-11-02'));
  assert.deepEqual(GridDaily.parse('Gg1-20261102\n'), GridDaily.create('2026-11-02'));
  // Round trip through the canonical code.
  assert.deepEqual(GridDaily.parse(GridDaily.create(DAY).code), GridDaily.create(DAY));
});

test('parse and create reject bad codes and dates without rollover', () => {
  const badParses = [
    '', '   ', 'GG1-', 'GG1-2026110', 'GG1-202611023', 'GG1-2026-11-02',
    'GG2-20261102', 'XX1-20261102', 'GG1-20261102x', 'xGG1-20261102',
    'GG1-20260001', 'GG1-20261301', 'GG1-20260000', 'GG1-20260431',
    'GG1-20230229', // not a leap year: must not roll over to March 1st
    'GG1-19000229', // century year, not leap
    'GG1-20260230',
    null, undefined, 42, {}, []
  ];
  for (const bad of badParses) {
    assert.throws(() => GridDaily.parse(bad), TypeError, String(bad));
  }
  const badDays = [
    '', '2026-11-2', '2026-1-02', '2026/11/02', '2026-11-02T00:00:00Z',
    '2026-13-01', '2026-00-10', '2026-04-31', '2023-02-29', '1900-02-29',
    null, undefined, 20261102, {}
  ];
  for (const bad of badDays) {
    assert.throws(() => GridDaily.create(bad), TypeError, String(bad));
  }
  // Real leap days are accepted.
  assert.equal(GridDaily.parse('GG1-20240229').day, '2024-02-29');
  assert.equal(GridDaily.parse('GG1-20000229').day, '2000-02-29');
  assert.equal(GridDaily.create('2024-02-29').code, 'GG1-20240229');
});

test('readBest returns valid stored scores and tolerates the rest', () => {
  const storage = makeStorage();
  assert.equal(GridDaily.readBest(storage, CODE), null); // absent
  storage.data.set(BEST_KEY, '9');
  assert.equal(GridDaily.readBest(storage, CODE), 9);
  storage.data.set(BEST_KEY, '4096');
  assert.equal(GridDaily.readBest(storage, CODE), 4096);
  for (const corrupt of ['', 'abc', '0', '-3', '4097', '99999', '1.5', ' 9', '9 ', '{"moves":9}', 'null']) {
    storage.data.set(BEST_KEY, corrupt);
    assert.equal(GridDaily.readBest(storage, CODE), null, corrupt);
  }
  // Invalid codes return null rather than throwing.
  for (const bad of ['nope', 'GG1-20230229', '', null, 42]) {
    assert.equal(GridDaily.readBest(storage, bad), null, String(bad));
  }
});

test('recordBest keeps the lower score per code', () => {
  const storage = makeStorage();
  const other = 'GG1-20261103';
  assert.equal(GridDaily.recordBest(storage, CODE, 10), 10);
  assert.equal(GridDaily.recordBest(storage, CODE, 12), 10); // worse: ignored
  assert.equal(GridDaily.recordBest(storage, CODE, 7), 7);   // better: kept
  assert.equal(GridDaily.recordBest(storage, other, 20), 20); // separate record
  assert.equal(GridDaily.readBest(storage, CODE), 7);
  assert.equal(GridDaily.readBest(storage, other), 20);
  // Codes are canonicalised, so spellings share one record.
  assert.equal(GridDaily.recordBest(storage, ' gg1-20261102 ', 9), 7);
  assert.equal(GridDaily.readBest(storage, 'GG1-20261102'), 7);
});

test('recordBest ignores invalid scores and reports the existing best', () => {
  const storage = makeStorage();
  for (const bad of [0, -3, 1.5, NaN, Infinity, '7', null, undefined, 4097]) {
    assert.equal(GridDaily.recordBest(storage, CODE, bad), null, String(bad));
  }
  assert.equal(GridDaily.readBest(storage, CODE), null, 'nothing stored');
  assert.equal(GridDaily.recordBest(storage, CODE, 9), 9);
  assert.equal(GridDaily.recordBest(storage, CODE, 3.5), 9, 'existing best returned');
  assert.equal(GridDaily.readBest(storage, CODE), 9, 'invalid score did not overwrite');
  // A corrupt stored value is treated as absent and replaced by a valid score.
  storage.data.set(BEST_KEY, 'garbage');
  assert.equal(GridDaily.recordBest(storage, CODE, 11), 11);
  assert.equal(GridDaily.readBest(storage, CODE), 11);
  // Invalid code: nothing happens, null returned.
  assert.equal(GridDaily.recordBest(storage, 'nope', 5), null);
});

test('null and throwing storage never break play', () => {
  assert.equal(GridDaily.readBest(null, CODE), null);
  assert.equal(GridDaily.readBest(undefined, CODE), null);
  assert.equal(GridDaily.readBest({}, CODE), null);
  const blocked = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); }
  };
  assert.equal(GridDaily.readBest(blocked, CODE), null);
  // The resulting score is still returned when persistence is unavailable.
  assert.equal(GridDaily.recordBest(blocked, CODE, 11), 11);
  assert.equal(GridDaily.recordBest(blocked, CODE, 'bad'), null);
  // Writes failing while reads work: result returned, old value kept.
  const writeFails = makeStorage();
  writeFails.setItem = () => { throw new Error('quota'); };
  assert.equal(GridDaily.recordBest(writeFails, CODE, 6), 6);
  assert.equal(GridDaily.readBest(writeFails, CODE), null);
});
