/* A vista da missão (cards C13 e C16): a Terra e a Lua em escala, com as bases de lançamento
 * marcadas na Terra, cada uma na latitude e na longitude de verdade, e o caminho de uma missão da
 * base escolhida até o local de pouso escolhido na Lua.
 *
 * A escala é a de verdade (missionScale.js), porque a órbita de espera fica a 185 km do chão: a Lua
 * fica a uns 60 raios da Terra, e a Terra vira um ponto quando a órbita inteira cabe na tela. Os
 * botões de câmera levam de volta à Terra, à Lua e à nave.
 *
 * As posições e as rotações são do motor: a Terra e a Lua, do src/engine/system.js; cada base, do
 * src/engine/earthSite.js; e a missão, do src/engine/mission.js, pela ponte (useMission). Aqui não
 * tem conta de órbita.
 *
 * O relógio é próprio, como o da vista do sistema: anda sem mudar a data do cálculo. Sem missão,
 * ele cobre o período, a partir da data escolhida. Com a missão na tela, cobre a missão, do
 * lançamento ao pouso, e a Terra, a Lua e a nave são desenhadas no instante dele.
 */
import { Html, Line } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useMemo, useRef, useState } from 'react'
import { Matrix4 } from 'three'

import { missionView } from '../data/missionView.js'
import { MISSION, PERIOD_DAYS } from '../engine/config.js'
import { EARTH_EQUATORIAL_RADIUS_KM, EARTH_SIDEREAL_DAY_HOURS, earthSiteKm } from '../engine/earthSite.js'
import { ECLIPTIC_SKY_MATRIX, moonOrbitPath, systemStateAt } from '../engine/system.js'
import { useMission } from '../hooks/useMission.js'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion.js'
import { useViewClock } from '../hooks/useViewClock.js'
import { formatDuration, formatUtc, formatUtcDate } from '../panel/format.js'
import { token } from './cssToken.js'
import { EarthBody } from './EarthBody.jsx'
import { sunSideStart } from './framing.js'
import { craftCamera, missionEvents, pathLength, segmentUnits, spacecraftAt } from './missionPath.js'
import { readSiteClick } from './missionPicking.js'
import {
  EARTH_RADIUS, MARKER_LIFT, MOON_RADIUS, facesCamera, kmToUnits, markerPosition, markerScale,
} from './missionScale.js'
import { MoonBody } from './MoonBody.jsx'
import { StarField } from './StarField.jsx'
import { ViewClock } from './ViewClock.jsx'
import { ZoomControls } from './ZoomControls.jsx'
// o mesmo esqueleto da vista do sistema (a cena, a camada dos nomes, os números e as notas)
import './SystemView.css'
import './MissionView.css'

const HOUR_MS = 3600e3
const PERIOD_HOURS = PERIOD_DAYS * 24
/* Tocando, 6 horas por segundo: a Terra dá uma volta a cada 4 segundos, devagar o bastante para
   acompanhar uma base com o olho, e o período inteiro passa em 2 minutos. No ritmo da vista do
   sistema (30 horas por segundo) a Terra daria mais de uma volta por segundo e viraria um borrão. */
const PLAY_HOURS_PER_SECOND = 6
/* Com a missão na tela, o cursor do relógio anda de 6 em 6 minutos: a subida leva 10 minutos e a
   espera na órbita da Terra pode levar menos de 10, e de hora em hora as duas sumiriam entre dois
   passos. */
const MISSION_STEP_HOURS = 0.1
/* Tocando a missão, 2 horas por segundo: os quatro dias e meio passam em menos de 1 minuto, e cada
   volta na órbita lunar, que leva 2 horas, dura 1 segundo. */
const MISSION_PLAY_HOURS_PER_SECOND = 2

/* A câmera nasce perto da Terra, que é onde as bases estão. O near é curto porque dá para chegar a
   menos de meio raio da Lua do chão dela; o far cobre a órbita inteira vista de longe. */
