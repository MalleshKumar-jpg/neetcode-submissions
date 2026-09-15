# Rehab epoch games

Four first-person three.js scenes for a **cue-locked motor-imagery paradigm**.

These are not games in the usual sense. There is no input, no score, and
nothing that can fail. Each trial runs a fixed timeline; the virtual hand
flexes at a fixed latency after the cue whether or not the patient imagined
anything. The software's job is to (a) make that scripted movement feel like
the patient's own, and (b) get the markers out with known timing.

| Scene | What arrives in the palm | What happens during the hold |
|---|---|---|
| **Glowworm Hollow** | a firefly settles | its light bleeds out between the closed fingers |
| **First Snow** | a crystal lands | it melts, leaving a drop to let go of |
| **Tide Line** | a wave washes in a shell | the water draws back; the shell dries |
| **Ember Drift** | an ember floats down | it burns brighter inside the closed fist |

## Trial timeline

    rest 2.0s -> cue 0.5s -> flex 1.5s -> hold 2.5s -> extend 1.5s -> rest 4.0s

12.0 s per trial. Rest and inter-trial rest carry +/- jitter (0.4 s and 1.0 s
by default) so the patient cannot entrain to the rhythm and contaminate the
baseline with anticipatory potentials.

Sides are drawn in **balanced blocks of four** (two left, two right, shuffled),
so left/right counts stay matched even if the session is stopped early.

Edit `src/epoch.js` (`DEFAULT_TIMING`) or pass `timing` in a theme to change it.

## Running

Open any file in `dist/` directly in a browser. They are fully self-contained
— three.js is inlined, there are no CDN calls and no webfonts — so they run on
an air-gapped clinical machine off a USB stick.

Build from source:

    npm install three esbuild
    NM_DIR=$(pwd) node build.mjs

## Markers

Every phase boundary emits a marker. Labels: `session_start`, `cue_left` /
`cue_right`, `flex`, `hold`, `extend`, `iti`, `rest`, `session_end`. Each row
carries `trial`, `side`, `phase`, `t_perf_ms` (high-resolution, stamped inside
the rAF callback that draws the change), `t_session_ms` and `t_unix_ms`.

Two ways out:

- **CSV** — download from the summary screen at the end of a session.
- **Live** — put a WebSocket URL in the intro's "Marker socket" field and run
  `tools/marker_bridge.py`, which republishes each marker on an LSL stream:

      pip install websockets pylsl
      python tools/marker_bridge.py --port 8765

## Timing: read this before you trust a number

`t_perf_ms` is stamped in the animation-frame callback that *draws* the change.
Compositing and display latency come after that and are not measured. So:

**Use the photodiode patch.** The square in the screen corner is drawn as a
WebGL overlay, not a DOM element, so it is guaranteed to land in the same
presented frame as the 3D scene. It flashes white for 100 ms at cue onset and
at flex onset. Tape a photodiode over it, feed it into a spare amplifier
channel, and you measure your real cue-to-photon latency instead of assuming
it. Do this once per machine and monitor; do not assume the offset transfers.

Toggle it off in the intro screen for a patient-facing session, but leave it on
whenever you are recording data you intend to analyse.

## Design constraints these scenes respect

These are not stylistic choices — each one protects the recording.

- **Low eccentricity.** Both hands sit near the midline (`spread: 0.082`, about
  10 degrees off centre at the default distance) and a fixation point is drawn
  dead centre. Objects far into the periphery provoke saccades, and lateralised
  EOG is precisely what a left/right classifier will learn instead of motor
  imagery. Raise `spread` only if you have a reason to.
- **No colour coding of side.** The cue text is one colour for both sides.
  Different hues mean different luminance, which becomes a lateralised visual
  evoked potential in the cue epoch.
- **Symmetric lighting.** Ember Drift's fire sits dead ahead rather than off to
  one side; a lateral light source would put a standing luminance difference
  between the two hands.
- **The object comes to the hand.** It is created at cue onset, lands in the
  open palm exactly as flex begins, and rides the closing fist. Since the
  movement is open-loop, the grasp can never miss — no near-misses, no fumbles,
  nothing that would undercut the patient's sense of having caused it.
- **Everything is compiled before trial one** (`renderer.compile`), so no shader
  hitch lands on a phase boundary and skews a marker.

## Matching the virtual hand to the real one

`EpochScheduler.update` derives `curl` from the timeline with a smoothstep
ease. If your FES or orthosis ramps differently, change that easing to match —
congruence between what the patient sees and what their hand actually does is
the mechanism you are paying for, and a virtual hand that closes visibly faster
than the real one breaks it.

## Layout

    src/engine.js        scene bootstrap, post-processing, HUD, main loop
    src/epoch.js         trial timeline, balanced sides, marker sink
    src/hand.js          procedural skinned hands and forearms
    src/world.js         terrain, motes, trunks, noise
    src/themes/          the four scenes
    src/themes/common.js per-trial choreography shared by all four
    tools/marker_bridge.py  WebSocket -> LSL
    build.mjs            bundles each theme into a standalone HTML file
