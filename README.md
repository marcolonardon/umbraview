# UmbraView

## Overview

UmbraView shows, for any site near the Moon's south pole and any date, when the Sun and the
Earth are above that site's real horizon, built from NASA's LOLA terrain. It is the Umbra Team's
project for the *Lunar Landing Site Navigator* challenge of the NASA Space Apps Challenge 2026.

- **Live site:** [enzodaun.github.io/umbraview](https://enzodaun.github.io/umbraview/),
  published by GitHub Pages on every merge into `main`.
- **Run it locally:** `npm install`, then `npm run dev`. The Node version and the commands are in
  *How to run*, below. `npm run verify` runs lint, tests, build and the build check, the same as
  the CI.
- **Data:** NASA's LOLA polar elevation models, checked against NASA's average visibility maps
  and JPL's SPICE. Every data source, library and license is listed in
  [CREDITS.md](CREDITS.md).
- **Use of AI:** Claude (Anthropic) helped with research, code, tests, documentation and the
  logo, and everything went through the team's review. The logo is labeled as AI-generated in the
  site footer. The statement is at the end of [docs/uso-de-ia.md](docs/uso-de-ia.md), in English.
- **License:** MIT, for the code and the logo ([LICENSE](LICENSE)).

---

A site that shows, for a site on the Moon, when the Sun and the Earth are above the real
horizon, with the terrain measured by NASA, and helps choose where and when to land.

A project by the **Umbra Team** for the *Lunar Landing Site Navigator* challenge of the NASA Space
Apps Challenge 2026 (14 and 15/11/2026).

It is a static site: every calculation runs in the browser, with no server. Its address is in
the Overview section, above.

**Before opening your first PR, read [CONTRIBUTING.md](CONTRIBUTING.md).** It has the branch
rule and the Claude rule, and neither of them is optional.

First time in the project? Start with [`docs/primeiros-passos.md`](docs/primeiros-passos.md): it
installs everything on Windows, from scratch.

---

## What already exists

- The screen with the product's regions: header; on the left, the Moon scene and, below it, the
  site's sky as a drawing; on the right, the panel for the chosen site, with the controls and the
  numbers.
- The whole Moon in the scene, with its real color and terrain (NASA, *CGI Moon Kit*), framed in
  any screen shape, over the sky of stars from the HYG catalog, in the position they are in on the
  chosen date (`src/scene/MoonGlobe.jsx` and `StarField.jsx`).
- The site's sky as a drawing (`src/panel/SiteSky.jsx`): the view from the ground, with the terrain
  outline in 360° and the path of the Sun and the Earth over the period, solid where they appear
  and dashed where the terrain hides them; and the timeline of the period, with the Sun, the Earth
  and the landing windows, and a cursor that marks the hour on the chart and can become the
  calculation date. The numbers come from `sky.groundView`.
- The 3D Moon in the scene region (`src/scene/`), which rotates with the mouse and zooms with the
  wheel (card C1). Near the south pole, it shows the real terrain, at its real height, with the
  Sun's light for the date and the shadow of the mountains (card C2). Up close, where the machine
  can handle it, the fine terrain (from the 80 m data) covers the screen, with one vertex every
  400 m in the middle of it and every 800 m around it, and the 80 m lighting everywhere: the small
  craters show up (card C6). A click near the pole chooses a site and puts a marker on it (card
  C3), and the panel on the right shows that site's sky on the same date (cards I1 and E11): the
  Sun and the Earth now, the next sunset, the light over the period and the landing windows.
- The map of areas with a landing window (the "Show landing areas" button, next to the scene): it
  paints over the Moon the places that have a landing window in the period of the chosen date, by
  the same rule as the panel's list. Down to 84°S, with a 5 km grid and the fine terrain; on the
  rest of the Moon, with a 2° grid (61 km) and the whole-Moon terrain. The horizons of both grids
  are computed beforehand, by `scripts/prepare-data/prepare-landing-grid.mjs`, and the calculation
  for each date runs in a Worker (`src/engine/landingAreas.js`).
- The system view (the "Earth, Moon and Sun" selector, above the scene): the Earth, the Moon in
  its orbit and the direction of the Sun, with the positions, axes and libration from the engine
  (`src/engine/system.js`), not to scale, and its own clock that moves through the period without
  changing the calculation date.
- The mission view (the "Mission" selector, above the scene; card C13): the Earth and the Moon
  with their real sizes and the real distance between them, the Earth turning with the view's
  clock, and 15 launch pads marked on the Earth at their real latitude and longitude
  (`src/data/launchSites.js`, with the coordinates from GCAT). The engine puts each pad in space
  at the clock's instant (`src/engine/earthSite.js`, checked against JPL Horizons). A launch
  site is chosen by clicking its mark or in the list, which also turns the camera to it. It is
  where the mission simulation will be drawn (cards C14 to C16); the path of a mission is not
  there yet.
- In the panel, the list of landing sites, which also chooses the site, including by keyboard
  alone (card I2): the IM-2 landing and the center of 7 of the 9 Artemis III candidate regions
  (card E16). Also in the panel, the date and time in UTC, which start at the time the page was
  opened (card I4). Both change the scene and the panel together (card E14).
- The calculation engine (`src/engine/`): a site's horizon, the Sun and the Earth hour by hour,
  the next sunset and the landing windows, checked against JPL's SPICE and pyproj.
- The bridge between the engine and the screen (`src/hooks/`): `useSiteSky` delivers the sky of
  the chosen site, and `useSubsolarPoint`, the direction of the Sun. The scene uses
  `useSubsolarPoint`; `App.jsx` calls `useSiteSky` and hands the result to the panel.
- Any point on the whole Moon can be chosen, by clicking: inside 84°S the horizon comes from the
  pole's fine terrain; outside, from the whole-Moon terrain (`public/data/relief/global/`, 1.9 km
  per pixel), and the panel warns that the result is approximate. The panel separates "hidden by
  the terrain" from "below the horizon" (night, the far side, libration).
