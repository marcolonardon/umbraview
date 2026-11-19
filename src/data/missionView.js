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
  play: 'Play',
  pause: 'Pause',
  // A lista de bases, que é por onde quem usa teclado escolhe uma.
  launchSitePlaceholder: 'Choose a launch site…',
  groupLaunched: 'Has launched to the Moon',
  groupNotYet: 'No launch to the Moon so far',
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
  // o cartão de uma janela de pouso: a duração vai em destaque, e as duas datas embaixo
  windowRange: (start, end) => `${start} to ${end}`,
  // o que falta para haver uma missão, um texto por estado
  windowsLoading: 'Calculating the landing windows of the landing site…',
  windowsError: 'The landing windows of this landing site could not be calculated, so there is no mission to simulate.',
  // sem janela, os dois caminhos estão na vista: a data, no próprio passo, e o local, no passo anterior
  noWindows: (periodDays) => `No landing window here in the next ${periodDays} days. Choose another date or another landing site.`,
  missionLoading: 'Calculating the mission…',
  missionError: 'No path was found from this launch site to this landing window.',
  missionReady: 'Ready to launch.',

  /* O painel da missão (card C17): os três passos para montar uma missão, o botão de lançar, a
     linha do tempo das fases e o resumo no pouso. */
  controlTitle: 'Mission control',
  // as etiquetas dos três passos: o nome curto, e o que a da janela mostra depois de escolhida
  chipLanding: 'Landing',
  chipWindow: 'Window',
  chipLaunch: 'Launch site',
  windowChip: (date, duration) => `${date} · ${duration}`,
  // passo 1: onde pousar
  stepLanding: 'Where to land?',
  landingSiteLabel: 'Landing site',
  landingSitePlaceholder: 'Choose a landing site…',
  // o ponto que veio do clique na Lua, e não da lista: a opção que a lista mostra para ele
  customLandingSite: 'Your point on the Moon',
  landingHint: 'Click a pin, or any point on the Moon. Drag to turn it, scroll to zoom.',
  // as listas ficam recolhidas atrás deste nome: é por elas que quem usa teclado escolhe
  chooseFromList: 'Choose from a list',
  // passo 2: quando pousar
  stepWindow: 'When to land?',
  windowWaiting: 'Choose where to land first.',
  // a data de onde as janelas são procuradas, recolhida no passo da janela
  changeDate: 'Search from another date',
  dateHint: (periodDays) => `Landing windows are searched in the ${periodDays} days after this date.`,
  /* Sem janela no período, o que a busca adiante achou (sky.nextWindow, card C18). As datas e a
     duração chegam do motor, já em texto; o "≥" vem junto quando a janela passa do fim do período
     dela, como nos cartões. */
  nextWindow: (periodDays, from, opensAt, duration) =>
    `No landing window in the ${periodDays} days from ${from}. The next one opens on ${opensAt} and lasts ${duration}.`,
  // o botão que leva a busca para o período da próxima janela
  useNextWindow: 'Go to the next landing window',
  // a Terra nunca passou do horizonte na busca inteira: nenhuma data resolve
  farSide:
    'The Earth never rises above the horizon here: this is the far side of the Moon, with no direct link to the Earth, so there is no landing window. Choose a point on the near side.',
  noWindowUntil: (until, minHours) =>
    `No landing window here until ${until}: the Sun and the Earth are never in view together for ${minHours} hours in a row. Choose another landing site.`,
  /* O mapa de onde dá para pousar (card C18): o mesmo da vista da Lua (scene.js), com o verde
     explicado em uma frase, porque o cartão é pequeno. */
  landingAreasToggle: 'Show where you can land',
  landingAreasLoading: 'Finding where you can land…',
  landingAreasReady: (periodDays, minHours) =>
    `Green areas have a landing window in the ${periodDays} days from this date: ${minHours} hours or more with the Sun and the Earth in view together. Approximate away from the south pole.`,
  landingAreasError: "Couldn't calculate where you can land. Reload the page to try again.",
  // passo 3: de onde lançar
  stepLaunch: 'Where to launch from?',
  launchHint: 'Click a mark on the Earth.',
  // o botão que solta a missão: põe a câmera na nave e toca o relógio, do lançamento
  launchButton: 'Launch',
  launchAgain: 'Launch again',
  // voando, o painel some; este botão volta a ele
  changeMission: 'Change mission',
  // o selo por cima da cena, que abre a nota de que é uma missão de referência
  referenceBadge: 'Reference mission',
  // o trilho do painel de voo: um controle só para o tempo, da Terra à Lua
  progressLabel: 'Mission progress',
  // o que o leitor de tela ouve no trilho: a fase e o tempo de missão
  progressValue: (phase, elapsed) => `${phase}, T+ ${elapsed}`,
  // a velocidade rápida de tocar
  fastLabel: '4× speed',
  // voando, a câmera se põe sozinha; este botão a solta, para a pessoa girar e aproximar
  freeCamera: 'Free camera',
  // o mapa pequeno do trajeto inteiro, no canto da cena
  mapLabel:
    'Map of the whole path of the mission, seen from above: the Earth, the orbit of the Moon, the Moon, the crossing and the spacecraft.',
  mapCaption: 'Whole path, to scale. The Moon and the spacecraft are dots.',
  // a legenda do trilho: os nomes das fases, embaixo dele
  timelineLabel: 'Mission phases',
  // o cartão de voo: a fase, o tempo de missão e a nave em números
  flightStatus: 'Flight status',
  elapsedValue: (elapsed) => `T+ ${elapsed}`,
  telemetryValue: (altitudeKm, body, speedKmS) =>
    `${Math.round(altitudeKm).toLocaleString('en-US')} km above the ${body === 'moon' ? 'Moon' : 'Earth'} · ${speedKmS.toFixed(2)} km/s`,
  // nos dois trechos desenhados não há número: os pontos do caminho são desenho
  drawnValue: 'Drawn, not computed',
  phaseNames: {
    ascent: 'Climb',
    parking: 'Parking orbit',
    crossing: 'Crossing',
    lunarOrbit: 'Lunar orbit',
    descent: 'Descent',
    landing: 'Landing',
  },
  // o resumo, quando o relógio chega ao pouso: só números que o motor calculou
  completeTitle: 'Mission complete',
  totalTime: 'From launch to landing',
  totalDeltaV: 'Speed changed by the three burns',
  totalDeltaVValue: (kmS) => `${kmS.toFixed(2)} km/s`,
  // os números e as notas ficam recolhidos, para a tela não virar um muro de texto
  detailsSummary: 'Mission details and what is real',
  // os nomes dos quatro eventos na cena; voando, só o do próximo aparece
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
