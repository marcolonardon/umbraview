# Backlog

What is left to do, whose it is, and how to know it is done. Look for your name.

## How to use this file

**Developers (Enzo, Marco, Miguel, Rechierli).** Tell the group you took the card, create the
branch with its code (`feat/i1-painel`) and follow [CONTRIBUTING.md](../CONTRIBUTING.md). In the
PR that closes the card, change its "Status" to "done on dd/mm, PR #n".

**Non-developers (Mateus B.).** You don't use GitHub: Enzo sends your cards as a PDF, and sends
them again when they change. What you need to read goes at the end of the PDF: the project's data
sources (appendix A) and the AI use text (appendix B). The deliverable is a spreadsheet, text,
image or video, in a folder shared with the team. Tell Enzo when you finish; he marks the card as
done and brings the result into the project. If you use AI to generate an image, music, video or
text that goes into the project, tell Enzo: the AI use text needs to say so.

**Found something that is not part of your card?** It becomes a new card, at the end of the right
area, with the next number. Don't solve it in the middle of the card you are working on.

## Calendar

| When | What |
|---|---|
| by 13/11 | The cards below. |
| 13/11 | Space Apps publishes the 2026 submission guide. Cards P4, V1 and V4 adjust to it. |
| 14/11, 9:00, to 15/11, 23:59 (local event time) | Hackathon and submission, through the project page on the Space Apps site. |

---

## How the pieces fit together

The site answers one question: **at a point on the Moon, on a date, do the Sun and the Earth
appear above the surrounding mountains?** Four pieces do this:

- **Engine** (`src/engine/`, Enzo): does the math. It takes the point and the date and returns
  numbers. The terrain it uses is in `public/data/relief/` (card E2).
- **Bridge** (`src/hooks/`, Enzo): `useSiteSky` calls the engine when the point or the date
  changes, and tells the screen whether it is calculating, whether it worked or whether there was
  an error; `useSubsolarPoint` gives the direction of the Sun for the scene's light.
- **3D scene** (`src/scene/`, Marco): the Moon on the screen, with the sunlight coming from the
  right direction.
- **Panel** (`src/panel/`, Miguel): the numbers for the chosen point, as text, and the controls to
  choose the location and the date.

The chosen point and date are kept in `App.jsx`, which hands both to the scene and to the panel.
The ones that wire this up in `App.jsx` are cards E11 (the click on the scene) and E14 (the list
and the date). Cards C1 and I1 each only swap the empty-text line of their own region for the new
component. That way Marco and Miguel don't edit the same lines at the same time.

### What the bridge delivers to the screen

The format of the result is agreed here, so that the scene and the panel don't depend on how the
engine does the math. It is what card E3 delivered; changing it later is a new card, telling Marco
and Miguel the same day.

`useSiteSky(site, dateUtc)` takes the point (`site`, an object with `lat` and `lon` in degrees,
and `name` when it comes from the list of locations) and the date (`dateUtc`, a `Date`). It
returns `{ status, sky }`:

| Field | Type | What it is |
|---|---|---|
| `status` | `'idle'`, `'loading'`, `'ready'` or `'error'` | `idle`: no point chosen. `loading`: calculating. `ready`: `sky` has the result. `error`: the calculation failed. |
| `sky` | object, or `null` when `status` is not `ready` | The result, in the fields below. |
| `sky.sunNow.elevationDeg` | number | Height of the center of the Sun above the horizon plane, in degrees. It can be negative. |
| `sky.sunNow.visible` | `true` or `false` | The Sun is above the mountains in that direction (at least half of it in view). |
| `sky.earthNow.elevationDeg` | number | The same, for the Earth. |
| `sky.earthNow.visible` | `true` or `false` | Some part of the Earth is above the mountains. |
| `sky.nextSunsetUtc` | `Date` or `null` | When half of the Sun disappears behind the mountains. `null` if it does not set within the period. |
| `sky.nextSunriseUtc` | `Date` or `null` | With the Sun hidden now, when half of it comes back. `null` with the Sun in view now (and not the setting) or if it does not come back within the period. |
| `sky.nextEarthsetUtc` | `Date` or `null` | When the last part of the Earth disappears behind the mountains. With the Earth hidden now, it is the setting after it comes back, as in `nextSunsetUtc`. `null` if it does not set within the period. |
| `sky.nextEarthriseUtc` | `Date` or `null` | With the Earth hidden now, when the first part of it comes back. `null` with the Earth in view now (and not the setting) or if it does not come back within the period. |
| `sky.sunFraction` | number from 0 to 1 | How much of the Sun was in view, on average, over the period. |
| `sky.earthFraction` | number from 0 to 1 | Share of the period's hours with some part of the Earth in view. |
| `sky.longestDarkHours` | number | The longest continuous stretch, in hours, with the whole Sun hidden. |
| `sky.landingWindows` | list of `{ startUtc, endUtc, durationHours, startsBeforePeriod, endsAfterPeriod }`: two `Date`s, a number and two `true` or `false` | Stretches in which at least half of the Sun and some part of the Earth are in view at the same time. `durationHours`: how long the window lasts, in hours, without rounding: `endUtc` minus `startUtc`; for a window cut by the period, only the part inside it (added in card I6). The start and the end fall between two hours, by the same calculation as the sunset: a window that closes because of the Sun closes at `nextSunsetUtc`. `startsBeforePeriod`: the window was already open at the start of the period, and `startUtc` is the start of the period, not the sunrise. `endsAfterPeriod`: the window continues after the end of the period, and `endUtc` is the last calculated instant. A window entirely inside the period is only included if it lasts at least `MIN_LANDING_WINDOW_HOURS` (`src/engine/config.js`); one cut at either end is included even if shorter. Empty list if there are none. |
| `sky.period` | `{ startUtc, endUtc }`: two `Date`s | The period of the numbers above. `startUtc`: the chosen date, the same instant as `sunNow` and `earthNow`. `endUtc`: the last calculated instant, the date plus `PERIOD_DAYS` × 24 − 1 hours (currently 719 h), because the engine calculates hour by hour starting from the date; it is the same `endUtc` as a window with `endsAfterPeriod`. Added in card I6, by Enzo's decision on 12/11. |

The engine delivers `sky` ready, in this format: `summarizeSky`, in `src/engine/summary.js`. The
period starts on the chosen date and lasts `PERIOD_DAYS` days (`src/engine/config.js`, with the
reason).

A case that looks like an error and is not: a negative `elevationDeg` with `visible: true`. From
the top of a hill, the Sun can be below the horizon plane and still in view, because the
surrounding mountains are lower than the point.

`useSubsolarPoint(dateUtc)` returns `{ lat, lon }`, in degrees: the point on the Moon where the
Sun is directly overhead on that date. The scene's light comes from the center of the Moon in its
direction; to become a 3D point, it goes through the same conversion as the point marker (card
C3). It does not depend on the chosen point: the light exists before anyone chooses a point and
while `useSiteSky` is calculating. As long as the date does not change, it returns the same
object.

---

## E: Enzo

### E1 · Calculation engine

**Status:** done on 03/11, PR #2 and PR #3 · **Depends on:** E2 (done), for the comparison with
NASA

**What it delivers.** The engine in `src/engine/`, in plain JavaScript (no React and no access to
the page). The path the bridge (E3) uses, in this order:
1. `computeHorizon` (`horizon.js`): the horizon of the point, from the terrain layers that
   `loadReliefLayers` (`reliefFiles.js`, card E2) builds with the site's files;
2. `computeEphemeris` (`ephemeris.js`): the Sun and the Earth hour by hour;
3. `computeSeries` (`series.js`): how much of each one the mountains hide, hour by hour;
4. `summarizeSky` (`summary.js`): the `sky` in the format of "What the bridge delivers to the screen".

The parameters are in `config.js`.

**Done when.**
- Sun and Earth match JPL's SPICE with a difference of up to 0.01°. Done: `ephemeris.test.js` and
  `series.test.js`, against `fixtures/spiceReference.json` (`scripts/references/`).
- The percentage of Sun over the period is close to the map by Mazarico et al. (CREDITS.md) at the
  reference points. Done: the comparison below, with the terrain from card E2: the difference for
  each of the 10 most illuminated points and the average of each band of the random sample, which
  is what `compare-nasa.mjs` prints.
- Next sunset and landing windows checked in cases built by hand. Done:
  `series.test.js` and `summary.test.js`, including that the landing window does not go past sunset.
- No file in `src/engine/` imports React, and `verify` passes. Done:
  `noBrowserDependencies.test.js`.

**Comparison with NASA.** `node scripts/prepare-data/compare-nasa.mjs`, with the site's terrain
(`public/data/relief/`, card E2), on 30/10/2026. The 10 most illuminated points on the 60 m map by
Mazarico et al. 2011, NASA → ours (difference in percentage points):

| # | Point | Sun | Earth |
|---|---|---|---|
| 1 | 89.475°S 137.44°W | 88.4% → 85.4% (−3.1) | 58.1% → 58.0% (0.0) |
| 2 | 89.686°S 162.94°W | 87.1% → 81.6% (−5.4) | 53.7% → 53.8% (0.0) |
| 3 | 88.809°S 123.76°E | 86.0% → 84.2% (−1.7) | 56.5% → 58.6% (+2.1) |
| 4 | 89.784°S 155.90°W | 85.5% → 83.0% (−2.5) | 56.7% → 56.7% (0.0) |
| 5 | 85.300°S 37.10°E | 83.1% → 82.0% (−1.1) | 59.9% → 63.7% (+3.8) |
| 6 | 88.665°S 68.40°W | 82.7% → 79.2% (−3.5) | 61.4% → 61.5% (0.0) |
| 7 | 86.001°S 2.06°E | 81.9% → 74.0% (−7.9) | 58.7% → 58.3% (−0.4) |
| 8 | 85.955°S 3.38°W | 81.3% → 80.2% (−1.1) | 63.3% → 64.2% (+0.9) |
| 9 | 87.988°S 166.38°W | 80.4% → 76.8% (−3.6) | 45.3% → 45.5% (+0.2) |
| 10 | 86.041°S 3.16°E | 79.6% → 68.9% (−10.7) | 59.3% → 56.8% (−2.5) |

And in the random samples by Sun band:

| Band | NASA map | Points | Mean error in Sun | Where NASA gives ≥ 50% Sun | Mean error in Earth |
|---|---|---|---|---|---|
| 85° to 90°S | 60 m | 259 | 2.1 pts | 3.1 pts (109 points) | 1.2 pts |
| 84° to 85°S | 240 m | 113 | 2.6 pts | 4.3 pts (38 points) | 1.6 pts |

**Open.**
- Points 7 and 10, near 86°S between 2° and 3°E, are 8 and 11 points below NASA for the Sun, and
  the cause has not been investigated. With a 10 m mast (`--mast=10`), the two are 1.3 and 1.5
  points from NASA, but the mean error of the random sample rises from 2.1 to 3.6 (`config.js`).
- Our Sun is below NASA's: at the 10 most illuminated points, in all 10, and the bias (the mean of
  the difference, with its sign) is −2.5 points from 84° to 85°S, for a mean error of 2.6, and
  −0.6 from 85° to 90°S, for 2.1. The Earth goes the other way from 85° to 90°S: a bias of +1.2,
  for a mean error of 1.2. Measured on 04/11/2026, in the "viés" line of `compare-nasa.mjs`. The
  cause has not been investigated.

### E2 · Relief data for the site

**Status:** done on 03/11, PR #3 · **Depends on:** nothing

**What it delivers.**
- `public/data/relief/`: the terrain of the south pole, from the pole down to 84°S, cut from NASA's
  LOLA files (CREDITS.md). The fine one, at 80 m per pixel, applies up to 10 km from the point and
  is stored in 332 tiles of 20 × 20 km, 127 kB each. The coarse one, at 960 m, applies up to
  200 km and is stored in a single file, of 1.3 MB. That is 43.5 MB in total.
- `src/engine/reliefFiles.js`: `loadReliefLayers(manifest, ponto, readFile, cache)` returns the
  layers that `computeHorizon` uses, downloading only the coarse terrain and the tiles around the
  point (usually 4, about 0.5 MB). `isInsideReliefArea(manifest, lat)` says whether the point is
  inside the area.
- `scripts/prepare-data/`: the script that generates the cutouts, the comparison with NASA, the
  measurement of the landing windows and the README to run everything from scratch. The cutouts
  script generates the same files, byte for byte, on Windows and on Linux.

**Why 80 m.** Measured on 29/10/2026 at the 259 random points from 85° to 90°S
(`scripts/prepare-data/nasa-reference.json`), with a one-off script that was not kept in the
repository, and so these numbers cannot be reproduced with it: the same engine and the same
points, changing only the fine terrain (the 2 × 2 pixel average of the 80 m one, for 160 m, and
the 240 m file):

| Fine terrain | Mean error in Sun | Where NASA gives ≥ 50% Sun | Most illuminated point (NASA: 88.4%) |
|---|---|---|---|
| 80 m | 2.1 pts | 3.1 pts | 85.4% |
| 160 m | 3.4 pts | 6.2 pts | 78.0% |
| 240 m | 5.1 pts | 10.0 pts | 70.9% |

With 160 m, the ones that lose the most are the most illuminated points, which are the ones that
matter for landing.

**Why tiles and why down to 84°S.** The site downloads only the tiles around the point, so the
cost of a click is the same in any area; the area only changes the size of the repository
(measured on 29/10/2026, also with a one-off script that cannot be reproduced from the repository): down to 88°S, 7 MB; down to 86°S, 22 MB; down to 85°S, 33
MB; down to 84°S, 44 MB. The choice of 84°S followed what NASA said on 19/08/2022 about the 13
candidate regions for Artemis III: they are "within six degrees of latitude of the lunar South
Pole" (source in CREDITS.md). Of the 9 that remained afterwards, the center of 7 is within 84°S;
Peak near Cabeus B and Nobile Rim 2 wait for card E8 (card E16). In a single file, the fine terrain
down to 84°S would be 46 MB to download before the first click. Compressing the tiles (storing
the difference between neighbors, and then gzip) would take about 24 MB off the repository, but
requires code to decompress them on the site; if it becomes necessary, the change stays only in
`reliefFiles.js`.

**Comparison with NASA.** It is in card E1, done with these files.

**Done when.**
- With the cutouts, the percentage of Sun and of Earth is close to the map by Mazarico et al.
  (CREDITS.md) at the reference points, and a script redoes the comparison. Done:
  `scripts/prepare-data/compare-nasa.mjs`, with the result in card E1.
