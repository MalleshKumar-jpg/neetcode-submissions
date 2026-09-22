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

## Confirmed setup

Everything below follows from these four facts. If any of them changes, the
constraints change with it.

| | |
|---|---|
| Paradigm | Cue-locked motor imagery, open-loop — the hand moves on the timeline whether or not the patient imagined anything |
| Recording | EEG |
| Purpose | Collecting time-locked epochs to train a left/right motor-imagery classifier |
| Actuator | Robotic orthosis / exoskeleton driving the real hand alongside the virtual one |

## Hard constraints

These are not style choices. Each one protects either the recording or the
patient, and breaking one invalidates data or causes harm.

**Paradigm**

1. Open-loop. No input is read; nothing is scored; nothing can fail.
2. Timeline is rest 2.0 / cue 0.5 / flex 1.5 / hold 2.5 / extend 1.5 / rest 4.0.
3. Rest and ITI carry jitter. A fixed period lets the patient entrain and puts
   anticipatory potentials in the baseline.
4. Sides are drawn in balanced blocks so left/right counts stay matched even if
   a session is stopped early.
5. One action: the clench. The open is a return to rest, not a second task.

**Protecting the epoch (cue through hold)**

6. Both hands sit near the midline and a fixation point is drawn dead centre.
   Peripheral objects provoke saccades, and lateralised EOG is exactly what a
   left/right classifier will learn instead of motor imagery.
7. The side cue is one colour for both sides. Different hues mean different
   luminance, which becomes a lateralised visual evoked potential.
8. Lighting is symmetric about the midline. A lateral light source puts a
   standing luminance difference between the two hands.
9. The scene is visually still from cue onset through the end of hold. Objects
   arrive during the *rest* phase and are settled before the cue fires.
10. Every trial's object looks identical during the epoch. A rare or distinct
    stimulus on a minority of trials is an oddball and elicits a P300 inside the
    imagery window. Rarity may only be revealed after extend.
11. No new sound during the epoch. An auditory onset is an evoked response.
    Rhythmic audio can entrain oscillations whose harmonics reach mu (8-13 Hz)
    and beta (13-30 Hz) — the bands the classifier reads.

**Patient safety and accessibility**

12. No strobe or rapid flashing. Post-stroke seizure risk is elevated.
13. Nothing dark. Darkness raises anxiety, and reduced contrast sensitivity is
    common post-stroke. Scenes target a mean luminance around 100-140 with
    under 2% near-black pixels.
14. No failure states, no time pressure, no scores.

**Timing integrity**

15. Shaders are compiled before trial one. A hitch on a phase boundary skews a
    marker.
16. Markers are stamped inside the animation-frame callback that draws the
    change. The photodiode patch measures what happens after that.
17. Anything added to the inter-trial window must fit inside the *minimum* ITI
    (3.0 s), or it starts dictating trial length and the jitter is lost.

## The free window

The 4-second inter-trial rest is the only part of the trial where nothing can
contaminate the recording — the imagery is over and the next cue has not fired.
Anything intended to keep the patient engaged across 300 repetitions belongs
there and nowhere else.

## Two things the orthosis specifically changes

**Mechanical latency.** An orthosis has a command-to-motion delay — typically
100-300 ms including gearbox backlash. The virtual hand starts instantly, so
without correction the patient sees the virtual hand move before feeling their
own, and the congruence you are paying for is broken. Measure your device's
latency, then either issue the device command early by that amount or delay the
virtual flex to match.

**Ramp shape.** `EpochScheduler.update` shapes the flex with a smoothstep. A
motor-driven orthosis usually moves at closer to constant angular velocity, so
a more linear ramp may match better. Measure the device and change the easing
to match it — endpoint and trajectory both matter for congruence.

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
