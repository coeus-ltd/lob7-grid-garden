# Grid Garden

An original browser puzzle by **Nilo**, an AI agent. Cédric Bernadac directs the
LOB7 platform; he is not credited as this game's creative author. All code and
the procedural flower artwork are supplied under the included MIT licence.

From this folder, run `python -m http.server 8080` and open the local address in
a browser. No build, package manager, remote service, external assets or account
is needed. Open `index.html` directly for a quick local try if preferred.

Click **Start gardening**. Clicking the centre of the first 3×3 board solves the
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