- The south pole terrain down to 84°S (`public/data/relief/`), cropped from NASA's files by
  `scripts/prepare-data/`, and the comparison of the engine's horizon with NASA's (numbers in card
  E1).
- The color, spacing, type and motion tokens (`src/styles/tokens.css`), with the contrast of
  each color pair checked by a test.
- The safeguards that stop Claude from making a commit or signing one (CONTRIBUTING.md, section
  4).
- `verify`, which runs lint, tests, build and the build check, and the CI, which runs the same
  `verify` on every PR.

What is missing, who does it and how each piece fits together are in the
[backlog](docs/backlog.md).

---

## How to run

You need Node 24.15 or newer and Git for Windows. The step-by-step guide to install both is in
[`docs/primeiros-passos.md`](docs/primeiros-passos.md).

**Machine: yours · Shell: Windows PowerShell · folder: repository root.**

```powershell
# PASTE INTO WINDOWS POWERSHELL, NOT GIT BASH
npm install; if ($LASTEXITCODE -eq 0) { npm run dev }
```

- `npm install` downloads the dependencies and turns on this clone's commit hook. In the middle of
  the output you should see `ganchos: core.hooksPath = .githooks (...)`. If you see `esta pasta não
  é um repositório git`, you are in a copy without git (a zip, for example): the site runs, but the
  hook stays off. Two npm warnings appear and can be ignored
  ([`docs/primeiros-passos.md`](docs/primeiros-passos.md), step 6).
- `npm run dev` starts the site at `http://localhost:5173`. It keeps running; to stop it, `Ctrl+C`.

| Command | What it does |
|---|---|
| `npm run dev` | Starts the site in development mode, reloading on every saved file. |
| `npm run test` | Runs the tests once. |
| `npm run lint` | Checks the code. A warning counts as an error (`--max-warnings 0`). |
| `npm run build` | Generates the final site in `dist/`. |
| `npm run verify` | Lint, tests, build and the build check, in that order. It is what the CI runs. |

---

## Where to find each thing

| Question | Where |
|---|---|
| How to work in the repository (branch, commit, PR, Claude) | [`CONTRIBUTING.md`](CONTRIBUTING.md) |
| What do I do now | [`docs/backlog.md`](docs/backlog.md), look for your name |
| Why a library is on an old version | "Pinned versions", below |
| Where each piece of data and each library comes from | [`CREDITS.md`](CREDITS.md) |
| How the project declares its use of AI (Space Apps requires it) | [`docs/uso-de-ia.md`](docs/uso-de-ia.md) |
| What the team's Claude knows about the project | [`CLAUDE.md`](CLAUDE.md) |

---

## Three rules for every screen

