/* A vista da missão (cards C13, C16 e C17): a Terra e a Lua em escala, com as bases de lançamento
 * marcadas na Terra, cada uma na latitude e na longitude de verdade, e o caminho de uma missão da
 * base escolhida até o local de pouso escolhido na Lua.
 *
 * A escala é a de verdade (missionScale.js), porque a órbita de espera fica a 185 km do chão: a Lua
 * fica a uns 60 raios da Terra. Em escala, ou se vê a nave ou se vê o trajeto inteiro; por isso a
 * câmera vai sozinha aonde importa em cada momento, e voando o trajeto inteiro fica num mapa
 * pequeno no canto (MissionMap.jsx).
 *
 * A vista tem dois modos. Planejando, o painel da missão (MissionControl.jsx) fica por cima da
 * cena, um passo por vez, e a câmera vai ao polo sul da Lua ou à Terra, onde se escolhe. Voando,
 * depois do Launch, ficam o trilho da missão, o cartão de voo e o mapa (MissionFlight.jsx), e a
 * câmera acompanha a nave.
 *
 * As posições e as rotações são do motor: a Terra e a Lua, do src/engine/system.js; cada base, do
 * src/engine/earthSite.js; e a missão, do src/engine/mission.js, pela ponte (useMission). Aqui não
 * tem conta de órbita. O relógio da missão não muda a data do cálculo: anda pelo trilho, do
 * lançamento ao pouso, e a Terra, a Lua e a nave são desenhadas no instante dele.
 */
import { Html, Line } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Matrix4 } from 'three'

import { missionView } from '../data/missionView.js'
import { MIN_LANDING_WINDOW_HOURS, MISSION, PERIOD_DAYS } from '../engine/config.js'
import { EARTH_EQUATORIAL_RADIUS_KM, EARTH_SIDEREAL_DAY_HOURS, earthSiteKm } from '../engine/earthSite.js'
import { ECLIPTIC_SKY_MATRIX, moonOrbitPath, systemStateAt } from '../engine/system.js'
import { useKeepFocus } from '../hooks/useKeepFocus.js'
import { useLandingAreas } from '../hooks/useLandingAreas.js'
import { useLaunchReach } from '../hooks/useLaunchReach.js'
import { useMission } from '../hooks/useMission.js'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion.js'
import { useViewClock } from '../hooks/useViewClock.js'
import { formatDuration, formatUtc, formatUtcDate } from '../panel/format.js'
import { token } from './cssToken.js'
import { EarthBody } from './EarthBody.jsx'
import { LandingAreasLayer } from './LandingAreasLayer.jsx'
import { sunSideStart } from './framing.js'
import { LAUNCH_STEP, MissionControl } from './MissionControl.jsx'
import { MissionComplete, MissionHud, TRACK_STEPS } from './MissionFlight.jsx'
import { mapPoint, missionMap } from './missionMap.js'
import { MissionMap } from './MissionMap.jsx'
import {
  craftCamera, craftViewDirection, flownPoints, landingStartHeight, landingViewDirection, landingViewUp, launchViewDirection,
  missionEvents, moonViewDirection, nextEvent,
  orbitNormal, pathLength, segmentUnits, spacecraftAt, telemetryAt, timeAtTrack, trackLayout, watchesMoon,
} from './missionPath.js'
import { landingMarkerPosition, readLandingClick, readSiteClick } from './missionPicking.js'
import {
  EARTH_RADIUS, MARKER_LIFT, MOON_RADIUS, facesCamera, kmToUnits, markerPosition, markerScale,
} from './missionScale.js'
import { MoonBody } from './MoonBody.jsx'
import { CLICK_MAX_DRAG_PX } from './picking.js'
import { StarField } from './StarField.jsx'
import { ZoomControls } from './ZoomControls.jsx'
// o mesmo esqueleto da vista do sistema (a cena, a camada dos nomes, os números e as notas)
import './SystemView.css'
import './MissionView.css'

const HOUR_MS = 3600e3
/* Tocando, a missão inteira leva estes segundos, do lançamento ao pouso. O relógio anda pelo
   trilho, e não pelo tempo: cada fase leva na tela a parte do trilho que ela ocupa (a subida e o
   pouso, 5 segundos cada; a travessia, 15). Andando pelo tempo, a 2 horas por segundo, a subida
   passava em um décimo de segundo. */
const MISSION_PLAY_SECONDS = 45
// a velocidade rápida: a missão inteira em 11 segundos, para quem quer ver de novo
const FAST_FACTOR = 4
// quanto da cor fica na parte da linha que a nave ainda não voou
const REMAINING_OPACITY = 0.3

/* A câmera nasce perto da Terra, que é onde as bases estão. O near é curto porque dá para chegar a
   menos de meio raio da Lua do chão dela; o far cobre a órbita inteira vista de longe. */
const CAMERA = { position: [0, 1.4, 4], fov: 35, near: 0.02, far: 3000 }
/* Os alvos da câmera: de que distância cada um é visto e até onde dá para chegar perto, em raios
   da Terra. Quem escolhe o alvo é o passo aberto no painel e, voando, a nave. */
