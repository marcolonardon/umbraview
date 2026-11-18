/* Textos da vista da missão (card C13), em inglês, como todo texto de tela (README, "Três regras que
 * valem para qualquer tela"). */
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
  camera: { earth: 'Earth', moon: 'Moon', orbit: 'Whole orbit' },
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
}