const CAMERA = { position: [0, 1.4, 4], fov: 35, near: 0.02, far: 3000 }
/* Para onde cada botão de câmera leva: o alvo, de que distância ele é visto e até onde dá para
   chegar perto, tudo em raios da Terra. De 230 raios a órbita inteira da Lua cabe na tela. */
const CAMERA_VIEWS = {
  earth: { distance: Math.hypot(...CAMERA.position), minDistance: 1.25 },
  moon: { distance: 1.3, minDistance: 0.4 },
  orbit: { distance: 230, minDistance: 1.25 },
  /* A nave: só existe com a missão na tela, e a câmera vai junto com ela. Perto da Terra e da Lua
     o limite de perto cresce, para a câmera não cair dentro do corpo (craftCamera). */
  craft: { distance: 2, minDistance: 0.3 },
}
const MAX_DISTANCE = 600
const ORIGIN = Object.freeze([0, 0, 0])
/* O céu de estrelas fica sempre no infinito: a casca em que a vista do sistema o prende de longe
   começa além de onde o zoom daqui chega. Entre 5 e 200 raios ele vai se revelando
   (starPoints.js). */
const STAR_SHELL = Object.freeze({ radius: 300, from: 1e6, to: 1e7 })
const STAR_ZOOM_RANGE = [5, 200]
const ORBIT_STEPS = 160
const LIGHT_DISTANCE = 100
const SUN_INTENSITY = 2.6
const AMBIENT_INTENSITY = 0.08
/* O raio da marca de uma base, em raios da Terra: 0,012 são uns 77 km, o bastante para aparecer
   com a Terra inteira na tela. A escolhida é maior. De perto elas encolhem (markerScale). Com a
   Terra inteira na tela, plataformas a menos disso uma da outra (as duas de Kennedy e a de Cabo
   Canaveral) ficam com as marcas em cima uma da outra, e é a lista que as separa. */
const MARKER_RADIUS = 0.012
const SELECTED_MARKER_RADIUS = 0.022
/* O raio da área que recebe o clique em volta de cada marca, em raios da Terra: 5 vezes a marca.
   Com a Terra inteira na tela dá uns 24 pixels de largura, o mínimo que o WCAG 2.5.8 pede para um
   alvo de clique; a marca sozinha teria 5. Encolhe de perto junto com ela. */
const HIT_RADIUS = 0.06
/* Até que distância da câmera o nome da base escolhida aparece, em raios da Terra. Mais longe a
   marca já não se vê, e o nome ficava em cima do nome da Terra (visto no navegador). */
const SITE_TAG_MAX_DISTANCE = 12
// a largura da linha da missão, em pixels: um pouco mais que a da órbita da Lua, que é o fundo
const PATH_WIDTH = 2.5
/* Em quantos traços cada curva desenhada (a subida e a descida final) é cortada. O tamanho do
   traço sai do comprimento da curva: a descida final tem um quinto do tamanho da subida. */
const SCHEMATIC_DASHES = 12
/* O raio do ponto da nave, em vezes a distância dela até a câmera: assim ele tem sempre uns 5
   pixels na tela, de perto e com a órbita inteira à vista. Com tamanho fixo ele sumiria de longe
   ou taparia a Lua de perto. */
const CRAFT_RADIUS_PER_DISTANCE = 0.005
/* Até que distância da câmera o nome de um evento aparece, em raios da Terra: de mais longe os
   dois da Terra ficam em cima um do outro e do nome dela, e os dois da Lua, do nome da Lua. */
const EVENT_TAG_MAX_DISTANCE = 12

/* O nome de um evento da missão, preso ao ponto do caminho em que ele acontece. position: o ponto,
   nas unidades do desenho. raised: o nome fica acima do ponto, e não abaixo. Some de longe
   (EVENT_TAG_MAX_DISTANCE), a cada quadro desenhado, direto no elemento. */
