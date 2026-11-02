'use strict';
(() => {
  const garden = document.getElementById('garden');
  const message = document.getElementById('message');
  const levelLabel = document.getElementById('level');
  const movesLabel = document.getElementById('moves');
  const startButton = document.getElementById('start');
  const nextButton = document.getElementById('next');
  const newButton = document.getElementById('new');
  const originalButton = document.getElementById('original');
  const dailyButton = document.getElementById('daily');
  const codePanel = document.getElementById('code-panel');
  const codeInput = document.getElementById('daily-code');
  const playCodeButton = document.getElementById('play-code');
  const selectCodeButton = document.getElementById('select-code');
  const codeMessage = document.getElementById('code-message');
  const bestLabel = document.getElementById('daily-best');
  const daily = window.GridDaily;
  const sessionBests = Object.create(null);
  const undoButton = document.getElementById('undo');
  const hintButton = document.getElementById('hint');
  const resetButton = document.getElementById('reset');
  const levels = [
    { size: 3, seed: [4], name: 'A first bloom' },
    { size: 3, seed: [0, 8, 4], name: 'Corners and company' },
    { size: 4, seed: [1, 5, 8, 14], name: 'A winding path' },
    { size: 4, seed: [0, 2, 6, 9, 11, 15], name: 'The evening garden' }
  ];
  const SAVE_KEY = 'grid-garden';
  let mode = 'original';
  let levelIndex = 0;
  let generatedSeed = [];
  let dailyChallenge = null;
  let assisted = false;
  let board = [];
  let solution = new Set();
  let history = [];
  let state = 'ready';
  let lastActivity = 0;
  let hint = -1;
  let pauseFromVisibility = false;
  let resumePending = false;

  function signal(event) {
    if (event === 'start') resumePending = false;
    if (window.parent !== window) window.parent.postMessage({ type: 'lob7:game', event }, 'https://lob7.com');
  }
  function activity() {
    if (resumePending) signal('start');
    if (performance.now() - lastActivity >= 2000) { lastActivity = performance.now(); signal('activity'); }
  }
  function currentLevel() {
    if (mode === 'daily') return { size: 4, seed: dailyChallenge.seed, name: 'Daily garden' };
    return mode === 'generated' ? { size: 4, seed: generatedSeed, name: 'A fresh garden' } : levels[levelIndex];
  }
  function dailyStorage() {
    try { return window.localStorage; } catch (_) { return null; }
  }
  function bestForCode() {
    const code = dailyChallenge.code;
    const stored = daily.readBest(dailyStorage(), code);
    if (stored !== null) sessionBests[code] = Math.min(sessionBests[code] ?? Infinity, stored);
    return sessionBests[code] ?? null;
  }
  function change(index) {
    const size = currentLevel().size;
    const row = Math.floor(index / size), col = index % size;
    for (const [r, c] of [[row, col], [row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]]) {
      if (r >= 0 && r < size && c >= 0 && c < size) board[r * size + c] = !board[r * size + c];
    }
    if (solution.has(index)) solution.delete(index); else solution.add(index);
  }
  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 2, mode, levelIndex, seed: generatedSeed, history,
        ...(mode === 'daily' ? { code: dailyChallenge.code, assisted } : {}) }));
    } catch (error) { /* storage unavailable: play on without persistence */ }
  }
  function load() {
    let data;
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw || raw.length > 25000) return null;
      data = JSON.parse(raw);
    } catch (error) { return null; }
    if (!data || ![1, 2].includes(data.version) || !['original', 'generated', 'daily'].includes(data.mode)
      || !Number.isInteger(data.levelIndex) || data.levelIndex < 0 || data.levelIndex >= levels.length) return null;
    const savedMode = data.mode;
    let savedDaily = null;
    if (savedMode === 'daily') {
      if (data.version !== 2 || typeof data.assisted !== 'boolean') return null;
      try { savedDaily = daily.parse(data.code); } catch (_) { return null; }
    }
    const index = data.levelIndex;
    const size = savedMode === 'original' ? levels[index].size : 4;
    if (!Array.isArray(data.seed) || data.seed.length > 16
      || data.seed.some(n => !Number.isInteger(n) || n < 0 || n >= 16)) return null;
    const seed = [...new Set(data.seed)];
    if (savedMode === 'generated' && seed.length === 0) return null;
    if (!Array.isArray(data.history) || data.history.length > 4096
      || data.history.some(n => !Number.isInteger(n) || n < 0 || n >= size * size)) return null;
    const moves = data.history.slice();
    return { mode: savedMode, levelIndex: index, seed, history: moves, daily: savedDaily, assisted: data.assisted === true };
  }
  function render(focusIndex) {
    const level = currentLevel();
    garden.style.setProperty('--size', String(level.size));
    garden.replaceChildren();
    board.forEach((bloom, index) => {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = `tile${bloom ? ' bloom' : ''}${hint === index ? ' hinted' : ''}`;
      tile.textContent = bloom ? '✿' : '·';
      tile.setAttribute('aria-label', `Row ${Math.floor(index / level.size) + 1}, column ${index % level.size + 1}: ${bloom ? 'blooming' : 'sleeping'}`);
      tile.setAttribute('aria-pressed', String(bloom));
      tile.disabled = state !== 'playing';
      tile.addEventListener('click', () => plant(index));
      tile.addEventListener('keydown', event => {
        let target;
        if (event.key === 'ArrowLeft') target = Math.max(0, index - 1);
        if (event.key === 'ArrowRight') target = Math.min(board.length - 1, index + 1);
        if (event.key === 'ArrowUp') target = Math.max(0, index - level.size);
        if (event.key === 'ArrowDown') target = Math.min(board.length - 1, index + level.size);
        if (target !== undefined) { event.preventDefault(); garden.children[target].focus(); }
      });
      garden.append(tile);
    });
    levelLabel.textContent = mode === 'daily' ? `Daily garden · ${dailyChallenge.day} UTC` : mode === 'generated'
      ? 'A fresh garden · new every time'
      : `Garden ${levelIndex + 1}/${levels.length} · ${levels[levelIndex].name}`;
    movesLabel.textContent = `Moves: ${history.length}`;
    undoButton.disabled = state !== 'playing' || history.length === 0;
    hintButton.disabled = state !== 'playing';
    resetButton.disabled = state === 'ready' || (state === 'finished' && mode !== 'daily');
    resetButton.textContent = mode === 'daily' && state === 'finished' ? 'Retry this code' : 'Reset garden';
    originalButton.hidden = mode === 'original';
    codePanel.hidden = mode !== 'daily';
    if (mode === 'daily') {
      const best = bestForCode();
      bestLabel.textContent = best === null ? 'Best without hints: not set yet.'
        : `Best without hints on this browser: ${best} ${best === 1 ? 'move' : 'moves'}.`;
    }
    if (focusIndex !== undefined && state === 'playing') garden.children[focusIndex].focus();
  }
  function setup(savedHistory = [], savedAssisted = false) {
    const level = currentLevel();
    assisted = mode === 'daily' && savedAssisted;
    codeMessage.textContent = '';
    codeInput.removeAttribute('aria-invalid');
    if (mode === 'daily') codeInput.value = dailyChallenge.code;
    board = Array(level.size * level.size).fill(true);
    solution = new Set(); history = []; hint = -1;
    for (const index of level.seed) change(index);
    for (const index of savedHistory) { change(index); history.push(index); }
    state = 'playing';
    message.textContent = savedHistory.length
      ? `${board.filter(Boolean).length} of ${board.length} flowers are blooming. Welcome back.`
      : mode === 'daily' ? 'Everyone gets the same garden for this UTC day. Solve it in as few moves as you can.'
        : mode === 'generated'
        ? 'A fresh garden grown from hidden presses. There is always a way.'
        : levelIndex === 0
          ? 'Try the centre tile. What happens to its neighbours?'
          : 'Bring every flower into bloom. There is always a way.';
    startButton.hidden = true; nextButton.hidden = true;
    if (board.every(Boolean)) completeGarden(false);
    save();
    render();
  }
  function growGarden() {
    mode = 'generated';
    for (let attempt = 0; attempt < 25; attempt++) {
      const count = 8 + Math.floor(Math.random() * 5);
      const picks = Array.from({ length: 16 }, (_, index) => index);
      for (let i = picks.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [picks[i], picks[j]] = [picks[j], picks[i]];
      }
      generatedSeed = picks.slice(0, count);
      setup();
      if (!board.every(Boolean)) return;
    }
    generatedSeed = [5];
    setup();
  }
  function completeGarden(notify = true) {
      const moves = `${history.length} ${history.length === 1 ? 'move' : 'moves'}`;
      if (mode === 'daily') {
        state = 'finished';
        if (!assisted) {
          const code = dailyChallenge.code;
          const recorded = daily.recordBest(dailyStorage(), code, history.length);
          if (recorded !== null) sessionBests[code] = Math.min(sessionBests[code] ?? Infinity, recorded);
        }
        message.textContent = assisted ? `Daily garden complete in ${moves}, with hints. Best scores count runs without hints.`
          : `Daily garden complete in ${moves}! Retry the same code to improve your best.`;
      } else if (mode === 'generated') {
        state = 'finished'; message.textContent = `Fresh garden complete in ${moves}! New garden grows another.`;
      } else if (levelIndex === levels.length - 1) {
        state = 'finished'; message.textContent = `Garden complete in ${moves}! Every garden is in bloom. Beautifully done!`;
        startButton.hidden = false; startButton.textContent = 'Plant a new garden';
      } else {
        state = 'between'; message.textContent = `Garden complete in ${moves}!`;
        nextButton.hidden = false;
      }
      if (notify && state === 'finished') signal('end');
  }
  function plant(index) {
    if (state !== 'playing' || document.hidden) return;
    change(index); history.push(index); hint = -1; activity();
    const count = board.filter(Boolean).length;
    if (count === board.length) completeGarden();
    else message.textContent = `${count} of ${board.length} flowers are blooming. Keep growing.`;
    save();
    render(index);
    if (state === 'between') nextButton.focus();
    else if (state === 'finished' && mode === 'daily') resetButton.focus();
    else if (state === 'finished' && mode === 'generated') newButton.focus();
    else if (state === 'finished') startButton.focus();
  }
  startButton.addEventListener('click', () => { mode = 'original'; levelIndex = 0; setup(); signal('start'); });
  nextButton.addEventListener('click', () => { levelIndex += 1; setup(); });
  newButton.addEventListener('click', () => {
    if (state === 'ready' || state === 'finished') signal('start');
    growGarden(); activity();
  });
  originalButton.addEventListener('click', () => {
    if (mode === 'original') return;
    mode = 'original'; setup(); activity();
  });
  function playDaily(challenge) {
    const newSession = state === 'ready' || state === 'finished';
    mode = 'daily'; dailyChallenge = challenge; setup();
    if (newSession) signal('start');
    activity();
  }
  dailyButton.addEventListener('click', () => playDaily(daily.create(daily.utcDay())));
  playCodeButton.addEventListener('click', () => {
    let challenge;
    try { challenge = daily.parse(codeInput.value); } catch (_) {
      codeMessage.textContent = 'Use GG1-YYYYMMDD with a real date, for example GG1-20261102. Your current garden is unchanged.';
      codeInput.setAttribute('aria-invalid', 'true'); codeInput.focus(); return;
    }
    playDaily(challenge);
  });
  selectCodeButton.addEventListener('click', () => {
    codeInput.value = dailyChallenge.code; codeInput.removeAttribute('aria-invalid');
    codeInput.focus(); codeInput.select();
    codeMessage.textContent = 'Code selected. Copy it to share this daily garden.';
  });
  resetButton.addEventListener('click', () => {
    if (state === 'playing' || state === 'between' || (state === 'finished' && mode === 'daily')) {
      const newSession = state === 'finished'; setup();
      if (newSession) signal('start');
      activity();
    }
  });
  undoButton.addEventListener('click', () => {
    if (state !== 'playing' || !history.length) return;
    const index = history.pop(); change(index); hint = -1;
    message.textContent = 'Last move undone. Try another path.'; save(); render(index); activity();
  });
  hintButton.addEventListener('click', () => {
    if (state !== 'playing') return;
    if (mode === 'daily') assisted = true;
    hint = solution.values().next().value;
    message.textContent = 'The highlighted tile is a useful next move. You still make the choice.';
    save(); render(hint); activity();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (state === 'playing' || state === 'between')) { pauseFromVisibility = true; signal('pause'); }
    else if (!document.hidden && pauseFromVisibility) { pauseFromVisibility = false; signal('resume'); }
  });
  const saved = load();
  if (saved) {
    mode = saved.mode; levelIndex = saved.levelIndex; generatedSeed = saved.seed; dailyChallenge = saved.daily;
    setup(saved.history, saved.assisted);
    resumePending = true;
  } else {
    mode = 'daily'; dailyChallenge = daily.create(daily.utcDay()); setup(); resumePending = true;
  }
  signal('ready');
})();