const CAMERA_VIEWS = {
  earth: { distance: Math.hypot(...CAMERA.position), minDistance: 1.25 },
  moon: { distance: 1.3, minDistance: 0.4 },
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
/* No passo do pouso a Lua é um globo: a câmera gira em volta do centro dela, para qualquer lado, e
   a roda vai do chão à Lua inteira. Ela começa quase em cima do polo sul (landingViewDirection),
   à altura que a largura da cena pede (landingStartHeight). Antes a câmera girava em volta do
   ponto do polo e não subia além do horizonte dele: só se via a Lua por baixo, e o Marco achou a
   vista limitada (18/11/2026). O mais perto que ela chega do centro, em raios da Terra: */
const LANDING_MIN_DISTANCE = MOON_RADIUS + 0.03
/* Até onde a câmera chega do eixo vertical do desenho, que é quase o eixo da Lua: bem em cima
   dele não há lado para onde girar. É o mesmo limite da cena da Lua (framing.js). */
const POLAR_EDGE = Math.PI / 180
/* Voando em volta da Lua, a câmera olha a Lua de um lugar parado (moonViewDirection), a estas
   distâncias do centro dela, em raios da Terra: na órbita lunar, com a órbita inteira na tela; na
   descida e no pouso, mais perto, com a Lua inteira cabendo na altura da cena (de 0,8 ela passava
   da borda de cima). */
const MOON_ORBIT_DISTANCE = 1.3
const MOON_LANDING_DISTANCE = 0.95
// o ponto da nave durante o voo, em vezes o tamanho de base: é o que o olho tem que achar primeiro
const CRAFT_SIZE = 1.6
// o tamanho de um pino e do local escolhido, em vezes o tamanho de base
const PIN_SIZE = 1.2
const SELECTED_PIN_SIZE = 2
// a borda escura de um ponto, em vezes o tamanho dele
const RIM_SCALE = 1.35
// a área de clique de um pino, em vezes o ponto da nave: uns 30 pixels de largura na tela
const PIN_HIT_SIZE = 3
// no passo da base, as marcas das bases ficam maiores: é nelas que se clica
const PAD_STEP_SCALE = 1.8

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

/* Um ponto que tem sempre o mesmo tamanho na tela, de perto e de longe: a nave e o local de pouso.
   Cor sem luz (meshBasicMaterial), para aparecer também do lado da noite.
   rimmed: o ponto ganha uma borda escura (card C17, fase 5). Sem ela, o âmbar de um pino no chão
   claro da Lua e o branco da nave sobre as nuvens da Terra quase somem: o contraste entre as duas
   cores fica perto de 1,3 para 1, e a WCAG pede 3 para 1 no que se precisa achar (1.4.11). A borda
   é uma esfera maior, na cor do fundo, e o ponto fica na frente dela, um pouco para o lado da
   câmera, a cada quadro. */
function ScreenDot({ position, color, size = 1, userData, rimmed = false }) {
  const dot = useRef(null)
  const rim = useRef(null)
  useFrame(({ camera }) => {
    if (!dot.current) return
    const [x, y, z] = position
    const toCamera = [camera.position.x - x, camera.position.y - y, camera.position.z - z]
    const distance = Math.hypot(...toCamera)
    const scale = distance * CRAFT_RADIUS_PER_DISTANCE * size
    dot.current.scale.setScalar(scale)
    if (!rim.current) return
    rim.current.scale.setScalar(scale * RIM_SCALE)
    const lift = (scale * RIM_SCALE) / distance
    dot.current.position.set(x + toCamera[0] * lift, y + toCamera[1] * lift, z + toCamera[2] * lift)
  })
  return (
    <>
      <mesh ref={dot} position={position} userData={userData}>
        <sphereGeometry args={[1, 16, 8]} />
        {/* sem cor, é uma área de clique: não desenha nada, só existe para o raio do clique acertar */}
        {color ? <meshBasicMaterial color={token(color)} /> : <meshBasicMaterial colorWrite={false} depthWrite={false} />}
      </mesh>
      {rimmed && (
        <mesh ref={rim} position={position}>
          <sphereGeometry args={[1, 16, 8]} />
          <meshBasicMaterial color={token('--color-bg')} />
        </mesh>
      )}
    </>
  )
}

/* Os locais de pouso conhecidos, como pinos na Lua (card C17, fase 2): um ponto por local, com o
   nome ao passar o mouse, e o clique escolhe o local. sites: os locais. positions: onde fica cada
   um, no desenho. onPick: chamada com o local clicado. O escolhido ganha a marca maior do local
   de pouso, que o MissionBodies desenha por cima.
   Os pinos do outro lado da Lua não respondem: o raio do clique acerta a Lua antes, e ela segura o
   evento (MissionBodies). */
function SitePins({ sites, positions, onPick, labels }) {
  const [hovered, setHovered] = useState(-1)
  const indexOf = (event) => event.object.userData.pinIndex
  return (
    <>
      {sites.map((site, i) => (
        // na cor de destaque: o branco das marcas das bases some no cinza claro da Lua
        <ScreenDot key={site.id} position={positions[i]} color="--color-accent" size={PIN_SIZE} rimmed />
      ))}
      <group
        onClick={(event) => {
          event.stopPropagation()
          // o fim de um arrasto não é clique, pelo mesmo limite dos outros cliques da cena
          if (event.delta <= CLICK_MAX_DRAG_PX) onPick(sites[indexOf(event)])
        }}
        onPointerOver={(event) => {
          event.stopPropagation()
          event.nativeEvent.target.style.cursor = 'pointer'
          setHovered(indexOf(event))
        }}
        onPointerOut={() => setHovered(-1)}
      >
        {sites.map((site, i) => (
          <ScreenDot key={site.id} position={positions[i]} size={PIN_HIT_SIZE} userData={{ pinIndex: i }} />
        ))}
      </group>
      {hovered >= 0 && <EventTag position={positions[hovered]} text={sites[hovered].name} raised labels={labels} />}
    </>
  )
}


// uma linha do caminho da missão: cheia no que é conta, tracejada no que é desenho
function PathLine({ line, flown }) {
  /* flown: quantos pontos do trecho a nave já voou, ou null planejando, quando a linha é uma prévia
     e aparece inteira. Voando, a linha é desenhada duas vezes: inteira e fraca, e por cima forte
     só até onde a nave chegou. A forte é a mesma linha com menos pedaços desenhados (um pedaço
     entre cada dois pontos), sem refazer a geometria a cada quadro. Depois de cada desenho do
     React, e não só quando flown muda: a linha do Drei refaz a geometria quando os pontos trocam. */
  const strong = useRef(null)
  useLayoutEffect(() => {
    if (strong.current) strong.current.geometry.instanceCount = flown === null ? Infinity : Math.max(0, flown - 1)
  })
  const look = { points: line.points, color: token('--color-accent'), lineWidth: PATH_WIDTH, dashed: line.dash > 0, dashSize: line.dash, gapSize: line.dash }
  return (
    <>
      {flown !== null && <Line {...look} transparent opacity={REMAINING_OPACITY} />}
      <Line ref={strong} {...look} />
    </>
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
   missionKey: o que identifica a missão na tela (o instante do lançamento), ou null sem missão.
   landingSite: o local de pouso escolhido, { lat, lon }, ou null. onPickLanding: chamada com
   { lat, lon } quando a pessoa clica num ponto da Lua (card C17). launchKey: quantas vezes a
   pessoa lançou; quando muda, a câmera da nave se põe em cima da base. upcoming: voando, o
   próximo evento da missão, o único que ganha nome na cena; planejando, null: a linha é só uma prévia.
   knownSites: os locais de pouso conhecidos. step: o passo aberto no painel, ou null voando: no do
   pouso (0) a câmera olha o polo sul da Lua e os locais conhecidos viram pinos; no da base (2) as
   marcas das bases crescem. Voando, só a base escolhida aparece, e a cena não escolhe nada.
   flown: voando, quantos pontos de cada trecho a nave já voou, por fase; planejando, null.
   craftTick: o passo do trilho em que a missão está; é o que faz a câmera da nave acompanhá-la.
   freeCamera: a pessoa soltou a câmera; ela vai junto com a nave, mas não se põe sozinha.
   landingAreas: o mapa de onde dá para pousar (o areas do useLandingAreas), ou null desligado
   (card C18).
   reach: o que a conta rápida disse de cada base para a janela (useLaunchReach), ou null; a marca
   da base que não alcança a órbita fica na cor apagada (card C19). */
function MissionBodies({
  state, orbit, sites, markers, selectedIndex, faceSelected, onPick, dateUtc, reducedMotion, cameraView, labels, path, craft, missionKey,
  landingSite, onPickLanding, launchKey, upcoming, knownSites, step, flown, craftTick, freeCamera, landingAreas, reach,
}) {
  const planning = step !== null
  // a largura da cena sobre a altura dela: numa cena em pé, a câmera do passo do pouso começa mais alta
  const aspect = useThree((three) => three.size.width / three.size.height)
  /* No passo do pouso, a câmera da Lua começa em cima do polo sul, de perto, onde estão os locais
     conhecidos. No da janela também, quando a câmera está na Lua (card C18): é onde estão o ponto
     escolhido e o mapa de onde dá para pousar, e sair dali para a Lua inteira afastava os dois. */
  const moonStep = step === 0 || step === 1
  const poleView = cameraView === 'moon' && moonStep
  // voando em volta da Lua, a câmera olha a Lua de um lugar parado, e não a nave
  const atMoon = cameraView === 'craft' && Boolean(craft) && watchesMoon(craft.phase)
  const [hoveredPad, setHoveredPad] = useState(-1)
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
  /* Um nome por vez (card C17, fase 5): quando o próximo evento é na Lua e a câmera está perto
     dela, o nome do evento aparece em cima da Lua, e o nome "Moon" ficava por baixo dele, os dois
     ilegíveis. De perto, quem fala é o evento; de longe, onde o nome do evento some, é a Lua. */
  const moonTag = useRef(null)
  // no passo do pouso também: com a Lua enchendo a cena, o nome dela aparecia cortado numa borda
  const eventOnMoon = upcoming?.center === 'moon' || poleView
  useFrame(({ camera }) => {
    for (const mesh of markerMeshes.current) {
      if (mesh) mesh.scale.setScalar(markerScale(camera.position.distanceTo(mesh.position)))
    }
    if (moonTag.current) {
      const fromMoon = Math.hypot(camera.position.x - moonPosition[0], camera.position.y - moonPosition[1], camera.position.z - moonPosition[2])
      moonTag.current.style.visibility = eventOnMoon && fromMoon < EVENT_TAG_MAX_DISTANCE ? 'hidden' : 'visible'
    }
    if (!siteTag.current || !selected) return
    const position = camera.position.toArray()
    const shown = Math.hypot(...position) < SITE_TAG_MAX_DISTANCE && facesCamera(selected, position)
    siteTag.current.style.visibility = shown ? 'visible' : 'hidden'
  })

  const view =
    atMoon
      ? { distance: craft.phase === 'lunarOrbit' ? MOON_ORBIT_DISTANCE : MOON_LANDING_DISTANCE, minDistance: CAMERA_VIEWS.moon.minDistance }
      : cameraView === 'craft' && craft
      ? craftCamera(craftPosition, craft.center === 'moon' ? craft.position : craftPosition.map((value, k) => value - moonPosition[k]), {
          distance: CAMERA_VIEWS.craft.distance,
          near: CAMERA_VIEWS.craft.minDistance,
          earthClearance: CAMERA_VIEWS.earth.minDistance,
          moonClearance: CAMERA_VIEWS.moon.minDistance,
        })
      : poleView
        ? { distance: MOON_RADIUS + landingStartHeight(aspect), minDistance: LANDING_MIN_DISTANCE }
        : CAMERA_VIEWS[cameraView]
  /* No passo do pouso, a câmera da Lua vai para cima do polo sul, de perto (landingViewDirection).
     Só a entrada no passo move a câmera: depois quem manda é a pessoa. */
  const moonFacing = useMemo(
    () => (moonStep ? { key: 'landing', direction: landingViewDirection(state.moonMatrix, state.sunDirection) } : null),
    [moonStep, state],
  )
  // no passo do pouso o eixo de giro dos controles se deita, para o polo não ficar em cima dele
  const landingUp = useMemo(() => landingViewUp(state.moonMatrix, state.sunDirection), [state])
  /* No passo da base, sem base escolhida, a câmera da Terra vai para o lado do dia, ao norte do
     equador, onde estão quase todas as bases (launchViewDirection). Com uma base escolhida, quem
     manda é ela (facing, mais abaixo). */
  const padsFacing = useMemo(
    () => (step === 2 ? { key: 'pads', direction: launchViewDirection(state.earthMatrix, state.sunDirection) } : null),
    [step, state],
  )
  // os pinos dos locais conhecidos, presos à Lua
  const pinPositions = useMemo(
    () => knownSites.map((site) => landingMarkerPosition(site, state.moonMatrix).map((value, k) => value + moonPosition[k])),
    // a posição da Lua sai do mesmo state
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [knownSites, state],
  )
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

  /* A câmera que conta a história: voando, ela se põe sozinha, de um jeito por fase
     (craftViewDirection), e acompanha a nave a cada passo do trilho. Sem isto a câmera ficava
     parada em relação à nave, e a nave, dando a volta, sumia atrás do corpo (visto no navegador:
     a tela toda de mar na órbita de espera). Com a câmera livre ela continua indo junto com a
     nave, mas quem a gira e aproxima é a pessoa. */
  /* Em volta da Lua a câmera não acompanha a nave: põe-se uma vez na entrada da órbita lunar e
     outra na da descida, num lugar parado, e é a nave que dá a volta. Acompanhando a nave a cada
     passo do trilho, a câmera dava seis voltas na Lua em dez segundos, e a vista pulava (o Marco
     viu em 18/11/2026). Entre uma e outra a pessoa gira e aproxima à vontade. */
  const lunarOrbitLine = path?.lines.find((line) => line.key === 'lunarOrbit')
  const lunarNormal = useMemo(() => (lunarOrbitLine ? orbitNormal(lunarOrbitLine.points) : null), [lunarOrbitLine])
  const moonFlightStage = atMoon ? (craft.phase === 'lunarOrbit' ? 'orbit' : 'landing') : null
  const moonFlightFacing = useMemo(() => {
    if (!moonFlightStage || freeCamera || !lunarNormal || !landingSite) return null
    const fromMoon = landingMarkerPosition(landingSite, state.moonMatrix)
    const length = Math.hypot(...fromMoon)
    const direction = moonViewDirection({
      phase: moonFlightStage === 'orbit' ? 'lunarOrbit' : 'landing',
      orbitNormal: lunarNormal,
      landingDirection: fromMoon.map((value) => value / length),
      sunDirection: state.sunDirection,
    })
    return { key: `${launchKey} ${moonFlightStage}`, direction }
  }, [moonFlightStage, freeCamera, lunarNormal, landingSite, state, launchKey])

  const craftFacing = useMemo(() => {
    if (!craft || !craftPosition || freeCamera) return null
    const direction = craftViewDirection({
      phase: craft.phase,
      fromEarth: craftPosition,
      fromMoon: craftPosition.map((value, k) => value - moonPosition[k]),
      phaseProgress: craft.phaseProgress,
    })
    return { key: `${launchKey} ${craftTick}`, direction }
    // a posição da nave e a da Lua saem do craft e do state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [craft, state, freeCamera, launchKey, craftTick])

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
    const index = siteIndexOf(event)
    const marker = markers[index]
    if (!marker || !facesCamera(marker, event.camera.position.toArray())) return
    event.nativeEvent.target.style.cursor = 'pointer'
    // o nome da base em que o mouse está: as marcas são pontos iguais, e é o nome que as distingue
    setHoveredPad(index)
  }
  function handleSiteOut(event) {
    event.nativeEvent.target.style.cursor = ''
    setHoveredPad(-1)
  }

  /* O clique na Lua escolhe o local de pouso (missionPicking.js): qualquer ponto dela, como na
     vista da Lua. A mãozinha em cima dela diz que dá para clicar. */
  function handleMoonClick(event) {
    event.stopPropagation()
    const site = readLandingClick({ point: event.point.toArray(), delta: event.delta }, moonPosition, state.moonMatrix)
    if (site) onPickLanding(site)
  }
  // a Lua segura o evento: o que está atrás dela (um pino do outro lado) não responde ao mouse
  function handleMoonOver(event) {
    event.stopPropagation()
    event.nativeEvent.target.style.cursor = 'pointer'
  }
  // a marca do local de pouso, presa à Lua: anda e gira com ela
  const landingMarker = landingSite && fromCenter('moon', landingMarkerPosition(landingSite, state.moonMatrix))

  return (
    <>
      <color attach="background" args={[token('--color-bg')]} />
      <StarField dateUtc={dateUtc} skyMatrix={ECLIPTIC_SKY_MATRIX} zoomRange={STAR_ZOOM_RANGE} shell={STAR_SHELL} />
      <ambientLight intensity={AMBIENT_INTENSITY} />
      <directionalLight position={sun.map((v) => v * LIGHT_DISTANCE)} intensity={SUN_INTENSITY} color={token('--color-sunlight')} />

      {/* as linhas dos eixos ajudam a ler a Terra e a Lua paradas; voando, são ruído em volta da linha da missão */}
      <EarthBody radius={EARTH_RADIUS} matrix={earthMatrix} sunDirection={sun} showAxis={planning} />
      <Html position={[0, -EARTH_RADIUS * 1.25, 0]} center pointerEvents="none" zIndexRange={[1, 0]} portal={labels}>
        <span className="system-view__tag">{missionView.earth}</span>
      </Html>

      {/* As bases. Cor sem luz (meshBasicMaterial): a marca tem que aparecer também do lado da
          noite. A posição já vem do motor no instante do relógio, e por isso as marcas ficam fora
          do grupo que gira com a Terra. */}
      {markers.map((position, i) =>
        // voando, só a base de onde a missão saiu: as outras são ruído em volta da linha
        planning || i === selectedIndex ? (
          <mesh
            key={sites[i].id}
            position={position}
            ref={(mesh) => {
              markerMeshes.current[i] = mesh
            }}
          >
            <sphereGeometry args={[(i === selectedIndex ? SELECTED_MARKER_RADIUS : MARKER_RADIUS) * (step === 2 ? PAD_STEP_SCALE : 1), 16, 8]} />
            <meshBasicMaterial
              color={token(i === selectedIndex ? '--color-accent' : reach?.[sites[i].id] === 'blocked' ? '--color-text-muted' : '--color-text')}
            />
          </mesh>
        ) : null,
      )}
      {/* A área de clique de cada marca: uma esfera maior que ela, que não desenha nada (não
          escreve cor nem profundidade) e só existe para o raio do clique acertar. Só planejando:
          voando, a cena não troca a missão. */}
      {planning && (
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
      )}
      {hoveredPad >= 0 && hoveredPad !== selectedIndex && markers[hoveredPad] && (
        <EventTag position={markers[hoveredPad]} text={sites[hoveredPad].name} raised labels={labels} />
      )}
      {/* o nome da base escolhida, só planejando: voando, o nome que importa é o do próximo evento */}
      {selected && planning && (
        <Html position={selected} center pointerEvents="none" zIndexRange={[1, 0]} portal={labels}>
          <span ref={siteTag} className="system-view__tag mission-view__site-tag">
            {sites[selectedIndex].name}
          </span>
        </Html>
      )}

      {/* Planejando, a Lua é clicável: qualquer ponto dela pode ser o local de pouso. */}
      <MoonBody
        radius={MOON_RADIUS}
        matrix={moonMatrix}
        onClick={planning ? handleMoonClick : undefined}
        onPointerOver={planning ? handleMoonOver : undefined}
        onPointerOut={planning ? handleSiteOut : undefined}
        // no passo do pouso a câmera olha o polo, e a linha do eixo atravessaria os pinos
        showAxis={planning && !moonStep}
        relief
      />
      {/* As manchas de onde dá para pousar: o mesmo mapa da vista da Lua, nos mesmos uniformes, que
          o material da Lua daqui também lê (MoonBody.jsx). */}
      <LandingAreasLayer areas={landingAreas} color={token('--color-success')} />
      {step === 0 && <SitePins sites={knownSites} positions={pinPositions} onPick={onPickLanding} labels={labels} />}
      {landingMarker && <ScreenDot position={landingMarker} color="--color-accent" size={SELECTED_PIN_SIZE} rimmed />}
      {/* voando, o nome do pouso já está lá, no fim da linha */}
      {landingMarker && planning && (
        <EventTag position={landingMarker} text={landingSite.name ?? missionView.customLandingSite} labels={labels} />
      )}
      <Html position={[moonPosition[0], moonPosition[1] - MOON_RADIUS * 1.6, moonPosition[2]]} center pointerEvents="none" zIndexRange={[1, 0]} portal={labels}>
        <span ref={moonTag} className="system-view__tag">
          {missionView.moon}
        </span>
      </Html>
      <Line points={orbitPoints} color={token('--color-text-secondary')} lineWidth={1.5} />

      {/* A missão: os trechos contados da Terra ficam parados no desenho, com a Terra girando
          embaixo deles; os contados da Lua ficam num grupo preso à Lua. */}
      {path && (
        <>
          {path.lines.filter((line) => line.center === 'earth').map((line) => (
            <PathLine key={line.key} line={line} flown={flown ? flown[line.key] : null} />
          ))}
          <group position={moonPosition}>
            {path.lines.filter((line) => line.center === 'moon').map((line) => (
              <PathLine key={line.key} line={line} flown={flown ? flown[line.key] : null} />
            ))}
          </group>
          {/* Um nome de evento por vez: o do próximo, o lugar para onde a nave está indo. */}
          {upcoming && (
            <EventTag key={upcoming.key} position={fromCenter(upcoming.center, upcoming.position)} text={missionView.events[upcoming.key]} labels={labels} />
          )}
        </>
      )}
      {/* A nave no instante do relógio: um ponto, sem nome. O cartão de voo já diz onde ela está, e
          o nome em cima do ponto empilhava com os outros no lançamento. */}
      {craftPosition && <ScreenDot position={craftPosition} color="--color-text" size={CRAFT_SIZE} rimmed />}

      <ZoomControls
        minDistance={view.minDistance}
        maxDistance={MAX_DISTANCE}
        reducedMotion={reducedMotion}
        target={cameraView === 'moon' || atMoon ? moonPosition : cameraView === 'craft' && craftPosition ? craftPosition : ORIGIN}
        // a vista do polo, a Lua inteira e a Lua do voo são alvos diferentes: trocar de um para o outro desliza
        targetName={poleView ? 'pole' : atMoon ? 'craft-moon' : cameraView}
        distance={view.distance}
        facing={atMoon ? moonFlightFacing : cameraView === 'craft' ? craftFacing : cameraView === 'moon' ? moonFacing : (facing ?? padsFacing)}
        minPolarAngle={poleView ? POLAR_EDGE : 0}
        maxPolarAngle={poleView ? Math.PI - POLAR_EDGE : Math.PI}
        surfaceRadius={poleView ? MOON_RADIUS : null}
        up={poleView ? landingUp : undefined}
      />
    </>
  )
}

/* O aviso do passo da janela quando o período não tem nenhuma (card C18), pelo que a busca
   adiante achou: a próxima janela, o lado oculto ou nada em um ano. Sem a busca (nextWindow null),
   o aviso antigo, que manda trocar a data ou o local. */
function noWindowNotice(nextWindow, dateUtc) {
  if (!nextWindow) return missionView.noWindows(PERIOD_DAYS)
  const { landingWindow: next, earthEverAboveHorizon, searchedUntilUtc } = nextWindow
  if (next) {
    // o "≥" na janela que passa do fim do período dela, como nos cartões (MissionControl.jsx)
    const duration = `${next.startsBeforePeriod || next.endsAfterPeriod ? '≥ ' : ''}${formatDuration(next.durationHours)}`
    return missionView.nextWindow(PERIOD_DAYS, formatUtcDate(dateUtc), formatUtc(next.startUtc), duration)
  }
  if (!earthEverAboveHorizon) return missionView.farSide
  return missionView.noWindowUntil(formatUtcDate(searchedUntilUtc), MIN_LANDING_WINDOW_HOURS)
}

/* dateUtc: a data escolhida (um Date); sem missão, o relógio da vista começa nela. launchSites: as
   bases (src/data/launchSites.js). launchSiteId: o id da base escolhida, ou null.
   onLaunchSiteChange: chamada com o id quando a pessoa escolhe uma base na lista.
   landingSite: o local de pouso escolhido na Lua, { lat, lon, name }, ou null. skyStatus e
   landingWindows: o status e as janelas de pouso dele (useSiteSky). landingWindowStartMs: o começo
   da janela escolhida, em milissegundos UTC, ou null; sem escolha, ou se a janela guardada não
   existe mais, vale a primeira. onLandingWindowChange: chamada com o começo da janela que a pessoa
   escolhe na lista.
   sites: os locais de pouso conhecidos (src/data/sites.js), para a lista do painel da missão.
   onLandingSiteChange: chamada com o local escolhido, da lista ou do clique na Lua (card C17).
   onDateChange: chamada com a data que a pessoa escolhe no passo da janela; é a data da tela
   inteira, de onde as janelas de pouso são procuradas.
   nextWindow: sem janela no período, o que a busca adiante achou (sky.nextWindow, card C18), ou null.
   startStep: o passo em que o painel abre, ou null para o primeiro que falta; o App manda 1 quando
   a pessoa vem da vista da Lua com o ponto escolhido (card C18).
   showLandingAreas e onToggleLandingAreas: o mapa de onde dá para pousar, o mesmo estado do mapa da
   vista da Lua (card C18).
   Quem guarda as escolhas é o App.jsx, para elas não se perderem quando a pessoa troca de vista. */
export function MissionView({
  dateUtc, launchSites, launchSiteId, onLaunchSiteChange,
  landingSite = null, skyStatus = 'idle', landingWindows = null, landingWindowStartMs = null, onLandingWindowChange,
  sites = [], onLandingSiteChange = () => {}, onDateChange = () => {},
  nextWindow = null, startStep = null, showLandingAreas = false, onToggleLandingAreas = () => {},
}) {
  const selectedIndex = launchSites.findIndex((site) => site.id === launchSiteId)
  const launchSite = launchSites[selectedIndex] ?? null
  const windows = landingSite && skyStatus === 'ready' ? (landingWindows ?? []) : []
  const landingWindow = windows.find((item) => item.startUtc.getTime() === landingWindowStartMs) ?? windows[0] ?? null
  const { status: missionStatus, mission, reason: missionReason } = useMission(launchSite, landingSite, landingWindow)
  /* Quais bases lançam, na janela escolhida, na direção que permitem (card C19): a lista as separa,
     e as marcas delas na Terra ficam apagadas. */
  const reach = useLaunchReach(launchSites, landingWindow)

  /* O relógio da missão anda pelo trilho, em passos de 0 a TRACK_STEPS, e não pelo tempo: o
     instante sai do lugar no trilho (timeAtTrack). O "hour" do useViewClock aqui é esse lugar.
     Tocando, ele para no fim do trilho, que é o pouso, em vez de voltar ao lançamento; e volta ao
     começo, parado, quando a missão troca. */
  const missionStartMs = mission ? mission.launchUtc.getTime() : null
  const [fast, setFast] = useState(false)
  // voando, a câmera se põe sozinha, a não ser que a pessoa a solte
  const [freeCamera, setFreeCamera] = useState(false)
  // o mapa pequeno do voo, oculto pela pessoa: vale para os próximos lançamentos também
  const [mapHidden, setMapHidden] = useState(false)
  const clock = useViewClock(
    TRACK_STEPS + 1,
    (TRACK_STEPS / MISSION_PLAY_SECONDS) * (fast ? FAST_FACTOR : 1),
    missionStartMs ?? 'period',
    TRACK_STEPS,
  )
  const trackPosition = clock.hour / TRACK_STEPS
  const reducedMotion = usePrefersReducedMotion()
  const labels = useRef(null)
  // para onde o foco do teclado vai quando o controle que o tinha sai da página (useKeepFocus, mais abaixo)
  const focusTarget = useRef(null)
  /* O passo aberto no painel: o que a pessoa reabriu clicando na etiqueta, ou, sem isso, o primeiro
     que falta fazer; com os três feitos, o do lançamento. */
  const [chosenStep, setChosenStep] = useState(startStep)
  const firstUndone = [landingSite, landingWindow, launchSite].findIndex((choice) => !choice)
  const openStep = chosenStep ?? (firstUndone === -1 ? LAUNCH_STEP : firstUndone)
  /* A câmera vai aonde se escolhe: à Lua no passo do pouso, à Terra no da base. Começa assim, e
     acompanha a troca de passo (vista durante o render, como a troca do relógio no useViewClock). */
  /* No passo da janela também é a Lua (card C18): é lá que estão o ponto escolhido e o mapa de onde
     dá para pousar. Antes a câmera ficava onde estava, e quem reabria a janela vindo do passo da
     base ligava o mapa olhando para a Terra. */
  const cameraOfStep = (step) => (step === 0 || step === 1 ? 'moon' : step === 2 ? 'earth' : null)
  const [chosenCameraView, setCameraView] = useState(() => cameraOfStep(openStep) ?? 'earth')
  const [stepOfCamera, setStepOfCamera] = useState(openStep)
  if (stepOfCamera !== openStep) {
    setStepOfCamera(openStep)
    if (cameraOfStep(openStep)) setCameraView(cameraOfStep(openStep))
  }
  /* A missão que está voando: a que foi lançada. Trocar qualquer escolha muda a missão, e a vista
     volta a planejar. */
  const [flightKey, setFlightKey] = useState(null)
  const flying = Boolean(mission) && flightKey === missionStartMs
  // quantas vezes a pessoa lançou: a cada lançamento a câmera da nave se põe em cima da base
  const [launchCount, setLaunchCount] = useState(0)
  // a nave só tem câmera voando: se a missão some com a câmera nela, a câmera volta para a Terra
  const cameraView = chosenCameraView === 'craft' && !flying ? 'earth' : chosenCameraView
  /* Se a câmera vira para a base escolhida. Sim quando a escolha vem da lista (ou já veio feita,
     de outra vista): a base pode estar do outro lado da Terra. Não quando vem do clique na marca:
     a pessoa já está olhando para ela, e a câmera andar sozinha tiraria a Terra do lugar. */
  const [faceSelected, setFaceSelected] = useState(true)
  /* A câmera nasce com o Sol de lado, pela direção dele na data em que a vista abriu: a Terra
     aparece meio iluminada, com a linha do dia e da noite à vista. Fica no estado, e não é
     recalculada: depois de aberta, quem manda na câmera é a pessoa. */
  const [camera] = useState(() => {
    const position = sunSideStart(CAMERA.position, systemStateAt(dateUtc.getTime()).sunDirection)
    /* Nascendo na Lua, a câmera já nasce à distância dela: os controles levam o alvo até a Lua
       sem mexer na distância, e de 4 raios a Lua seria uma bolinha. */
    const scale = chosenCameraView === 'moon' ? CAMERA_VIEWS.moon.distance / Math.hypot(...position) : 1
    return { ...CAMERA, position: position.map((value) => value * scale) }
  })
  // o instante da cena: o do trilho, com a missão; sem ela, a data escolhida
  const dateMs = mission ? timeAtTrack(mission.segments, trackPosition) : dateUtc.getTime()
  const state = useMemo(() => systemStateAt(dateMs), [dateMs])
  // o mês da Lua a partir do lançamento: a missão começa dias antes da data escolhida
  const orbitStartMs = missionStartMs ?? dateUtc.getTime()
  const orbit = useMemo(() => moonOrbitPath(orbitStartMs, ORBIT_STEPS), [orbitStartMs])
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
    const piece = trackLayout(mission.segments).find((item) => item.phase === phase)
    // quanto da fase já passou, de 0 a 1: a câmera muda de lado no meio da travessia
    const phaseProgress = piece.endMs > piece.startMs ? (dateMs - piece.startMs) / (piece.endMs - piece.startMs) : 0
    return { phase, center, positionKm, position: kmToUnits(positionKm), phaseProgress }
  }, [mission, dateMs])

  /* O aviso do cartão do painel: o que impede o passo aberto de andar, ou em que pé a conta está.
     No passo da janela, o que houve com as janelas do local; no do lançamento, a conta da missão.
     Nos outros dois a pergunta do passo já diz o que fazer. */
  const noWindow = skyStatus === 'ready' && windows.length === 0
  const windowNotice =
    !landingSite ? missionView.windowWaiting
    : skyStatus === 'loading' ? missionView.windowsLoading
    : skyStatus === 'error' ? missionView.windowsError
    : noWindow ? noWindowNotice(nextWindow, dateUtc)
    : ''
  const launchNotice =
    missionStatus === 'loading' ? missionView.missionLoading
    : missionStatus === 'error' ? (missionReason === 'azimuth' ? missionView.launchBlocked : missionView.missionError)
    : mission ? missionView.missionReady
    : ''
  const notice = openStep === 1 ? windowNotice : openStep === LAUNCH_STEP ? launchNotice : ''

  /* Sem janela no período e com uma achada adiante, o botão leva a busca para o período dela. Fica
     no passo da janela, como quem troca a data à mão: a janela nova aparece nos cartões antes de
     o painel seguir para a base. */
  const goToNextWindow = noWindow && nextWindow?.landingWindow
    ? () => {
        setChosenStep(1)
        onDateChange(nextWindow.periodStartUtc)
      }
    : null

  /* O mapa de onde dá para pousar (card C18). Só planejando: voando, as manchas seriam ruído em
     volta da linha da missão, e a conta não roda. */
  const landing = useLandingAreas(dateUtc, showLandingAreas && !flying)
  const landingAreasText =
    !showLandingAreas ? ''
    : landing.status === 'error' ? missionView.landingAreasError
    : landing.status === 'ready' ? missionView.landingAreasReady(PERIOD_DAYS, MIN_LANDING_WINDOW_HOURS)
    : missionView.landingAreasLoading

  /* Escolher fecha o passo que estava reaberto: o painel segue para o próximo que falta. */
  const chooseLandingSite = (site) => {
    setChosenStep(null)
    onLandingSiteChange(site)
  }
  const chooseLaunchSite = (id) => {
    setChosenStep(null)
    onLaunchSiteChange(id)
  }
  /* Para onde a câmera está virada, para os testes e para quem depura: o polo sul da Lua, a
     Terra ou a nave. A câmera é do WebGL; o que a tela sabe dela é isto. */
  const cameraName = cameraView === 'moon' ? 'pole' : cameraView
  // o mapa do trajeto inteiro, e a nave e a Lua nele, no instante do relógio
  const map = useMemo(() => (flying ? missionMap(mission, orbit) : null), [flying, mission, orbit])
  const craftOnMap = craft && mapPoint(craft.center === 'moon' ? craft.positionKm.map((value, k) => value + state.moonKm[k]) : craft.positionKm)

  // o relógio chegou ao pouso: a missão terminou, e o resumo dela aparece
  const complete = flying && clock.hour >= TRACK_STEPS
  // voando: os pedaços do trilho, a nave em números e quanto de cada trecho da linha já foi voado
  const layout = useMemo(() => (mission ? trackLayout(mission.segments) : null), [mission])
  const telemetry = useMemo(() => (flying ? telemetryAt(mission.segments, dateMs) : null), [flying, mission, dateMs])
  const flown = useMemo(
    () => (flying ? Object.fromEntries(mission.segments.map((segment) => [segment.phase, flownPoints(segment, dateMs)])) : null),
    [flying, mission, dateMs],
  )
  const elapsedHours = mission ? (dateMs - missionStartMs) / HOUR_MS : 0
  /* Lançar: a vista passa de planejar para voar, o relógio volta ao lançamento e toca, e a câmera
     vai para a nave. É a pessoa que aperta: a vista não se mexe sozinha (README, "Accessibility"). */
  const launch = () => {
    setFlightKey(missionStartMs)
    clock.seek(0)
    clock.setPlaying(true)
    setCameraView('craft')
    // cada lançamento começa com a câmera se pondo sozinha
    setFreeCamera(false)
    setLaunchCount((count) => count + 1)
  }
  // de volta a planejar: a missão continua montada, e a pessoa troca o que quiser
  const changeMission = () => {
    setFlightKey(null)
    clock.seek(0)
    setCameraView('earth')
  }

  /* O foco não se perde quando a tela muda de etapa: planejando vai para a pergunta do passo
     aberto, e voando, para o botão de tocar e pausar. Só um dos dois está na página de cada vez. */
  useKeepFocus(focusTarget, `${flying} ${openStep} ${launchCount}`)

  return (
    <div className="system-view mission-view">
      {/* A cena ocupa a largura toda, e o que se usa para montar e voar a missão fica por cima
          dela. Os controles são irmãos da cena, e não filhos: a cena é uma imagem para o leitor de
          tela (role="img"), e o que fica dentro de uma imagem não é lido. */}
      <div className={flying ? 'mission-view__stage mission-view__stage--flying' : 'mission-view__stage'}>
        {/* A área da cena: a cena e o que fica por cima dela e se prende às bordas dela. O selo e o
            resumo ficam fora, porque em tela de celular descem para baixo da cena. */}
        <div className="mission-view__scene-area">
          <div className="system-view__scene" role="img" aria-label={mission ? missionView.labelWithMission : missionView.label} data-camera={cameraName}>
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
                  chooseLaunchSite(launchSites[index].id)
                }}
                landingSite={landingSite}
                onPickLanding={chooseLandingSite}
                dateUtc={dateUtc}
                reducedMotion={reducedMotion}
                cameraView={cameraView}
                labels={labels}
                path={path}
                // planejando, a linha é uma prévia: a nave e os nomes dos eventos só aparecem voando
                craft={flying ? craft : null}
                upcoming={flying ? nextEvent(path.events, dateMs) : null}
                knownSites={sites}
                step={flying ? null : openStep}
                flown={flown}
                missionKey={missionStartMs}
                launchKey={launchCount}
                craftTick={Math.round(clock.hour)}
                freeCamera={freeCamera}
                reach={reach}
                landingAreas={flying ? null : landing.areas}
              />
            </Canvas>
            <div className="system-view__labels" ref={labels} />
          </div>
          {flying ? (
            <div className="mission-view__flight">
              <button className="view-clock__button" type="button" onClick={changeMission}>
                {missionView.changeMission}
              </button>
              {/* O que o leitor de tela ouve durante o voo: a troca de fase e o pouso. O cartão de voo
                  não serve para isso: os números dele mudam a cada quadro. Fora da vista, porque na
                  tela o cartão já diz a fase. */}
              <p className="mission-view__announcer" role="status">
                {complete ? missionView.completeTitle : missionView.phaseNames[craft.phase]}
              </p>
            </div>
          ) : (
            <MissionControl
              sites={sites}
              landingSite={landingSite}
              onLandingSiteChange={chooseLandingSite}
              windows={windows}
              landingWindow={landingWindow}
              onLandingWindowChange={(startMs) => {
                setChosenStep(null)
                onLandingWindowChange(startMs)
              }}
              dateUtc={dateUtc}
              onUseNextWindow={goToNextWindow}
              showLandingAreas={showLandingAreas}
              onToggleLandingAreas={onToggleLandingAreas}
              landingAreasText={landingAreasText}
              onDateChange={(date) => {
                /* Quem trocou a data fica no passo da janela: com janela na data nova a primeira
                   já vem escolhida, e o painel pularia para a base antes de a pessoa ver o que
                   mudou. */
                setChosenStep(1)
                onDateChange(date)
              }}
              launchSites={launchSites}
              launchSite={launchSite}
              reach={reach}
              onLaunchSiteChange={(id) => {
                setFaceSelected(true)
                chooseLaunchSite(id)
              }}
              openStep={openStep}
              onOpenStep={setChosenStep}
              // segue com o que já estava escolhido: o painel volta ao primeiro passo que falta
              onContinue={() => setChosenStep(null)}
              notice={notice}
              canLaunch={Boolean(mission)}
              onLaunch={launch}
              focusTarget={focusTarget}
            />
          )}
          {/* O trajeto inteiro, em escala, num canto: na cena, com a câmera na nave, ele não cabe. */}
          {flying && (
            <MissionHud
              layout={layout}
              position={trackPosition}
              phase={craft.phase}
              elapsedHours={elapsedHours}
              telemetry={telemetry}
              missionName={missionView.hudMission(landingSite.name ?? missionView.customLandingSite, launchSite.name)}
              playing={clock.playing}
              onTogglePlay={() => clock.setPlaying((value) => !value)}
              fast={fast}
              onToggleFast={() => setFast((value) => !value)}
              onSeek={(position) => clock.seek(position * TRACK_STEPS)}
              freeCamera={freeCamera}
              onToggleFreeCamera={() => setFreeCamera((value) => !value)}
              focusTarget={focusTarget}
            />
          )}
          {flying && (
            <MissionMap
              map={map}
              craft={craftOnMap}
              moon={mapPoint(state.moonKm)}
              dateMs={dateMs}
              hidden={mapHidden}
              onToggle={() => setMapHidden((value) => !value)}
            />
          )}
        </div>
        {/* O resumo do pouso, por cima da cena, no canto onde ficava o cartão do lançamento. */}
        {complete && <MissionComplete mission={mission} onRelaunch={launch} />}
        {/* À mão sempre que há missão: uma linha com cara de precisa convida a ler "foi assim que
            a IM-2 voou" (plano, "Risks"). O texto abre no clique, para não ficar em cima da cena. */}
        {mission && (
          <details className="mission-view__badge">
            <summary className="mission-view__badge-summary">{missionView.referenceBadge}</summary>
            <p className="mission-view__badge-text">{missionView.referenceNote}</p>
          </details>
        )}
      </div>

      {/* Os números e as notas, recolhidos: abertos, eram um muro de texto embaixo da cena. */}
      <details className="mission-view__details">
        <summary className="mission-view__details-summary">{missionView.detailsSummary}</summary>
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
          {landingSite && (
            <div>
              <dt>{missionView.landingSiteLabel}</dt>
              <dd>{missionView.coordinatesValue(landingSite)}</dd>
            </div>
          )}
          {launchSite && (
            <>
              <div>
                <dt>{missionView.coordinates}</dt>
                <dd>{missionView.coordinatesValue(launchSite)}</dd>
              </div>
              <div>
                <dt>{missionView.allowedDirections}</dt>
                <dd>{launchSite.azimuthLimits ? missionView.directionsValue(launchSite.azimuthLimits) : missionView.directionsNotChecked}</dd>
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
        {mission && (
          <>
            <p className="system-view__note">{missionView.pathNote}</p>
            <p className="system-view__note">{missionView.leftOutNote}</p>
            <p className="system-view__note">{missionView.choicesNote(MISSION)}</p>
          </>
        )}
        <p className="system-view__note">{missionView.scaleNote(earthRadii)}</p>
        <p className="system-view__note">{missionView.sitesNote(EARTH_SIDEREAL_DAY_HOURS)}</p>
      </details>
    </div>
  )
}
