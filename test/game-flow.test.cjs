const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function memoryStorage(values = {}) {
  const map = new Map(Object.entries(values));
  return { map, getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) };
}
function boot({ store = memoryStorage(), date = '2026-11-02T12:00:00Z', random = .37 } = {}) {
  const nodes = {}, events = {}, signals = []; let focused, epoch = Date.parse(date);
  function node() {
    return { children: [], attrs: {}, events: {}, value: '', textContent: '', hidden: false, disabled: false,
      style: { setProperty() {} }, setAttribute(k, v) { this.attrs[k] = String(v); },
      removeAttribute(k) { delete this.attrs[k]; }, append(n) { this.children.push(n); },
      replaceChildren() { this.children = []; }, addEventListener(k, fn) { this.events[k] = fn; },
      focus() { focused = this; }, select() { this.selected = true; } };
  }
  for (const id of ['garden','message','level','moves','start','next','new','original','daily','undo','hint','reset',
    'code-panel','daily-code','play-code','select-code','code-message','daily-best']) nodes[id] = node();
  class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [epoch])); } static now() { return epoch; } }
  const document = { hidden: false, getElementById: id => nodes[id], createElement: node,
    addEventListener: (kind, fn) => { events[kind] = fn; } };
  const sandbox = { document, Date: ClockDate, Math: Object.assign(Object.create(Math), { random: () => random }),
    performance: { now: () => 10000 } };
  sandbox.window = sandbox; sandbox.parent = { postMessage: message => signals.push(message.event) };
  Object.defineProperty(sandbox, 'localStorage', { get: () => { if (store === 'blocked') throw new Error('SecurityError'); return store; } });
  vm.createContext(sandbox);
  for (const file of ['daily-garden.js', 'game.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox);
  const b = { nodes, store, signals, daily: sandbox.GridDaily, get focused() { return focused; },
    board: () => nodes.garden.children.map(n => n.attrs['aria-pressed'] === 'true'),
    moves: () => Number(nodes.moves.textContent.match(/\d+/)[0]),
    click(id) { assert.equal(nodes[id].disabled, false, id + ' disabled'); nodes[id].events.click(); },
    press(index) { const n = nodes.garden.children[index]; assert.equal(n.disabled, false); n.events.click(); },
    code(value) { nodes['daily-code'].value = value; b.click('play-code'); },
    date(value) { epoch = Date.parse(value); },
    hidden(value) { document.hidden = value; events.visibilitychange(); },
    solve(seed) { for (const index of seed) { if (nodes.garden.children[index].disabled) break; b.press(index); } }
  };
  return b;
}

test('fresh entry is a nontrivial daily puzzle, stable across cosmetic randomness', () => {
  const a = boot({ random: .01 }), b = boot({ random: .99 });
  assert.equal(a.nodes['daily-code'].value, 'GG1-20261102');
  assert.match(a.nodes.level.textContent, /2026-11-02 UTC/);
  assert.equal(a.board().length, 16); assert.equal(a.board().every(Boolean), false);
  assert.deepEqual(a.board(), b.board()); assert.equal(a.signals.includes('start'), false);
  a.press(0); assert.ok(a.signals.includes('start'));
});

test('daily completion records a best, reloads finished, and retries exactly the same code', () => {
  const b = boot(), start = b.board(), seed = b.daily.create('2026-11-02').seed;
  b.solve(seed); const score = b.moves(); assert.equal(b.board().every(Boolean), true);
  assert.match(b.nodes.message.textContent, /Daily garden complete/);
  assert.match(b.nodes['daily-best'].textContent, new RegExp('browser: ' + score + ' moves'));
  assert.equal(b.nodes.reset.disabled, false); assert.equal(b.nodes.reset.textContent, 'Retry this code');
  assert.ok(b.signals.includes('end'));
  const reload = boot({ store: b.store }); assert.equal(reload.board().every(Boolean), true);
  assert.equal(reload.moves(), score); reload.click('reset');
  assert.deepEqual(reload.board(), start); assert.equal(reload.moves(), 0);
});

test('a better unassisted retry lowers the record and a worse one cannot replace it', () => {
  const b = boot(), seed = b.daily.create('2026-11-02').seed;
  b.press(0); b.press(0); b.solve(seed); const first = b.moves();
  b.click('reset'); b.solve(seed); const better = b.moves(); assert.equal(first, better + 2);
  const bestText = b.nodes['daily-best'].textContent;
  b.click('reset'); b.press(0); b.press(0); b.solve(seed);
  assert.equal(b.nodes['daily-best'].textContent, bestText);
});

test('using Hint persists assistance across reload and excludes the run from the best', () => {
  const b = boot(); b.click('hint'); const reload = boot({ store: b.store });
  reload.solve(reload.daily.create('2026-11-02').seed);
  assert.match(reload.nodes.message.textContent, /with hints/);
  assert.equal(reload.nodes['daily-best'].textContent, 'Best without hints: not set yet.');
  reload.click('reset'); reload.solve(reload.daily.create('2026-11-02').seed);
  assert.match(reload.nodes['daily-best'].textContent, /on this browser:/);
});

test('a normalized shared code loads the same puzzle in an independent session', () => {
  const a = boot(), b = boot(); a.code(' gg1-20240229 '); b.code('GG1-20240229');
  assert.equal(a.nodes['daily-code'].value, 'GG1-20240229'); assert.deepEqual(a.board(), b.board());
  a.click('select-code'); assert.equal(a.nodes['daily-code'].selected, true);
  assert.match(a.nodes['code-message'].textContent, /Code selected/);
  a.press(0); const current = a.board(), moves = a.moves();
  a.code('GG1-20260229'); assert.deepEqual(a.board(), current); assert.equal(a.moves(), moves);
  assert.equal(a.nodes['daily-code'].attrs['aria-invalid'], 'true');
  assert.match(a.nodes['code-message'].textContent, /real date/);
  a.click('select-code'); assert.equal(a.nodes['daily-code'].value, 'GG1-20240229');
  assert.equal(a.nodes['daily-code'].attrs['aria-invalid'], undefined);
});

test('unfinished code, board and moves resume exactly after reload', () => {
  const b = boot(); b.code('GG1-20261031'); b.press(0); b.press(3);
  const board = b.board(), moves = b.moves(); const reload = boot({ store: b.store });
  assert.equal(reload.nodes['daily-code'].value, 'GG1-20261031');
  assert.deepEqual(reload.board(), board); assert.equal(reload.moves(), moves);
  reload.click('undo'); assert.equal(reload.moves(), moves - 1);
});

test('UTC rollover never changes an active code or its record; Today opens the new day', () => {
  const b = boot({ date: '2026-11-02T23:59:59Z' }); b.press(0); b.date('2026-11-03T00:00:01Z');
  assert.equal(b.nodes['daily-code'].value, 'GG1-20261102');
  const reload = boot({ store: b.store, date: '2026-11-03T00:00:01Z' });
  assert.equal(reload.nodes['daily-code'].value, 'GG1-20261102');
  reload.click('daily'); assert.equal(reload.nodes['daily-code'].value, 'GG1-20261103');
  assert.equal(reload.moves(), 0); assert.equal(reload.nodes['daily-best'].textContent, 'Best without hints: not set yet.');
});

test('daily records stay separate when loading another date and returning', () => {
  const b = boot(); b.solve(b.daily.create('2026-11-02').seed); const record = b.nodes['daily-best'].textContent;
  b.code('GG1-20261103'); assert.equal(b.nodes['daily-best'].textContent, 'Best without hints: not set yet.');
  b.code('GG1-20261102'); assert.equal(b.nodes['daily-best'].textContent, record);
});

test('version 1 original progress still loads with its exact board and move count', () => {
  const store = memoryStorage({ 'grid-garden': JSON.stringify({version:1,mode:'original',levelIndex:1,seed:[],history:[0]}) });
  const b = boot({ store }); assert.match(b.nodes.level.textContent, /Garden 2\/4/);
  assert.equal(b.board().length, 9); assert.equal(b.moves(), 1); assert.equal(b.nodes['code-panel'].hidden, true);
  b.click('undo'); assert.equal(b.moves(), 0);
  b.solve([0,8,4]); assert.match(b.nodes.message.textContent, /complete/);
});

test('four originals and the random generator remain playable and resumable', () => {
  const b = boot(); b.click('original');
  for (const [i, seed] of [[4],[0,8,4],[1,5,8,14],[0,2,6,9,11,15]].entries()) {
    b.solve(seed); assert.equal(b.board().every(Boolean), true);
    if (i < 3) b.click('next');
  }
  assert.match(b.nodes.message.textContent, /Every garden is in bloom/);
  b.click('new'); assert.match(b.nodes.level.textContent, /fresh garden/); assert.equal(b.board().length,16);
  b.press(0); const board = b.board(); const reload = boot({ store:b.store });
  assert.deepEqual(reload.board(), board); assert.equal(reload.moves(),1);
  reload.click('undo'); assert.equal(reload.moves(),0); reload.click('daily');
  assert.match(reload.nodes.level.textContent,/Daily garden/);
});

test('blocked storage and invalid saves do not prevent completing or retrying a daily puzzle', () => {
  for (const store of ['blocked', memoryStorage({'grid-garden':'{invalid'}),
    memoryStorage({'grid-garden':JSON.stringify({version:2,mode:'daily',levelIndex:0,seed:[],history:[999],code:'GG1-20261102',assisted:false})})]) {
    const b = boot({ store }); b.solve(b.daily.create('2026-11-02').seed);
    assert.equal(b.board().every(Boolean), true); assert.match(b.nodes['daily-best'].textContent,/on this browser/);
    b.click('reset'); assert.equal(b.moves(),0);
  }
});

test('keyboard focus does not count as a move and hidden documents cannot plant', () => {
  const b = boot(), first = b.nodes.garden.children[0]; let prevented = false;
  first.events.keydown({key:'ArrowRight',preventDefault(){prevented=true;}});
  assert.equal(prevented,true); assert.equal(b.focused,b.nodes.garden.children[1]); assert.equal(b.moves(),0);
  const board=b.board(); b.hidden(true); b.press(0); assert.deepEqual(b.board(),board);
  b.hidden(false); b.press(0); assert.equal(b.moves(),1);
});