function EventTag({ position, text, raised = false, labels }) {
  const tag = useRef(null)
  useFrame(({ camera }) => {
    if (!tag.current) return
    const distance = Math.hypot(camera.position.x - position[0], camera.position.y - position[1], camera.position.z - position[2])
    tag.current.style.visibility = distance < EVENT_TAG_MAX_DISTANCE ? 'visible' : 'hidden'
  })
  return (
    <Html position={position} center pointerEvents="none" zIndexRange={[1, 0]} portal={labels}>
      <span ref={tag} className={`system-view__tag mission-view__event-tag${raised ? ' mission-view__event-tag--raised' : ''}`}>
        {text}
      </span>
    </Html>
  )
}

/* A nave no instante do relógio: um ponto que tem sempre o mesmo tamanho na tela, com o nome. */
function Spacecraft({ position, labels }) {
  const dot = useRef(null)
  useFrame(({ camera }) => {
    if (dot.current) dot.current.scale.setScalar(camera.position.distanceTo(dot.current.position) * CRAFT_RADIUS_PER_DISTANCE)
  })
  return (
    <>
      <mesh ref={dot} position={position}>
        <sphereGeometry args={[1, 16, 8]} />
        <meshBasicMaterial color={token('--color-text')} />
      </mesh>
      <Html position={position} center pointerEvents="none" zIndexRange={[1, 0]} portal={labels}>
        <span className="system-view__tag mission-view__craft-tag">{missionView.spacecraft}</span>
      </Html>
    </>
  )
}

// uma linha do caminho da missão: cheia no que é conta, tracejada no que é desenho
function PathLine({ line }) {
  return (
    <Line
      points={line.points}
      color={token('--color-accent')}
      lineWidth={PATH_WIDTH}
      dashed={line.dash > 0}
      dashSize={line.dash}
      gapSize={line.dash}
    />
  )
}

/* state: a Terra, a Lua e o Sol no instante (systemStateAt). orbit: o caminho da Lua, em km.
   sites: as bases. markers: onde fica a marca de cada uma, na mesma ordem. selectedIndex: qual é a
   escolhida, ou −1. faceSelected: se a câmera deve virar para a escolhida (a escolha veio da
   lista). onPick: chamada com o índice da base quando a pessoa clica na marca dela. cameraView:
   qual botão de câmera está ligado. labels: a camada onde os nomes são postos (o motivo está na
   SystemView.jsx).
   path: o caminho da missão já nas unidades do desenho, { lines, events }, ou null sem missão.
   craft: a nave no instante do relógio, { center, position }, ou null. O que é contado da Lua
   (center 'moon') é desenhado a partir da posição dela naquele instante, e anda com ela.
   missionKey: o que identifica a missão na tela (o instante do lançamento), ou null sem missão. */
