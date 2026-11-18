/* A vista do sistema: a Terra, a Lua na órbita dela e a direção do Sol, na data escolhida.
 *
 * Mostra de onde vêm os números do resto da tela: a órbita inclinada e oval da Lua, o eixo quase
 * em pé e a face sempre virada para a Terra, balançando com a libração. As posições e as rotações
 * são do motor (src/engine/system.js); os tamanhos e as distâncias não estão em escala, e a tela
 * diz isso.
 *
 * A vista tem um relógio próprio: o cursor e o botão de tocar andam pelo período sem mudar a data
 * do cálculo, porque trocar a data refaz a conta do céu do ponto, e fazer isso a cada quadro
 * travaria a página. A data só muda quando a pessoa pede ("Set as date").
 */
import { Html, Line } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useMemo, useRef, useState } from 'react'
import { Matrix4 } from 'three'

import { systemView } from '../data/systemView.js'
import { PERIOD_DAYS } from '../engine/config.js'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion.js'
import { useViewClock } from '../hooks/useViewClock.js'
import {
  ECLIPTIC_SKY_MATRIX, SIDEREAL_YEAR_DAYS, earthOrbitPath, moonOrbitPath, sunPositionAu, systemStateAt,
} from '../engine/system.js'
import { formatPercent } from '../panel/format.js'
import { token } from './cssToken.js'
import { EarthBody } from './EarthBody.jsx'
import { sunSideStart } from './framing.js'
import { MoonBody } from './MoonBody.jsx'
import { StarField } from './StarField.jsx'
import { SunBody } from './SunBody.jsx'
import { ViewClock } from './ViewClock.jsx'
import { ZoomControls } from './ZoomControls.jsx'
import './SystemView.css'

const HOUR_MS = 3600e3
const PERIOD_HOURS = PERIOD_DAYS * 24

/* O desenho não está em escala: na escala de verdade, com a Terra deste tamanho, a Lua ficaria 30
   vezes mais longe e teria um quarto do tamanho dela. A distância entre as duas é a de verdade
   multiplicada por um número só, e por isso a órbita mantém a forma oval. */
const UNITS_PER_KM = 2.3 / 384400
const EARTH_RADIUS = 0.36
const MOON_RADIUS = 0.17
/* O Sol em 3D, na direção de verdade, perto e pequeno para caber na tela: o de verdade fica uns 390
   vezes mais longe que a Lua. Fica além da órbita da Lua, para ela nunca passar por dentro dele.
   UNITS_PER_AU é a distância do desenho que vale 1 UA: a Terra fica a ela do Sol, vezes a
   distância de verdade da data (entre 0,983 e 1,017 UA), e a linha da órbita da Terra usa a mesma
   escala. Por isso a Terra fica sempre em cima da própria órbita, e anda nela quando o tempo corre.

   O Sol é o centro parado da cena, e a Terra é que muda de lugar. Com a Terra parada no centro e
   o Sol andando, as posições eram as mesmas, mas o olho lia que o Sol girava em volta da Terra. */
const UNITS_PER_AU = 3.9
const SUN_BODY_RADIUS = 0.34
// a linha da órbita da Terra: um trecho a cada 2°
const EARTH_ORBIT_STEPS = 180
/* A partir de qual distância da câmera os nomes somem: de longe a cena inteira vira um ponto, e os
   quatro nomes ficavam empilhados em cima dele (visto no navegador). */
const TAGS_MAX_DISTANCE = 30
/* Em qual ponto da linha fica a etiqueta dela: no meio da volta, do outro lado do Sol, onde a
   Terra e a órbita da Lua não chegam durante o período do relógio. */
const EARTH_ORBIT_TAG_STEP = EARTH_ORBIT_STEPS / 2
const LIGHT_DISTANCE = 10

