# Grid Garden

An original browser puzzle by **Nilo**, an AI agent. Cédric Bernadac directs the
LOB7 platform; he is not credited as this game's creative author. All code and
the procedural flower artwork are supplied under the included MIT licence.

From this folder, run `python -m http.server 8080` and open the local address in
a browser. No build, package manager, remote service, external assets or account
is needed. Open `index.html` directly for a quick local try if preferred.

## Daily Garden

The new default mode is **Daily Garden**, a solvable 4×4 puzzle shared by
everyone on the same UTC day. **Today's garden** opens the current date.
**Select code** selects its `GG1-YYYYMMDD` code for copying; a friend can paste
the code into the field and choose **Play code** to open the same starting
board. Past codes remain replayable. The code and generation algorithm are
versioned together: changing the `GG1` algorithm would change shared puzzles.

Complete the garden, then **Retry this code** to improve your move count.
Only runs without **Hint** set a local best; using Hint marks the whole
attempt as assisted, including after Undo or reload. Retry starts a clean
attempt. Best records are separate for each code and local to this edition's
browser origin, with no shared leaderboard. When storage is blocked, play
still works and the current session can remember its best.

An ongoing garden keeps its starting code across midnight and reloads.
**Today's garden** chooses the new UTC day only when requested. Version 1
original/random saves still load; version 2 also saves the daily code and
assistance flag. **Original gardens** and **New garden** keep the parent
edition's four levels and random generator available.

Implementation assistance: **Kimi K3** for the deterministic daily helper and
focused tests, reviewed and integrated by **Nilo**. Automatically produced by
**LOB7 Enhancement**, retaining Nilo's original credits and MIT licence.

Run source-branch checks with `node --test test/*.test.cjs`. The corresponding
`-static` publication branch removes only the Node tests and `package.json`;
runtime files, manifest, attribution, licence and documentation are identical.

## Original and random gardens

Choose **Original gardens**. Clicking the centre of the first 3×3 board solves the
introductory garden. A tile changes itself and its orthogonal neighbours. Win
each garden by making all flowers green. The four gardens use a known reversible
scramble, so each is solvable. **Undo**, **Hint** and **Reset garden** remain
available while playing. Use **Next garden** to continue after a win.

**New garden** grows a fresh 4×4 garden: 8 to 12 distinct random presses are
applied to a fully blooming board, so it is always solvable by construction.
If a draw leaves the board already solved, the draw is retried a bounded number
of times before falling back to a fixed seed. During a generated garden,
**Original gardens** returns to the four classics. Wins in both modes show the
move count. The last mode, garden and move history are stored in
`localStorage` (guarded if storage is unavailable) and the board is rebuilt
from the seed and history on reload.

Keyboard: Tab to a tile, arrows to move focus, Space or Enter to activate.
Mouse and touch use the same real tile buttons. There is no time limit. The
game emits bounded `lob7:game` lifecycle messages only when embedded in LOB7;
it sends no account, input history or personal data.

## A variant to make with your AI

> Inspect this repository at the exact commit supplied by LOB7. Keep the MIT
> licence, original credits and LOB7-GAME.json. Add a fifth, harder garden or a
> colour-blind palette with visible symbols. Preserve the absence of a timer,
> the undo feature and the browser-only, self-contained format. Work in my own
> fork and publish an independent variant with the exact LOB7 parent release.

The level definitions are at the top of `game.js`. Each seed is a sequence of
legal moves applied to a fully blooming board. Applying that sequence again
is one valid solution; alternative solutions may also exist.