function MissionBodies({
  state, orbit, sites, markers, selectedIndex, faceSelected, onPick, dateUtc, reducedMotion, cameraView, labels, path, craft, missionKey,
}) {
  const moonPosition = kmToUnits(state.moonKm)
  const fromCenter = (center, [x, y, z]) =>
    center === 'moon' ? [moonPosition[0] + x, moonPosition[1] + y, moonPosition[2] + z] : [x, y, z]
  const craftPosition = craft && fromCenter(craft.center, craft.position)
  const moonMatrix = useMemo(
    () => new Matrix4().fromArray(state.moonMatrix).setPosition(...kmToUnits(state.moonKm)),
    [state],
  )
  const earthMatrix = useMemo(() => new Matrix4().fromArray(state.earthMatrix), [state])
  const orbitPoints = useMemo(() => orbit.map(kmToUnits), [orbit])
  const sun = state.sunDirection
  const selected = selectedIndex >= 0 ? markers[selectedIndex] : null

  /* O nome da base escolhida some quando ela passa para o lado de trás da Terra e quando a câmera
     se afasta: o nome é texto por cima do desenho, e sem isto ficaria flutuando na frente de outro
     continente, ou em cima do nome da Terra. A cada quadro desenhado, direto no elemento, sem
     redesenhar a vista. */
  const siteTag = useRef(null)
  /* As marcas e, depois delas, as áreas de clique, na ordem das bases: o tamanho de cada uma
     acompanha a distância da câmera até ela. */
  const markerMeshes = useRef([])
  useFrame(({ camera }) => {
    for (const mesh of markerMeshes.current) {
      if (mesh) mesh.scale.setScalar(markerScale(camera.position.distanceTo(mesh.position)))
    }
    if (!siteTag.current || !selected) return
    const position = camera.position.toArray()
    const shown = Math.hypot(...position) < SITE_TAG_MAX_DISTANCE && facesCamera(selected, position)
    siteTag.current.style.visibility = shown ? 'visible' : 'hidden'
  })

  const view =
    cameraView === 'craft' && craft
      ? craftCamera(craftPosition, craft.center === 'moon' ? craft.position : craftPosition.map((value, k) => value - moonPosition[k]), {
          distance: CAMERA_VIEWS.craft.distance,
          near: CAMERA_VIEWS.craft.minDistance,
          earthClearance: CAMERA_VIEWS.earth.minDistance,
          moonClearance: CAMERA_VIEWS.moon.minDistance,
        })
      : CAMERA_VIEWS[cameraView]
  /* Escolher uma base na lista vira a câmera para ela (ZoomControls.jsx). A direção acompanha a
     base, que gira com a Terra; a câmera só se move quando a base escolhida troca. Quem clicou na
     marca já está olhando para ela: aí a câmera fica onde está.
     Quando a missão chega, a câmera vira de novo, de onde quer que a escolha tenha vindo: o
     relógio pula para a hora do lançamento, dias antes, a Terra aparece em outra posição, e a base
     de onde a linha sai pode ter ido para o outro lado. */
  const facing = useMemo(
    () =>
      selected && (faceSelected || missionKey !== null)
        ? { key: `${sites[selectedIndex].id} ${missionKey ?? ''}`, direction: selected.map((value) => value / MARKER_LIFT) }
        : null,
    [selected, faceSelected, missionKey, sites, selectedIndex],
  )

  /* O clique numa marca escolhe a base (missionPicking.js). O raio do clique só enxerga as áreas
     de clique, que são as únicas com quem ouve o evento: a Terra não entra, e é a regra do
     readSiteClick que tira a marca que está atrás dela. */
  const siteIndexOf = (hit) => hit.object.userData.siteIndex
  function handleSiteClick(event) {
    event.stopPropagation()
    const click = { delta: event.delta, hits: event.intersections.map(siteIndexOf) }
    const index = readSiteClick(click, markers, event.camera.position.toArray(), selectedIndex)
    if (index >= 0) onPick(index)
  }
  /* A mãozinha em cima de uma marca diz que ela é clicável. Só em cima das que estão do lado de
     cá da Terra: do outro lado o clique não faz nada. O cursor é posto no elemento em que o mouse
     está, que o próprio evento entrega: o canvas da cena. */
  function handleSiteOver(event) {
    const marker = markers[siteIndexOf(event)]
    if (marker && facesCamera(marker, event.camera.position.toArray())) event.nativeEvent.target.style.cursor = 'pointer'
  }
  function handleSiteOut(event) {
    event.nativeEvent.target.style.cursor = ''
  }

  return (
    <>
      <color attach="background" args={[token('--color-bg')]} />
      <StarField dateUtc={dateUtc} skyMatrix={ECLIPTIC_SKY_MATRIX} zoomRange={STAR_ZOOM_RANGE} shell={STAR_SHELL} />
      <ambientLight intensity={AMBIENT_INTENSITY} />
      <directionalLight position={sun.map((v) => v * LIGHT_DISTANCE)} intensity={SUN_INTENSITY} color={token('--color-sunlight')} />

      <EarthBody radius={EARTH_RADIUS} matrix={earthMatrix} sunDirection={sun} />
      <Html position={[0, -EARTH_RADIUS * 1.25, 0]} center pointerEvents="none" zIndexRange={[1, 0]} portal={labels}>
        <span className="system-view__tag">{missionView.earth}</span>
      </Html>

      {/* As bases. Cor sem luz (meshBasicMaterial): a marca tem que aparecer também do lado da
          noite. A posição já vem do motor no instante do relógio, e por isso as marcas ficam fora
          do grupo que gira com a Terra. */}
      {markers.map((position, i) => (
        <mesh
          key={sites[i].id}
          position={position}
          ref={(mesh) => {
            markerMeshes.current[i] = mesh
          }}
        >
          <sphereGeometry args={[i === selectedIndex ? SELECTED_MARKER_RADIUS : MARKER_RADIUS, 16, 8]} />
          <meshBasicMaterial color={token(i === selectedIndex ? '--color-accent' : '--color-text')} />
        </mesh>
      ))}
      {/* A área de clique de cada marca: uma esfera maior que ela, que não desenha nada (não
          escreve cor nem profundidade) e só existe para o raio do clique acertar. */}
      <group onClick={handleSiteClick} onPointerOver={handleSiteOver} onPointerOut={handleSiteOut}>
        {markers.map((position, i) => (
          <mesh
            key={sites[i].id}
            position={position}
            userData={{ siteIndex: i }}
            ref={(mesh) => {
              markerMeshes.current[markers.length + i] = mesh
            }}
          >
            <sphereGeometry args={[HIT_RADIUS, 12, 8]} />
            <meshBasicMaterial colorWrite={false} depthWrite={false} />
          </mesh>
        ))}
      </group>
      {selected && (
        <Html position={selected} center pointerEvents="none" zIndexRange={[1, 0]} portal={labels}>
          <span ref={siteTag} className="system-view__tag mission-view__site-tag">
            {sites[selectedIndex].name}
          </span>
        </Html>
      )}

      <MoonBody radius={MOON_RADIUS} matrix={moonMatrix} />
      <Html position={[moonPosition[0], moonPosition[1] - MOON_RADIUS * 1.6, moonPosition[2]]} center pointerEvents="none" zIndexRange={[1, 0]} portal={labels}>
        <span className="system-view__tag">{missionView.moon}</span>
      </Html>
      <Line points={orbitPoints} color={token('--color-text-secondary')} lineWidth={1.5} />

      {/* A missão: os trechos contados da Terra ficam parados no desenho, com a Terra girando
          embaixo deles; os contados da Lua ficam num grupo preso à Lua. */}
      {path && (
        <>
          {path.lines.filter((line) => line.center === 'earth').map((line) => <PathLine key={line.key} line={line} />)}
          <group position={moonPosition}>
            {path.lines.filter((line) => line.center === 'moon').map((line) => <PathLine key={line.key} line={line} />)}
          </group>
          {path.events.map((event) => (
            <EventTag
              key={event.key}
              position={fromCenter(event.center, event.position)}
              text={missionView.events[event.key]}
              // o pouso e a chegada à Lua acontecem perto um do outro, no polo: um nome sobe e o outro desce
              raised={event.key === 'landing'}
              labels={labels}
            />
          ))}
        </>
      )}
      {craftPosition && <Spacecraft position={craftPosition} labels={labels} />}

      <ZoomControls
        minDistance={view.minDistance}
        maxDistance={MAX_DISTANCE}
        reducedMotion={reducedMotion}
        target={cameraView === 'moon' ? moonPosition : cameraView === 'craft' && craftPosition ? craftPosition : ORIGIN}
        targetName={cameraView}
        distance={view.distance}
        facing={cameraView === 'earth' || cameraView === 'orbit' ? facing : null}
      />
    </>
  )
}

