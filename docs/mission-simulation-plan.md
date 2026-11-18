# Mission simulation: the plan

**Status:** proposed by Marco on 17/11/2026. Nothing here is built yet. It waits for Enzo's OK,
for two reasons: it brings back "Story mode", which is in "Out of scope for now" in the
[backlog](backlog.md), and it adds files to the engine. The work is split into cards C13 to C16 of
the backlog; this page is the reasoning behind them.

## What we want

UmbraView already answers *where* and *when* to land: for a site and a date, the engine gives the
landing windows (Sun and Earth in view at the same time). The missing half is *how to get there*:
choose a launch site on the Earth, and see the path a spacecraft would follow to reach the chosen
site inside one of its landing windows.

On screen it can be simple: the Earth with the launch sites in their real place, a line that
leaves the launch site, goes around the Earth, crosses to the Moon and ends at the landing site,
and a clock that moves a dot along that line. What cannot be simple is the math: the line has to
be an orbit that obeys gravity, not a curve drawn by hand.

## What exists today, and what does not

- **The orbits of the system view are already real.** `moonOrbitPath`, `earthOrbitPath` and
  `systemStateAt` (`src/engine/system.js`) take the positions from the same ephemeris as the rest
  of the engine, and `system.test.js` checks them. What is not real in that view is the **scale**:
  the Earth and the Moon are drawn much bigger than their distance allows, and the Sun is drawn
  near and small (the constants at the top of `src/scene/SystemView.jsx`). The screen says so.
- **That scale cannot hold a mission.** A parking orbit is 185 km above the ground, 3% of the
  Earth's radius. In the system view the Earth is drawn about 9 times too big for its distance to
  the Moon (0.36 units of radius, where the distance scale gives 0.038), so the orbit would be
  inside the Earth. The mission needs a view where the Earth, the Moon and the distance between
  them are in the same scale.
- **There is no launch site, no Earth-fixed point and no spacecraft in the engine.** The engine
  knows where the Earth is and how it is turned, but nothing uses a point on its surface.
- **The landing windows exist** (`sky.landingWindows`, from `useSiteSky`), and they are the
  target of the mission.

## What "real" means here

The simulation is a **reference mission**: a physically valid way to reach the chosen site inside
the chosen window. It is not the flight plan of IM-2 or of Artemis III, and the screen has to say
that. Piece by piece:

| Piece | How it is obtained | Real? |
|---|---|---|
| Where the launch site is in space at each instant | `ObserverVector` of the astronomy-engine (rotation, precession and nutation of the Earth), from the site's latitude and longitude | Real |
| Where the Moon is and how it is turned | The engine's ephemeris, already checked against JPL's SPICE | Real |
| The coasting arcs: parking orbit, crossing to the Moon, lunar orbit, descent ellipse | Integrated step by step under the gravity of the Earth, the Moon and the Sun, each in its real position | Real physics, for a mission we designed |
| The burns (leaving the Earth, entering lunar orbit, leaving it) | An instant change of speed | A model: a real burn takes minutes |
| The climb from the pad to the parking orbit, and the powered descent to the ground | A smooth curve between two computed points | A drawing, shown with a different line |
| The launch time, the launch direction and the fuel-free aiming | Solved by the engine so that the path ends at the site, inside the window | Computed, not typed |

Left out of the physics, and said on screen: the Earth's flattening (J2), the air, the pressure of
sunlight, the Moon's uneven gravity, the rocket's performance and the launch directions each
range forbids.

## How a mission is calculated

It starts from the end, because the end is what UmbraView already computes.

1. **Landing.** The chosen site and one of its landing windows. The landing is aimed at a time
   inside the window.
2. **Lunar orbit.** A circle 100 km above the Moon whose plane contains the landing site. For a
   site near the pole this is a polar orbit. The spacecraft stays in it for some hours and then
   descends.
3. **Arrival at the Moon.** The path from the Earth passes 100 km above the Moon, and a burn at
   that point turns the flyby into the circle of step 2.
4. **Crossing.** About 4 days of coasting, pulled by the Earth, the Moon and the Sun.
5. **Leaving the Earth.** A burn along the direction of motion, in the parking orbit, 185 km up.
6. **Parking orbit.** A circle around the Earth whose plane contains the launch site at the
   launch instant.
7. **Launch.** The time of day at which that plane has the lowest tilt the site allows, which is
   the launch that takes the most from the Earth's rotation.