**Content does not live inside the component.** Title, label, empty-state text and button name
live in `src/data/`, and the component imports them. The text the person sees is in English,
because the project is judged in English; comments and tests stay in Portuguese. The test
`src/noHardcodedText.test.js` fails loose text in a `.jsx` in `src/`, giving the file and the
line.

**Color, spacing and duration come from the token.** Never `#e9b450`, `16px` or `200ms` inside
the component: use `var(--color-accent)`, `var(--space-4)`, `var(--duration-fast)`. The tokens
live in `src/styles/tokens.css`. A new color goes in there, with its contrast pair in
`src/styles/tokens.test.js`.

**The screen does not calculate astronomy.** The position of the Sun and the Earth, the horizon,
the percentage of light and the landing window come from the engine, in `src/engine/`, which is
plain JavaScript, with no React, tested against NASA's values. The screen receives the finished
number through a hook in `src/hooks/`. If you needed to do one of these calculations in a
component, the number is missing from the engine: talk to Enzo instead of calculating it there.

## No made-up data

Landing site coordinates, mission dates, comparison numbers and crater names come from a source,
and the source is written down (in the `src/data/` file itself and in
[`CREDITS.md`](CREDITS.md)). The judges read the site as a result: a draft value that gets
published becomes a false statement with the team's name on it.

Until the source arrives, write `TODO_PREENCHER` in place of the value.
`scripts/check-build.mjs` runs on every `verify` and fails any build that has this marker, saying
which file it is in.

## Accessibility

- The lint includes `eslint-plugin-jsx-a11y`: an image without `alt`, a button without a name and
  a click on an element that does not receive the keyboard fail `verify`.
- Every control works with the keyboard and shows focus (`:focus-visible` with
  `--focus-ring`, in `src/styles/global.css`).
- Motion respects `prefers-reduced-motion`: with the option turned on in the system, the 3D scene
  does not animate the camera on its own and the transitions go away. `global.css` already turns
  off the transitions; whoever animates the scene checks the preference in the component itself.
- Without that option, the Moon rotates slowly on its own only until the person drags it or uses
  the wheel on it, or until a site is chosen, and it does not start rotating again (cards C5 and
  C10): WCAG 2.2.2 asks for a way to stop what moves on its own.

## Tests

The tests live next to the file they test, with the same name and `.test` before the extension,
and run with Vitest and Testing Library. Three things about them:

- **The suite runs in the Tokyo time zone, on purpose** (`vite.config.js`, `test.env`). The app
  shows times in UTC, which is the reference for missions. A formatter that forgot
  `timeZone: 'UTC'` would pass in the CI, which runs in UTC, and be wrong on the user's computer.
- **The "Structure" block below is checked by a test** (`src/readmeStructure.test.js`): a new
  file in `src/` missing from the block, or a file in the block that no longer exists, fails
  `verify`.
- **The git hooks run through `sh`** (`scripts/hooks.test.js`). On Windows, `sh` comes with Git
  for Windows; if the terminal cannot find `sh`, these cases are skipped and the reason shows up
  in the output. In the CI they always run.

## Pinned versions

Every version in `package.json` is exact, without `^`: everyone installs exactly the same thing,
and updating is a decision, not a side effect of `npm install`. Updating a dependency is its own
PR, with `verify` passing and Enzo's OK.

Three versions do not go up without checking first, because they break another piece:

| What | Stays at | Why |
|---|---|---|
| `react` and `react-dom` | 19.3 (below 19.4) | `@react-three/fiber` 9.8.2 accepts React `>=19 <19.4`. |
| `eslint` and `@eslint/js` | 9 | `eslint-plugin-jsx-a11y` 6.10.2, which checks accessibility, accepts ESLint only up to 9. |
| Node | 24.15 or newer | On the 24 line, jsdom 30, used in the tests, requires at least 24.15. |

## If package-lock.json has a conflict

It happens when two people add a dependency in parallel branches. **Do not resolve it by
hand**: the file has thousands of interlinked lines, and a manual merge corrupts the dependency
tree in a way that only shows up days later.

**Machine: yours, in Git Bash, at the repository root.**

```bash
git checkout --theirs package-lock.json && npm install && git add package-lock.json
```

This keeps the `develop` version and regenerates the lock from the already merged
`package.json`. Then, finish the merge as Git asks and run `npm run verify` before the push.

## Structure