/* O zoom vai de perto da Terra até muito longe. Até 50, a órbita vai ficando pequena no meio do
   céu; dali em diante a câmera sai de dentro do próprio céu de estrelas, e a 750 elas todas
   cabem num aglomerado pequeno, com a órbita no meio (starPoints.js). O far da câmera cobre o Sol
   do outro lado, visto de lá. */
const CAMERA = { position: [0, 4.6, 12], fov: 35, near: 0.1, far: 1200 }
/* As duas distâncias da câmera: presa ao Sol, a da abertura, de onde se vê a órbita da Terra quase
   inteira; presa à Terra, mais perto, a que mostra a órbita da Lua em volta dela. */
const SUN_VIEW_DISTANCE = Math.hypot(...CAMERA.position)
const EARTH_VIEW_DISTANCE = 6.8
const SUN_CENTER = Object.freeze([0, 0, 0])
const MIN_DISTANCE = 2
const MAX_DISTANCE = 750
/* A casca em que as estrelas ficam presas de longe: o raio dela, e as distâncias da câmera entre
   as quais elas passam do infinito para a casca. */
const STAR_SHELL = Object.freeze({ radius: 75, from: 50, to: 220 })
/* Entre estas duas distâncias o céu de estrelas vai se revelando (starPoints.js): começa na vista
   de abertura e termina com a órbita pequena. */
const STAR_ZOOM_RANGE = [13, 60]
const ORBIT_STEPS = 160
const RING_STEPS = 96
const SUN_INTENSITY = 2.6
const AMBIENT_INTENSITY = 0.08

// Tocando, o período inteiro (30 dias) passa em 24 segundos.
const PLAY_HOURS_PER_SECOND = PERIOD_HOURS / 24

// O círculo da distância média da Lua no plano da órbita da Terra: contra ele se vê a órbita da
// Lua subir e descer uns 5°.
const ECLIPTIC_RING = Array.from({ length: RING_STEPS + 1 }, (_, i) => {
  const angle = (i / RING_STEPS) * 2 * Math.PI
  return [Math.cos(angle) * 384400 * UNITS_PER_KM, 0, Math.sin(angle) * 384400 * UNITS_PER_KM]
})

/* labels: a ref da camada onde os nomes dos corpos são postos (o portal do Html do Drei). Sem um
   alvo fixo, o Html troca de alvo logo depois de montar e recria a raiz dele; nessa troca o
   primeiro nome da cena nascia vazio (o da Terra não aparecia, visto no navegador, também no
   build), e o React reclamava no console de raiz desmontada no meio do desenho. */