The aiming has three free choices, the same ones a real mission has, and none of them costs fuel
outside the direction of motion: **the speed at the end of the burn**, **where on the parking
orbit the burn happens** (which is also when), and **the tilt of the launch plane around the
launch site** (the launch direction). Three targets close the system: the height of the pass over
the Moon, the lunar orbit plane containing the landing site, and the arrival time. The engine
solves it by Newton's method, with the path integrated at every trial, switching the gravity of
the Moon and the Sun on in five steps so the first guess (a plain ellipse around the Earth) is
never far from the answer.

## Feasibility, measured on 17/11/2026

Two drafts, run in Node 22 on Marco's computer with the project's own astronomy-engine. They were
not kept in the repository, so these numbers cannot be reproduced from it until cards C14 and C15
bring the code with its tests.

**The propagator against a flown trajectory.** JPL Horizons has the as-flown path of Artemis I
(object −1023, from NASA/JSC navigation). Starting from Orion's state on 17/11/2022 at 14:00 TDB,
226,000 km from the Earth, and integrating 68 hours of coast (RK4, steps of up to 120 s, 33 ms of
computing), the distance between our position and JPL's was:

| Gravity in the model | After 24 h | After 48 h | After 68 h |
|---|---|---|---|
| Earth, Moon and Sun | 17 km | 43 km | 56 km |
| Earth and Moon | 72 km | 301 km | 660 km |
| Earth only | 163 km | 882 km | 2,470 km |

So the three bodies as point masses, in their real positions, are enough for a line on screen,
and the Sun cannot be left out. Where the remaining 56 km come from was not investigated (Orion's
own thrusters during the coast are a candidate).

**The aiming.** 35 missions to the IM-2 landing site: landing dates every 2 days from 01/12 to
27/12/2026 from Kennedy, plus Kourou, Baikonur, Mahia and Alcântara on four of those dates, and
both sides of the Moon on the first date. Parking orbit at 185 km, 4 days of crossing, pass at
100 km.

- All 35 converged, in 13 to 17 integrations for each of the five gravity steps.
- Each mission took 458 to 877 ms. That is too long for the page's main thread: the calculation
  goes in a Worker, as the landing areas map already does.
- Pass over the Moon at 100.000 km, with the orbit plane containing the landing site to less than
  0.00001°, and a lunar orbit tilted 85° to 86° (or 94°, from the other side).
- Burn to leave the Earth: 3.13 to 3.14 km/s. Burn to enter lunar orbit: 0.82 to 0.86 km/s. Both
  are in the range textbooks give for this kind of transfer (not verified against a source yet).
- Tilt of the parking orbit: Kennedy 28.3° to 28.7° (launching almost due east), Baikonur 45.7°,
  Mahia 39.0°; Kourou and Alcântara, near the equator, 8° to 27°, because their plane has to tilt
  to reach the Moon when it is far from the equator.

A first draft tried to aim by changing the direction of the burn, and did not converge: the burn
happens almost on the opposite side of the Earth from the Moon, where a sideways push barely
moves the arrival point. Aiming with the launch plane, as real missions do, is what made it work.

## Where each piece goes

Following the three rules of the README: text in `src/data/`, color and size from the tokens,
astronomy in `src/engine/`.

| Layer | File | What it holds |
|---|---|---|
| Data | `src/data/launchSites.js` | The launch sites, each with its source (card C13) |
| Data | `src/data/missionView.js` | The texts of the mission view |
| Engine | `src/engine/earthSite.js` | A point of the Earth in space at an instant (card C13) |
| Engine | `src/engine/orbit.js` | The gravity model, the ephemeris in a grid, the integrator and the "closest pass" event (card C14) |
| Engine | `src/engine/mission.js` | The mission: launch time, aiming, the phases and their numbers (card C15) |
| Engine | `src/engine/config.js` | The mission's parameters, each with its reason and its source |
| Worker | `src/workers/mission.worker.js` | Runs `mission.js` off the main thread |
| Bridge | `src/hooks/useMission.js` | `{ status, mission }`, in the same style as `useLandingAreas` |
| Scene | `src/scene/MissionView.jsx` | The Earth and the Moon to scale, the launch sites, the path, the clock (cards C13 and C16) |
| App | `src/App.jsx` | A third button in the view selector |

No new dependency: the astronomy-engine already has what is needed (`ObserverVector`,
`GeoMoonState`, `HelioVector`), and the integrator is a few dozen lines of plain JavaScript.

## Data and sources

