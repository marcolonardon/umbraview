/* Textos da vista da missão (cards C13 e C16), em inglês, como todo texto de tela (README, "Três
 * regras que valem para qualquer tela"). */
const hemisphere = (value, positive, negative) => `${Math.abs(value).toFixed(4)}° ${value >= 0 ? positive : negative}`

export const missionView = {
  // o botão dela no seletor de vista, por cima da cena
  viewMission: 'Mission',
  // Nome da cena para o leitor de tela: o canvas não tem texto.
  label:
    '3D view of the Earth and the Moon on the chosen date, with their real sizes and the real distance between them, over the real star field. Launch sites are marked on the Earth: click a mark to choose that site, or use the list below. Drag to rotate, scroll to zoom.',
  earth: 'Earth',
  moon: 'Moon',
  // O relógio próprio da vista: anda pelo período sem mudar a data do cálculo.
  timeLabel: 'Time in the period',
  play: 'Play',
  pause: 'Pause',
  // Para onde a câmera vai: em escala, a Terra vira um ponto quando a órbita inteira cabe na tela.
  cameraLabel: 'Camera',
  camera: { earth: 'Earth', moon: 'Moon', orbit: 'Whole orbit', craft: 'Spacecraft' },
  // A lista de bases, que é por onde quem usa teclado escolhe uma.
  launchSiteLabel: 'Launch site',
  launchSitePlaceholder: 'Choose a launch site…',
  groupLaunched: 'Has launched to the Moon',
  groupNotYet: 'No launch to the Moon so far',
  // os dois jeitos de escolher: o clique na marca e a lista, que também vira a câmera para a base
  noLaunchSite: 'Choose a launch site: click its mark on the Earth, or pick it in the list, and the camera turns to it.',
  distance: 'Earth–Moon distance',
  distanceValue: (km, earthRadii) => `${Math.round(km).toLocaleString('en-US')} km (${earthRadii.toFixed(1)} Earth radii)`,
  // as 4 casas são as da fonte (GCAT): uns 11 m no chão
  coordinates: 'Latitude, longitude',
  coordinatesValue: ({ lat, lon }) => `${hemisphere(lat, 'N', 'S')}, ${hemisphere(lon, 'E', 'W')}`,
  // um lançamento à Lua que saiu da plataforma; não é necessariamente o mais recente
  lunarLaunch: 'A launch to the Moon from this pad',
  lunarLaunchValue: (mission, date) => `${mission}, ${date}`,
  noLunarLaunch: 'None so far',
  /* O que é de verdade e o que não é. O número de raios da Terra chega do motor, no instante do
     relógio; a duração da volta da Terra, do NASA NSSDCA Earth Fact Sheet (CREDITS.md). */
  scaleNote: (earthRadii) =>
    `The Earth, the Moon and the distance between them are to scale: right now the Moon is ${earthRadii.toFixed(1)} Earth radii away. That is why the Earth shrinks to a dot when the whole orbit fits on screen; the camera buttons take you back to the Earth or to the Moon. The Sun is not drawn: only the direction of its light is real.`,
  sitesNote: (siderealDayHours) => {
    const hours = Math.floor(siderealDayHours)
    const minutes = Math.round((siderealDayHours - hours) * 60)
    return `Each mark on the Earth is a launch pad at its real latitude and longitude (GCAT, J. McDowell), and it turns with the Earth, once every ${hours} h ${minutes} min. The list has the launch sites where we found a launch to the Moon, plus Alcântara, in Brazil, which has not launched one. Pads a few kilometres apart have their marks on top of each other: click again to go to the next one.`
  },

  /* A missão simulada (card C16): o caminho da base escolhida até o local de pouso, dentro de uma
     janela de pouso dele. */
  // o nome da cena quando a missão está desenhada
  labelWithMission:
    '3D view of the Earth and the Moon, with their real sizes and the real distance between them, over the real star field. A line shows the path of the reference mission, from the launch site, around the Earth, across to the Moon, around it and down to the landing site; a dot is the spacecraft at the time of the clock. The numbers of the mission are in the list below. Drag to rotate, scroll to zoom.',
  // a janela de pouso, entre as do local escolhido na Lua
  landingWindowLabel: 'Landing window',
  landingWindowValue: (start, end, duration) => `${start} to ${end} (${duration})`,
  // o relógio, quando cobre a missão: do lançamento ao pouso
  missionTimeLabel: 'Time in the mission',
  // o que falta para haver uma missão, um texto por estado
  noLandingSite:
    'To simulate a mission, choose a landing site on the Moon: in the list of the panel, or by clicking the Moon in the Moon view.',
  windowsLoading: 'Calculating the landing windows of the landing site…',
  windowsError: 'The landing windows of this landing site could not be calculated, so there is no mission to simulate.',
  noWindows:
    'This landing site has no landing window in the period, so there is no mission to simulate. Try another date or another site.',
  missionLoading: 'Calculating the mission…',
  missionError: 'No path was found from this launch site to this landing window.',
  missionReady: (launchSite, landingSite) => `Reference mission from ${launchSite} to ${landingSite}.`,
  // os nomes na cena: a nave e os quatro eventos
  spacecraft: 'Spacecraft',
  events: { launch: 'Launch', tli: 'Leaving the Earth', loi: 'Arriving at the Moon', landing: 'Landing' },
  // os números da missão, na ordem do voo
  craftNow: 'The spacecraft now',
  phases: {
    ascent: 'Climbing to the parking orbit (drawn, not computed)',
    parking: 'Waiting in the parking orbit around the Earth',
    crossing: 'Crossing to the Moon',
    lunarOrbit: 'In lunar orbit',
    descent: 'Descending to the low point',
    landing: 'Final descent to the ground (drawn, not computed)',
  },
  launch: 'Launch',
  launchValue: (when, azimuthDeg) => `${when}, heading ${azimuthDeg.toFixed(0)}° from north`,
  parkingOrbit: 'Parking orbit',
  parkingOrbitValue: (altitudeKm, inclinationDeg) => `${altitudeKm} km up, tilted ${inclinationDeg.toFixed(1)}° to the Earth's equator`,
  tli: 'Leaving the Earth',
  loi: 'Arriving at the Moon',
  burnValue: (when, deltaVKmS) => `${when}, a burn of ${deltaVKmS.toFixed(2)} km/s`,
  crossing: 'Crossing',
  lunarOrbit: 'Lunar orbit',
  lunarOrbitValue: (altitudeKm, inclinationDeg, duration) =>
    `${altitudeKm} km up, tilted ${inclinationDeg.toFixed(1)}° to the Moon's equator, for ${duration}`,
  descent: 'Leaving the lunar orbit',
  // a queima de descida é de uns 20 m/s: em km/s viraria 0,02
  smallBurnValue: (when, deltaVKmS) => `${when}, a burn of ${(deltaVKmS * 1000).toFixed(0)} m/s`,
  landing: 'Landing',
  /* O que é de verdade e o que não é (docs/mission-simulation-plan.md, "What real means here"). Os
     números das escolhas do modelo chegam do MISSION (src/engine/config.js). */
  referenceNote:
    'This is a reference mission: a physically valid way to reach the chosen landing site inside the chosen landing window, computed by UmbraView. It is not the flight plan of IM-2, of Artemis III or of any mission that has flown.',
  pathNote:
    'The solid line is computed: the parking orbit, the crossing, the lunar orbit and the descent are followed step by step under the gravity of the Earth, the Moon and the Sun, each in its real position. Each burn is an instant change of speed; a real burn takes minutes. The dashed lines are drawings, not calculations: the climb from the pad to the parking orbit, and the final descent to the ground.',
  leftOutNote:
    "Left out of the physics: the Earth's flattening, the air, the pressure of sunlight, the Moon's uneven gravity, what the rocket can lift and the launch directions each range forbids.",
  choicesNote: ({ parkingAltitudeKm, lunarOrbitAltitudeKm, crossingDays, lunarOrbitStayHours, landingAimHours }) =>
    `The heights and the times are choices of the model, still provisional: a parking orbit ${parkingAltitudeKm} km up, a crossing of about ${crossingDays} days, a lunar orbit ${lunarOrbitAltitudeKm} km up for about ${lunarOrbitStayHours} hours, and a landing aimed ${landingAimHours} hours after the window opens. The launch is at the time of day that leaves the parking orbit least tilted.`,
}
