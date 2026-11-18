/* A vista da missão (card C13): a Terra e a Lua em escala, na data escolhida, com as bases de
 * lançamento marcadas na Terra, cada uma na latitude e na longitude de verdade.
 *
 * É daqui que a trajetória de uma missão vai sair (cards C15 e C16), e por isso a escala é a de
 * verdade (missionScale.js): a Lua fica a uns 60 raios da Terra, e a Terra vira um ponto quando a
 * órbita inteira cabe na tela. Os botões de câmera levam de volta à Terra e à Lua.
 *
 * As posições e as rotações são do motor: a Terra e a Lua, do src/engine/system.js; cada base, do
 * src/engine/earthSite.js, no instante do relógio da vista. O relógio é próprio, como o da vista do
 * sistema: anda pelo período sem mudar a data do cálculo.
 */
import { Html, Line } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useMemo, useRef, useState } from 'react'
import { Matrix4 } from 'three'

import { missionView } from '../data/missionView.js'
import { PERIOD_DAYS } from '../engine/config.js'
import { EARTH_EQUATORIAL_RADIUS_KM, EARTH_SIDEREAL_DAY_HOURS, earthSiteKm } from '../engine/earthSite.js'
import { ECLIPTIC_SKY_MATRIX, moonOrbitPath, systemStateAt } from '../engine/system.js'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion.js'
import { useViewClock } from '../hooks/useViewClock.js'
import { formatUtcDate } from '../panel/format.js'
import { token } from './cssToken.js'
import { EarthBody } from './EarthBody.jsx'
import { sunSideStart } from './framing.js'
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

/* A câmera nasce perto da Terra, que é onde as bases estão. O near é curto porque dá para chegar a
   menos de meio raio da Lua do chão dela; o far cobre a órbita inteira vista de longe. */
const CAMERA = { position: [0, 1.4, 4], fov: 35, near: 0.02, far: 3000 }
/* Para onde cada botão de câmera leva: o alvo, de que distância ele é visto e até onde dá para
   chegar perto, tudo em raios da Terra. De 230 raios a órbita inteira da Lua cabe na tela. */
const CAMERA_VIEWS = {
  earth: { distance: Math.hypot(...CAMERA.position), minDistance: 1.25 },
  moon: { distance: 1.3, minDistance: 0.4 },
  orbit: { distance: 230, minDistance: 1.25 },
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

/* state: a Terra, a Lua e o Sol no instante (systemStateAt). orbit: o caminho da Lua, em km.
   sites: as bases. markers: onde fica a marca de cada uma, na mesma ordem. selectedIndex: qual é a
   escolhida, ou −1. faceSelected: se a câmera deve virar para a escolhida (a escolha veio da
   lista). onPick: chamada com o índice da base quando a pessoa clica na marca dela. cameraView:
   qual botão de câmera está ligado. labels: a camada onde os nomes são postos (o motivo está na
   SystemView.jsx). */
function MissionBodies({
  state, orbit, sites, markers, selectedIndex, faceSelected, onPick, dateUtc, reducedMotion, cameraView, labels,
}) {
  const moonPosition = kmToUnits(state.moonKm)
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

  const view = CAMERA_VIEWS[cameraView]
  /* Escolher uma base na lista vira a câmera para ela (ZoomControls.jsx). A direção acompanha a
     base, que gira com a Terra; a câmera só se move quando a base escolhida troca. Quem clicou na
     marca já está olhando para ela: aí a câmera fica onde está. */
  const facing = useMemo(
    () =>
      selected && faceSelected
        ? { key: sites[selectedIndex].id, direction: selected.map((value) => value / MARKER_LIFT) }
        : null,
    [selected, faceSelected, sites, selectedIndex],
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

      <ZoomControls
        minDistance={view.minDistance}
        maxDistance={MAX_DISTANCE}
        reducedMotion={reducedMotion}
        target={cameraView === 'moon' ? moonPosition : ORIGIN}
        targetName={cameraView}
        distance={view.distance}
        facing={cameraView === 'moon' ? null : facing}
      />
    </>
  )
}

/* dateUtc: a data escolhida (um Date); o relógio da vista começa nela. launchSites: as bases
   (src/data/launchSites.js). launchSiteId: o id da base escolhida, ou null. onLaunchSiteChange:
   chamada com o id quando a pessoa escolhe uma base na lista. Quem guarda a escolha é o App.jsx,
   para ela não se perder quando a pessoa troca de vista. */
export function MissionView({ dateUtc, launchSites, launchSiteId, onLaunchSiteChange }) {
  const clock = useViewClock(PERIOD_HOURS, PLAY_HOURS_PER_SECOND)
  const reducedMotion = usePrefersReducedMotion()
  const labels = useRef(null)
  const [cameraView, setCameraView] = useState('earth')
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
  const dateMs = dateUtc.getTime() + clock.hour * HOUR_MS
  const state = useMemo(() => systemStateAt(dateMs), [dateMs])
  const orbit = useMemo(() => moonOrbitPath(dateUtc.getTime(), ORBIT_STEPS), [dateUtc])
  const markers = useMemo(
    () => launchSites.map((site) => markerPosition(earthSiteKm(site.lat, site.lon, dateMs))),
    [launchSites, dateMs],
  )
  const selectedIndex = launchSites.findIndex((site) => site.id === launchSiteId)
  const launchSite = launchSites[selectedIndex] ?? null
  const earthRadii = state.distanceKm / EARTH_EQUATORIAL_RADIUS_KM

  /* Por ter ou não lançado à Lua, e não por país: é o que a lista afirma sobre cada base. O
     Object.groupBy guarda a ordem em que cada grupo aparece: quem decide a ordem é o
     launchSites.js. */
  const groups = Object.entries(
    Object.groupBy(launchSites, (site) => (site.lunarLaunch ? missionView.groupLaunched : missionView.groupNotYet)),
  )

  return (
    <div className="system-view mission-view">
      <div className="system-view__scene" role="img" aria-label={missionView.label}>
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
          />
        </Canvas>
        <div className="system-view__labels" ref={labels} />
      </div>
      <ViewClock clock={clock} startUtc={dateUtc} periodHours={PERIOD_HOURS} labels={missionView}>
        <div className="mission-view__camera" role="group" aria-label={missionView.cameraLabel}>
          {Object.keys(CAMERA_VIEWS).map((name) => (
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
      {/* Um <select> comum, como a lista de locais de pouso (SiteList.jsx): já funciona com teclado
          e com leitor de tela. A primeira opção é um aviso, e não uma base. */}
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
      <p className="system-view__note">{missionView.scaleNote(earthRadii)}</p>
      <p className="system-view__note">{missionView.sitesNote(EARTH_SIDEREAL_DAY_HOURS)}</p>
    </div>
  )
}