| Data | Source | Status on 17/11/2026 |
|---|---|---|
| Launch sites: name, latitude, longitude | J. McDowell, *General Catalog of Artificial Space Objects* (GCAT), release 1.8.9, sites and launch points tables, [planet4589.org/space/gcat](https://planet4589.org/space/gcat); CC-BY, citation requested | The tables and the license were read; the rows were read through an automated summary, so no coordinate is copied here. Card C13 copies the rows to `scripts/references/` and a test ties the list to them |
| Which missions to the Moon left from each site | Each agency's page | Not verified. The list below is the starting point |
| Gravity of the Earth, the Moon and the Sun (GM) | JPL, *Astrodynamic Parameters*, from the DE440 ephemeris, [ssd.jpl.nasa.gov/astro_par.html](https://ssd.jpl.nasa.gov/astro_par.html) | Read; used in the drafts |
| Radius of the Earth | The same as Horizons uses (6378.137 km at the equator) | Read in the Horizons output |
| As-flown path of Artemis I, to check the propagator | JPL Horizons, object −1023, [ssd.jpl.nasa.gov/horizons](https://ssd.jpl.nasa.gov/horizons/) | Read; card C14 stores a small fixture and the script that fetches it |
| IM-2 launch: 26/02/2025, 7:16 p.m. EST, Falcon 9, Launch Complex 39A | NASA, [mission blog of 26/02/2025](https://www.nasa.gov/blogs/missions/2025/02/26/liftoff-intuitive-machines-lunar-lander-begins-journey-to-the-moon/) | Read. It is the real case to compare a simulated launch time against (card C15) |
| Height of the parking orbit, height and duration of the lunar orbit, crossing time | To be chosen with a source for each (Apollo and IM-2 are the candidates) | Not verified: 185 km, 100 km and 4 days are the drafts' values |

Launch sites to start from, the ones that have sent a mission to the Moon (the missions are from
memory, not verified): Kennedy Space Center (pads 39A and 39B), Cape Canaveral, Baikonur,
Vostochny, Xichang, Wenchang, Satish Dhawan, Tanegashima, Kourou, Mahia and Wallops. Alcântara is
proposed as well, marked as a site with no launch to the Moon so far: it is the team's home
country, and a site at 2°S shows better than any other why the launch plane has to tilt.

## The cards

| Card | What it delivers | Depends on |
|---|---|---|
| C13 | The launch sites, with sources, and the mission view: the Earth and the Moon to scale, with the sites on the Earth | nothing |
| C14 | The propagator in the engine, checked against Artemis I | nothing |
| C15 | The mission in the engine, the Worker and the bridge | C13 and C14 |
| C16 | The mission on screen: the path, the clock, the numbers and the choice of launch site and window | C13 and C15 |

C13 and C14 do not touch the same files and can go in parallel. Each card is one PR
(CONTRIBUTING.md, section 1, rule 6).

## Decisions that are not Claude's to make

1. **Enzo's OK** for the scope and for the new engine files.
2. **Which launch sites enter**, and whether Alcântara is one of them.
3. **The reference mission's numbers**: parking orbit height, crossing time, lunar orbit height
   and how long the spacecraft stays in it. They are choices of the model, shown on screen, and
   each needs a source or a written reason.
4. **Where in the window the landing is aimed.** Proposed: 12 hours after the window opens, or
   the middle of the window when it is shorter than 24 hours.
5. **A new view, and not a change to the system view.** Proposed: the system view stays as it is,
   because its scale is what lets the Sun and the Earth's orbit fit on screen.

## Risks

- **A window with no solution.** The crossing time has a ceiling (the slowest ellipse that still
  reaches the Moon), and a short window may not fit a launch. The bridge returns `error`, and the
  screen says that no path was found for that window.
- **The team's laptops.** 0.5 to 0.9 s was measured on one computer, in Node. Card C15 measures in
  the browser, on Miguel's laptop as well, where the site was slowest in card C4.
- **The Earth to scale is small.** Seen from where the whole path fits, the Earth is a dot and the
  launch sites cannot be told apart. The view needs buttons that take the camera to the Earth, to
  the Moon and to the spacecraft.
- **Reading more into it than there is.** A precise-looking line invites the reading "this is how
  IM-2 flew". The texts of the view carry the table of "What real means here".

## Out of this plan

- Artemis III as NASA plans it (Orion in a halo orbit, a separate lander). The reference mission
  is a single spacecraft, in the style of Apollo and IM-2.
- The trip back.
- The launch directions each range forbids, and the rocket: what it can lift, its stages.
- Replaying trajectories that were flown, from JPL Horizons, next to the simulated one.
- Telling the mission as a story, step by step, with text for each phase.
