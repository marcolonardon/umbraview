/* O mapa pequeno do voo (card C17, fase 4), no canto da cena: a Terra, a órbita da Lua, a Lua no
 * instante do relógio, a travessia e a nave. As contas são do missionMap.js; aqui fica o desenho,
 * num SVG cuja moldura é em km: quem põe a escala é o próprio navegador.
 *
 * As posições estão em escala. A Terra é desenhada no tamanho de verdade; a Lua e a nave, que
 * nessa escala teriam menos de 1 pixel, são pontos de tamanho fixo, e a legenda diz isso.
 */
import { useMemo } from 'react'

import { missionView } from '../data/missionView.js'
import { EARTH_EQUATORIAL_RADIUS_KM } from '../engine/earthSite.js'
import { flownOnMap } from './missionMap.js'
import './MissionControl.css'

// o tamanho dos pontos da Lua e da nave, em vezes o maior lado do mapa
const MOON_DOT = 0.018
const CRAFT_DOT = 0.028

const line = (points) => points.map(([x, y]) => `${x},${y}`).join(' ')

/* map: o mapa da missão (missionMap). craft e moon: onde a nave e a Lua estão no instante, [x, y]
   em km no mapa (mapPoint). dateMs: o instante, para separar a parte já voada da travessia.
   hidden: a pessoa ocultou o mapa; fica só o botão que o traz de volta. onToggle: chamada pelo
   botão de ocultar e mostrar. */
export function MissionMap({ map, craft, moon, dateMs, hidden = false, onToggle = () => {} }) {
  const [x, y, width, height] = map.viewBox
  const size = Math.max(width, height)
  /* A órbita da Lua e o caminho inteiro não mudam durante o voo: o texto das duas linhas é feito
     uma vez por missão, e não a cada quadro, junto com a nave. */
  const fixed = useMemo(() => ({ orbit: line(map.orbit), path: line(map.path.map((point) => [point.x, point.y])) }), [map])
  const toggle = (
    <button className="mission-map__toggle" type="button" aria-expanded={!hidden} onClick={onToggle}>
      {hidden ? missionView.mapShow : missionView.mapHide}
    </button>
  )
  if (hidden) return <div className="mission-map mission-map--hidden">{toggle}</div>
  return (
    <figure className="mission-map">
      {toggle}
      <svg className="mission-map__svg" viewBox={`${x} ${y} ${width} ${height}`} role="img" aria-label={missionView.mapLabel}>
        <polyline className="mission-map__orbit" points={fixed.orbit} />
        <polyline className="mission-map__path" points={fixed.path} />
        <polyline className="mission-map__flown" points={line(flownOnMap(map.path, dateMs, craft))} />
        <circle className="mission-map__earth" cx="0" cy="0" r={EARTH_EQUATORIAL_RADIUS_KM} />
        <circle className="mission-map__moon" cx={moon[0]} cy={moon[1]} r={size * MOON_DOT} />
        <circle className="mission-map__craft" cx={craft[0]} cy={craft[1]} r={size * CRAFT_DOT} />
      </svg>
      <figcaption className="mission-map__caption">{missionView.mapCaption}</figcaption>
    </figure>
  )
}
