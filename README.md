# follow-me

A koi pond seen from above, in the browser. The fish swim by flocking rules,
come to a pointer that holds still, scatter from one that moves fast, and
gather where you tap. With the camera on they follow your hand instead.

<https://kenny-t-vo.github.io/follow-me/>

## Running it

Any static server from the repo root; ES modules do not load from `file://`.

```bash
python3 -m http.server 8766
```

Then <http://localhost:8766>. Tests run with `node --test` and need nothing
installed beyond Node.

## Using it

Move the pointer and fish within reach come to it. Move fast and the ones
nearby startle and burst away. Tap or click to drop food; a ripple marks the
spot and the fish eat it over a few seconds.

Bottom right: `settings.`, `hand.`, `about.`. Under `hand.`, `camera.` asks for
the camera and `a video.` takes a clip from disk. Landmarks are found in the
page by MediaPipe; the frames never leave the browser. The library and the
7.8 MB hand model load from CDNs the first time, so the first start takes a
few seconds. The feed is hidden by default, or shown as a thumbnail or as a
faint background behind the pond.

Keys: `s` settings, `h` hand, `space` pause, `r` reseed, `g` cycle style,
`esc` close.

Settings persist in the browser. `copy link.` puts the changed ones in the
URL, `save svg.` writes the current frame as vector paths, `reset.` returns
to the defaults.

Blue fish are attracted right now. Purple ones have just left the hand and
fade back over a few seconds. Those are the site's link colours, with the
same meanings.

## How it works

Distances and speeds are in body lengths. The one absolute setting is the
fish length as a share of the shorter side of the window, so the same
settings behave the same on a phone and a large monitor.

Physics is a boids pass over typed arrays with a spatial hash: separation,
alignment and cohesion, plus wander from three slow sines per fish, a
sociability trait so some fish keep to themselves, burst-and-coast thrust,
and edge steering in a smoothstep band. Steering only turns a fish, under an
agility cap; speed relaxes toward a target set by thrust, attraction and
startle.

Each fish is a spine of 14 nodes. The nose is the boid; the rest follow the
path it took with fixed segment lengths and a joint limit, which gives the
body its follow-through in a turn. A travelling wave is added when the
outline is built, wavelength 0.95 lengths with a quadratic amplitude envelope
toward the tail, beating at 1.5 × speed / length hertz, which is a Strouhal
number near 0.3. The outline comes from a width profile along the spine with
a forked caudal fin, and pectoral fins that flare on the inside of a turn and
when braking.

Three renderings of that geometry: `ink` (fill and hairline), `koi` (seven
varieties with blotches clipped to the body, chosen per fish from the seed),
and `grid` (fish rasterised into cells; each cell is a square scaled by how
much of it the fish covers, inset, optionally fading, optionally in the koi
colours).

## Layout

- `index.html`, `app.css`: the page. `type.css` and `fonts/` are copies of
  the website's type.
- `src/params.js`: the settings schema. One entry drives the pane,
  localStorage and the share link.
- `src/sim.js`: boids. `src/fish.js`: spine and outline. `src/render.js`:
  the three styles and overlays. `src/koi.js`: varieties and blotches.
  `src/hand.js`: camera, clip and MediaPipe. `src/ui.js`: the panes.
  `src/svg.js`: the snapshot. `src/main.js`: wiring.
- `tests/`: `node:test` checks for the physics, the geometry and the schema.

## Limits

Hand tracking is tuned on a laptop camera. Phones can turn it on but it is
not tuned there. No sound, and no water beyond the ripple ring.