- Another team member runs the script from scratch following only its README. Done: card I5, on
  12/11 (PR #29).
- The size of `public/data/` and the chosen area are noted in this card. Done: "What it
  delivers" and "Why tiles and why down to 84°S".
- No file is larger than 50 MB. Done: the largest is `far.bin`, at 1.3 MB.

**Open.**
- The files have no version in their names. If a deploy brings new cutouts, the browser of someone
  who has already opened the site may combine the `manifest.json` from one version with tiles from
  the other, until their cache expires, and the same size does not give it away. It only happens
  when the cutouts change; if needed, the way out is one folder per version.
- Git keeps every version of every file. Today's version of the cutouts takes up 31.7 MB inside
  `.git` (measured on 04/11/2026, with `git cat-file`), and each new generation that changes the
  tiles adds another version to the history, even when it replaces the previous one. Generating
  identical files again, as in card I5, adds nothing: for git, it is the same version.

### E3 · Bridge between the engine and the screen

**Status:** done on 04/11, PR #4 · **Depends on:** E1 (done) and E2 (done)

**What it is for.** The scene and the panel do not call the engine directly: the bridge does, in
the format agreed in "What the bridge delivers to the screen". Wiring the bridge into `App.jsx` is
card E11.

**What it delivers.**
- `src/hooks/useSiteSky.js` asks `src/engine/siteSky.js` for the calculation; it follows the order
  of card E1, reads `manifest.json` once, uses the same terrain `cache` for all points and keeps
  the last position of the Sun and the Earth (valid for any point on the same date) and the last
  horizon (valid for any date at the same point). The site's `readFile` (`createReliefReader`)
  does the `fetch` inside `data/relief/`, starting from the page's address, and checks
  `response.ok`. A point outside the area with terrain (`isInsideReliefArea`) gives
  `status: 'error'`.
- `src/hooks/useSubsolarPoint.js` gives the direction of the Sun for the scene.
- The table in "What the bridge delivers to the screen", with the period and `useSubsolarPoint`.

**Done when.**
- The hook's tests cover the four `status` values, with the real engine (not a substitute).
  Done: `src/hooks/useSiteSky.test.js`.
- Marco and Miguel were told about the final format. Done: in PR #4.

**Open.**
- For now, no Web Worker. Measured on 03/11/2026, in Node, on Enzo's computer: changing the point
  freezes the page for about 50 ms (the horizon takes 38 to 46 ms); changing the date, up to about
  80 ms (the position of the Sun and the Earth, `src/engine/config.js`). If the page freezes on the
  team's laptops (this can be checked together with card C4), the calculation moves to a Web
  Worker without changing the engine, because `siteSky.js` does not touch the page. In the Worker,
  a relative address is resolved from the Worker's file, not from the page: the page passes the
  full address of the folder, `new URL('data/relief/', document.baseURI).href`.

### E4 · GitHub with the public repository

**Status:** in progress: the site and the protection of `main` and `develop` were turned on on
14/11, PR #38 · **Depends on:** nothing

**What it is for.** Finish what is left on GitHub: Claude's safeguard verified on Windows and the
mark of what was submitted.

**What is left.**
1. In a Claude Code session on Windows, ask it for a `git commit` and see the refusal
   `Bloqueado pela politica do repositorio`. The hook has only been tested on Linux so far.
2. At delivery time (15/11, 23:59): a tag on `main` marking what was submitted.

**Done when.** The hook refuses the commit on Windows, and the delivery tag is on `main`.

### E5 · Fix the project documents on claude.ai

**Status:** done on 05/11, PR #7 · **Depends on:** nothing

**What it is for.** The three project documents on claude.ai (the project, the scope and the
script of the presentation for the team) are what the team reads outside the repository. They
need to state the current name of the challenge and what the 2026 FAQ says about starting before
the hackathon.

**What it delivers.**
- The project and scope tabs with the name "Lunar Landing Site Navigator". The old name stays only
  as "(antes, CLPS Lunar Mission Browser)", because the address of the challenge page still uses
  it.
- In the script, the answer to "Pode programar antes do evento?" quotes the FAQ ("Teams are not
  allowed to begin working on the challenges prior to the hackathon", checked on 05/11/2026) and
  the team's decision to start based on guidance from the advisor and from the organizers of the
  2025 event. In the scope, the "Riscos" table records this risk as accepted.

**Watch out.** The FAQ page builds its text with JavaScript: reading the page without a browser
does not find that sentence, and that is how a document ended up saying the FAQ did not forbid it.
A rule from the Space Apps site is checked in the browser.

### E6 · Review PRs and bring `develop` into `main`

**Status:** ongoing. Who reviews what is in CONTRIBUTING.md, section 1.

### E7 · Test of the hooks in a folder that is already a repository

**Status:** done on 05/11, PR #6 · **Depends on:** nothing

**What it is for.** The test "fora de um repositório git, avisa e não quebra o npm install", in
`scripts/hooks.test.js`, runs `install-hooks.mjs` in a folder without git. If that folder sits
inside another repository, git finds the outer one: the test fails, and the installer writes
`core.hooksPath = .githooks` into that repository, in the git of whoever ran `verify`. That was
the case on Marco's machine, where the temporary folder sits inside the user folder, which is a
git repository (reviews of PRs #2, #4 and #5).

**What it delivers.** The test sets up the case on purpose, on every machine: it creates a
repository in the temporary folder and the folder without git inside it, and runs the installer
with `GIT_CEILING_DIRECTORIES` pointing to that repository, which makes git stop searching before
entering it. The test checks that, this way, git does not find the repository from the folder
without git, and that the repository still has no `core.hooksPath` after the installer.

**Done when.**
- The test passes with the temporary folder inside a git repository. Done: the test itself sets
  up that repository, so every `verify` and the CI check it.
- `verify` passes. Done.

**Verified** on 05/11/2026: on Linux, also with the system temporary folder inside a repository;
on Enzo's Windows machine, in the `verify` of each commit of PR #6; and on Marco's Windows machine,
in the review of PR #6.

### E8 · Terrain for the list's sites away from the pole

**Status:** to do · **Depends on:** P1 (the list of sites)

**What it is for.** The site's terrain goes from the pole to 84°S (card E2). The other sites in
the P1 spreadsheet (Apollo, Luna, Surveyor, Chang'e, Chandrayaan-3, SLIM, CLPS) and two Artemis
III candidate regions (Peak near Cabeus B and Nobile Rim 2, card E16) fall outside it, and they
stay off the list until this card.

**What to do.**
1. In the script in `scripts/prepare-data/`, one cutout per list site north of 84°S, from the
   whole-Moon LOLA files (CREDITS.md): the fine one up to 10 km from the site and the coarse one
   up to 200 km.
2. On the site, build the layers of these cutouts with `cylindricalGridRelief`
   (`src/engine/relief.js`).
3. Choose an outside reference to check the result against: the Mazarico maps only cover the
   pole.
4. The two Artemis III regions join the list like the other seven (card E16): the center of the
   USGS outline, with "(center)" in the name. In `src/data/sites.test.js`, the test of the area
   with terrain and the one that checks which regions are on the list use `areaMaxLatDeg`: both
   change together with the area rule.
5. The 4 NASEM sites in the spreadsheet also have no landing date: with `landedAtUtc: null`, they
   would fall into the "Artemis III candidate regions" group of the list
   (`src/panel/SiteList.jsx`). They need a group of their own before joining.

**Done when.** Choosing any site on the list shows the result in the panel, the size of the
cutouts is noted here, and so is the check.

### E9 · Engine tests without the simulated browser

**Status:** done on 11/11, PR #25 · **Depends on:** nothing

**What it is for.** All tests run inside jsdom, the simulated browser, including the engine ones,
which do not use the screen. On 29/10/2026, Vitest warned that creating jsdom took 67% of the time
it measured.

**What to do.** Put `// @vitest-environment node` at the top of the tests in `src/engine/` and
`scripts/` (check beforehand that Vitest 5 accepts this comment), and measure the time of
`npm run test` before and after.

**Done when.** `verify` passes and both times are noted here.

**Measured** on 10/11/2026, on Linux (2 processors), with the whole suite (`npx vitest run`, 241
tests; the duration is the one from Vitest's JSON report), three runs of each:

| Environment of the 12 test files in `src/engine/` and `scripts/` | Suite duration |
|---|---|
| jsdom, the simulated browser (before) | 30.3 to 34.7 s |
| Node (after) | 22.1 to 24.0 s |

Vitest 5 honors the comment: a test with it sees `document` as undefined; without it, it sees
jsdom's. The rule for new tests in these folders is in `vite.config.js`.

### E10 · Script names in English

**Status:** done on 06/11, PR #10 · **Depends on:** nothing

**What it is for.** CLAUDE.md asks for file names in English, and four files in `scripts/` were in
Portuguese.

**What it delivers.** The four with English names:
- `conferir-build.mjs` → `check-build.mjs`, and the function `conferirBuild` → `checkBuild`;
- `conferir-build.test.js` → `check-build.test.js`;
- `ganchos.test.js` → `hooks.test.js`;
- `instalar-ganchos.mjs` → `install-hooks.mjs`.

`package.json` (scripts `conferir` and `prepare`), the README, `.githooks/commit-msg` and card E7
cite the new names. The command is still `npm run conferir`. The Portuguese variable names inside
the files were left for card E12.

**Done when.** No Portuguese names in `scripts/`, and `verify` and the CI pass.

**Verified:** `verify` passes on each commit of PR #10, on Linux and on Enzo's Windows machine,
with the same number of tests as `develop`; and `npm run prepare` turns on the hooks through
`install-hooks.mjs`.

### E11 · Connect the click on the scene to the panel

**Status:** done on 10/11, PR #19 · **Depends on:** E3 (done), C1 (done), C3 (done) and I1 (done)

**What it is for.** This is where the site starts to respond: the point clicked on the scene
(card C3) goes to `useSiteSky`, and the panel (card I1) shows its sky. The list of sites and the
date control were left for card E14, because they depend on I2 and I4, which did not exist yet
(CONTRIBUTING.md, section 1, rule 6).

**What it delivers.** In `App.jsx`, the clicked point (`site`) and the date go to `useSiteSky`,
and the `{ status, sky }` it returns goes to `SitePanel`. The date is the time the page opened,
the same as the scene's light, so that the shadow and the numbers speak of the same instant, until
E14 connects the date control.

**Done when.** Clicking a point on the scene shows its result in the panel, and `verify` passes.
Done: `src/App.test.jsx` picks a point through the `onSelect` that `App` hands to the scene (the
click cannot be simulated without WebGL) and checks that the panel shows the calculating notice in
the same render and then, number by number, the sky the engine gives for that point at the time
the page opened. With the sky calculated 6 h later, the test fails: Earth's altitude changes in
the panel.

**Verified** on 10/11/2026, with `npm run build` + `npm run preview`, in a Chromium without a
graphics card (SwiftShader), with the reduced-motion request turned on: a click near the pole
places the marker, the panel shows the calculating notice right away and the point's numbers
afterwards; a click outside the area shows the scene's notice and does not change the panel. In
the console, only the usual `THREE.Clock` warning.

### E12 · Variable and function names in English

**Status:** to do · **Depends on:** E10 (done), and on there being no open PR on the files it
changes

**What it is for.** CLAUDE.md asks for variable and function names in English and, right below,
asks to follow the style of the files that already exist. As long as there are Portuguese names in
the code, the two rules clash: whoever uses a file as a model, person or Claude, copies the
Portuguese along with it. Came from PR #10 (card E10), which only changed the file names.

**What to do.** Change to English the names of constants, variables and functions declared in
Portuguese, and the fields a function returns (`checkBuild` returns `lidos` and `problemas`),
without changing what the code does. Count from 06/11/2026, in declarations with `const`, `let`
and `function` (the list of Portuguese words was made by hand, so some name may be missing):
- code that runs: `scripts/check-build.mjs` (9 names) and `scripts/install-hooks.mjs` (3);
- tests: another 20 files in `src/` and `scripts/`. The ones with the most are
  `src/engine/series.test.js` (22), `src/scene/reliefMesh.test.js` (15),
  `src/readmeStructure.test.js` (14) and `scripts/hooks.test.js` (13).

One commit per folder, so the review reads only name changes, without hunting for behavior
changes in the middle. Comments and `describe`/`it` text stay in Portuguese (CLAUDE.md). The
change touches many lines of each file and clashes with any other PR on the same file: hence the
dependency above.

**Done when.** The names declared in these files are in English, `npm run test` passes with the
same number of tests as before the change, and `verify` passes.

### E13 · The reason for the error, for the panel

**Status:** closed on 11/11, PR #26, with no code · **Depends on:** nothing

**Why it was closed.** A point outside the area no longer reaches the panel: the click on the
scene blocks it (card C3), and the list only has sites inside it (card I2, with the area test in
`sites.test.js`). The only error left is the calculation that failed, and the panel's error text
now speaks only of that (card E14). The engine still refuses a point outside the area, and the
reason still goes to the console.

**What it is for.** The `status: 'error'` of `useSiteSky` lumps together two cases that call for
different responses from the user:
- **the point outside the area with terrain:** `loadReliefLayers` refuses before downloading any
  tile (`src/engine/reliefFiles.js`). Trying again does not help; another point, inside the area,
  does;
- **the calculation that failed:** a terrain file that did not arrive (`createReliefReader`, in
  `src/hooks/useSiteSky.js`, checks `response.ok`) or that arrived with the wrong size
  (`reliefFiles.js`). Here the point may be correct.

The hook sends the reason only to the console (`useSiteSky: a conta do céu falhou`), and the
screen receives only the `status`. That is why the panel's error text says "It may be outside the
area we have terrain for": the "may" is because the panel does not know which of the two happened.
The click on the scene already blocks the point outside the area before it reaches the hook (card
C3), and the list (I2) only brings sites inside it: `src/data/sites.test.js` fails a site north of
84°S. Came from PR #11 (card I1).

**What to do.**
1. The bridge returns the reason along with the `error`. How the engine tells the two cases apart
   is up to Enzo; comparing the text of the `Error` message does not work, because it breaks the
   first time someone rewrites the sentence.
2. The new field goes into the "What the bridge delivers to the screen" table, notifying Marco
   and Miguel on the same day.
3. In the panel (`src/panel/SitePanel.jsx`), two texts in `src/data/panel.js` in place of today's
   `error`: the one for the point outside the area asks for another point, inside the area; the
   one for the failure cannot promise that choosing the same point again fixes it, because today
   that does not redo the calculation (card E14, item 3).

**How to test.** In `src/hooks/useSiteSky.test.js`, the test of the point outside the area starts
checking the reason, and a new case covers the file that does not arrive. In
`src/panel/SitePanel.test.jsx`, one text for each reason.

**Done when.** The panel shows one text for the point outside the area and another for the
calculation failure, the bridge table has the new field, the tests above pass and `verify` passes.

### E14 · Connect the list and the date in `App.jsx`

**Status:** done on 11/11, PR #26 · **Depends on:** E11 (done), I2 (done) and I4 (done)

**What it is for.** With E11, the site responds to the click on the scene, always at the time the
page opened. This card connects the other two controls: the list of sites (I2), which is also the
way to choose with the keyboard, and the date and time (I4). Came from splitting E11, in PR #19.

**What to do.**
1. In `App.jsx`, the date becomes a state that the `onChange` of the date control (I4) changes,
   and the `onSelect` of the list (I2) calls the same `setSite` as the click on the scene. The
   scene and the panel keep receiving the same date.
2. Do not replace the stored date with an invalid date: an invalid date (`Invalid Date`) has no
   Sun position in the engine, and `useSubsolarPoint` crashes the screen. The I4 control does not
   call `onChange` with the field empty (PR #17).
3. Decide what the screen offers when `useSiteSky` returns `error`. Choosing the same point again
   on the same date does not redo the calculation, because the request is the same; changing the
   point or the date does redo it, and `siteSky.js` retries the file that failed. A "try again"
   button needs a new way to ask the hook for the same calculation. The reason for the error shows
   up in the console (`useSiteSky: a conta do céu falhou`).
4. Typing the year in the I4 field may request one calculation per keystroke: typing 2026, the
   field went through 0002, 0020 and 0202, and each one is a valid date (seen by Miguel in PR #17,
   with the scene alone; with the panel connected, it has not been tested yet). Each date change
   redoes the Sun and Earth positions for the period (`PERIOD_DAYS`, `src/engine/config.js`, with
   the time measured). Measure with the panel connected before deciding what to do.
5. The two comments in the date control that cite E11 (the one about who stores the date and the
   one about "item 2") now cite this card.

**How it turned out.**
- The list shows the chosen site and goes back to "Choose a site…" when the point comes from the
  click on the scene: without that, it would keep showing the last site with the panel on another
  point.
- Item 2: the guard went into `DateTimeControl.jsx`, next to the one for the empty field. Besides
  the empty field, a year after 9999 also gives an invalid date: the field accepts it, but `Date`
  only reads that year with a `+` in front.
- Item 3: the panel's error text says to reload the page, which always redoes the calculation. A
  "try again" button would need a new way to ask the hook for the same calculation, just to do
  what reloading already does. E13 was closed along with it.
- Item 4: nothing was needed. Each date change costs a short calculation, and `useSiteSky` already
  discards the result of an old request (measured below).

**Verified** on 11/11/2026, in Playwright's Chromium (153, no graphics card: WebGL is done in
software), with the build in `npm run preview`:
- The page's first Tab reaches the list, with the focus ring; the down arrow chooses Athena
  (IM-2), the marker appears on the scene and the panel shows its sky.
- With Athena chosen, typing 2027 in the year: the field went through 0002, 0020, 0202 and 2027,
  and each one requested a calculation, 23 to 32 ms between "Calculating…" and the numbers.
  Between one keystroke and the next the page took 0.7 to 1.4 s: that is the scene's frame in
  this Chromium without a graphics card (617 to 867 ms per frame, measured with the Moon
  spinning), not the calculation. With a graphics card, the frame takes about 6 ms (card C4).
- Typing 10000 in the year: the field did not accept it and stayed at 2027. The guard for a year
  after 9999 is proven in the `DateTimeControl` test; in another browser, not verified.
- The click on the Moon after the list makes the list go back to the prompt, and choosing Athena
  again shows its sky again.
- With the terrain tiles answering 404, the panel shows "Couldn't calculate this site.
  Reload the page to try again." and the reason goes to the console.
- The console had no errors, apart from the deliberate 404 ones.

**Done when.** Choosing a site on the list or changing the date shows the result in the panel and
the correct light on the scene, also with the keyboard alone, and `verify` passes.

### E15 · Tests that time out on Windows now and then

**Status:** done on 14/11, PR #32 · **Depends on:** nothing

**What it is for.** The test "aponta o core.hooksPath para .githooks num repositório git"
(`scripts/hooks.test.js`) starts `git` and `node` three times, and Vitest gives each test 5 s. On
Enzo's Windows machine it usually takes less than 1 s, but on 10/11/2026, between 16:30 and 17:10,
it took 6.3 s and 9.4 s inside `verify`, and failed both times; on a third run, another test in the
suite failed, with no name recorded. A test that passes or not depending on how busy the computer
is teaches people to rerun until it passes (card C7). Came from PR #25 (card E9).

**What is known** (on Enzo's Windows machine, with Vitest's JSON report):
- On its own, the hooks file gives 212 to 238 ms on this test, in Node or in jsdom (10/11/2026).
- In the whole suite, on 11/11/2026, it gave 562 to 698 ms over 6 runs: with the hooks in Node or
  in jsdom, and right after `lint` or not. It is not card E9 nor the order of `verify`.
- The cause of the slowness on 10/11 was not found.

**What to do.** Give every test in the suite a time limit greater than Vitest's 5 s, with the
reason in the comment ("How it turned out" says why the whole suite, and not only the tests that
start processes), and measure on Miguel's laptop, where the site was the slowest in card C4. If
the failure comes back, record the name of every test that fails.

**How it turned out.**
- Every test in the suite has a 30 s limit, not Vitest's 5 s: the `testTimeout` in
  `vite.config.js`, with the reason in the comment.
- The limit applies to the suite, and not only to the tests that start processes, because of the
  measurement of 13/11/2026, at 21:04 (below). Right after an `npm ci`, a test that only reads the
  disk also failed: "o relevo fino lido pelo site bate com o arquivo da NASA", in
  `src/engine/reliefFiles.test.js`. The slowness hits the whole machine, and giving more time test
  by test would turn into a hunt for the slow test.
- The cost: an asynchronous test that hangs takes 30 s to fail, not 5 s.

**Measured** on 12, 13 and 14/11/2026, on Windows. "The test" is "aponta o core.hooksPath para
.githooks num repositório git"; "the file" is the whole `scripts/hooks.test.js`. "Limit" is the
limit for each test in that run: Vitest's 5 s, 30 s only on the hooks tests that start
processes, or 30 s on the whole suite (as it turned out).

| When | Where | How | Limit | The test | The file |
|---|---|---|---|---|---|
| 12/11, 14:38 | Enzo's computer | `verify` right after `npm ci` | 5 s | 17,381 ms (failed) | 32 s |
| 12/11, 15:09 to 15:11 | Enzo's computer | `verify` | 5 s | 520 to 649 ms | 8.0 to 13.4 s |
| 12/11, 15:30 | Enzo's computer | `verify` right after `npm ci` | hooks, 30 s | 1,293 ms | 19.9 s |
| 13/11 | Enzo's computer | 4 `verify` runs | 5 s | 548 to 775 ms | 11 to 12 s |
| 13/11, 15:48 | Miguel's desktop | `verify` | hooks, 30 s | 415 ms | 7.3 s |
| 13/11, 21:04 | Enzo's computer | `verify` right after `npm ci` | 5 s | 994 ms | 22.0 s |
| 13/11, 21:08 | Enzo's computer | `verify`, without `npm ci` | 5 s | 487 ms | 10.8 s |
| 13/11, 21:23 | Miguel's laptop | `verify` right after `npm ci` | hooks, 30 s | 783 ms | 19.2 s |
| 13/11, 21:24 | Miguel's laptop | 3 runs of the file alone | hooks, 30 s | 380 to 477 ms | 9.9 to 10.1 s |
| 14/11, 00:10 to 00:11 | Enzo's computer | 3 `verify` runs, without `npm ci` | suite, 30 s | 636 to 694 ms | 12.1 to 14.2 s |

- At 21:04, two other tests failed on the 5 s limit:
  - the commit-msg one "aceita mensagem normal", at 5,400 ms (417 ms at 21:08);
  - the fine terrain one, at 5,011 ms (503 ms at 21:08).

  The whole suite took 39.5 s, against 17.6 s at 21:08.
- All three times `verify` ran right after an `npm ci` on Enzo's computer, it was slow, and it
  failed in two of them. The cause was not proven.
- On Miguel's laptop, the slowest test took 1.5 s, and the suite took 47 s.

**Done when.** Every test in the suite has a time limit greater than Vitest's 5 s, with the
reason written down; `verify` passes on the Windows machine of whoever does it and on Miguel's;
and the measured times are noted here.

### E16 · The Artemis III candidate regions on the list

**Status:** done on 12/11, PR #27 · **Depends on:** I2 (done) and E14 (done)

**What it is for.** The list of sites (card I2) puts the Artemis III candidate regions in a group
of their own, "Artemis III candidate regions", but it shipped with IM-2 only, because the regions
had no coordinates. Came from card I7, which moved to area E because Enzo did it.

**The starting point.**
- The names of the 9 regions come from NASA
  ([NTRS 20250011660](https://ntrs.nasa.gov/citations/20250011660)). That document gives no
  coordinates, and NASA does not give one point for each region.
- The USGS published the outline of each one (McClernan 2024, CREDITS.md). In the polar
  projection of the LOLA files, each outline is a rectangle 16 to 77 km on a side.

**How it turned out.**
- `measurePolarPolygon` (`src/engine/geometry.js`) gives the center and area of an outline,
  computed in the polar projection. The average of the latitudes and longitudes would be wrong
  near the pole and on top of longitude 180°.
- The coordinate of each region on the list is the center of the USGS outline: the middle of the
  rectangle the USGS drew, computed from a source, with the method in the code and tested. The
  name carries "(center)", so the panel does not look like an official landing point.
- The copied outline is in `scripts/references/artemis-regions.geojson`, and two tests in
  `src/data/sites.test.js` tie the list to it: the coordinate and name of each region are the
  outline's, and the list brings every region with its center inside the area with terrain, and
  only those.
- 7 of the 9 get in. Peak near Cabeus B (center at −83.6375°) and Nobile Rim 2 (−83.9541°) lie
  north of 84°S and wait for card E8. Mons Mouton Plateau gets in by its center (−84.3347°), but
  the region extends to 82.85°S.
- Card E2 and `scripts/prepare-data/prepare_relief.py` said the Artemis III regions fit within
  84°S: that held for the 13 from 2022. Both were corrected.

**Verified** on 12 and 13/11/2026:
- The computed area of each outline matches the USGS `Area_km2` for the 9 regions. Marco redid the
  7 centers in Python, without `measurePolarPolygon`, and they match `sites.js` to the 4th decimal
  place (13/11).
- The box that the
  [LROC mosaic page](https://data.lroc.im-ldi.com/lroc/view_rdr/NAC_ROI_CABEUSPKLO2) gives
  for Peak near Cabeus B (latitude −84.06 to −83.21, longitude −72.47 to −64.80) matches the
  corners of the USGS outline. The page was found by Miguel on 11/11, and the box was checked by
  Marco on 13/11.
- In Playwright's Chromium, with the build in `npm run preview`: the 7 regions appear in the
  group, in alphabetical order; choosing Haworth (center) places the marker on the scene and shows
  the sky in the panel; typing "h" with the list focused jumps to Haworth; the console had no
  errors.
- Each new test catches its own error: changing one digit of a coordinate, or swapping the names
  of Haworth and Malapert Massif, fails only the coordinate-and-name test; removing a region fails
  only the test of which regions are on the list; adding Nobile Rim 2 fails that one and the one
  for the area with terrain.

**Done when.** The regions with their center inside the area appear in the "Artemis III
candidate regions" group, the tests in `src/data/sites.test.js` pass and `verify` passes.

### E17 · The terrain script's README, with what I5 found

**Status:** to do; came out of card I5, on 12/11 · **Depends on:** nothing

**What it is for.** The script's README (`scripts/prepare-data/README.md`) is what someone follows
to generate the terrain from scratch. In card I5, Miguel followed steps 1 to 4 and arrived at the
same cutouts as the repository, but noted 5 points where the README leaves something out or is
confusing. Whoever runs it again may trip over the same ones.

**What to do.** Resolve in the README the 5 points from card I5, in "What the README does not say,
or makes confusing", with the numbers Miguel measured there:
1. how long steps 1 and 3 take;
2. how much space the Python environment takes, and the total space;
3. what output shows that the download in step 1 worked;
4. the size in MB in the README and in MiB in `curl`;
5. the long lines, which break when copied from a narrow screen.

**Done when.** Each of the 5 points is resolved in the README, or noted here with the reason it
was left as is, and `verify` passes.

### E18 · Earth and the Sun's return in the bridge summary

**Status:** done on 14/11, PR #35 · **Depends on:** I6 (done)

**What it is for.** The challenge asks for the windows of direct communication with Earth and the
time until the Sun or Earth sets ("Earthset"). The engine has Earth hour by hour
(`earthMarginDeg`), but the bridge summary only said whether it was in view now. And, with the Sun
hidden, the screen had no way of saying when the light comes back (card I8).

**How it turned out.**
- Four fields in `sky`, in the "What the bridge delivers to the screen" table: `earthFraction`,
  `nextEarthsetUtc`, `nextSunriseUtc` and `nextEarthriseUtc`.
- `nextSetting(kind, series, fromIndex)` (`src/engine/series.js`) gives the next setting of the
  Sun or Earth, and `nextSunset` is its Sun version. The "in view" rule for each body lives in a
  single place (`BODIES`), also read by `nextChange` and by the landing windows.
- The return (`nextSunriseUtc` and `nextEarthriseUtc`) comes from `nextChange` only when the body
  is hidden now: with it in view, `nextChange` returns the setting, not the return.
- Showing the fields on screen is card I8: the sunrise and Earth in the panel.

**Verified** on 14/11/2026:
- With the skeleton returning `null` and `0`, only the new tests failed, for the right reason: 2
  in `series.test.js` and 4 in `summary.test.js`.
- Each new test catches its own error: Earthset by the Sun's rule, the return without checking
  whether the body is in view now, Earth counted as in view with a negative margin, and Earth's
  return by the Sun's rule each fail at least one test.

**Done when.** The four fields are in `summary.js`, with tests, and in the bridge table, Marco
and Miguel have been notified, and `verify` passes.

---

### E19 · What the 2026 submission guide asks of the site and the repository

**Status:** done on 15/11, PR #40 · **Depends on:** nothing

**What it is for.** The 2026 submission guide (version of 13/11, read on 14/11) asks for a
visible mark on every image and video made with AI, and English on the submission page and on
everything it links to. The logo (card V2) was made with AI and appears in the site's tab, and the
README was entirely in Portuguese.

**How it turned out.**
- The site's footer says the logo was made with AI and that the code had AI help, and links to
  the code and the source of the terrain. A legible mark does not fit in the browser tab; the
  footer is the mark on the same page. The texts are in `src/data/app.js`.
- The README opens with a section in English: what it is, the site's address, how to run it, the
  data, the use of AI and the license. The rest of the documentation remains in Portuguese.
- `docs/uso-de-ia.md` says where the marks are, also in the English text for the submission.
- The mark in the video belongs to card V4.

**Done when.** The footer has the mark and the link, with a test; the README opens in English;
and `verify` passes.

---

### E20 · The CI lets the protection pass without verify when the PR description is edited

**Status:** to do · **Depends on:** nothing

**What it is for.** The run for the description edit (the `edited` event) cancels the push run
that is still running (the `concurrency` with `cancel-in-progress`, in
`.github/workflows/verify.yml`) and skips `verify` (the job's `if`). The skipped job counts as
passed in the protection's required check. In PR #39, the run for the opening was canceled at
36 s, the edit run skipped `verify`, and GitHub showed "All checks have passed" (seen on
15/11/2026).

**What to do.** Remove `if: github.event.action != 'edited'` from the `verify` job: the edit then
runs the whole `verify`, about 1 min more per edit. Discarded:
- splitting the description check into a workflow of its own: two checks with the same name
  overlap, and the last one wins;
- taking the edit out of the cancellation group: the skipped job would keep passing.

**Until then.** Before merging, check on the PR's last commit that the job "lint, testes, build e
conferência" really ran (more than 0 s). If it did not, use Re-run on the canceled run.

**Done when.** Editing a PR's description runs the whole `verify`, and the required check only
turns green once it has finished.

---

## C: Marco

Besides the cards, Marco reviews Enzo's PRs (CONTRIBUTING.md, section 1).

### C1 · The Moon in 3D, rotating with the mouse

**Status:** done on 05/11, PR #5 · **Depends on:** nothing

**What it is for.** The left region of the screen shows the Moon in 3D, so the person can see where
the chosen site is and from which side the sunlight comes. This card only does the base: the Moon,
the light and the camera. The real terrain and the mountain shadows are in C2; the click is in C3.

**What the person sees when the card is done.** In the "Lunar scene" region, filling the whole
region, a gray sphere lit on one side only, by a light that plays the role of the Sun. Dragging
with the mouse rotates the Moon; the mouse wheel zooms in and out. The camera starts looking at the
south pole, because that is where the product focuses.

**What to do.** The libraries (three, `@react-three/fiber` and `@react-three/drei`) are already in
`package.json`; do not install anything.
1. `src/scene/LunarScene.jsx`, with a React Three Fiber `<Canvas>` containing:
   - the Moon: a `<mesh>` with `<sphereGeometry args={[1, 64, 64]} />` and `<meshStandardMaterial />`;
   - the Sun: a `<directionalLight>` in a fixed direction for now (the right direction comes from
     the engine, in C2);
   - a very faint `<ambientLight>`, so the dark side does not disappear completely;
   - the controls: Drei's `<OrbitControls>`, with `enablePan={false}` (dragging does not move the
     Moon off center) and zoom limits (`minDistance` and `maxDistance`);
   - the camera starting below the sphere: `camera={{ position: [0, -3, 0.01] }}` on the `<Canvas>`.
2. The colors of the Moon and of the light are new tokens in `src/styles/tokens.css` (for example
   `--color-moon` and `--color-sunlight`). The component reads them with
   `getComputedStyle(document.documentElement).getPropertyValue('--color-moon').trim()`. No
   `#hex` in the component.
3. `src/scene/LunarScene.css`: the Canvas takes the size of the element around it. If that element
   has no height, the scene ends up 150 px tall (seen in a draft on 29/10/2026). Give it `flex: 1`
   inside the region.
4. Less motion: `src/hooks/usePrefersReducedMotion.js` returns `true` when the person asked the
   system for less animation (`window.matchMedia('(prefers-reduced-motion: reduce)')`). With
   `true`: `autoRotate={false}` and `enableDamping={false}` (no glide after releasing the mouse).
   Without the request, a slow automatic rotation can stay.
5. `src/data/scene.js`: the scene's name for screen readers, in English, saying what it is and how
   to use it (for example "3D view of the Moon. Drag to rotate, scroll to zoom."). It goes in the
   `aria-label` of the element around the Canvas, with `role="img"`.
6. In `App.jsx`, replace the line `<p className="app__empty">{app.scene.empty}</p>` with
   `<LunarScene />`, and remove `scene.empty` from `src/data/app.js`.
7. The new files in the README's "Structure" block.

**How to test** (`src/scene/LunarScene.test.jsx`). The tests run in jsdom, which has neither WebGL
nor `matchMedia`. Replace the 3D libraries with stand-ins and simulate the request for less motion:

```jsx
const controles = vi.fn()
vi.mock('@react-three/fiber', () => ({ Canvas: ({ children }) => <div data-testid="canvas">{children}</div> }))
vi.mock('@react-three/drei', () => ({ OrbitControls: (props) => { controles(props); return null } }))

function sistemaPede(menosMovimento) {
  window.matchMedia = vi.fn().mockReturnValue({ matches: menosMovimento, addEventListener: vi.fn(), removeEventListener: vi.fn() })
}
```

Cases: the accessible name comes from `src/data/scene.js`; with `sistemaPede(true)`, the controls
receive `autoRotate: false` and `enableDamping: false`; with `sistemaPede(false)`,
`autoRotate: true`. This way of testing was verified in a draft on 29/10/2026: the tests pass, lint
passes and the build comes out.

**Done when.**
- In `npm run dev`, the Moon appears filling the region, rotates when dragged and zooms with the
  wheel.
- With the less-motion request turned on (in Chrome or Edge: DevTools > Rendering >
  "Emulate CSS media feature prefers-reduced-motion" > reduce), the Moon does not rotate on its own.
- The tests above pass and `verify` passes.

### C2 · The south pole terrain and the mountain shadows

**Status:** done on 06/11, PR #8 · **Depends on:** C1 (done) and E2 (done); the Sun direction is
already ready (`useSubsolarPoint`, card E3)

**What it is for.** A smooth sphere does not show why a site stays in the dark. With the real
terrain near the pole and the light coming from the right direction, the person sees the mountains
casting shadows, which is what the product is about.

**What to do.**
1. Build a mesh with height, fitted onto the sphere, from E2's coarse terrain:
   `public/data/relief/far.bin`, 802 × 802 heights in `int16` (half a meter per unit), 960 m per
   pixel, row by row starting from the top one, in the polar projection of the LOLA files. Where
   the grid sits is in the `far` field of `manifest.json`, and `polarXYToUnit`
   (`src/engine/geometry.js`) converts the projection's x/y into a point on the Moon.
2. The light direction comes from `useSubsolarPoint(dateUtc)` (`src/hooks/useSubsolarPoint.js`; the
   format is in "What the bridge delivers to the screen"): the light leaves the center of the Moon
   in the direction of the point it returns.
3. Turn on shadows: `shadows` on the `<Canvas>`, `castShadow` on the light, `castShadow` and
   `receiveShadow` on the mesh.
4. Decide the scale: mountains a few kilometers high on a Moon with a 1,737 km radius barely show.
   Either the height is exaggerated (and the screen says it is exaggerated, with the text in
   `src/data/scene.js`), or the camera gets close to the pole.
   **Decided on 06/11 (Marco): real height, and the camera gets to about 35 km from the pole.**
   Exaggerating the height stretches the shadow by the same proportion: with the Sun 1 or 2 degrees
   above the horizon, the scene would show shadow at sites where the engine says `visible: true`,
   and the "Done when" below would not hold.

**Done when.** At three sites agreed with Enzo, on the same date, the scene shows light where the
engine says `visible: true` and shadow where it says `false`; and `verify` passes.

Done on 06/11/2026, with the three sites Enzo computed with the engine for 14/11/2026, 00:00 UTC
(review of PR #8). The scene was rendered in Chromium with that date and the camera about 7 km
above each site, looking down; the number is the brightness at the center of the image, from 0 to
255 (the faint light on the dark side alone gives about 5):

| Point | Lat, lon | Engine | Scene with shadow | Scene without shadow (control) |
|---|---|---|---|---|
| 1 | −86.219°, 154.92° | light (margin +7.80°) | 51: light | 51 |
| 2 | −87.097°, 40.99° | shadow (margin −17.08°) | 5: shadow | 8 |
| 3 | −85.445°, −175.65° | shadow (margin −2.11°) | 5: shadow | 87 |

The control turns off the shadow and leaves only the slope of the ground. At point 3, it is the
mountain's shadow that darkens the point: without it, the point is bright. At point 2, the slope
already faces away from the Sun, and the shadow only completes it. `verify` passes on PR #8.

**Open.**
- With a grazing Sun, the shadow loses precision. A shadow pixel is 424 m on a side, facing the
  light, and covers about 424 m / tan(Sun altitude) on the ground, in the direction of the Sun:
  about 14 km with the Sun at 1.8°. A shadow edge can shift by that distance (Enzo's calculation,
  in the review of PR #8; not measured in the scene). That is why the sites in the check above have
  a large margin.

### C3 · Choosing a site by clicking on the Moon

**Status:** done on 06/11, PR #9 · **Depends on:** C1 (done), C2 (done) and E2 (done)

**What it is for.** Besides the list of sites (I2), the person can click any point in the allowed
area and see its result.

**What to do.**
1. `src/scene/coordinates.js`, with two functions, from latitude and longitude to a 3D point and
   back. The forward one (`latLonToScene`) and the four test points below already came with C2,
   because the sunlight goes through it; the way back is missing. The convention: the y axis points
   to the north pole; longitude 0° at +x; longitude 90° east at −z.
   - forward: `x = cos(lat)·cos(lon)`, `y = sin(lat)`, `z = −cos(lat)·sin(lon)`;
   - back: `lat = asin(y)`, `lon = atan2(−z, x)` (normalize the point to length 1 first).
2. In the `onClick` of the Moon's `<mesh>`, the point hit arrives in `event.point`. Convert it and
   call `onSelect({ lat, lon })`, which comes from `App.jsx`. Done with the `onClick` on a `<group>`
   around the sphere and the terrain mesh, and the math in `src/scene/picking.js`: the end of a drag
   to rotate the Moon also arrives as a click, and is ignored (`CLICK_MAX_DRAG_PX`). `App.jsx` keeps
   the point in a state only for the scene; handing it to the panel is E11.
3. A small marker on the chosen point, also when it comes from the list.
4. A click outside the allowed area chooses nothing and shows a short notice (text in
   `src/data/scene.js`), which disappears on its own after 5 seconds (Marco's decision, 06/11). The
   allowed area goes from the pole to 84°S: it is the `areaMaxLatDeg` of
   `public/data/relief/manifest.json`, and the check is `isInsideReliefArea(manifest, lat)`, from
   `src/engine/reliefFiles.js`.

Keyboard users choose from the list (I2); the scene does not need to receive focus.

**How to test** (`src/scene/coordinates.test.js`). The four points of the convention: (0°, 0°) → (1,
0, 0); (0°, 90°) → (0, 0, −1); (90°, 0°) → (0, 1, 0); (−90°, 0°) → (0, −1, 0). And the round trip of
a few points near the south pole giving the same point, comparing with `toBeCloseTo`: near the
pole, rounding in the middle of the calculation already shifts the longitude.

**Done when.** The tests pass, the click chooses the point and the marker appears on it, and
`verify` passes. Showing the point's result in the panel was moved out of this card to E11
(Marco's decision, 06/11): the panel is I1 and the connection is E11, and neither of them existed
when C3 was done (CONTRIBUTING.md, section 1, rule 6).

### C4 · How heavy the site is on the team's laptops

**Status:** done on 09/11, PR #12 · **Depends on:** C1 (done), and again after C2 (done)

**What it is for.** The judges open the site on any computer. If the scene stutters on the team's
laptops, it will stutter there too.

**What to do.** With C1 on `develop`, on each laptop (Enzo, Marco and Miguel), run
`npm run build` and then `npm run preview` (the final version of the site, not the development
one) and measure:
- the time until the Moon appears, with a stopwatch;
- the frames per second while rotating the Moon: in Chrome or Edge, DevTools > Rendering > "Frame
  Rendering Stats";
- the size of the JavaScript, which `npm run build` prints at the end.

Reference: in a draft on 29/10/2026, the C1 scene alone took the site's JavaScript from 221 kB
to 1.15 MB (315 kB compressed).

**Done when.** A table in this card with laptop, browser, time, frames per second and date;
repeated after C2.

**Measured on Marco's laptop on 08/11/2026**, from 12:43 to 13:03 (Brasília time). Samsung
960XFH, i7-13700H, 32 GB, plugged in, 144 Hz screen, Windows 11 (10.0.26200), Edge 157 and Chrome
156. The laptop has an RTX 4050, but both browsers used the **Intel Iris Xe** (WebGL reports
"ANGLE (Intel, Iris Xe … D3D11)"): Windows gives the integrated graphics card to the browser when
nobody configures something else, and that is the case closest to an ordinary computer.
Two moments: (a) `0b669b9`, the merge of PR #5, with C1 only; (b) `10cd326`, `develop` with C1,
C2 and C3. Build with `npm run build` and site on `npm run preview`; each row combines 3 runs, with
a clean profile and a 1280 × 800 window.

| Laptop | Date | Moment | Browser | Until the Moon appears | fps rotating | fps dragging | JavaScript (gzip) |
|---|---|---|---|---|---|---|---|
| Marco (Samsung 960XFH, Iris Xe, 144 Hz screen) | 08/11/2026 | (a) C1 only | Edge 157 | 248 ms | 144 | 144 | 1,150 kB (315 kB) |
| Marco (Samsung 960XFH, Iris Xe, 144 Hz screen) | 08/11/2026 | (a) C1 only | Chrome 156 | 273 ms | 144 | 144 | 1,150 kB (315 kB) |
| Marco (Samsung 960XFH, Iris Xe, 144 Hz screen) | 08/11/2026 | (b) C1 + C2 + C3 | Edge 157 | 345 ms | 144 | 144 | 1,214 kB (343 kB) |
| Marco (Samsung 960XFH, Iris Xe, 144 Hz screen) | 08/11/2026 | (b) C1 + C2 + C3 | Chrome 156 | 365 ms | 144 | 144 | 1,214 kB (343 kB) |
| Enzo (Dell 15 DC15250, Intel UHD, 120 Hz screen) | 09/11/2026 | (b) C1 + C2 + C3 | Edge 157 | 479 ms | 120 | 119.9 | 1,214 kB (343 kB) |
| Miguel (model not given, Iris Xe, 60 Hz screen) | 09/11/2026 | (b) C1 + C2 + C3 | Edge | 1,925 ms | 55.2 | 59.4 | 1,214 kB (343 kB) |
| Miguel (model not given, Iris Xe, 60 Hz screen) | 09/11/2026 | (b) C1 + C2 + C3 | Chrome | 1,669 ms | 54.9 | 54.4 | 1,214 kB (343 kB) |

The time is the median, counted from the start of navigation to the first frame with the Moon lit.
In (b), the page downloads 1,595 KB, of which 1,258 KB are two terrain files; with the local
server, they arrive in about 150 ms, so on a real network the time until the Moon will be longer.
`dist/` is 44 MB, almost all of it in `data/relief/`, but the page only downloads what it uses. The
card asked for a stopwatch and DevTools' "Frame Rendering Stats"; a script with the installed
browser (playwright-core) took the same measurement more precisely and repeatably. In one of the 3
Edge runs in (b), while dragging, a 20.8 ms frame showed up; in the others, none went over 9 ms.
The fps is the median of the 3 runs.

The fps stays at 144 because the browser does not draw faster than the screen. That says the scene
does not stutter, but it does not say how much headroom is left. Turning off that limit
(`--disable-gpu-vsync --disable-frame-rate-limit`) does not work: frames pile up on the graphics
card and the page freezes for 0.4 to 2.8 s at a time. What measures the headroom is the **cost of
each frame**: right after React Three Fiber draws, reading 1 pixel from the canvas forces the
graphics card to finish the frame, and the time of that operation is the frame's CPU and GPU work.

| Laptop | Moment | Browser | Cost per frame rotating (median / p95) | Dragging (median / p95) |
|---|---|---|---|---|
| Marco | (a) C1 only | Edge | 2.9 / 3.3 ms | 2.9 / 3.2 ms |
| Marco | (a) C1 only | Chrome | 2.9 / 3.3 ms | 2.8 / 3.1 ms |
| Marco | (b) C1 + C2 + C3 | Edge | 6.0 / 6.5 ms | 5.9 / 6.4 ms |
| Marco | (b) C1 + C2 + C3 | Chrome | 6.0 / 6.6 ms | 5.9 / 6.6 ms |
| Enzo | (b) C1 + C2 + C3 | Edge | 5.2 / 12.9 ms | 5.1 / 12.7 ms |
| Miguel | (b) C1 + C2 + C3 | Edge | 20.5 / 23.9 ms | 20.4 / 23.6 ms |
| Miguel | (b) C1 + C2 + C3 | Chrome | 20.5 / 24.1 ms | 20.2 / 23.8 ms |

- C2's terrain and shadow doubled the frame cost on Marco's laptop, from 2.9 to 6.0 ms, and added
  28 kB (gzip) of JavaScript and about 100 ms until the Moon appears.
- On Marco's and Enzo's laptops the scene keeps up with the screen (144 and 120 Hz), at about 5 to
  6 ms per frame. Reading the pixel makes the CPU wait for the graphics card, so this cost is a
  ceiling, not the exact cost.
- **On Miguel's laptop, the scene does not reach 60 fps.** The screen is 60 Hz (16.7 ms per frame),
  and the frame costs about 20 ms. Without the pixel read, which also adds weight, the fps stayed
  at 55 rotating and 54 to 59 dragging, with hitches of up to 116 ms while dragging. The Moon took
  1.5 to 2.6 s to appear, even with the server on the laptop itself; the terrain arrived in 0.5 to
  0.7 s, so it explains only part of the delay.
- **For C6:** on the team's weakest laptop, the current scene already goes over 16.7 ms, so there
  is no headroom left for the fine terrain. Decided on 09/11: the fine terrain turns on only where
  the machine can handle it; the how is in card C6.
- With the Moon still (less-motion request), the scene keeps costing the same per frame, on every
  screen frame: this became card C9.
- In the console, only the warning "THREE.Clock: This module has been deprecated", on all laptops.

**Enzo's and Miguel's laptops:** measured on 09/11/2026, on the same commit (b) `10cd326`, with
`npm run build`, `npm run preview` and the same script as Marco (`medir2.mjs`, 3 runs of each
measurement, plugged in). The full numbers are in the comments of PR #12. Enzo measured only in
Edge; his first run of time until the Moon had the mouse moved by accident (1,118 ms) and was
redone. Miguel measured in Edge and Chrome and did not give the laptop model or the browser
versions.

### C5 · Stopping the rotation when the person touches the Moon

**Status:** done on 09/11, PR #13 · **Depends on:** C1 (done)

**What it is for.** Without the less-motion request in the system, C1's Moon rotates on its own all
the time, and there is no way to pause it. WCAG 2.2.2 (level A) asks for a way to pause anything
that moves on its own for more than 5 seconds alongside other content. Stopping the rotation when
the person interacts also helps C3 and E11: the chosen site does not wander away from in front of
them. It came from the review of PR #5.

**What to do.** In `src/scene/LunarScene.jsx`, turn off `autoRotate` the first time the person
drags or uses the wheel (Drei's `OrbitControls` reports it in `onStart`), and keep it off from then
on. With the less-motion request, nothing changes: the Moon already starts still.

**How to test** (`src/scene/LunarScene.test.jsx`). With the same stand-ins as C1: without the
less-motion request, the controls start with `autoRotate: true`; after calling the `onStart` that
the scene handed them, they receive `autoRotate: false`.

**Done when.** In `npm run dev`, the Moon rotates on its own until the first time the person
interacts, and does not rotate again; the tests pass and `verify` passes.

`onStart` fires when the person presses the left or middle button, uses the wheel or touches the
screen (read in the three-stdlib `OrbitControls`, which Drei uses). That is why the ordinary click
that chooses a site also stops the rotation, which is what "What it's for" asks for.

**Verified** on 09/11/2026, in `npm run dev`, in a Chromium (the browser in the Claude app),
reading the camera position and the controls' `autoRotate` from the page:
- Marco's Windows has "Animation effects" turned off, and the browser answers
  `prefers-reduced-motion: reduce`: the Moon started still and stayed still.
- Without the request (`matchMedia` replaced only in that tab), the Moon rotated on its own and
  stopped the first time the person dragged, used the wheel or clicked to choose a site, each case
  on a reloaded page. After the glide, the camera stayed in the same place for 600 frames (10 s),
  also after the scene redrew.
- The browser was hidden and did not draw on its own: the frames were advanced with React Three
  Fiber's `advance`, which runs the same per-frame code, including the controls' rotation.
- Marco checked it by eye in his own browser, on the same day, with `npm run dev`: it worked.

**What was left for later** became card C10, in the review of PR #13. Enzo verified in the browser
on 09/11/2026 that Shift+click chooses the site and the Moon keeps rotating (three-stdlib treats a
click with Ctrl, Shift or Cmd as pan and does not report `onStart`); the same will happen with the
I2 list.

### C6 · The fine terrain up close

**Status:** done on 13/11, PR #30; verified by Marco on CIT-DES06 (Intel UHD 630, weaker than
the Iris Xe in his notebook), with the window maximized, and by Miguel on his notebook (Iris Xe),
where the fine terrain stays off · **Depends on:** C2 (done), C4 (done) and C9 (done), because the meter requests its own frames in the scene that only
draws when something changes

**What it is for.** Up close, the C2 scene gets blurry: it draws the coarse terrain (`far.bin`),
with one vertex every 1.9 km, and a 1 or 2 km crater becomes a few triangles. Tested on
06/11/2026: with every pixel of `far.bin` (960 m) and a 4096 shadow, it is only twice as
sharp, with 4 times as many vertices, and WebGL 2 only guarantees 2048 textures. It came from PR #8.

**What to do.** Draw the 80 m fine terrain (`public/data/relief/near/`, the 20 km tiles
from card E2) only near where the camera is looking, on top of the coarse terrain, swapping the tiles
when the camera moves. C4 says how much more the scene can handle.

**Decided on 09/11 (Marco), with the numbers from C4:** the fine terrain turns on only where the machine
can handle it. On Miguel's notebook, today's scene already costs about 20 ms per frame (55 fps on a
60 Hz screen), so there it stays off and the scene stays as it is today. The scene measures its own pace in the
first few seconds (Drei's `PerformanceMonitor` does this) and only turns on the fine terrain if the frames
stay below 16.7 ms; if it goes over that after being turned on, it turns off again.

**Done when.** With the camera at minimum distance, on a notebook that can handle it (Marco's or
Enzo's), a 1 km crater shows a rim and a floor, and the frames stay below 16.7 ms;
on a notebook that can't handle it (Miguel's), the fine terrain stays off and the cost per frame does not
go above what C4 measured; and `verify` passes.

**What changed from "What to do"**, with the reason for each:
- **400 m, not 80 m or 160 m** (`src/scene/nearTiles.js`). One vertex every 5 pixels. Until
  13/11 it was 160 m, one vertex every 2 pixels: with 80 m, the triangles would be smaller than a
  pixel, which the GPU draws very poorly. In Marco's check, with the window maximized,
  the 160 m triangles came out at about 2 pixels, and the antialiasing that React Three Fiber turns on
  paints a pixel again for every triangle that touches it: the meter turned off the fine terrain
  (sixth round, below). The rim and floor of a 1 km crater come from the 80 m normal map,
  not from the vertices: in the same place, the image with 400 m changed by more than 8 shades in 154 of 847,754
  pixels. The 1 km crater ends up with about 3 vertices from side to side.
- **Two layers** (`src/scene/nearTiles.js`), around the tile corner closest to the center
  of the screen, and only with the camera below 80 km of altitude (higher up, the fine terrain vanishes within a pixel):
  - the **center**, 2 × 2 tiles (40 × 40 km) every 400 m, with the center of the screen at least
    10 km from the edge. The plan was 3 × 3 at 160 m, and the measurement below showed it touched
    16.7 ms; later, the 2 × 2 at 160 m did not fit in the maximized window of CIT-DES06 (13/11);
  - the **ring**, 6 × 6 tiles (120 × 120 km) every 800 m, which also runs underneath the center.
    Requested by Marco on 12/11, after seeing only a square of fine terrain in the middle of the screen: with the
    ring, the whole screen is covered at minimum distance (up to an aspect ratio of 1.8, width over
    height). Underneath the center, it plugs any gap between the two layers, without needing a
    "skirt" at the edge (a review of the drawing, on 12/11, showed that the skirt made a false shadow). Each
    center tile always carries its own ring piece underneath, even if the ring on screen is still
    the previous one and doesn't reach that far (in a 4-tile drag). There the ring casts no shadow:
    it is smoother than the center, and at the bottom of a crater it sits above it.
  The center swaps on its own, as soon as it arrives, as before; the ring is only requested with the center of the current
  position on the screen, and swaps when all 36 have arrived. Waiting for the 36 to show the center would take 9
  times more bytes (4.6 MB versus 0.5 MB) on the first zoom-in, and in a drag it would request the 36 of
  each block along the way.
- **Normal map** (`buildNormalMap`, in `src/scene/reliefMesh.js`): each tile gets a
  texture with the "outward" direction of the surface at each 80 m pixel, and the light of both layers
  comes from it. Requested by Marco on 12/11, after seeing the 800 m ring almost as blurry as the
  coarse one, and with straight lines at the seam between tiles (each mesh computed its own light, and the
  seam had different light on each side). With the map, the ring gets the center's detail
  without a single extra triangle, and the seam uses the pixel that each tile repeats from its neighbor. The
  texture is half-float: with 8 bits, the normal would be off by about 0.2°, and with the Sun 1.5° above the horizon the
  flat ground would get blotches of up to 15% brightness. Each 250 × 250 texture weighs 500 kB on the
  GPU, and the same in JavaScript memory, which keeps its data. With the scene still
  there are 36 (about 18 MB: the 4 of the center are inside the ring). When the ring swaps, the old ring's ones
  stay until the new ones are ready: from 72 to 80 in the worst case (about 36 to 40 MB), counted in a
  simulation from the code review, on 12/11. A tile's map is built on its own, in a
  frame of its own, and the texture goes up to the GPU in that same frame (about 3 ms plus about 6 ms,
  in the CIT-DES06 browser, on 13/11). The shadow is still the one from C2, and the outline of the mountains is the
  mesh's.
- **Stencil** (`src/scene/reliefLayers.js`): the center shows on top of the ring and the coarse terrain, and the
  ring on top of the coarse terrain, even where those are a little higher. Without it, at the seam, the higher coarse
  terrain poked through the fine one in steps ("teeth", seen by Marco on 12/11). Depth alone doesn't
  solve it, and changing the edge height would make each tile's mesh depend on the block it
  is in. The `<Canvas>` asks WebGL for the stencil, which three creates without it.
- **A meter of our own** (`src/scene/frameBudget.js`), not Drei's `PerformanceMonitor`. That one
  counts frames per second over time windows, and with C9 the still scene doesn't draw: it
  would conclude "can't handle it" even on a fast notebook. The meter only measures the frames it
  requests itself, in bursts: when the page opens, until it decides; and, once on, at each new block of
  fine terrain on screen, which is when the frame cost changes. The rest (one step of the mouse wheel, a
  tile arriving) doesn't count: the interval between those loose frames is the pace of the hand or of the
  network, not the cost of drawing, and counting it turned off the fine terrain on a machine that can handle it.
  In the burst, it ignores the first second of the page (the scene still building the terrain), the first 6
  intervals of a new block (about 100 ms: the swap on screen and what it leaves for the
  following frames, such as the hole's buffer going up to the GPU; it was 2 until 13/11, and the
  review saw that frames from the swap were left among the counted ones) and the frame after building a tile,
  and it decides by the average of 60 intervals of up to 100 ms. The burst goes on until it gathers those 60, not a
  fixed number of frames: with a fixed number, one extra interval that doesn't count left 59, and it
  ended without deciding. The ceiling is twice the frames it needs, so that it doesn't request frames
  forever on a page that only has pauses. The opening has the same ceiling, counted after the
  first second: if it goes past it without gathering the 60 intervals, it turns off the fine terrain and shows the
  line in the console, with the average of all the intervals. Without it, on a machine where every frame
  goes over 100 ms (a Chrome without video acceleration, a virtual machine, a remote
  desktop), the opening requested frames forever and the still scene went back to drawing nonstop
  (Enzo's review, on 13/11). In a truly hidden tab the browser doesn't even call
  `requestAnimationFrame`, so a loose frame in a visible tab means a slow machine; in the
  hidden browser of the Claude app, the opening turns it off, and checking there still
  needs the slower clock. It decides in **steps**: a burst that overflows with the ring on screen removes only the
  ring and opens another burst on its own, which measures the center; if that one overflows too, it turns everything off. The
  step never goes up. Without the steps, a machine that can handle the center but not the ring would lose the
  whole fine terrain. Every measurement that finishes goes to the console, with the average (`relevo fino
  ligado`, `continua ligado`, `só no centro`, `continua só no centro` or `desligado`): until 13/11,
  only the ones that changed something, and with the machine coping nobody saw the headroom.
- **The limit is 17.5 ms, not 16.7 ms** (Marco's OK on 13/11; he had decided on 16.7 ms on 09/11).
  The average of 60 intervals on a 60 Hz screen that keeps up with the scene comes to 16.67 ms, right up against 16.7:
  a single frame that misses the screen's turn (33.3 ms) brings the average to 16.94 ms and would turn the fine
  terrain off for good. With 17.5 ms, the average accepts up to 3 missed frames in 60 (about 57 per second).
  Miguel's notebook, with the Moon rotating, sits at 18.1 ms (C4), above the limit. Once off, it doesn't
  turn on again on that page, so the fine terrain doesn't flicker on a machine at the limit.
- **A hole in the coarse terrain** under the tiles of both layers: in a crater, the coarse terrain (the
  1.9 km average) sits above the floor and would cast a shadow on the fine one. Only the squares with all four
  corners covered are removed, so the seam doesn't open a gap; the ones that are only partly underneath stay, and the
  stencil doesn't let them show on top of the fine one. The hole follows the fine mesh, which sits
  half a pixel (40 m) to the right of and below the tile's edge on the grid. Swapping the hole
  redoes only the coarse triangles, in the same GPU buffer, starting from each vertex's
  tile, computed once per terrain (`reliefVertexLabels` and `coverTriangles`): 4 ms per swap,
  versus the roughly 31 ms of walking the grid again, which made the page stutter. The click follows the
  stencil rule (`visibleHit`): the center's hit, otherwise the ring's, otherwise the coarse terrain's, even
  if another one is closer. The closest hit could be the coarse terrain or the ring hidden underneath
  the fine one, up to about 600 m from where the person clicked.
- **The meshes built little by little**: one normal map per frame; a center tile's mesh
  in the frame after its map (about 2 ms, at 400 m); and up to 8 of the ring, with the map ready
  (0.4 ms each). A layer's new block comes onto the screen all at once, together with the hole, in the same
  React commit (the hole's state lives inside the Canvas): the page doesn't freeze, and the coarse terrain never
  has a hole without the fine one on top. The new block only comes in when all its tiles
  have arrived (or failed) and are built (`nearTilesStep` and `nearFrameStep`); until then, the previous
  block stays on screen. Swapping earlier, the tiles leaving the block vanished before the new ones
  arrived, and the fine terrain flickered at every swap. The tile that failed is left out, and the coarse terrain
  covers its spot. The page's memory keeps 100 tiles (12.7 MB), to go back and forth in a
  drag without downloading again.
- **The shadow is the one from C2** (424 m per pixel). The rim and floor of the craters show through the light of the
  normal map.
- **No antialiasing** (`src/scene/LunarScene.jsx`), decided by Marco on 13/11. The MSAA that
  React Three Fiber turns on paints each pixel once for every triangle that touches it: with it, on the
  Intel UHD 630 and the window maximized, the fine terrain sat at the limit of 60 frames per second and
  the meter turned it off. Without it, the frame takes half the time on the GPU, with or without the
  fine terrain, and up close the image barely changes (seventh round). From afar, the edge of the Moon becomes
  stair-stepped, and the 84°S line from C8 became a 1.5-pixel band (`src/scene/AreaRing.jsx`):
  the regular line vanished in pieces.

**Verified** on 11/11/2026, in `npm run dev`, in a Chromium (the Claude app's browser), on the
CIT-DES06 computer, with an Intel UHD 630 (weaker than the Iris Xe in Marco's notebook in C4).
The browser was hidden: it draws few frames per second, at a pace that changes on its own.
That's why the cost was measured with the GPU's own timer
(`EXT_disjoint_timer_query_webgl2`), and the meter was checked with frames delivered by the test,
through React Three Fiber's `advance`, at the interval the test chose. This checks the meter's
wiring in the scene, not the machine's speed; the cost table is what tells the speed.

First round, before the fixes from the PR review:
- **Craters:** above (−89°, 180°), the best-lit place out of 8 sites tested on that date, the
  center of the screen had 2.65 times more detail (the variation in brightness between neighboring pixels) and
  shows dozens of craters with a bright rim on the Sun side and a dark floor, several smaller than 1
  km. Without the fine terrain, the same place is just a smudge. No empty pixel on the whole screen.
- **Block:** 3 × 3 cost 12.8 ms per frame (p95 of 16.3 ms), at the limit of 16.7 ms; hence the 2 × 2.
- **Click:** on top of the fine terrain, it picks the site, the marker appears and the panel shows the sky.

Second round, after the fixes, with the scene still (the reduced-motion request switched only in
that tab, so the scene stays in C9's `demand`):
- **Cost**, on the same page, with a 538 × 584 pixel screen and the camera at minimum distance, above
  (−89.6°, 40°); each round is 100 frames, after 20 discarded:

  | On screen | Median | p95 | Rounds |
  |---|---|---|---|
  | without the fine terrain | 4.7 ms | 6.1 to 6.3 ms | 3 |
  | with the 2 × 2 block | 9.4 and 10.9 ms | 11.4 and 11.9 ms | 2 |

- **On opening, with nobody touching anything:** the meter requested its own frames and decided on its own. At the
  real pace of the hidden browser (about 29 frames per second), it turned off with a 34.5 ms average;
  with the page's clock three times slower, it turned on with 11.1 ms. After deciding, the still
  scene drew 0 frames in 2 s.
- **Frames it didn't request:** 200 frames, each 25 ms after the previous one, requested from outside (what
  the mouse wheel does): the fine terrain stayed on. Before the fix, the 25 ms average
  turned it off.
- **New block:** moving the camera to (−88.2°, 75°) at 60 Hz, the block came in and the meter requested the
  burst's frames (62) and stayed on. Moving to (−87.5°, 190°) at 25 ms per frame, the
  burst turned it off at the 62nd frame: the 4 tiles left and the coarse terrain came back whole (249,034
  triangles). Once off, the camera back near the pole didn't bring the fine terrain back.
- **Hole in the coarse terrain:** with the 2 × 2 block on screen, the coarse terrain drew 248,234 of the 249,034
  triangles; the hole follows the fine mesh on all four sides (test in `nearTiles.test.js`).
- **Console:** only the meter's lines and the usual `THREE.Clock` warning.
- **Not redone in this round:** the image of the craters and the click (the hidden browser stopped
  drawing). Marco checks it by eye in `npm run dev`.

Third round, after the fix for the flicker on block swap and the fixes from a second
review (the burst that gathers the 60 intervals, the failure that only counts on its own attempt), with the
final code, the same way (the test's frames and clock, at 60 Hz), on a reloaded page and with the
rotation stopped by one step of the wheel:
- **On opening:** turned on with 16.67 ms, in 122 frames (the first second plus 61).
- **Swap to a block with no tile in common**, from (−89.6°, 40°) to (−88.2°, 75°): the 4
  previous tiles stayed on screen for 7 frames, until the 4 new ones were built, and the swap happened
  in a single frame, with the hole along with it, followed by the 62-frame burst. Before the fix, the same
  swap had 6 frames with no fine terrain at all.
- **Neighboring block**, 20 km to the side (2 tiles in common): the 2 new ones built in 5 frames, and
  the swap of the 4 in a single frame.
- **A tile that fails** (the `fetch` switched only in that tab to answer HTTP 503 for
  `r07c05`): one error line in the console, and the screen went from the 4 previous tiles straight to the
  3 that arrived; the coarse terrain covered the spot of the one that failed.
- **The camera rising above 80 km in a single step**, with nothing else requesting a frame: on the next frame the
  fine terrain left and the coarse terrain came back whole.
- **Going down again in the same block**, now with `r07c05` responding: the scene waited for its new
  read and swapped straight to the 4 tiles, without going through the 3.
- **At 25 ms per frame**, on a new block: the burst turned it off at the 62nd frame and the coarse terrain came back
  whole.
- **Console:** the usual `THREE.Clock` warning, the meter's lines and the line for the tile that
  failed on purpose.
- **Not reproduced:** the second review pointed out that, in `npm run dev`, Fast Refresh could run
  the `NearRelief` cleanup without unmounting and leave the coarse terrain on top of the fine one. I edited the file with
  the block on screen, and the effects didn't run again: nothing changed. The cleanup now also removes what
  is on screen, in case it happens.

Fourth round, on 12/11/2026, after the ring and the stencil, the same way (the test's frames and clock,
at 60 Hz), on a reloaded page, with a 538 × 584 pixel screen:
- **First zoom-in**, at (−89.6°, 40°), with the final code: the center came in 8 frames after
  the movement, with the hole (the coarse terrain at 248,234 triangles) and the 4 ring pieces underneath; the
  whole ring, 26 frames later, with the 36 tiles (the coarse terrain at 241,592). The page downloaded 36
  tiles: the 4 of the center are among the ring's and were not downloaded twice.
- **Teeth**: each layer painted a flat color, counting the coarse-terrain pixels between center pixels
  on the same screen row, at minimum distance:

  | Place | Without stencil on the coarse terrain (as it was) | With stencil | Coarse terrain on the whole screen, with the ring |
  |---|---|---|---|
  | (−89.0°, 180°) | 1,802 px | 196 px | 0 px |
  | (−85.5°, 60°) | 836 px | 0 px | 0 px |
  | (−84.3°, 120°) | 1,160 px | 0 px | 4,491 px (4 ring tiles don't exist there) |

  The 196 px with stencil are outside the center: with it, the coarse terrain doesn't paint where the center drew,
  and the terrain leaves the center's edge wavy on screen. Without the stencil on the ring, the 800 m mesh
  would cover 62 to 72 thousand of the center's pixels; with it, none. No empty pixel in any case.
- **A real click**, through browser events, in the center of the screen: the panel showed the sky of the
  site, and the marker ended up 1 m from the point under the camera. The choice between layers is in the
  tests (`visibleHit`, compared against the stencil in every combination): in the browser, the pixel
  found with the ring in front of the center gave 18 m between the two hits, less than the imprecision of the
  simulated click.
- **Drag of 4 tiles** (80 km) in a single frame, with the final code: the new center came in with its
  ring pieces underneath (the previous ring didn't reach that far), and no empty pixel in
  any frame of the swap.
- **Hole**: 10 ms once per terrain and 4.2 ms per swap (9.2 ms at worst out of 9).
- **Drag** of 100 km in 5 frames: the fine terrain never left the screen (always 4 tiles in the center
  and 36 in the ring, and the coarse terrain never came back whole); with the camera stopped, the center swapped first and the ring
  8 frames later.
- **Meter steps**: on a new block at 25 ms per frame, only the ring left (`relevo fino só no
  centro`); with the frames back to 16.7 ms, the center stayed, and on another block the ring wasn't requested
  (no tile downloaded); at 25 ms again, it turned everything off and the coarse terrain came back whole.
- **Not measured**: the ring's cost on the GPU (the hidden browser doesn't allow it). By calculation,
  it is 45 thousand triangles more than the center's 125 thousand (with the center at 160 m).

Fifth round, on 12/11/2026, after the normal map, the same way, with each piece painted
a color to know which tile each pixel belongs to. The scene was dark at that time (average brightness of about
6 out of 255), so the numbers are small; the comparison is on the same frame, with the map turned on and
off just for that instant:

| Place | Ring detail, without → with the map | Seam in the ring (brightness difference at the seam ÷ the one inside), without → with |
|---|---|---|
| (−89.0°, 180°) | 0.25 → 0.67 | 4.41 → 0.46 |
| (−85.5°, 60°) | 0.30 → 0.67 | 2.79 → 1.15 |
| (−88.2°, 75°) | 0.24 → 0.86 | 2.22 → 1.30 |
| (−87.5°, 300°), almost no light | 0.03 → 0.07 | 1.40 → 0.85 |

- The center's detail also went up (0.36 → 0.53 at (−89.0°, 180°)), and the ring reached its level.
- **Building**, measured in the browser with 6 tiles: the normal map at 2.4 ms median (5.3 ms at
  worst), the half-float texture at 1.4 ms (5.1 ms), the full center mesh (at 160 m) at 6.8 ms
  (11.8 ms) and the ring's at 0.4 ms. The first zoom-in: the center in 12 frames (4 maps, 4
  meshes and the ring pieces underneath) and the whole ring about 40 frames later, one map per frame.
- **The first bug**: the first version stored the raw normal in the texture, and three reads the map as
  color × 2 − 1; the light came out skewed. Found by the measurement (the detail had jumped 11 times) and pinned down in a
  test.
- **Long frames in the test**: the hidden browser draws slowly, and the test delivered frames
  faster than the GPU finished them. Every now and then the browser paused JavaScript
  until it caught up: frames of 50 to 490 ms, also with no texture going up at all (reading 1 pixel after
  42 frames waited 217 to 423 ms, with a half-float texture, an 8-bit one or a smaller one). In a real
  tab, the screen's pace doesn't let frames pile up like that; it wasn't possible to measure the
  real cost on the GPU here.

Sixth round, on 13/11/2026, after Marco's check in his Chrome, on CIT-DES06 (the window
maximized on a 1920 × 1080 screen, `devicePixelRatio` 1, the same UHD 630). With the center at 160 m,
the console showed `relevo fino só no centro (o anel saiu), média de 20.98 ms` and, in the next burst,
`relevo fino desligado, média de 22.82 ms`. On a 60 Hz screen, a 20.98 ms average is about 15 frames
in 60 that missed the screen's turn.
- **The cause:** the 160 m center mesh. With the window maximized, the scene is 1114 × 761 pixels, a
  pixel covers about 70 m at minimum distance, and each 160 m triangle came out at about 2 pixels. The
  antialiasing that React Three Fiber turns on (4-sample MSAA) paints a pixel again for every
  triangle that touches it. Measured with the GPU timer, as in the earlier rounds, with the
  Claude app's browser at the size of the maximized window, above (−87°, 150°), in 5 interleaved rounds
  of 15 frames:

  | On screen | Median | 90% of frames below |
  |---|---|---|
  | without the fine terrain | 5.9 ms | 7.8 ms |
  | only the center, at 160 m | 10.1 ms | 16.0 ms |
  | only the center, at 400 m | 6.9 ms | 8.0 ms |
  | the center at 160 m and the ring | 13.5 ms | 21.7 ms |
  | the center at 400 m and the ring | 9.0 ms | 10.5 ms |
  | the center at 800 m and the ring | 8.4 ms | 9.9 ms |

  Drawing the same scene without antialiasing, the center at 160 m with the ring dropped from 14.6 to
  6.7 ms. The shadow costs about 0.5 ms, and a simpler material (Lambert) would save about 1.3 ms.
- **The image**, in the same place, with the center at 160 m and at 400 m: average difference of 0.04 shade (from 0 to
  255), and 154 of 847,754 pixels changed by more than 8 shades; with 800 m, 0.09 shade and 404 pixels. The light comes
  from the normal map, and the camera always looks at the center of the Moon.
- **With the final code** (the center at 400 m), at another time, the same way: without the fine terrain, 6.4 ms
  (90% below 7.8 ms); the center and the ring, 11.0 ms (13.9 ms); on the same page, with the center's
  meshes swapped for 160 m, 13.8 ms (18.3 ms). The numbers change from one time to another (the GPU
  also draws the computer's screen), so each comparison was made on the same page,
  interleaved.
- **Building**, in the browser, 12 times: the center mesh at 400 m at 2.0 ms median (3.1 ms at
  worst), versus 8.8 ms (10.9 ms) at 160 m; the normal map at 3.1 ms (12.7 ms), and its texture,
  created and sent to the GPU, at 5.6 ms (12 ms).
- **What three reviewers checked**, on 13/11, in Node: with 400 m, the click point moves up to
  13 m in 95% of cases at the edge of the screen (2.6 m median and 103 m at worst; in the middle of the screen, nothing),
  and a pixel covers 70 m; in a simulation, the shadow changes less than it changes in half an hour of Sun; the
  seams, the hole in the coarse terrain, the stencil and the click don't depend on the spacing.
- **The console**, with the test's frames and clock: `relevo fino ligado` and `continua ligado` at
  60 Hz; on a new block at 25 ms per frame, `só no centro (o anel saiu)`, and with the frames back
  to 60 Hz, `continua só no centro, média de 16.67 ms`.

Seventh round, on 13/11/2026, after Marco's second check, with the center at 400 m, the same
way (the Claude app's browser at the size of the maximized window, 1114 × 761). In Marco's
Chrome, the console showed `relevo fino ligado` (16.67 ms), then `só no centro (o anel saiu)` with
17.71 ms and `desligado` with 20.73 ms.
- **Building doesn't enter the measurement.** Frame by frame, during a zoom-in: the ring's 32 textures
  go up one per frame, 6 to 30 ms of JavaScript each, all in frames the meter skips, and the
  ring only comes onto the screen after the last one. In the frames that count, less than 1 ms of JavaScript and about
  10 to 13 ms on the GPU: what went over the limit was drawing, not loading.
- **The "only the center" step barely helps on this screen.** After it, only the first frame has
  work (about 11 ms, the swap on screen); the following ones, 0.1 ms of JavaScript and about 11 ms on the GPU,
  almost the same as with the ring: where the ring leaves, the coarse terrain comes in, which costs about the same per
  pixel. The 17.71 and 20.73 ms are about 4 and 14 late frames in 60, the machine at the limit.
- **No antialiasing** (`antialias: false` on the `<Canvas>`), on the same page, 5 rounds of 15
  frames:

  | On screen | With antialiasing | Without |
  |---|---|---|
  | without the fine terrain | 7.5 ms (90% below 7.8 ms) | 3.9 ms (5.1 ms) |
  | the center and the ring | 11.7 ms (12.2 ms) | 6.1 ms (8.1 ms) |

- **The image**, before and after, in the same place: up close, 887 of 847,754 pixels changed by more than 8
  shades, almost all of them on the edge between the layers. From afar (the camera at the initial distance), the edge of the
  Moon becomes stair-stepped, and the 84°S line became dashed: each of its 720 pieces is about
  0.2 pixel there, and without antialiasing the GPU doesn't paint a line piece smaller than a pixel.
  Moving the near plane farther from the camera (0.01 and 0.1, instead of 0.001) didn't solve it. Drawn as
  a strip of triangles (Drei's `Line`, `src/scene/AreaRing.jsx`), the line came out whole at
  1.5 pixels wide, with the same color; at 1 pixel there were still small holes.
- **In Marco's Chrome**, without antialiasing, with the window maximized and F12 closed during the
  measurement: `relevo fino ligado, média de 16.67 ms` and `relevo fino continua ligado, média de 16.67
  ms`, that is, 60 frames per second with no late frame. By eye, from afar and up close, the
  84°S line whole and the craters right.

**On Miguel's notebook**, on 13/11/2026, at commit `e22031c`, with `npm run preview`, Chrome
157.0.8103.51, the window maximized, the notebook plugged in, F12 closed and 15 s without touching anything (the Moon
rotating), in 2 rounds with the page reloaded. Measured by Miguel; the numbers are the ones he
copied from the console:
- **Both rounds:** a single line, with no "on" before it:
  `NearRelief: relevo fino desligado, média de 18.15 ms entre quadros (o limite é 17.5 ms)`. The
  opening decided by the 60 intervals, not by the ceiling.
- **The "Done when" for this notebook:** the fine terrain stays off, and the opening measures the scene without
  it. The 18.15 ms is in line with what C4 measured there, rotating: 54.9 fps in Chrome (18.2 ms) and 55.2 fps in
  Edge (18.1 ms).
- **Console:** no error, only the usual `THREE.Clock` warning. It doesn't come from our code:
  React Three Fiber creates a `THREE.Clock` internally, and three warns.
- **Earlier**, in a round without the commit and browser noted down, it gave 19.17 ms; and in `npm run dev`, with
  DevTools open, 18.19 ms. Off in both.
- **On Miguel's PC** (GeForce RTX 3060, AORUS 8G), the same way, in Chrome 157.0.8103.52:
  `NearRelief: relevo fino ligado, média de 5.56 ms entre quadros (o limite é 17.5 ms)`, in one
  round (the second wasn't noted down). The screen's refresh rate wasn't noted down: 5.56 ms is the pace of
  a 180 Hz screen, and then it would be the screen's pace, not the frame cost (not verified).

**Open.**
- In both checks on 13/11, the burst with only the center gave more than the one with the ring (22.82 versus
  20.98 ms, and 20.73 versus 17.71 ms), and by the measurement it should give almost the same. Its frames don't
  have extra work (seventh round); the most likely cause is GPU variation, since it also
  draws the computer's screen and the open DevTools (not verified).
- Without antialiasing, the edge of the Moon seen from afar becomes stair-stepped. If it bothers anyone, card C12
  suggests smoothing the edges some other way.
- The cost on Marco's notebook (BOOK, Iris Xe) wasn't measured; CIT-DES06 has a weaker
  GPU, so it should come in below the numbers above (not verified).
- The ring's cost on the GPU was measured only on CIT-DES06 (sixth round). If it doesn't fit
  on another machine, the meter removes only the ring (`relevo fino só no centro`, in the console).
- Higher than about 43 km of altitude, in a wide window (aspect ratio of 1.5), the edges of the screen
  fall on the coarse terrain: the ring covers 50 km to each side of the center of the screen, at minimum.
- A tile that takes very long to arrive, without failing (the network stalled), holds up the swap: the previous
  block stays on screen until it arrives or fails. Over the internet, the browser gives up on the stalled
  read after a while, and then it becomes a failure (not verified how long).
- At the seam between the 4 center tiles, in a place with almost no light ((−87.5°, 300°)), the brightness
  difference at the seam stayed 2.7 times the one inside, with and without the map. With so little light, few
  pixels decide the calculation; not verified by eye.
- The cost of the textures on the GPU wasn't measured (about 18 MB with the scene still and up to about
  40 MB during the ring swap, plus the same in JavaScript memory), nor their effect on a notebook
  with little video memory.
- Between about 43 and 80 km, in a wide window, the outer edge of the ring is a little brighter than the
  coarse terrain next to it, with the Sun low: the 80 m normal is rougher, and grazing light brightens the
  slope facing the Sun more than it darkens the one facing away. In a calculation from the code review,
  with shadow, ambient light and the screen colors, the typical difference was about 8% (2 to 4 shades, from 0
  to 255) and reached 43% in a place facing away from the Sun; before the map, about 4%. Not verified by eye.
  If it shows up, one way out is to blend the map's normal with the mesh's over the last kilometers of the
  block.
- The normal map has no mipmap. Up to about 60 km, each screen pixel covers at most 2 pixels of the
  map, and a mipmap would change almost nothing (simulated in the code review); near 80 km, with
  2.6 to 2.8 per pixel, the light may shimmer a little when the camera moves. Not verified by eye.
- Finer shadow near the camera: it would require moving C2's shadow box close to the block.
  It stays as a card suggestion, to agree on with Enzo.
- The fine terrain at 80 m, if there is ever headroom to spare.

### C7 · Terrain test close to the time limit

**Status:** done on 09/11, PR #14 · **Depends on:** nothing

**What it is for.** Vitest gave each test 5 s (today the suite gives 30 s, card E15). On Enzo's
Windows, on 06/11/2026, the test "todo vértice fica perto da superfície"
(`src/scene/reliefMesh.test.js`) took 2.4 to 7.5 s, and failed `verify` once on time, with
nothing wrong in the mesh. A test that passes or not depending on how busy the computer is teaches
people to rerun it until it passes, and a real error slips through with it. It came from PR #10
(card E10).

**Cause** (measured on Linux on 06/11/2026). The `far.bin` mesh has 125,314 vertices, and the test
calls `expect` twice for each one. The math takes 6 to 13 ms; the 250 thousand `expect` calls, 830
to 1,100 ms. The neighboring test, "todo vértice fica no hemisfério sul da cena", does the same,
with one `expect` per vertex, and took 0.8 to 2.3 s on Enzo's Windows.

**What to do.** In both tests, keep the smallest and largest value in the loop (each vertex's
radius; the angle to the pole) and check them with a single `expect`, at the end. The check stays
the same.

**How to verify the test still catches errors.** The mesh goes from −6.72 km to +6.96 km (measured
along with the cause). With the 8000 m limit changed to 6000 m, the new test must fail; back at
8000 m, it must pass.

**Done when.** Both tests check the same thing as before, each one takes less than 0.5 s in the
`verify` on the Windows machine of whoever does the card, and `verify` passes.

**Verified** on 09/11/2026, on Marco's Windows, with the whole suite running as in `verify`
(each test's time read from Vitest's JSON report):

| Test | Before | After |
|---|---|---|
| "todo vértice fica perto da superfície" | 3,868 ms | 79 ms |
| "todo vértice fica no hemisfério sul da cena" | 2,093 ms | 44 ms |

The first one checks the largest distance from the sphere of radius 1, in meters, which is the same
as the two limits from before. With the limit changed from 8000 m to 6000 m, the new test fails
(`expected 6956.45… to be less than 6000`), so does the old one, and back at 8000 m the new one
passes. The second one, with the range reduced by 1 km, fails in the new test and in the old one.
The suite still has 213 tests.

### C8 · Show in the scene how far a site can be chosen

**Status:** done on 09/11, PR #18 · **Depends on:** C3 (done)

**What it is for.** The terrain the scene draws around the pole goes to about 77°S (the `far.bin`,
which the engine uses for the distant mountains on the horizon), but a site can only be chosen down
to 84°S, where the fine terrain exists (card E2). Nothing on the screen shows this limit: the user
clicks on a mountain between 84° and 77°S and gets the out-of-area warning. Tested on 06/11/2026:
a click about 32 px from the center of the pole, with the camera in the initial position, already
falls outside the area. It came from PR #9.

**What to do.** Draw a subtle ring in the scene at the latitude of the `areaMaxLatDeg` from
`public/data/relief/manifest.json`, with a token color, following the terrain so it doesn't
disappear behind the mountains. Darkening the terrain outside the area was ruled out in the PR #9
review: on screen, it would be confused with shadow, which is what the site is about.

**Done when.** With the camera in the initial position and at the minimum distance, the ring
appears at 84°S; a click inside it chooses the site and one outside gives the warning; and `verify`
passes.

**How it turned out.** `src/scene/areaRing.js` computes 720 points at the latitude of the
`areaMaxLatDeg`, each one 300 m above the coarse terrain at that spot (read from `far.bin` by C3's
`reliefHeightAtM`), and `src/scene/AreaRing.jsx` draws the loop as a thin line in the
`--color-text-muted` color. The line neither casts nor receives shadow and doesn't take part in the
click (raycast turned off): a click on top of it still reaches the terrain. In `LunarScene.jsx`,
only the import and the line that mounts the ring.

**Verified** on 09/11/2026, with `npm run build` + `npm run preview`, on Edge 157 with the Intel
Iris Xe of Marco's laptop, with the reduced-motion request on so the camera wouldn't move:
- In the initial position, the ring appears around the pole, with a radius of about 21 px. Clicking
  from the center outward, every 2 px, up to 20 px the site is chosen; from 22 px on, it isn't.
- At the minimum distance, with the camera tilted until it is above the ring, it appears as a
  continuous line over the terrain. A click 6 px inside chooses the site; 6 px outside gives the
  warning "Landing sites can be chosen between the south pole and 84°S.".
- The cost per frame (C4's script, 3 runs of each, alternating before and after) was about
  6.0 ms without the ring and 6.1 ms with it. The fps stayed at 144, the screen's limit.
- In the console, only the usual `THREE.Clock` warning.

### C9 · Draw the scene only when something changes

**Status:** done on 11/11, PR #22 · **Depends on:** nothing

**What it is for.** The `<Canvas>` draws the scene 144 times per second on a 144 Hz screen (60 on
a 60 Hz one), even with the Moon still. Measured in C4, on 08/11/2026: with the reduced-motion
request, the Moon doesn't spin and each frame costs the same 6 ms as when it spins. This drains the
battery and heats the laptop without changing anything on screen.

**What to do.** `frameloop="demand"` on the `<Canvas>` in `src/scene/LunarScene.jsx`: React Three
Fiber then draws only when something changes (controls, light, C3's marker). Check that the
automatic spin, dragging with `enableDamping` and changing the light's date still draw; whatever
changes the scene outside React requests a frame with `invalidate()`.

**Done when.** With the Moon still, the scene draws no frames at all (counting
`requestAnimationFrame` on the canvas, or in the DevTools Performance tab); when spinning, dragging
and changing the date, everything shows up as before; and `verify` passes.

**What changed from "What to do":** `frameloop="demand"` alone made the Moon stop spinning on its
own. It drew one frame and stayed in place. The spin step in each frame (2.6 × 10⁻⁵ rad, with the
glide) is far below what three-stdlib's `OrbitControls` counts as a change (`EPS =
1e-6`, compared with 6.9 × 10⁻¹⁰), and so it doesn't call `invalidate`. It ended up like this:
`always` while the Moon spins on its own, and `demand` when it is still (after the user interacts,
card C5; with a site chosen, card C10; or with the reduced-motion request). The waste C4 measured
was precisely with the Moon still.

**Verified** on 11/11/2026, with `npm run dev`, in a Chromium (the browser in the Claude app), with
the "Animation effects" of Marco's Windows turned on. Frames were counted with three's
`renderer.info.render.frame`:

| Situation | `develop` before | With C9 |
|---|---|---|
| Spinning on its own | 300 frames in 5 s | 300 in 5 s (`always`), and the camera moves |
| Still, after the wheel | 300 in 5 s | 0 in 10 s (`demand`), with the Moon zoomed in on screen |
| Drag and glide | (always draws) | frames during the drag, 75 during the glide, then 0 in 10 s |
| Click near the pole | (always draws) | 2 frames, the marker 0.5 px from the click and the panel with the site's sky; then 0 in 8 s |
| Date 7 days later (changed in the `App` state, because the control is wired up by E14) | (always draws) | 5 frames, the light in another direction and the shadow on the new side; then 0 in 8 s |
| Window at tablet size | (always draws) | 2 frames, the scene at the new size; then 0 in 6 s |

Marco checked it the same day, in his Edge, with `npm run dev` and the DevTools "Frame Rendering
Stats": it worked.

- **For C6:** Drei's `PerformanceMonitor` measures inside `useFrame`, so it only measures when the
  scene draws. With the Moon still there is no frame to measure: the measurement has to happen while
  it spins or while the user interacts, or C6 requests a few frames just to measure.

### C10 · Stop the spin when a site is chosen

**Status:** done on 10/11, PR #20 · **Depends on:** C5 (done)

**What it is for.** Today, the site chosen with Ctrl, Shift or Cmd+click goes off moving with the
Moon: that click chooses the site, but doesn't stop C5's spin. The same will happen with I2's list.
It came from the PR #13 review.

**What to do.** The `site` already reaches the scene as a prop. With
`autoRotate={!reducedMotion && !hasMoved && !site}` in `src/scene/LunarScene.jsx`, the click with a
key and the list are covered without touching I2. Stopping the spin in `handleMoonClick` would
cover only the click, so it was left out.

**How to test** (`src/scene/LunarScene.test.jsx`). With the same stand-ins as C5: a test calls
`rerender` with `site`, without calling `onStart`, and `autoRotate` goes to `false`.

**Done when.** The test above passes; the README line (section "Accessibility") no longer says
"without Ctrl, Shift or Cmd"; and `verify` passes.

**Verified** on 10/11/2026, with `npm run dev`, in a Chromium (the browser in the Claude app), with
the "Animation effects" of Marco's Windows turned on, reading the controls' `autoRotate` and the
camera position from the page (frames advanced with React Three Fiber's `advance`, as in C5):
- Shift+click near the pole: the site was chosen, the marker appeared and `autoRotate` went to
  `false` with `hasMoved` still `false`, that is, the click didn't notify `onStart` and what stopped
  the spin was the chosen site. After the rest of the glide, the camera stayed still for 1,100
  frames.
- Regular click, on a reloaded page: it chose the site and stopped the spin through `onStart`, as
  in C5.
- Marco checked it by eye in his browser, the same day, with `npm run dev`: Shift+click near the
  pole, without touching the Moon first, chose the site and stopped the spin.
- In C5's test, the final `rerender` now changes the date, not the site: with C10, a chosen site
  already stops the spin, and that part would pass even with C5 broken. Verified with a break that
  forgets `hasMoved` when the scene draws again: the test with the date fails, the one with the
  site passes.

**Open.** A way to pause from the keyboard before the user chooses any site (WCAG 2.2.2 together
with 2.1.1, "everything operable from the keyboard"). We decide after I2.

### C11 · The shadow with a grazing Sun

**Status:** to do; suggested in the C6 review, on 13/11 · **Depends on:** nothing

**What it is for.** In the C6 review, a Node simulation of three's shadow (C2's 2048-pixel map,
with a `normalBias` of 0.0002 Moon radius, about 347 m) compared the drawn shadow with a ray traced
to the Sun on the 80 m data. With a grazing Sun, the two disagreed on 28% of the points facing the
Sun, on average, and up to 73% on one tile, with any mesh step. Most of it is missing shadow: on
one tile, with a `normalBias` 4 times smaller, the part in shadow went up from 13% to 46%. Not
verified in the browser.

**What to do.** Measure in the browser, at a spot with a long shadow, how much of the shadow
disappears with today's `normalBias` (`src/scene/LunarScene.jsx`) and with a smaller one, and see
whether the stripes it prevents come back (C2's "shadow acne").

**Done when.** The browser numbers are in this card, and the team has decided whether the
`normalBias` changes.

### C12 · Smooth the edges without MSAA

**Status:** to do; suggested by C6, on 13/11 · **Depends on:** C6

**What it is for.** In C6, antialiasing (MSAA) was removed from the `<Canvas>`: it doubled the time
of each frame on the graphics card, and on the Intel UHD 630 with the window maximized the fine
terrain turned off. Without it, up close the image barely changes, but from far away the Moon's
edge looks jagged.

**What to do.** See whether an FXAA pass (its code comes with three, in `three/examples`, with no
new dependency) smooths the Moon's edge without bringing the cost back: it paints the whole screen
one more time, about 1 ms (not measured). It changes the way the scene draws (the frame goes
through an intermediate image), so the fine terrain's stencil and the shadow need to be checked
along with it.

**Done when.** The Moon's edge from far away looks smooth when checked by eye, the cost measured on
CIT-DES06 with the window maximized stays below 1.5 ms extra, and `verify` passes.

### Mission simulation (cards C13 to C16)

Proposed by Marco on 17/11/2026. **The four cards wait for Enzo's OK**: they bring back "Story
mode", from "Out of scope for now", and they add files to the engine. The reasoning, the
feasibility numbers and the sources are in
[`docs/mission-simulation-plan.md`](mission-simulation-plan.md); the cards below are what each PR
delivers.

The idea in one sentence: choose a launch site on the Earth and see the path a spacecraft would
follow, under the real gravity of the Earth, the Moon and the Sun, to reach the chosen site inside
one of its landing windows. It is a reference mission computed by the engine, not the flight plan
of IM-2 or of Artemis III, and the screen says so.

### C13 · The launch sites on the Earth, in a view to scale

**Status:** built on 18/11, on the branch `feat/c13-vista-da-missao`, which was born from the plan's
branch; it waits for Enzo's OK and for the PR number · **Depends on:** nothing

**What it is for.** The mission starts at a launch site, and today nothing in the site knows a
point on the Earth. And the system view cannot hold a mission: there the Earth is drawn about 9
times too big for its distance to the Moon, so an orbit 185 km up would be inside it.

**What to do.**
1. `src/data/launchSites.js`: the launch sites that have sent a mission to the Moon, one object
   per site, with `id`, `name`, `operator`, `lat`, `lon`, the missions and `sourceUrl`.
   Coordinates from GCAT (J. McDowell, CC-BY); the missions, from each agency's page. A row
   without a source does not enter. The starting list and what is still not verified are in the
   plan, "Data and sources". GCAT and each agency's page go into `CREDITS.md`.
2. The rows copied from GCAT go to `scripts/references/`, and `src/data/launchSites.test.js` ties
   the list to them, as `sites.test.js` does with the Artemis III outlines: a changed digit fails.
3. `src/engine/earthSite.js`: where a point of the Earth is in space at an instant, from its
   latitude and longitude (`ObserverVector` of the astronomy-engine), in the same drawing frame
   as `system.js`.
4. `src/scene/MissionView.jsx`, the third view of the selector in `App.jsx`: the Earth and the
   Moon with their real sizes and their real distance, the Earth turning with the clock, the
   Moon's orbit, the star sky and the sunlight from the right side, and a marker on each launch
   site. Buttons take the camera to the Earth and to the Moon: to scale, the Earth is a dot when
   the whole orbit fits on screen.
5. The Earth and the Moon are already drawn in `SystemView.jsx`. Move what the two views share to
   files of its own instead of copying it.
6. The list of launch sites, as a `<select>`, is the way to choose with the keyboard; the chosen
   site's marker is highlighted. Texts in `src/data/missionView.js`.

**How to test.**
- `earthSite.test.js`: the site is at the Earth's radius from the center; one sidereal day later
  (23 h 56 min) it is back in the same direction; its latitude in space matches the one typed, to
  the 0.2° that separates the two ways of measuring latitude on a flattened Earth; and one case
  against an outside reference (JPL Horizons should give the vector between a point on the
  Earth's surface and its center; not verified).
- `MissionView.test.jsx`, with the Canvas replaced as in `SystemView.test.jsx`: the accessible
  name, the list of sites, and that the text says the view is to scale.

**Done when.** In `npm run dev`, the Mission view shows the Earth to scale with every launch site
of the list in its place (checked by eye against a map for at least three of them), the list
chooses a site with the keyboard alone, every row has its source in the file and in `CREDITS.md`,
and `verify` passes.

**How it turned out.**
- **The list has 15 launch pads**, one row per pad: Kennedy LC-39A and LC-39B, Cape Canaveral
  SLC-41, Wallops, Vandenberg, Kourou, Baikonur, Vostochny, Xichang, Wenchang, Sriharikota,
  Tanegashima, Kagoshima (now Uchinoura), Mahia and Alcântara. The coordinate of each one is the
  pad's, from GCAT's launch points table, with the 4 decimals it gives. Vandenberg and Kagoshima
  were not in the plan's starting list: the GCAT launch log has a launch to the Moon from each
  (Clementine and Hiten).
- **Each pad carries one launch to the Moon that left from it**, with the time from the GCAT
  launch log; it is not necessarily the most recent one. Two of them the log does not call by
  name (SMART-1 rode along with two satellites, and Clementine appears as DSPSE): for those, the
  link between the mission and the launch comes from NASA's page, and the time, the site and the
  pad match the GCAT row. Alcântara enters with none: the log has 104 launches from there, none
  to the Moon (read on 18/11/2026).
- **Not decided by Marco or Enzo yet, and done as the plan proposed:** Alcântara is in the list,
  and Kennedy has two rows (39A, from where IM-2 left, and 39B, the Artemis pad). Taking a row out
  is deleting it from `launchSites.js` and from the copied GCAT rows.
- **The engine:** `earthSiteKm` and `earthSiteEquatorialKm` (`src/engine/earthSite.js`). Against
  JPL Horizons, for Kennedy and Mahia over one day each, the difference is 19 to 21 m.
- **A defect found on the way, and fixed: the Earth of the system view was turned wrong.** Its
  orientation (`earthMatrix`, in `src/engine/system.js`) came from the astronomy-engine's
  `RotationAxis`, as the Moon's does. For the Earth that gives the right pole and the wrong turn:
  against the position of a ground point, which matches Horizons, the continents were 0.88° off in
  longitude in February 2025 and 0.56° in November 2026 (60 to 100 km at the equator), and 134° off
  on 01/01/2000. Nobody could see it in the system view; in the mission view, the mark of a launch
  site would fall in the sea. `earthMatrix` now comes from the position of three ground points,
  the same calculation as the launch sites, and a test ties the two together. The Earth of the
  system view turned by that much.
- **What the two views share moved to files of its own:** the Earth (`EarthBody.jsx`), the Moon
  (`MoonBody.jsx`), the image becoming a texture (`useBodyTexture.js`), the reading of a color
  token (`cssToken.js`), the clock (`useViewClock.js`) and its row of controls (`ViewClock.jsx`).
  `SystemView.jsx` shows the same as before. The layout classes of `SystemView.css` are used by
  both views.
- **Choosing a launch site in the list turns the camera to it** (the `facing` of
  `ZoomControls.jsx`). Without that, someone using only the keyboard could choose a site on the far
  side of the Earth and never see it: the camera only turns with the mouse.
- **The marks can be clicked** (asked by Marco on 18/11): a click on a mark chooses that site, and
  the camera stays where it is, because whoever clicked is already looking at it. The rule is in
  `src/scene/missionPicking.js`, with three cautions: the end of a drag is not a click (the same
  4 pixels as the click on the Moon); a mark on the far side of the Earth is not chosen through
  it; and on marks that sit on top of each other, each click goes to the next one. Around each
  mark there is an invisible area 5 times its size, about 24 pixels wide with the whole Earth on
  screen, so the click does not have to hit a 5-pixel dot. The list is still the way to choose
  with the keyboard: the scene does not receive focus.
- **The marks shrink as the camera gets close**, to stay the same size on screen. With a fixed
  size, up close a mark was a 140 km disc over the site, covering the coast and its own name. With
  the whole Earth on screen, the two Kennedy pads and Cape Canaveral, a few km apart, have their
  marks on top of each other: the list is what tells them apart.
- **The image of the Earth is 2048 pixels wide**, 20 km per pixel at the equator: up close the
  coast is blurred, and the night side is dark. A sharper image is a new card, if needed.

**Verified** on 18/11/2026, with `npm run dev` in the app's browser pane (Chromium), at 1500 × 950:
- Choosing Kennedy LC-39A turns the camera to Florida, and the mark is on its east coast;
  Alcântara is on the north coast of Brazil, at the coastline; Baikonur is east of the Caspian Sea.
  Mahia and Tanegashima were on the night side at the time, where the coast cannot be told.
- The panel of the chosen site shows the coordinate and the launch: "28.6083° N, 80.6041° W" and
  "IM-2, 27 Feb 2025" for Kennedy, "None so far" for Alcântara.
- "Whole orbit" shows the Moon's orbit with the Earth as a dot in the middle, and "Moon" goes to
  the Moon. Playing, the clock moved 18 hours in 3 seconds.
- The system view shows the same bodies, names and buttons as before, and "Follow the Earth" still
  takes the camera to it.
- The console had no error, apart from the usual `THREE.Clock` warning.
- Each new test fails on its own error: the equator of the date in place of J2000's, the longitude
  with the sign swapped and a site 100 km up, in `earthSite.test.js`; the groups of the list
  swapped, east and west swapped, and the camera left on the Moon when a site is chosen, in
  `MissionView.test.jsx`. The click rule was written test first: with a skeleton that chose
  nothing, 6 of its 8 tests failed, and the 2 that passed are the ones that expect nothing.
- The click on a mark, with the mouse: over the mark in Central Asia the cursor becomes a hand,
  and the click chooses Baikonur, with its numbers, without moving the camera. Over the place where
  Vandenberg is, behind the Earth, the cursor does not change and the click does nothing. Dragging
  the Earth with the mouse starting on the Sriharikota mark turns the Earth and chooses nothing.
  Four clicks on the three marks of Florida, one on top of the other, went through LC-39B, LC-39A,
  SLC-41 and back to LC-39B.
- With the keyboard: with the focus on the list (the focus ring shows), the down arrow goes to the
  next site, the camera turns to it and its numbers change; Shift+Tab from the list reaches the
  camera buttons.
- Marco checked the view and the click on the marks in his own browser on 18/11, before the
  commits.
- Not verified: with the request for less motion turned on, on a touch screen, and in a browser
  other than Chromium.

### C14 · The propagator, checked against a flown trajectory

**Status:** proposed on 17/11; waits for Enzo's OK · **Depends on:** nothing

**What it is for.** To draw an orbit that is real, the engine has to move a spacecraft under
gravity. This card is only that: given a position, a speed and an instant, where the spacecraft
is later. Card C15 uses it to design the mission.

**What to do.**
1. `src/engine/orbit.js`, plain JavaScript:
   - the gravity of the Earth, plus the Moon and the Sun as third bodies, as point masses, with
     the constants from JPL (*Astrodynamic Parameters*, DE440; `CREDITS.md`);
   - the Moon and the Sun read from the astronomy-engine once, into a grid in time, and
     interpolated: calling the ephemeris at every step is what would make it slow;
   - a fixed-order integrator (RK4) whose step follows the distance to the Earth and to the Moon;
   - the "closest pass by the Moon" event, which card C15 aims at.
2. `scripts/references/`: a script that fetches from JPL Horizons the as-flown states of Artemis I
   (object −1023, geocentric, ICRF) in a stretch of coast with no burn, and the fixture it
   generates in `src/engine/fixtures/`.

**How to test** (`orbit.test.js`, test first).
- With only the Earth: a circular orbit closes in the period the formula gives, and the energy
  does not drift.
- Against the fixture: the position after 24, 48 and 68 hours stays within a limit written in the
  test. In the draft of 17/11 the difference was 17, 43 and 56 km.
- The same test with the Sun switched off, and with the Moon switched off too, has to fail: in
  the draft they gave 660 km and 2,470 km. A reference that every model passes proves nothing.

**Done when.** The three groups of tests pass, the differences measured against Artemis I are
written in this card, no file in `src/engine/` imports React, and `verify` passes.

### C15 · The mission in the engine: from the launch site to the landing window

**Status:** proposed on 17/11; waits for Enzo's OK · **Depends on:** C13 (the launch sites) and
C14 (the propagator)

**What it is for.** Given a launch site, a landing site and one of its landing windows, compute
the mission: when to launch and in which direction, the burns, and the path, phase by phase.

**What to do.**
1. The mission's parameters in `src/engine/config.js`, each with its reason and its source: the
   height of the parking orbit, the crossing time, the height of the lunar orbit, how long the
   spacecraft stays in it, and where in the window the landing is aimed. The values are decisions
   of Marco and Enzo (plan, "Decisions that are not Claude's to make").
2. `src/engine/mission.js`, in the order of the plan's "How a mission is calculated": the launch
   time with the lowest tilt, the first guess with only the Earth, and the aiming by Newton's
   method on three choices (the speed at the end of the burn, where on the parking orbit it
   happens, and the tilt of the launch plane) against three targets (the height of the pass over
   the Moon, the lunar orbit plane containing the landing site, and the arrival time), with the
   Moon and the Sun switched on in steps. Then the lunar orbit and the descent ellipse.
3. The climb from the pad and the powered descent are not integrated: they are a smooth curve
   between two computed points, and the result marks them as `schematic`.
4. `src/workers/mission.worker.js` and `src/hooks/useMission.js`: the calculation took 0.5 to
   0.9 s in the draft, too long for the main thread. `useMission` returns `{ status, mission }`
   with the same four `status` values as `useSiteSky`.
5. The format of `mission` goes into "What the bridge delivers to the screen", telling Miguel
   the same day. Draft, to be closed in the PR: the instants (`launchUtc`, `tliUtc`, `loiUtc`,
   `landingUtc`), the numbers (launch direction, tilt of the parking orbit, the speed change of
   each burn, the crossing time, the tilt of the lunar orbit) and `segments`, one per phase, with
   the phase, whether it is `integrated` or `schematic`, whether its points are counted from the
   Earth or from the Moon, and the points with their instants.

**How to test** (`mission.test.js`, test first).
- The launch site is in the plane of the parking orbit at the launch instant, and the tilt of
  that orbit is never smaller than the site's latitude.
- The burn that leaves the Earth is along the direction of motion.
- The pass over the Moon is at the configured height, the lunar orbit plane contains the landing
  site, and the landing falls inside the window.
- The instants come in order: launch, burn, arrival, landing.
- It converges for a spread of dates over one month and for sites at different latitudes, the
  equator included (35 cases converged in the draft).
- A window that no path reaches gives `error`, and not a wrong path.

**Done when.** The tests pass; the time of one mission is measured in the browser, on Miguel's
laptop as well, and written in this card; the simulated launch for the IM-2 landing from pad 39A
is compared with the real one (26/02/2025, 7:16 p.m. EST, NASA) and the difference is written
here, as a note and not as a pass or fail, because IM-2 flew its own profile; the bridge table has
the new format; and `verify` passes.

### C16 · The mission on screen: the path, the clock and the numbers

**Status:** proposed on 17/11; waits for Enzo's OK · **Depends on:** C13 (the view) and C15 (the
bridge)

**What it is for.** Show the mission of card C15 in the view of card C13.

**What the person sees when the card is done.** In the Mission view, with a site chosen on the
Moon: a list of that site's landing windows and the list of launch sites. Choosing both draws a
line from the launch site, around the Earth, across to the Moon, around it and down to the landing
site. The integrated stretches and the schematic ones have different lines. A clock, with play and
a cursor, moves a dot along the line, with the Earth turning and the Moon moving at the same
instant. Next to it, the numbers: launch time and direction, each burn, the crossing time, the
landing time.

**What to do.**
1. In `MissionView.jsx`, the lines of `mission.segments`, the dot of the spacecraft at the
   clock's instant, and a name at each event (launch, leaving the Earth, arriving at the Moon,
   landing). The stretches counted from the Moon are drawn on the Moon, and move with it.
2. A button takes the camera to the spacecraft, next to the ones for the Earth and the Moon.
3. One text for each state: no site chosen on the Moon, the site has no landing window in the
   period, calculating, no path found, and the mission. All in `src/data/missionView.js`.
4. The texts that say what is real and what is not (plan, "What real means here"), as the system
   view does with its scale.
5. The clock does not start on its own, and with the request for less motion the camera does not
   glide (README, "Accessibility").

**How to test** (`MissionView.test.jsx`). One case for each state of item 3, with the bridge
replaced; the numbers on screen are the ones the bridge gave; the clock moves without changing
the calculation date.

**Done when.** In `npm run dev`, choosing a site, a window and a launch site draws the mission and
the clock moves the spacecraft from the pad to the landing; everything works with the keyboard
alone; Marco has checked it in the browser before the commit; the README's "What already exists"
tells about the view; and `verify` passes.

---

## I: Miguel

### I1 · Panel with the numbers for the chosen site

**Status:** done on 08/11, PR #11 · **Depends on:** nothing to start; the format in "What the
bridge delivers to the screen" is enough

**What it is for.** It is the part that answers in text: "from here, do the Sun and the Earth show
up? Until when? When can we land?". It is what the judges will read.

**What the user sees, in each `status`.**
- `idle`: the text that already appears today ("Choose a landing site to see when the Sun and the
  Earth are above its horizon.").
- `loading`: a notice that it is calculating, with no old numbers on screen.
- `error`: a short sentence saying that site could not be calculated and to try another one.
- `ready`:
  - **Sun now** and **Earth now**: in view or hidden by the mountains, and the elevation in degrees;
  - **Next sunset**: date and time in UTC, or a text saying the Sun doesn't set in the period;
    with the Sun hidden the whole period (`sunFraction` 0), a text saying so, because
    `nextSunsetUtc` also comes as `null` in that case (PR #11 review);
  - **Sunlight in the period**: percentage;
  - **Longest darkness**: in hours;
  - **Landing windows**: the list of start and end in UTC, or a text saying there is no window in
    the period.

**What to do.**
1. `src/data/panel.js` with all the texts, in English. Move there the `panel.empty` that is
   currently in `src/data/app.js`.
2. `src/panel/format.js` with three small functions:
   - degrees with one decimal place and the ° symbol;
   - percentage: `new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 1 })`
     (0.855 becomes "85.5%");
   - date in UTC: `new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', dateStyle: 'medium',
     timeStyle: 'short' })` (becomes "14 Nov 2026, 03:00"; add " UTC" after it).
3. `src/panel/SitePanel.jsx`: receives `status` and `sky` through props and shows what is above.
4. `src/panel/SitePanel.css`, with tokens only.
5. In `App.jsx`, replace the line `<p className="app__empty">{app.panel.empty}</p>` with
   `<SitePanel status="idle" sky={null} />`. E11 wires up the rest.
6. The new files in the README's "Structure" block.

**How to test** (`src/panel/SitePanel.test.jsx` and `src/panel/format.test.js`). Write the test
before the component: it fails first, and then you make it pass. Test results stay inside the test
file itself, never in `src/data/`.
- One test for each `status`.
- `ready` with `nextSunsetUtc: null` shows the "doesn't set" text.
- `ready` with `landingWindows: []` shows the "no window" text.
- The time comes out in UTC: with `new Date('2026-11-14T03:00:00Z')`, the screen shows 03:00. The
  suite runs in the Tokyo time zone on purpose: if the formatter forgets `timeZone: 'UTC'`, 12:00
  appears, and the test catches it (verified on 29/10/2026).

**Careful.** A negative `elevationDeg` with `visible: true` is not an error (see "What the bridge
delivers to the screen"). Show both as they arrive.

**The minimum window: 24 h.** The panel only lists windows that last at least
`MIN_LANDING_WINDOW_HOURS` (`src/engine/config.js`). The value was provisional, 144 h, and was set
to 24 h by Enzo's decision on 12/11 (card I6), with this measurement, made on 30/10/2026 with
`node scripts/prepare-data/window-lengths.mjs`: the percentage of the comparison points with NASA
that have at least one window of this length, counting from 14/11/2026.

| Points | Period | ≥ 24 h | ≥ 72 h | ≥ 144 h |
|---|---|---|---|---|
| the 10 most illuminated on the NASA map | 30 days | 100% | 100% | 90% |
| the 10 most illuminated on the NASA map | 365 days | 100% | 100% | 100% |
| random sample from 85° to 90°S (259 points) | 30 days | 58% | 49% | 38% |
| random sample from 85° to 90°S (259 points) | 365 days | 78% | 70% | 59% |
| random sample from 84° to 85°S (113 points) | 30 days | 50% | 41% | 35% |
| random sample from 84° to 85°S (113 points) | 365 days | 72% | 66% | 56% |

The random sample has bright points and dark points on purpose, in ten bands of sunlight.

**Done when.**
- The four `status` values look different on screen.
- The tests above pass.
- No text outside `src/data/panel.js` and no color outside the tokens.
- `verify` passes.

### I2 · List of landing sites

**Status:** done on 11/11, PR #23 · **Depends on:** P1 for the real data; the component starts before,
with test data

**What it is for.** It is the fastest way to see a result: choosing "Athena (IM-2)" from a list,
instead of searching for the site on the Moon. It is also the way to choose from the keyboard.

**What to do.**
1. `src/panel/SiteList.jsx`: a `<select>` with a `<label>`, with the sites grouped by type
   (`<optgroup>`): "Landed" for those that have already landed and "Artemis III candidate regions"
   for the candidate regions, which have no landing date. By type, and not by agency: with the
   planned sites (IM-2 and the 9 candidate regions), agency would give an "Intuitive Machines" group
   with one site and a "NASA" one with nine, and wouldn't say that nobody has landed in the
   candidate regions (Enzo's decision). Why a plain `<select>`, and not a custom-drawn list: it
   already works with the keyboard and with a screen reader with no effort at all. A nicer list is
   left for later, if there is time.
2. On choosing, call `onSelect(site)`, which `App.jsx` wires up in E14.
3. When P1 delivers the spreadsheet: `src/data/sites.js`, one object per row, in the format
   `{ id, name, mission, agency, lat, lon, landedAtUtc, sourceUrl }`. A row without a source doesn't
   go in. Only the sites the site calculates go in, the ones inside the terrain, down to 84°S (card
   E2): a site north of that would give an error in the panel. That's why the list ships with IM-2
   only: the 9 Artemis III candidate regions were left for card E16 (formerly I7), and the other
   sites in the spreadsheet wait for card E8.

**How to test.**
- `src/panel/SiteList.test.jsx`: choosing an option with `userEvent.selectOptions` calls
  `onSelect` with the right site (the test sites stay in the test file itself).
- `src/data/sites.test.js`: every site has a `sourceUrl` starting with `https://`, `lat` between −90
  and 90, `lon` between −180 and 180, no `id` repeats, and every site is inside the area with
  terrain, by `isInsideReliefArea` (`src/engine/reliefFiles.js`) with the `areaMaxLatDeg` from
  `public/data/relief/manifest.json`: the same rule with which the engine rejects the site and the
  click on the scene blocks it.

**Done when.** The tests pass, it is possible to choose with the keyboard only (Tab to the list,
arrows, Enter), and `verify` passes.

### I3 · Site font

**Status:** done on 11/11, PR #24 · **Depends on:** nothing; agree on the choice with whoever does V2

**What it is for.** Today the site uses the system's default font, which changes from one computer
to another. A font of its own makes the site look the same on any machine, including the judges'.

**What to do.**
1. Choose between Fira Sans and Overpass, the fonts of the Space Apps visual identity. Show both to
   the team before deciding.
2. Install through npm: `npm install --save-exact @fontsource/fira-sans` (or `@fontsource/overpass`).
   Verified on 29/10/2026: both exist on npm, at version 5.3.0, with the OFL-1.1 license.
   A new dependency needs Enzo's OK: this card is the OK.
3. In `src/main.jsx`, import only the three weights the tokens use (400, 500 and 600):
   `import '@fontsource/fira-sans/400.css'`, and the same for 500 and 600.
4. In `src/styles/tokens.css`, put the font name at the start of `--font-sans`.
5. A line in CREDITS.md, with the license.

Why through npm, and not through the Google Fonts link: the font file ships with the site, so it
shows up even if Google's server is slow or blocked on the day, and the version stays pinned in
`package.json`.

**Done when.** In DevTools > Network, the font comes from the site itself; CREDITS.md has the
license; `verify` passes.

### I4 · Choose the date and time, in UTC

**Status:** done on 09/11, PR #17 · **Depends on:** nothing

**What it is for.** The result changes with the date: the same site can be in sunlight today and in
the dark a week from now. Missions work in UTC, and so does the site.

**What to do.**
1. `src/panel/DateTimeControl.jsx`: an `<input type="datetime-local">` with the label "Date and
   time (UTC)" and a "Now" button. The texts in `src/data/panel.js`.
2. **The most likely error in this card:** `datetime-local` doesn't store a time zone, and
   `new Date(valor)` reads the value in the computer's time zone. Read it as UTC:
   `new Date(valor + ':00Z')`. To put a date into the field: `data.toISOString().slice(0, 16)`.
3. On change, call `onChange(dateUtc)`, which `App.jsx` wires up in E14.

**How to test** (`src/panel/DateTimeControl.test.jsx`).
- Typing `2026-11-14T03:00` results in a `Date` with `getUTCHours() === 3`. The suite runs in
  Tokyo: with `new Date(valor)`, without the `Z`, the result would be 18:00 UTC on the 13th, and the
  test fails. That is the error it is there to catch (verified on 29/10/2026).
- The "Now" button uses the current time: pin the time in the test with `vi.setSystemTime`.

**Done when.** The tests pass, it works with the keyboard only, and `verify` passes.

### I5 · Run the terrain script from scratch, following only the README

**Status:** done on 12/11, PR #29 · **Depends on:** nothing

**What it is for.** The terrain the site uses (`public/data/relief/`) comes from a script, and so
far only Enzo has run that script. If its README depends on something that only exists on Enzo's
computer, nobody else can generate the terrain again. Card E2 only closes for good when another
person runs everything from scratch, reading only the README.

**What to do.**
1. In an up-to-date clone of `develop`, follow `scripts/prepare-data/README.md` from step 1 to 4,
   in order, without skipping anything. The two NASA downloads add up to about 410 MB.
2. If any step doesn't turn out as the README says, stop there and write down the step, the command
   and the whole output. Don't fix it on your own: what was missing belongs to the README, and the
   fix is up to Enzo.

**Done when.** This card has a line with the date, the Python version (the first line of the output
of step 2) and the output of step 4, which is `OK: os recortes gerados são idênticos aos do
repositório` or whatever appeared instead. With it, Enzo checks off the missing criterion in card
E2.

**Result.** 12/11/2026 · `Python 3.12.10` · step 4:
`OK: os recortes gerados são idênticos aos do repositório`.

Run by Miguel on his computer, with Windows 11, in the folder `C:\umbraview`: `develop` up to date,
with no `data-raw/`, no `.venv/` and no pip cache before starting. Steps 1 to 4 were done in order,
each block pasted into the shell the README asks for, and all of them finished without errors. Step
3 gave the three lines the README expects, ending in `OK: 332 ladrilhos, 334 arquivos,
43.5 MB em public/data/relief; maior arquivo far.bin, 1.29 MB`.

**What the README does not say, or makes confusing.** Noted for Enzo; the README was not changed.
1. **Time.** The README doesn't say how long steps 1 and 3 take (steps 5 and 7 do). Measured
   here: step 1 took about 10 min (4 min 37 s and 5 min 15 s, average of 660 KB/s); step 2,
   less than 1 min; step 3, about 2 min.
2. **Python's space.** The README asks for "about 410 MB free ... not counting the Python
   environment" and doesn't say how much it takes up. The `.venv/` ended up at 167 MiB (2,796
   files), from about 44 MB downloaded from PyPI (numpy 12.6 MB, rasterio 30.7 MB, the rest small).
   With the NASA files, about 600 MB.
3. **Step 1 without a confirmation line.** Besides the progress bar, the README doesn't say which
   output shows that the download worked. What checks it is step 3, through the SHA-256.
4. **MB and MiB.** `curl` shows the size in MiB (180.3M and 208.8M), and the README talks in MB
   (189 and 219). They are the same files (189,158,392 and 218,961,039 bytes), but whoever checks
   by the screen may think the download came out smaller.
5. **Long lines.** Copied from a narrow screen (here, Claude Code's), the address of each `curl` in
   step 1 wrapped onto the next line by itself, and PowerShell would receive `curl` without the
   address; in step 2, the `pip` line broke and a piece of it appeared repeated. On GitHub and in
   VS Code, each command stays on one line. The blocks for steps 1, 2 and 4 were pasted from a copy
   with each whole command on one line, with the same text as the README; the step 4 line is about
   190 characters long.

### I6 · Say in the panel what the period is and how long each window lasts

**Status:** done on 12/11, PR #28 · **Depends on:** I1 (done)

**What it is for.** "Sunlight in the period" and "Longest darkness" don't say what the period is:
whoever reads 85.5% doesn't know if it is for a week or a year. The same goes for the two panel
texts that end in "in this period" (the sunset one and the window list one). The period starts on
the chosen date and lasts `PERIOD_DAYS` days (`src/engine/config.js`, currently 30). The window
list is also missing how long each one lasts: the reader wants to know how many days are available
to operate, without doing the math in their head. It came from PR #11 (card I1).

**Enzo's decisions on 12/11.** The engine is his, and he authorized the engine changes in this
card.
- The period comes from the engine: `sky` gets `period: { startUtc, endUtc }`. `endUtc` is the last
  calculated instant, the date plus 719 h, because the engine does 720 calculations hour by hour
  from the date (`src/engine/siteSky.js`). If the panel added 30 days, the end would be 1 h after
  the last calculation, a "(continues)" window would seem to end before the period, and the
  `PERIOD_DAYS` rule would be in two places.
- Each window's duration also comes from the engine, because the screen doesn't do math: each item
  of `landingWindows` gets `durationHours`, calculated from its own `startUtc` and `endUtc`, so the
  three never disagree. In the window cut off by the period, it is the duration of the part inside
  it.
- The minimum window (`MIN_LANDING_WINDOW_HOURS`) drops from 144 h to 24 h. The reason is in its
  comment, in `src/engine/config.js`.
- The two new fields go into the table in "What the bridge delivers to the screen", with a notice
  to Marco on the same day.

**What to do.**
1. `src/engine/summary.js`: the `period` and the `durationHours`, and the rows in the bridge table.
2. `src/engine/config.js`: the 24 h minimum window.
3. In the panel, a "Period" row between "Earth now" and "Next sunset", with the start and end in
   UTC through `formatUtc` (`src/panel/format.js`): the two rows above are the first instant of the
   period, and the ones below apply to the whole period.
4. In the window list, each one's duration in front, separated by " · ", through `formatDuration`
   (`src/panel/format.js`): in days and hours ("6 d 4 h"), a whole day without the zero ("2 d"),
   below one day only hours ("18 h"), and below 1 h in minutes ("20 min"), so "0 h" doesn't appear.
   In the window cut off by the period, with "≥" attached to the number ("≥ 18 h"), so it doesn't
   look exact when it isn't. The "d", the "h" and the "min" stay in `format.js`, next to the number,
   like the ° and UTC.

**How to test.**
- `src/engine/summary.test.js`: the period goes from the first to the last calculated instant (with
  the end at 720 h, the test fails), and the duration of a whole window and of a cut-off one is
  exactly the end minus the start.
- `src/engine/config.test.js`: the minimum window is 24 h.
- `src/panel/format.test.js`: the duration in days and hours, the whole day without the zero, only
  hours below one day and minutes below 1 h; a 24 h window with the millisecond cut off doesn't
  become 23 h.
- `src/panel/SitePanel.test.jsx`: `ready` shows the start and end of the period in UTC, and the
  duration of each window, with "≥" only on the cut-off one. The suite runs in Tokyo: if the time
  zone slips, the time comes out wrong and the test catches it.

**Done when.** Whoever reads the panel knows from when to when the period numbers apply and how long
each window lasts, Marco has been notified of the two new fields, the tests pass and `verify`
passes.

### I7 · The 9 Artemis III regions in the list

**Status:** moved to area E, as card E16. The number I7 stays only here, so it isn't used
again.

### I8 · Sunrise and the Earth in the panel

**Status:** done on 15/11, PR #39 · **Depends on:** E18 (done)

**What it is for.** With the Sun hidden now, the panel shows the next sunset ("Next sunset"), which
in that case is the sunset after the next sunrise (`nextSunset`, `src/engine/series.js`), but
doesn't say when the light comes back. It is the first question of anyone looking at a site in the
dark. And the challenge asks for the time until Earthset ("Earthset"), and the panel only said
whether the Earth was in view now. Approved by Enzo on 12/11, together with I6, and expanded by him
to include the Earth in the same PR.

**What the bridge already delivers.** The fields from card E18, in the table in "What the bridge
delivers to the screen": `nextSunriseUtc`, `nextEarthriseUtc`, `nextEarthsetUtc` and
`earthFraction`.

**What to do.** In `src/panel/SitePanel.jsx`, with the texts in `src/data/panel.js`. The rows go
in this order: Sun now, Earth now, Period, Next sunrise, Next sunset, Sunlight in the period,
Longest darkness, Next Earthrise, Next Earthset, Earth in view in the period, Landing windows.
1. **Sunrise.** "Next sunrise", with the date in UTC through `formatUtc`, only with the Sun hidden
   now and `nextSunriseUtc` with a date.
2. **The Sun fix.** The sunset row said "always hidden" (`panel.sunAlwaysHidden`) only with
   `sunFraction` 0. The engine only calls the Sun in view with half of the disk, and `sunFraction`
   also counts the Sun that only grazes the terrain: with a tiny tip of Sun in some hours and never
   half, the panel said the Sun doesn't set, as if it were day the whole period. "Always hidden"
   now means the Sun hidden now and not coming back (`!sky.sunNow.visible && !sky.nextSunriseUtc`).
3. **The Earth.** "Next Earthrise" only with the Earth hidden now and `nextEarthriseUtc` with a
   date. "Next Earthset" with the date; on `null`, "always hidden" with the Earth hidden now and not
   coming back, and "doesn't set" otherwise, as with the Sun. "Earth in view in the period" with
   `earthFraction`, in the format of "Sunlight in the period".

**How to test.** `src/panel/SitePanel.test.jsx`, which runs in Tokyo (a time outside UTC comes out
wrong):
- the Sun in view, without the sunrise; the hidden Sun that comes back, with the sunrise in UTC;
- the Sun that only grazes the terrain (`sunFraction` 0.02, not coming back and not setting) says
  "always hidden"; the hidden Sun that comes back and doesn't set again says "doesn't set";
- the hidden Earth that comes back, in view, in view and not setting, coming back and not setting
  again, and always hidden, and the percentage;
- the order of the labels.

**Done when.** With the Sun hidden, whoever reads the panel knows when the light comes back; the
site where the Sun only grazes the terrain no longer reads "day"; the reader knows when the Earth
comes back, when it sets and how much of the period it stays in view; the tests pass and `verify`
passes.

---

<!-- The P cards go out as a PDF to people who don't use GitHub: write without citing any
repository file. What they need to read goes in the PDF attachments: the data table from CREDITS.md
(appendix A) and the English text of docs/uso-de-ia.md (appendix B). -->
## P: Mateus Berlingieri

None of these cards asks for code. The deliverable goes in a folder shared with the team.

### P1 · Table of landing sites

**Status:** to do · **Depends on:** nothing

**What it is for.** It becomes the list of sites that appears on the site (Miguel builds that part). The
judges will read these
coordinates and dates as fact; a wrong number is a mistake with the team's name on it.

**What to do.** A shared spreadsheet, one row per site, with these columns:

| Column | What goes in | Format |
|---|---|---|
| `name` | short name of the site, in English | text |
| `mission` | name of the mission | text |
| `agency` | agency or company responsible | acronym (NASA, CNSA, ISRO, JAXA...) |
| `lat` | latitude, positive to the north | decimal degrees with a period, from −90 to 90 |
| `lon` | longitude, positive to the east | decimal degrees with a period, from −180 to 180 |
| `landedAtUtc` | date and time of the landing, in UTC; empty for a candidate region | `YYYY-MM-DD HH:MM` |
| `sourceUrl` | link to the source | `https://...` |
| `consultedOn` | day you read the source | `DD/MM/YYYY` |
| `notes` | what someone needs to know (approximate coordinate, two sources that don't agree...) | text |

Which sites: the Apollo landings (Apollo 13 did not land); the Soviet (Luna) and American uncrewed
(Surveyor) landings; Chang'e 3, 4, 5 and 6; Chandrayaan-3; SLIM; the CLPS missions that have
already landed (check the current list on NASA's CLPS page); the Artemis candidate regions; the 4
non-polar sites from the report of the US National Academies (NASEM) of
21/10/2026.

Where to look: in the primary source, such as the mission's page at the agency, the scientific
paper on the landing, or the images of the site taken by the LRO probe (LROC). Wikipedia helps to
find the primary source, but it does not count as the final source.

**Rules.** A row without a source stays out; do not estimate. If two sources give different
coordinates, write down both in `notes` and tell Enzo.

**Done when.** Every row has a source, and Enzo has reviewed it.

### P2 · Credits and licenses

**Status:** to do · **Depends on:** nothing to get started; the music and the typeface come in
when they are chosen

**What it is for.** Space Apps requires every external source used in the project to be cited, with
its license.

**What to do.**
1. In the list of the project's data sources (appendix A of the PDF), the "Condição de uso"
   (conditions of use) column says "a conferir" (to be checked). For each row, open the source's
   link and look for what the page says about use and citation. Copy the sentence and the link.
2. Read the Space Apps 2026 participation terms (the "Legal" page of the site) and check that the
   project's license, MIT, meets what they ask for.
3. Check the license of the music chosen in V3 and of the site's typeface, which
   Miguel chooses.

**Deliverable.** The conditions of use of each source, with the sentence and the link, in a
spreadsheet or a document; Enzo brings it into the project.

**Done when.** No source is left "a conferir".

### P4 · Submission text, in English

**Status:** to do · **Depends on:** P5 helps; review on 13/11, with the submission guide

**What it is for.** The submission is a project page on the Space Apps site, filled in between
14/11, 9:00, and 15/11, 23:59. It is the first text the judges read.

**What to do.** A draft in English, in a shared document, with:
- the problem: why choosing where to land on the Moon depends on sunlight and on seeing the Earth;
- what UmbraView does, in plain language;
- the NASA data used (appendix A of the PDF);
- how the team used AI: the finished text, in English, is in appendix B of the PDF (Space Apps
  requires this description);
- the team.

Along with it, a short paragraph in English that introduces the project, for the code page; Enzo
puts it there. On 13/11, when the
submission guide comes out, adjust the text to its fields.

**Done when.** Enzo has reviewed the draft, and it has been adjusted to the guide on 13/11.

### P5 · Similar tools that already exist

**Status:** to do · **Depends on:** nothing

**What it is for.** The judges will ask "what is new about this?". The answer comes from this
table.

**What to do.** A table with: name, link, who made it, what it shows, who it is for, and what
UmbraView does that it doesn't. Start with NASA Moon Trek and LROC QuickMap, and look for others
that show lighting at the south pole or help plan a landing.

**Done when.** The table has been reviewed with Enzo.

---

## V: Miguel

### V1 · Video script and storyboard

**Status:** to do · **Depends on:** nothing for the script; the recordings depend on the site's
screens being ready

**What it is for.** The video shows the project working for people who will not open the site. It is
put together on Sunday (15/11), with little time: with the script ready beforehand, nobody decides in a rush.

**What to do**, together with Mateus B.:
1. Script in three parts: the problem (why light and the Earth matter for landing), UmbraView
   working (choosing a site, seeing the Sun and the Earth, seeing the landing windows) and the result.
2. Storyboard: one row per scene, with the duration, what appears on screen and the English caption.
3. The list of screen recordings that will be needed, to record when the screen is
   ready.
4. The duration comes from the 13/11 submission guide. Build the script in blocks that can be cut,
   so it works for both a short and a long version.

**Done when.** Script and storyboard in the shared folder, reviewed with Enzo.

### V2 · Visual identity of the team and the project

**Status:** done on 14/11, PR #36 · **Depends on:** nothing

**What it is for.** The logo appears in the video, on the submission page and in the site's icon.

**How it turned out.**
- The Umbra Team and UmbraView logo kit is in `brand/`: SVG, 512 and 1024 px PNG with a
  transparent background, single-color versions and the favicon. The colors, the typeface and where
  to use each version are in `brand/LEIA-ME.txt`.
- The site's icon (`public/favicon.ico`, `favicon.svg` and `apple-touch-icon.png`) is a copy of the one in
  `brand/favicon/`.
- **No NASA round logo, logotype or seal**, also in the video and on the submission
  page: only with NASA's authorization. Writing "NASA Space Apps Challenge 2026" as text is fine.

### V3 · Production kit

**Status:** to do · **Depends on:** nothing

**What to do.**
1. Music: a track whose license allows use in a published video. Write down name, author, link and
   license: Mateus B. checks it (P2) and Enzo records it in the project.
2. Screen recording: OBS Studio (free), set to 1080p. Make a test recording of
   any window, to get the settings right. Record the published site, at the address that is
   in the [README](../README.md).
3. English captions: a template `.srt` file and the style defined (font, size, position).

**Done when.** Everything in the shared folder, with the music's license written down.

### V4 · Final edit

**Status:** to do · **Depends on:** V1, V2, V3 and the hackathon recordings · **When:** 15/11

Put the video together with the hackathon recordings, export it in the format and duration of the
13/11 submission guide and deliver it where the guide asks.

---

## Out of scope for now

Ideas that came up and are not going in now. They go back to the list above only with Enzo's OK.

- Clicking on any point of the whole Moon: the enabled area goes from the pole down to 84°S (card
  E2), and the rest is for later.
- Story mode: telling a mission step by step. Part of it is proposed to come back as cards C13 to
  C16 (the mission simulation), which wait for Enzo's OK; the step-by-step text stays out.
- Asking the local organizers for written confirmation that the team can start before
  14/11 (this was card P3): Enzo decided on 05/11/2026 not to ask. The team follows the guidance of
  its advisor and of the 2025 event organizers, and the risk is accepted in the scope (card E5).