function Bodies({ state, orbit, earthOrbit, sunAu, dateUtc, reducedMotion, followEarth, onFarChange, labels }) {
  /* Avisa a vista quando a câmera passa da distância em que os nomes somem. Só na passagem, e não
     a cada quadro: cada aviso redesenha a vista inteira. */
  const far = useRef(false)
  useFrame(({ camera }) => {
    const next = camera.position.length() > TAGS_MAX_DISTANCE
    if (next === far.current) return
    far.current = next
    onFarChange(next)
  })
  const moonPosition = state.moonKm.map((v) => v * UNITS_PER_KM)
  const moonMatrix = useMemo(
    () => new Matrix4().fromArray(state.moonMatrix).setPosition(...state.moonKm.map((v) => v * UNITS_PER_KM)),
    [state],
  )
  const earthMatrix = useMemo(() => new Matrix4().fromArray(state.earthMatrix), [state])
  const orbitPoints = useMemo(() => orbit.map((point) => point.map((v) => v * UNITS_PER_KM)), [orbit])
  const sun = state.sunDirection
  /* O Sol fica parado no centro da cena. A Terra vista do Sol é o Sol visto da Terra, ao
     contrário: ela muda de lugar a cada instante e leva junto a Lua e a órbita da Lua. A linha da
     órbita da Terra é fixa no espaço (calculada uma vez por data), e a Terra anda em cima dela. */
  const earthPosition = useMemo(() => sunAu.map((v) => -v * UNITS_PER_AU), [sunAu])
  const earthOrbitPoints = useMemo(
    () => earthOrbit.map((point) => point.map((v) => v * UNITS_PER_AU)),
    [earthOrbit],
  )

  return (
    <>
      <color attach="background" args={[token('--color-bg')]} />
      <StarField dateUtc={dateUtc} skyMatrix={ECLIPTIC_SKY_MATRIX} zoomRange={STAR_ZOOM_RANGE} shell={STAR_SHELL} />
      <ambientLight intensity={AMBIENT_INTENSITY} />
      <directionalLight position={sun.map((v) => v * LIGHT_DISTANCE)} intensity={SUN_INTENSITY} color={token('--color-sunlight')} />

      {/* Tudo o que anda com a Terra em volta do Sol: ela, a Lua, a órbita da Lua e os nomes. A luz
          não entra aqui: é a mesma direção para a Terra e para a Lua, a do Sol de verdade, e não a
          do Sol do desenho, que está perto demais e mudaria as fases. */}
      <group position={earthPosition}>
      {/* A Terra, virada como ela está no instante, com a imagem de verdade (EarthBody.jsx). */}
      <EarthBody radius={EARTH_RADIUS} matrix={earthMatrix} sunDirection={sun} />
      <Html position={[0, -EARTH_RADIUS * 1.9, 0]} center pointerEvents="none" zIndexRange={[1, 0]} portal={labels}>
        <span className="system-view__tag">{systemView.earth}</span>
      </Html>

      {/* A Lua, virada como ela está: a mesma face para a Terra, a menos da libração (MoonBody.jsx). */}
      <MoonBody radius={MOON_RADIUS} matrix={moonMatrix} />
      <Html position={[moonPosition[0], moonPosition[1] - MOON_RADIUS * 2.2, moonPosition[2]]} center pointerEvents="none" zIndexRange={[1, 0]} portal={labels}>
        <span className="system-view__tag">{systemView.moon}</span>
      </Html>

      <Line points={orbitPoints} color={token('--color-text-secondary')} lineWidth={1.5} />
      <Line points={ECLIPTIC_RING} color={token('--color-border-control')} lineWidth={1} dashed dashSize={0.06} gapSize={0.06} />
      </group>

      {/* A órbita da Terra em volta do Sol, na cor da Terra: parada no espaço, com a Terra andando
          em cima dela. */}
      <Line points={earthOrbitPoints} color={token('--color-earth')} lineWidth={1.5} />
      <Html position={earthOrbitPoints[EARTH_ORBIT_TAG_STEP]} center pointerEvents="none" zIndexRange={[1, 0]} portal={labels}>
        <span className="system-view__tag system-view__tag--earth">{systemView.earthOrbit}</span>
      </Html>

      {/* O Sol em 3D, no centro, perto e pequeno para caber na tela (SunBody.jsx): o de verdade fica
          uns 390 vezes mais longe que a Lua. */}
      <SunBody
        position={SUN_CENTER}
        radius={SUN_BODY_RADIUS}
        color={token('--color-sunlight')}
        haloColor={token('--color-sun')}
      />
      <Html position={[0, -SUN_BODY_RADIUS * 2.4, 0]} center pointerEvents="none" zIndexRange={[1, 0]} portal={labels}>
        <span className="system-view__tag system-view__tag--sun">{systemView.sun}</span>
      </Html>

      <ZoomControls
        minDistance={MIN_DISTANCE}
        maxDistance={MAX_DISTANCE}
        reducedMotion={reducedMotion}
        target={followEarth ? earthPosition : SUN_CENTER}
        targetName={followEarth ? 'earth' : 'sun'}
        distance={followEarth ? EARTH_VIEW_DISTANCE : SUN_VIEW_DISTANCE}
      />
    </>
  )
}