```
umbraview/
├── .claude/
│   ├── hooks/
│   │   └── block-git-write.sh       refuses write git commands inside Claude Code
│   └── settings.json                the team's Claude Code configuration
│
├── .githooks/
│   └── commit-msg                   refuses commits signed by Claude
│
├── .github/
│   ├── workflows/
│   │   ├── pages.yml                publishes the site to GitHub Pages
│   │   └── verify.yml               the verify and the signature check on every PR
│   └── pull_request_template.md
│
├── brand/                           the team's and the project's logo kit, in vector (card V2)
│   ├── favicon/                     the tab and phone icons, the source of the ones in public/
│   ├── svg/                         the source of every version of the logo; the PNG comes from here when needed
│   └── LEIA-ME.txt                  the colors, the font and where to use each version
│
├── docs/
│   ├── backlog.md
│   ├── mission-simulation-plan.md   the plan for the mission simulation (cards C13 to C16), not built yet
│   ├── primeiros-passos.md
│   └── uso-de-ia.md
│
├── public/
│   ├── data/
│   │   ├── earth/                   the Earth image for the system view, from NASA's Blue Marble
│   │   ├── landing-grid/            the horizon of a grid of points, for the landing areas map
│   │   ├── moon/                    the color and terrain of the whole-Moon globe, from NASA, generated by the script
│   │   ├── relief/                  the south pole terrain the site uses, generated by the script (card E2)
│   │   └── stars/                   the stars of the scene's sky, from the HYG catalog, with their license
│   ├── brand/                       the header logo and the footer symbol, copied from brand/svg/
│   ├── apple-touch-icon.png         the site icon, copied from brand/favicon/ (card V2)
│   ├── favicon.ico
│   └── favicon.svg
│
├── scripts/
│   ├── prepare-data/                crops NASA's terrain for the site and compares it with NASA (card E2)
│   │   ├── README.md                where to download the files and how to run
│   │   ├── compare-nasa.mjs         our Sun and our Earth against NASA's maps
│   │   ├── nasa-reference.json      NASA's values at the comparison points
│   │   ├── nasa_reference.py        generates nasa-reference.json
│   │   ├── prepare-landing-grid.mjs  generates public/data/landing-grid/, with the site's engine and terrain
│   │   ├── prepare_earth.py         generates public/data/earth/, from NASA's Blue Marble
│   │   ├── prepare_moon_global.py   generates public/data/moon/ and the whole-Moon terrain, from NASA's CGI Moon Kit
│   │   ├── prepare_relief.py        generates public/data/relief/
│   │   ├── prepare_stars.py         generates public/data/stars/, from the HYG catalog
│   │   ├── requirements.txt
│   │   └── window-lengths.mjs       how long the landing windows last, to choose the minimum
│   ├── references/                  external references for the tests of the engine and of the site lists
│   │   ├── artemis-regions.geojson  the outline of the Artemis III candidate regions, from the USGS (card E16)
│   │   ├── gcat-launch-points.tsv   the launch pads of the list of launch sites, rows copied from GCAT (card C13)
│   │   ├── gcat-lunar-launches.tsv  one launch to the Moon from each of those pads, rows copied from GCAT
│   │   ├── horizons-reference.mjs   generates horizonsEarthSite.json, from JPL Horizons
│   │   ├── polar_reference.py
│   │   ├── requirements.txt
│   │   └── spice_reference.py
│   ├── check-build.mjs
│   ├── check-build.test.js
│   ├── hooks.test.js
│   └── install-hooks.mjs
│
├── src/
│   ├── data/
│   │   ├── about.js                 the text that explains the product: the problem, what the site does and how to start
│   │   ├── app.js                   main screen texts
│   │   ├── launchSites.js           the launch sites of the mission view, with the source of each one (card C13)
│   │   ├── missionView.js           mission view texts (the Earth and the Moon to scale)
│   │   ├── panel.js                 site panel texts (card I1)
│   │   ├── scene.js                 3D scene texts (cards C1 to C3)
│   │   ├── siteSky.js               ground view and timeline texts
│   │   ├── sites.js                 the landing sites in the list, with the source of each one (card I2)
│   │   └── systemView.js            system view texts (the Earth, the Moon and the Sun)
│   ├── engine/                      the calculation engine (card E1)
│   │   ├── fixtures/
│   │   │   ├── horizonsEarthSite.json  a point of the Earth's surface in space according to JPL Horizons, for the launch site test
│   │   │   ├── polarReference.json  x/y position from pyproj, for the projection test
│   │   │   ├── reliefSamples.json   heights read from NASA's files, for the site's terrain test
│   │   │   └── spiceReference.json  Sun and Earth according to SPICE, for the positions test
│   │   ├── config.js                the engine parameters, with the reason for each one
│   │   ├── earthSite.js             a point of the Earth's surface in space at an instant: the launch site
│   │   ├── ephemeris.js             the position of the Sun and the Earth seen from the Moon, hour by hour
│   │   ├── geometry.js              coordinates, south polar projection and east/north/up
│   │   ├── horizon.js               the horizon of a point, direction by direction
│   │   ├── landingAreas.js          which points of a grid have a landing window in the period of a date
│   │   ├── landingGridFiles.js      the landing grid files, and the map mask for the scene
│   │   ├── relief.js                the terrain height at a point: polar, cylindrical or tiled grid
│   │   ├── reliefFiles.js           the site's terrain files become the horizon layers
│   │   ├── series.js                Sun and Earth hour by hour, sunset and landing windows
│   │   ├── siteSky.js               the sky of a point over the screen's period, with the site's terrain
│   │   ├── summary.js               the result in the format the screen expects
│   │   ├── starCatalog.js           the stars from stars.bin: direction, magnitude and color from B−V
│   │   ├── system.js                the Earth, the Moon and the Sun at an instant: positions, axes, orbit and libration
│   │   └── systemState.js           the rotation of the star sky into the Moon's fixed reference frame
│   ├── hooks/                       the bridge between the engine and the screen (card E3)
│   │   ├── usePrefersReducedMotion.js  whether the person asked the system for less animation
│   │   ├── useFarRelief.js          the pole's coarse terrain, for the scene mesh (card C2)
│   │   ├── useLandingAreas.js       the map of areas with a landing window on the date, computed in a Worker
│   │   ├── useNearTiles.js          the fine terrain tiles around the camera (card C6)
│   │   ├── useSiteSky.js            the sky of the chosen site, with the calculation status
│   │   ├── useSkyRotation.js        the rotation of the star sky for the scene, on the date
│   │   ├── useStarCatalog.js        the stars of the scene's sky, read once per page
│   │   ├── useSubsolarPoint.js      where the Sun is directly overhead on the date, for the scene's light
│   │   ├── useTimedNotice.js        a short notice that goes away on its own (card C3)
│   │   └── useViewClock.js          the own clock of the system view and of the mission view
│   ├── panel/                       the site panel: the numbers and the choice of site and date (cards I1, I2 and I4)
│   │   ├── About.css
│   │   ├── About.jsx                the block that explains the product, at the end of the panel
│   │   ├── DateTimeControl.css
│   │   ├── DateTimeControl.jsx      the date and time of the calculation, in UTC (card I4)
│   │   ├── GroundView.css
│   │   ├── GroundView.jsx           the ground view: the terrain in 360° and the path of the Sun and the Earth on top
│   │   ├── SiteList.css
│   │   ├── SiteList.jsx             the list of landing sites, separating landings from candidate regions (card I2)
│   │   ├── SitePanel.css
│   │   ├── SitePanel.jsx            the site's numbers, one text for each useSiteSky status
│   │   ├── SiteSky.css
│   │   ├── SiteSky.jsx              the site's sky as a drawing: the ground view and the timeline, linked by the hour
│   │   ├── Timeline.css
│   │   ├── Timeline.jsx             the period's timeline: Sun, Earth and landing windows, with the hour cursor
│   │   ├── format.js                degrees, percentage and UTC date, as text for the panel
│   │   └── skyChart.js              the drawing math for the ground view and the timeline
│   ├── scene/                       the 3D Moon (cards C1 to C3, C6 and C8)
│   │   ├── CameraRig.jsx            the camera: frames the whole Moon, zooms with the wheel or a pinch, flies to the site and back
│   │   ├── LandingAreasLayer.jsx    the map of areas with a landing window, painted over the Moon
│   │   ├── LunarScene.css
│   │   ├── LunarScene.jsx           the Moon, the Sun's light for the date and the camera that rotates with the mouse
│   │   ├── MissionView.css
│   │   ├── MissionView.jsx          the mission view: the Earth and the Moon to scale, with the launch sites on the Earth (card C13)
│   │   ├── MoonGlobe.jsx            the whole-Moon sphere, with its real color and terrain
│   │   ├── NearRelief.jsx           the close-up fine terrain, only where the machine can handle it (card C6)
│   │   ├── ReliefCap.jsx            the south pole terrain in the scene, with shadows (card C2)
│   │   ├── SiteMarker.jsx           the marker of the chosen site (card C3)
│   │   ├── StarField.jsx            the real star sky, in the position for the date
│   │   ├── SystemView.css
│   │   ├── SystemView.jsx           the system view: the Earth, the Moon in its orbit and the Sun, with its own clock
│   │   ├── coordinates.js           Moon point to scene point and back: the axis convention
│   │   ├── frameBudget.js           whether the machine can handle the fine terrain: the time between frames (card C6)
│   │   ├── EarthHaze.jsx            the Earth's blue haze in the system view: it lightens only the day side
│   │   ├── SunBody.jsx              the 3D Sun of the system view: the disk darker at the edge, and the halo
│   │   ├── ZoomControls.jsx         the camera of the system view and of the mission view: rotates, zooms by sliding and turns to a chosen point
│   │   ├── EarthBody.jsx            the Earth of those two views: the real image, turned as it is at the instant
│   │   ├── MoonBody.jsx             the Moon of those two views
│   │   ├── ViewClock.css
│   │   ├── ViewClock.jsx            the row of controls of those two views: play, the clock cursor and the hour
│   │   ├── cssToken.js              the value of a token of tokens.css, for the colors the 3D drawing needs
│   │   ├── missionPicking.js        the click on the mark of a launch site: which site it chooses
│   │   ├── missionScale.js          the scale of the mission view, and where and how big the mark of a launch site is
│   │   ├── useBodyTexture.js        the image of a body becoming a texture, for the Earth and the Moon
│   │   ├── additiveLight.js         the blending of lights that add onto the background: the stars and the Sun's glow
│   │   ├── earthImage.js            the Earth image for the system view, read once per page
│   │   ├── framing.js               the camera distance for the Moon to fit in the scene, and the angles of the flight to the site
│   │   ├── moonGlobe.js             where each point of the Moon falls on the images, and the pole color on the terrain meshes
│   │   ├── moonImages.js            the Moon images, read once per page
│   │   ├── nearTiles.js             which fine terrain tiles the scene draws, and their mesh (card C6)
│   │   ├── picking.js               the click on the Moon and where the marker goes (card C3)
│   │   ├── reliefLayers.js          which one shows on top between the fine and the coarse terrain: the stencil (card C6)
│   │   ├── reliefMesh.js            the terrain mesh, at real height, from far.bin
│   │   ├── starPoints.js            the size and brightness of each star on screen, by magnitude
│   │   └── sunLight.js              where the Sun's light is, and why its target is the pole
│   ├── styles/
│   │   ├── global.css
│   │   └── tokens.css
│   ├── workers/
│   │   └── landingAreas.worker.js   the landing areas map calculation, off the page's main thread
│   ├── App.css
│   ├── App.jsx
│   ├── main.jsx
│   └── setupTests.js
│
├── .editorconfig
├── .gitattributes
├── .gitignore
├── .nvmrc
├── CLAUDE.md
├── CONTRIBUTING.md
├── CREDITS.md
├── eslint.config.js
├── index.html
├── LICENSE
├── package.json
├── package-lock.json
├── README.md
└── vite.config.js
```

### Organization

- `src/engine/`: the calculation. Plain JavaScript, with no React and no DOM, so it runs the same
  in the test, in the browser and in a script. It receives a coordinate and a date, and returns a
  number.
- `src/hooks/`: the bridge between the engine and the screen. A hook calls the engine, stores the
  result and tells the screen whether it is calculating, whether it worked or whether it failed.
- `src/data/`: the screen text and the small sourced data (the list of landing sites, for
  example). One file per screen region.
- `src/styles/`: the tokens and the global style. Each component's style lives in a `.css` next
  to it.
- `src/components/`: does not exist yet. It is born with the first piece of screen that repeats
  in two places, and not before.
- `scripts/`: what runs outside the browser: the hook installation, the build check, the
  preparation of the terrain data and the references for the tests of the engine and of the site
  list.
- `.claude/` and `.githooks/`: the safeguards for Claude and for commits (CONTRIBUTING.md,
  section 4).
- Raw NASA data does not go into the repository (`.gitignore`, `data-raw/` folder): the site
  uses only the small crops that `scripts/prepare-data/` generates (card E2).