/* dateUtc: a data escolhida (um Date); sem missão, o relógio da vista começa nela. launchSites: as
   bases (src/data/launchSites.js). launchSiteId: o id da base escolhida, ou null.
   onLaunchSiteChange: chamada com o id quando a pessoa escolhe uma base na lista.
   landingSite: o local de pouso escolhido na Lua, { lat, lon, name }, ou null. skyStatus e
   landingWindows: o status e as janelas de pouso dele (useSiteSky). landingWindowStartMs: o começo
   da janela escolhida, em milissegundos UTC, ou null; sem escolha, ou se a janela guardada não
   existe mais, vale a primeira. onLandingWindowChange: chamada com o começo da janela que a pessoa
   escolhe na lista.
   Quem guarda as escolhas é o App.jsx, para elas não se perderem quando a pessoa troca de vista. */
export function MissionView({
  dateUtc, launchSites, launchSiteId, onLaunchSiteChange,
  landingSite = null, skyStatus = 'idle', landingWindows = null, landingWindowStartMs = null, onLandingWindowChange,
}) {
  const selectedIndex = launchSites.findIndex((site) => site.id === launchSiteId)
  const launchSite = launchSites[selectedIndex] ?? null
  const windows = landingSite && skyStatus === 'ready' ? (landingWindows ?? []) : []
  const landingWindow = windows.find((item) => item.startUtc.getTime() === landingWindowStartMs) ?? windows[0] ?? null
  const { status: missionStatus, mission } = useMission(launchSite, landingSite, landingWindow)

  /* O que o relógio cobre: a missão, do lançamento ao pouso, ou o período. O último passo do
     cursor cai no pouso ou logo depois dele, e a volta ao começo, tocando, vem um passo adiante. */
  const missionStartMs = mission ? mission.launchUtc.getTime() : null
  const clockStartMs = missionStartMs ?? dateUtc.getTime()
  const clockHours = mission
    ? (Math.ceil((mission.landingUtc.getTime() - missionStartMs) / HOUR_MS / MISSION_STEP_HOURS) + 1) * MISSION_STEP_HOURS
    : PERIOD_HOURS
  const clock = useViewClock(clockHours, mission ? MISSION_PLAY_HOURS_PER_SECOND : PLAY_HOURS_PER_SECOND, missionStartMs ?? 'period')
  const reducedMotion = usePrefersReducedMotion()
  const labels = useRef(null)
  const [chosenCameraView, setCameraView] = useState('earth')
  // a nave só existe com a missão: se a missão some com a câmera nela, a câmera volta para a Terra
  const cameraView = chosenCameraView === 'craft' && !mission ? 'earth' : chosenCameraView
  /* Se a câmera vira para a base escolhida. Sim quando a escolha vem da lista (ou já veio feita,
     de outra vista): a base pode estar do outro lado da Terra. Não quando vem do clique na marca:
     a pessoa já está olhando para ela, e a câmera andar sozinha tiraria a Terra do lugar. */
  const [faceSelected, setFaceSelected] = useState(true)
  /* A câmera nasce com o Sol de lado, pela direção dele na data em que a vista abriu: a Terra
     aparece meio iluminada, com a linha do dia e da noite à vista. Fica no estado, e não é
     recalculada: depois de aberta, quem manda na câmera é a pessoa. */
  const [camera] = useState(() => ({
    ...CAMERA,
    position: sunSideStart(CAMERA.position, systemStateAt(dateUtc.getTime()).sunDirection),
  }))
  const dateMs = clockStartMs + clock.hour * HOUR_MS
  const state = useMemo(() => systemStateAt(dateMs), [dateMs])
  // o mês da Lua a partir de onde o relógio começa: a missão começa dias antes da data escolhida
  const orbit = useMemo(() => moonOrbitPath(clockStartMs, ORBIT_STEPS), [clockStartMs])
  const markers = useMemo(
    () => launchSites.map((site) => markerPosition(earthSiteKm(site.lat, site.lon, dateMs))),
    [launchSites, dateMs],
  )
  const earthRadii = state.distanceKm / EARTH_EQUATORIAL_RADIUS_KM

  // o caminho da missão nas unidades do desenho: refeito só quando a missão troca
  const path = useMemo(() => {
    if (!mission) return null
    return {
      lines: mission.segments.map((segment) => {
        const points = segmentUnits(segment)
        const dash = segment.kind === 'schematic' ? pathLength(points) / (2 * SCHEMATIC_DASHES) : 0
        return { key: segment.phase, center: segment.center, points, dash }
      }),
      events: missionEvents(mission).map(({ key, center, positionKm }) => ({ key, center, position: kmToUnits(positionKm) })),
    }
  }, [mission])
  // a nave no instante do relógio
  const craft = useMemo(() => {
    if (!mission) return null
    const { phase, center, positionKm } = spacecraftAt(mission.segments, dateMs)
    return { phase, center, position: kmToUnits(positionKm) }
  }, [mission, dateMs])

  /* O que falta para haver uma missão, ou em que pé ela está: um texto só, o primeiro que se
     aplica. Sem base escolhida não entra aqui: quem pede a base é a nota dela, mais abaixo. */
  const notice =
    !landingSite ? missionView.noLandingSite
    : skyStatus === 'loading' ? missionView.windowsLoading
    : skyStatus === 'error' ? missionView.windowsError
    : skyStatus === 'ready' && windows.length === 0 ? missionView.noWindows
    : missionStatus === 'loading' ? missionView.missionLoading
    : missionStatus === 'error' ? missionView.missionError
    : mission ? missionView.missionReady(launchSite.name, landingSite.name)
    : ''

  /* Por ter ou não lançado à Lua, e não por país: é o que a lista afirma sobre cada base. O
     Object.groupBy guarda a ordem em que cada grupo aparece: quem decide a ordem é o
     launchSites.js. */
  const groups = Object.entries(
    Object.groupBy(launchSites, (site) => (site.lunarLaunch ? missionView.groupLaunched : missionView.groupNotYet)),
  )

  return (
    <div className="system-view mission-view">
      <div className="system-view__scene" role="img" aria-label={mission ? missionView.labelWithMission : missionView.label}>
        <Canvas frameloop="demand" gl={{ antialias: true }} camera={camera}>
          <MissionBodies
            state={state}
            orbit={orbit}
            sites={launchSites}
            markers={markers}
            selectedIndex={selectedIndex}
            faceSelected={faceSelected}
            onPick={(index) => {
              setFaceSelected(false)
              onLaunchSiteChange(launchSites[index].id)
            }}
            dateUtc={dateUtc}
            reducedMotion={reducedMotion}
            cameraView={cameraView}
            labels={labels}
            path={path}
            craft={craft}
            missionKey={missionStartMs}
          />
        </Canvas>
        <div className="system-view__labels" ref={labels} />
      </div>
      <ViewClock
        clock={clock}
        startUtc={new Date(clockStartMs)}
        periodHours={clockHours}
        stepHours={mission ? MISSION_STEP_HOURS : 1}
        labels={mission ? { ...missionView, timeLabel: missionView.missionTimeLabel } : missionView}
      >
        <div className="mission-view__camera" role="group" aria-label={missionView.cameraLabel}>
          {Object.keys(CAMERA_VIEWS).filter((name) => name !== 'craft' || mission).map((name) => (
            <button
              key={name}
              className="view-clock__button"
              type="button"
              aria-pressed={cameraView === name}
              onClick={() => setCameraView(name)}
            >
              {missionView.camera[name]}
            </button>
          ))}
        </div>
      </ViewClock>
      {/* Dois <select> comuns, como a lista de locais de pouso (SiteList.jsx): já funcionam com
          teclado e com leitor de tela. Na das bases, a primeira opção é um aviso, e não uma base. */}
      <div className="mission-view__choices">
        <label className="mission-view__site">
          {missionView.launchSiteLabel}
          <select
            className="mission-view__select"
            value={launchSiteId ?? ''}
            onChange={(event) => {
              /* As bases estão na Terra: com a câmera na Lua, a escolha não mostraria nada. De
                 longe a câmera fica onde está, só vira. */
              if (cameraView === 'moon') setCameraView('earth')
              setFaceSelected(true)
              onLaunchSiteChange(event.target.value)
            }}
          >
            <option value="" disabled>
              {missionView.launchSitePlaceholder}
            </option>
            {groups.map(([groupLabel, groupSites]) => (
              <optgroup key={groupLabel} label={groupLabel}>
                {groupSites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        {/* As janelas de pouso do local escolhido na Lua. Só aparece quando há alguma: sem local, ou
            sem janela, quem explica é o aviso logo abaixo. */}
        {landingWindow && (
          <label className="mission-view__site mission-view__site--wide">
            {missionView.landingWindowLabel}
            <select
              className="mission-view__select"
              value={landingWindow.startUtc.getTime()}
              onChange={(event) => onLandingWindowChange(Number(event.target.value))}
            >
              {windows.map((item) => (
                <option key={item.startUtc.getTime()} value={item.startUtc.getTime()}>
                  {missionView.landingWindowValue(
                    formatUtc(item.startUtc),
                    formatUtc(item.endUtc),
                    // o "≥" na janela cortada pelo período, como no painel: ela dura mais que a parte dentro dele
                    `${item.startsBeforePeriod || item.endsAfterPeriod ? '≥ ' : ''}${formatDuration(item.durationHours)}`,
                  )}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {/* Sempre na página, mesmo vazio: é o que faz o leitor de tela anunciar "calculando" e o
          resultado quando o texto muda. */}
      <p className="system-view__note mission-view__notice" role="status">{notice}</p>
      {mission && (
        <dl className="system-view__facts">
          <div>
            <dt>{missionView.craftNow}</dt>
            <dd>{missionView.phases[craft.phase]}</dd>
          </div>
          <div>
            <dt>{missionView.launch}</dt>
            <dd>{missionView.launchValue(formatUtc(mission.launchUtc), mission.launchAzimuthDeg)}</dd>
          </div>
          <div>
            <dt>{missionView.parkingOrbit}</dt>
            <dd>{missionView.parkingOrbitValue(MISSION.parkingAltitudeKm, mission.parkingInclinationDeg)}</dd>
          </div>
          <div>
            <dt>{missionView.tli}</dt>
            <dd>{missionView.burnValue(formatUtc(mission.tliUtc), mission.tliDeltaVKmS)}</dd>
          </div>
          <div>
            <dt>{missionView.crossing}</dt>
            <dd>{formatDuration(mission.crossingHours)}</dd>
          </div>
          <div>
            <dt>{missionView.loi}</dt>
            <dd>{missionView.burnValue(formatUtc(mission.loiUtc), mission.loiDeltaVKmS)}</dd>
          </div>
          <div>
            <dt>{missionView.lunarOrbit}</dt>
            <dd>
              {missionView.lunarOrbitValue(MISSION.lunarOrbitAltitudeKm, mission.lunarInclinationDeg, formatDuration(mission.lunarOrbitHours))}
            </dd>
          </div>
          <div>
            <dt>{missionView.descent}</dt>
            <dd>{missionView.smallBurnValue(formatUtc(mission.descentUtc), mission.descentDeltaVKmS)}</dd>
          </div>
          <div>
            <dt>{missionView.landing}</dt>
            <dd>{formatUtc(mission.landingUtc)}</dd>
          </div>
        </dl>
      )}
      <dl className="system-view__facts">
        <div>
          <dt>{missionView.distance}</dt>
          <dd>{missionView.distanceValue(state.distanceKm, earthRadii)}</dd>
        </div>
        {launchSite && (
          <>
            <div>
              <dt>{missionView.coordinates}</dt>
              <dd>{missionView.coordinatesValue(launchSite)}</dd>
            </div>
            <div>
              <dt>{missionView.lunarLaunch}</dt>
              <dd>
                {launchSite.lunarLaunch
                  ? missionView.lunarLaunchValue(launchSite.lunarLaunch.mission, formatUtcDate(launchSite.lunarLaunch.launchedAtUtc))
                  : missionView.noLunarLaunch}
              </dd>
            </div>
          </>
        )}
      </dl>
      {!launchSite && <p className="system-view__note">{missionView.noLaunchSite}</p>}
      {mission && (
        <>
          <p className="system-view__note">{missionView.referenceNote}</p>
          <p className="system-view__note">{missionView.pathNote}</p>
          <p className="system-view__note">{missionView.leftOutNote}</p>
          <p className="system-view__note">{missionView.choicesNote(MISSION)}</p>
        </>
      )}
      <p className="system-view__note">{missionView.scaleNote(earthRadii)}</p>
      <p className="system-view__note">{missionView.sitesNote(EARTH_SIDEREAL_DAY_HOURS)}</p>
    </div>
  )
}