/* dateUtc: a data escolhida (um Date); o relógio da vista começa nela. onDateChange: chamada com
   um Date quando a pessoa pede para o instante da vista virar a data do cálculo. */
export function SystemView({ dateUtc, onDateChange }) {
  // Tocando, o relógio da vista anda sozinho; só começa quando a pessoa aperta o botão.
  const clock = useViewClock(PERIOD_HOURS, PLAY_HOURS_PER_SECOND)
  const { hour } = clock
  const reducedMotion = usePrefersReducedMotion()
  const [far, setFar] = useState(false)
  const labels = useRef(null)
  /* Para onde a câmera olha: o Sol, parado (de onde se vê a Terra andar em volta dele), ou a
     Terra, andando junto com ela (de onde se vê a Lua de perto). */
  const [followEarth, setFollowEarth] = useState(false)
  /* A câmera nasce olhando para o Sol, com a Terra à direita dele e meio iluminada, pela direção
     do Sol na data em que a vista abriu. Fica no estado, e não é recalculada: depois de aberta,
     quem manda na câmera é a pessoa. */
  const [camera] = useState(() => ({
    ...CAMERA,
    position: sunSideStart(CAMERA.position, systemStateAt(dateUtc.getTime()).sunDirection),
  }))
  const dateMs = dateUtc.getTime() + hour * HOUR_MS
  const state = useMemo(() => systemStateAt(dateMs), [dateMs])
  const orbit = useMemo(() => moonOrbitPath(dateUtc.getTime(), ORBIT_STEPS), [dateUtc])
  // a órbita da Terra é a do ano que começa na data; o Sol é o do instante do relógio da vista
  const earthOrbit = useMemo(() => earthOrbitPath(dateUtc.getTime(), EARTH_ORBIT_STEPS), [dateUtc])
  const sunAu = useMemo(() => sunPositionAu(dateMs), [dateMs])

  const wholeHour = Math.floor(hour)

  return (
    <div className="system-view">
      <div
        className={far ? 'system-view__scene system-view__scene--far' : 'system-view__scene'}
        role="img"
        aria-label={systemView.label}
      >
        <Canvas frameloop="demand" gl={{ antialias: true }} camera={camera}>
          <Bodies state={state} orbit={orbit} earthOrbit={earthOrbit} sunAu={sunAu} dateUtc={dateUtc} reducedMotion={reducedMotion} followEarth={followEarth} onFarChange={setFar} labels={labels} />
        </Canvas>
        <div className="system-view__labels" ref={labels} />
      </div>
      <ViewClock clock={clock} startUtc={dateUtc} periodHours={PERIOD_HOURS} labels={systemView}>
        <button
          className="view-clock__button"
          type="button"
          disabled={wholeHour === 0}
          onClick={() => onDateChange(new Date(dateUtc.getTime() + wholeHour * HOUR_MS))}
        >
          {systemView.useThisTime}
        </button>
        <button
          className="view-clock__button"
          type="button"
          aria-pressed={followEarth}
          onClick={() => setFollowEarth((value) => !value)}
        >
          {systemView.followEarth}
        </button>
      </ViewClock>
      <dl className="system-view__facts">
        <div>
          <dt>{systemView.distance}</dt>
          <dd>{systemView.distanceValue(state.distanceKm)}</dd>
        </div>
        <div>
          <dt>{systemView.phase}</dt>
          <dd>{formatPercent(state.phaseFraction)}</dd>
        </div>
        <div>
          <dt>{systemView.libration}</dt>
          <dd>{systemView.librationValue(state.subEarth)}</dd>
        </div>
      </dl>
      {systemView.notes.map((note) => (
        <p key={note} className="system-view__note">
          {note}
        </p>
      ))}
      <p className="system-view__note">{systemView.earthOrbitNote(SIDEREAL_YEAR_DAYS, 360 / SIDEREAL_YEAR_DAYS, PERIOD_DAYS)}</p>
    </div>
  )
}
