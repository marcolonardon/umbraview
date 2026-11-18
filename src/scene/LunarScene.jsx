/* A Lua em 3D: a esfera e a câmera que gira com o mouse (card C1), e o relevo do polo sul com a
 * luz do Sol da data escolhida e a sombra das montanhas (card C2), e o clique que escolhe um ponto,
 * com o marcador dele (card C3). O giro sozinho para na primeira vez que a pessoa mexe (card C5)
 * ou quando um ponto é escolhido (card C10), e a cena só desenha quando algo muda (card C9). De
 * perto, o relevo fino aparece em volta do centro da tela, onde a máquina aguenta (card C6).
 *
 * As medidas estão em raios da Lua: a esfera tem raio 1, e as distâncias da câmera e da luz são
 * contadas a partir do centro dela. O relevo está na altura real (reliefMesh.js diz o porquê). */
import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import { Object3D } from 'three'

import { scene } from '../data/scene.js'
import { MIN_LANDING_WINDOW_HOURS, PERIOD_DAYS } from '../engine/config.js'
import { MOON_RADIUS_M } from '../engine/geometry.js'
import { useFarRelief } from '../hooks/useFarRelief.js'
import { useLandingAreas } from '../hooks/useLandingAreas.js'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion.js'
import { useSubsolarPoint } from '../hooks/useSubsolarPoint.js'
import { useTimedNotice } from '../hooks/useTimedNotice.js'
import { CameraRig } from './CameraRig.jsx'
import { CAMERA_FOV_DEG, heroDirection } from './framing.js'
import { GlobalRelief } from './GlobalRelief.jsx'
import { LandingAreasLayer } from './LandingAreasLayer.jsx'
import { MoonGlobe } from './MoonGlobe.jsx'
import { NearRelief } from './NearRelief.jsx'
import { readMoonClick } from './picking.js'
import { ReliefCap } from './ReliefCap.jsx'
import { visibleHit } from './reliefLayers.js'
import { polarDistanceToAngle, smoothSphereThetaLength } from './reliefMesh.js'
import { SiteMarker } from './SiteMarker.jsx'
import { StarField } from './StarField.jsx'
import { SHADOW_MAP_SIZE, shadowFrame } from './sunLight.js'
import './LunarScene.css'

/* A câmera é a do CameraRig.jsx (o CameraControls do Drei): ela enquadra a Lua inteira no formato
   da tela, aproxima com a roda ou a pinça, e voa até o ponto escolhido. A direção de onde ela
   nasce sai do Sol da data (framing.js: abaixo do equador e a oeste do Sol, para o polo sul ficar
   embaixo e a linha entre o dia e a noite cruzar o disco). A distância daqui vale só até o
   primeiro quadro: o CameraRig acerta a distância para a Lua caber na cena.
   A câmera nunca fica exatamente no eixo y, que é o "para cima" dos controles: ali a direção dela e
   o "para cima" ficam paralelos e a rotação fica indefinida. */
const CAMERA_START_DISTANCE = 6

/* Com o relevo na altura real, as montanhas só aparecem de perto: 1.02 deixa a câmera descer a
   uns 35 km do polo, e o pico mais alto do relevo fica a 7 km. O máximo vai muito além da distância
   em que a Lua inteira cabe na tela (uns 11 raios no celular em pé, framing.js). Até 90 raios a Lua
   vai ficando pequena e o céu de estrelas enche em volta dela; dali em diante a câmera sai de
   dentro do próprio céu, e a 3.000 raios as estrelas todas cabem num aglomerado pequeno, com a
   Lua no meio (StarField.jsx e starPoints.js). O botão "Show the whole Moon" traz a câmera de
   volta. */
const MIN_DISTANCE = 1.02
const MAX_DISTANCE = 3000

/* O painel desta versão fica ao lado da cena, e não por cima dela. Só a faixa dos botões, embaixo,
   fica por cima: sem medir, a câmera enquadra a Lua na cena inteira. */
const NO_INSETS = Object.freeze({ right: 0, bottom: 0 })

/* O plano mais perto que a câmera desenha. O padrão do three (0.1, ou 174 km) cortaria a
   superfície quando a câmera desce a 35 km dela. O far cobre a Lua inteira vista de longe (as
   estrelas não dependem dele: StarField.jsx). */
const CAMERA_NEAR = 0.001
const CAMERA_FAR = 4000

const SUN_INTENSITY = 2.5

/* Fraco de propósito: só para o lado escuro não sumir no fundo. Forte, ele apagaria a sombra, que
   é o assunto do produto. */
const AMBIENT_INTENSITY = 0.06

/* O tipo de sombra do three. O padrão do React Three Fiber (o PCFSoftShadowMap) saiu do three
   0.186, que troca por este e avisa no console a cada página aberta. */
const SHADOW_TYPE = 'percentage'

/* Com a Lua parada, a cena só desenha quando algo muda. Desenhando a cada quadro da tela, ela
   parada custava os mesmos 6 ms por quadro de quando gira, 144 vezes por segundo numa tela de
   144 Hz, gastando bateria sem mudar nada (card C4). Pedem quadro sozinhos: os controles quando a
   pessoa move a câmera ou ela voa até um ponto, inclusive no deslize depois de soltar o mouse (o
   CameraControls do Drei chama o invalidate), e o React Three Fiber quando uma prop muda ou um objeto entra na cena (a
   luz de outra data, o relevo que chega, o marcador). O que mudar a cena por fora do React precisa
   pedir o quadro com invalidate().
   Enquanto ela gira sozinha, a cena desenha todo quadro: o passo do giro em cada quadro fica abaixo
   do que os controles contam como mudança, e eles não pedem o quadro seguinte. Só com o 'demand',
   a Lua desenharia um quadro e não sairia do lugar (card C9). */
const FRAME_LOOP_ROTATING = 'always'
const FRAME_LOOP_STILL = 'demand'

/* Quanto tempo o aviso de clique fora da área fica na tela, em milissegundos: o bastante para ler
   uma frase curta sem cobrir a Lua depois disso. Não é token porque não é duração de animação. */
const NOTICE_DURATION_MS = 5000

/* As cores vêm dos tokens (tokens.css), como toda cor da interface. O three não lê variável de
   CSS, então o valor é lido da página. */
function token(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/* O relevo grosso e o fino juntos (card C6). cover são os ladrilhos do fino desenhados agora, e o
   grosso abre o buraco embaixo deles. O estado mora aqui, dentro do Canvas, e não no LunarScene: o
   Canvas é outra raiz do React, e com o estado lá fora o buraco e os ladrilhos entrariam na tela em
   commits separados, com um quadro de fresta ou de grosso por cima do fino entre os dois. Também
   evita o React refazer o LunarScene inteiro a cada bloco novo. */
function Relief({ relief, color }) {
  const [cover, setCover] = useState([])
  return (
    <>
      <ReliefCap relief={relief} color={color} cover={cover} />
      <NearRelief manifest={relief.manifest} color={color} onCoverChange={setCover} />
    </>
  )
}

/* A luz do Sol e a caixa da sombra dela (sunLight.js). A caixa acompanha a câmera: a cada quadro,
   antes de desenhar, o alvo, a posição da luz e o tamanho da caixa saem do shadowFrame. Fica aqui
   dentro do Canvas porque precisa da câmera de cada quadro. subsolar: o ponto onde o Sol está a
   pino; color: a cor da luz, do token. */
function SunLight({ subsolar, color }) {
  const invalidate = useThree((state) => state.invalidate)
  const light = useRef(null)
  /* O alvo da luz precisa estar na cena para o three saber onde ele fica; solto, ele conta como
     se estivesse no centro, e a caixa da sombra sairia do lugar. */
  const [target] = useState(() => new Object3D())

  useFrame(({ camera, size }) => {
    const sun = light.current
    if (!sun) return
    // o ângulo do meio da tela até a quina: a caixa cobre o chão até ali (shadowFrame)
    const halfFov = (camera.fov * Math.PI) / 360
    const viewHalfAngle = Math.atan(Math.tan(halfFov) * Math.hypot(1, size.width / size.height))
    const frame = shadowFrame(camera.position.toArray(), subsolar, viewHalfAngle)
    target.position.set(...frame.target)
    target.updateMatrixWorld()
    sun.position.set(...frame.lightPosition)
    const box = sun.shadow.camera
    box.left = -frame.halfSize
    box.right = frame.halfSize
    box.top = frame.halfSize
    box.bottom = -frame.halfSize
    box.near = frame.near
    box.far = frame.far
    box.updateProjectionMatrix()
    sun.shadow.bias = frame.bias
    sun.shadow.normalBias = frame.normalBias
  })

  // o Sol de outra data muda a luz por fora do React: a cena parada (card C9) não desenharia
  useEffect(() => {
    invalidate()
  }, [subsolar, invalidate])

  return (
    <>
      <primitive object={target} />
      <directionalLight
        ref={light}
        target={target}
        intensity={SUN_INTENSITY}
        color={color}
        castShadow
        shadow-mapSize={[SHADOW_MAP_SIZE, SHADOW_MAP_SIZE]}
      />
    </>
  )
}

const METERS_PER_KM = 1000

/* A linha de texto do mapa das áreas de pouso, para cada estado da conta (useLandingAreas). */
function landingStatusText({ status, areas }, manifest) {
  if (status === 'error') return scene.landingError
  if (status === 'ready' && manifest) {
    const count = (flags) => flags.reduce((sum, flag) => sum + flag, 0)
    const { global } = areas
    return scene.landingReady({
      found: count(areas.flags) + (global ? count(global.flags) : 0),
      total: areas.flags.length + (global ? global.flags.length : 0),
      stepKm: areas.layout.stepM / METERS_PER_KM,
      limitDeg: Math.abs(manifest.areaMaxLatDeg),
      minHours: MIN_LANDING_WINDOW_HOURS,
      // o passo da grade da Lua inteira, de graus para quilômetros no chão
      globalStepKm: global ? Math.round((global.layout.stepDeg * Math.PI * MOON_RADIUS_M) / 180 / METERS_PER_KM) : null,
    })
  }
  // os números da regra são os do motor (config.js), os mesmos que o mapa e o painel usam
  return status === 'loading' ? scene.landingLoading({ periodDays: PERIOD_DAYS, minHours: MIN_LANDING_WINDOW_HOURS }) : ''
}

/* dateUtc: a data da luz (um Date). site: o ponto escolhido, { lat, lon } em graus, ou null; o
   marcador aparece nele. onSelect: chamada com { lat, lon } quando a pessoa clica num ponto da área
   com relevo. showLandingAreas: se o mapa das áreas com janela de pouso está ligado;
   onToggleLandingAreas: chamada quando a pessoa aperta o botão dele. Todos vêm do App.jsx. */
export function LunarScene({
  dateUtc,
  site = null,
  onSelect = () => {},
  showLandingAreas = false,
  onToggleLandingAreas = () => {},
}) {
  const reducedMotion = usePrefersReducedMotion()
  const subsolar = useSubsolarPoint(dateUtc)
  const relief = useFarRelief()
  const moonColor = token('--color-moon')
  const sunlightColor = token('--color-sunlight')
  const [notice, showNotice] = useTimedNotice(NOTICE_DURATION_MS)
  const landing = useLandingAreas(dateUtc, showLandingAreas)
  const manifest = relief?.manifest ?? null
  /* Se a pessoa já mexeu na Lua. Sem isto, ela giraria sozinha o tempo todo, sem jeito de parar
     (a WCAG 2.2.2 pede um), e o ponto escolhido sairia andando da frente da pessoa (card C5). */
  const [hasMoved, setHasMoved] = useState(false)
  /* Com um ponto escolhido, o giro para, venha ele de onde vier: o Ctrl, Shift ou Cmd+clique não
     avisa o onStart, e a lista de locais (card I2) nem passa pelos controles. Sem o !site, o
     marcador sairia andando com a Lua (card C10). */
  const autoRotate = !reducedMotion && !hasMoved && !site
  // cada pedido de volta ao quadro com a Lua inteira soma um: a câmera reage à mudança do número
  const [homeSignal, setHomeSignal] = useState(0)
  /* Se a Lua inteira está no quadro: é o que acende o botão "Show the whole Moon". Quem sabe é a
     câmera (CameraRig), que avisa quando a pessoa chega perto, afasta ou voa até um ponto. A cena
     abre com a Lua inteira, e por isso o botão nasce aceso. */
  const [wholeMoon, setWholeMoon] = useState(true)
  /* Quanto a faixa dos botões cobre da parte de baixo da cena, em pixels: a câmera enquadra a Lua
     no que sobra em cima dela. No celular os dois botões ficam um embaixo do outro e cobriam o
     polo sul, que é o assunto do site (visto no navegador em 390 × 844). Sem ResizeObserver (o
     navegador simulado dos testes), nada é medido, e a Lua é enquadrada na cena inteira. */
  const controlsRef = useRef(null)
  const [insets, setInsets] = useState(NO_INSETS)
  useEffect(() => {
    const element = controlsRef.current
    if (!element || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(([entry]) => {
      const bottom = Math.round(entry.contentRect.height)
      setInsets((current) => (current.bottom === bottom ? current : { right: 0, bottom }))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  // a câmera nasce na direção da primeira vista; a distância certa para a tela vem do CameraRig
  const [cameraStart] = useState(() => heroDirection(subsolar).map((v) => v * CAMERA_START_DISTANCE))

  // Com o relevo, a esfera lisa abre um buraco no polo e a malha entra no lugar.
  const sphereThetaLength = relief ? smoothSphereThetaLength(relief.manifest.far.reachM) : Math.PI
  /* Até onde o relevo do polo desenha, em latitude: a linha de ladrilhos da Lua inteira que fica
     toda ao sul disto não precisa ser desenhada (globalChunks). Sem o relevo do polo, nenhuma
     fica de fora. */
  const skipSouthOfDeg = relief ? -90 + (polarDistanceToAngle(relief.manifest.far.reachM) * 180) / Math.PI : -90

  function handleMoonClick(event) {
    /* O raio do clique atravessa as malhas do relevo e a esfera lisa por baixo delas, e o React
       Three Fiber chama o grupo uma vez para cada objeto atingido; os outros escolheriam o ponto de
       novo. O acerto que vale é o que a pessoa vê (visibleHit): com o relevo fino (card C6), nem
       sempre é o mais perto, porque o estêncil esconde o grosso e o anel embaixo do fino. */
    event.stopPropagation()
    const hit = visibleHit(event.intersections ?? []) ?? event
    const result = readMoonClick({ point: hit.point.toArray(), delta: event.delta }, manifest)
    if (!result) return
    // fora da área do polo o ponto também é escolhido; o aviso diz que o resultado ali é aproximado
    if (result.coarse) showNotice(scene.coarseTerrain(Math.abs(manifest.areaMaxLatDeg)))
    onSelect(result.site)
  }

  /* A câmera chama isto quando a pessoa aperta o botão do mouse, usa a roda ou toca na tela,
     inclusive no clique que escolhe um ponto. O giro desligado não volta: voltar sozinho depois de
     um tempo seria a Lua andando de novo enquanto a pessoa lê o ponto. */
  function handleUserStart() {
    setHasMoved(true)
  }

  return (
    <div className="lunar-scene">
      <div className="lunar-scene__view" role="img" aria-label={scene.label}>
        <Canvas
          frameloop={autoRotate ? FRAME_LOOP_ROTATING : FRAME_LOOP_STILL}
          /* O three cria a tela sem estêncil, e o relevo fino usa ele para ficar por cima do grosso
             (reliefLayers.js). O antisserrilhado (MSAA) que o React Three Fiber liga pinta cada pixel
             uma vez para cada triângulo que encosta nele: na Intel UHD 630, com a janela maximizada,
             o relevo fino ficava no limite dos 60 quadros por segundo e o medidor desligava
             (docs/backlog.md, C6, sétima rodada). Sem ele, a borda da Lua vista de longe e a linha dos
             84°S ficam serrilhadas; de perto, a câmera olha reto para baixo e quase não há borda.
             O resto das opções do React Three Fiber continua igual. */
          gl={{ stencil: true, antialias: false }}
          shadows={SHADOW_TYPE}
          camera={{ position: cameraStart, fov: CAMERA_FOV_DEG, near: CAMERA_NEAR, far: CAMERA_FAR }}
        >
          {/* O fundo pintado pelo three, e não a cor da página por trás de um canvas transparente:
              as estrelas são semitransparentes, e sobre um canvas transparente a borda delas
              sairia com a mistura errada. */}
          <color attach="background" args={[token('--color-bg')]} />
          <StarField dateUtc={dateUtc} />
          <ambientLight intensity={AMBIENT_INTENSITY} />
          <SunLight subsolar={subsolar} color={sunlightColor} />
          <group onClick={handleMoonClick}>
            <MoonGlobe color={moonColor} thetaLength={sphereThetaLength} far={manifest?.far ?? null} />
            {/* Dentro do grupo do clique também o relevo fino: o grosso tem um buraco embaixo dele,
                e a esfera lisa é aberta no polo; fora do grupo, o clique ali não acharia nada. */}
            {relief && <Relief relief={relief} color={moonColor} />}
            {/* O relevo da Lua inteira, de perto, fora do polo: por cima da esfera lisa e por baixo
                do relevo do polo (reliefLayers.js). */}
            <GlobalRelief color={moonColor} skipSouthOfDeg={skipSouthOfDeg} />
          </group>
          <LandingAreasLayer areas={landing.areas} color={token('--color-success')} />
          {site && <SiteMarker site={site} relief={relief} />}
          {/* a câmera enquadra a Lua inteira, gira devagar até a pessoa mexer, voa até o ponto
              escolhido e volta ao quadro amplo quando o botão pede */}
          <CameraRig
            subsolar={subsolar}
            insets={insets}
            site={site}
            reducedMotion={reducedMotion}
            autoRotate={autoRotate}
            homeSignal={homeSignal}
            minDistance={MIN_DISTANCE}
            maxDistance={MAX_DISTANCE}
            systemMaxDistance={MAX_DISTANCE}
            onUserStart={handleUserStart}
            onWideChange={setWholeMoon}
          />
        </Canvas>
      </div>
      {/* O mapa das áreas de pouso: o botão liga e desliga, e a linha ao lado diz o que a conta
          achou. O aria-live faz o leitor de tela ler a linha quando ela muda, sem ser um segundo
          role="status" na cena: o do aviso do clique continua o único. */}
      <div className="lunar-scene__landing" ref={controlsRef}>
        <button
          className="lunar-scene__toggle"
          type="button"
          aria-pressed={showLandingAreas}
          onClick={onToggleLandingAreas}
        >
          {scene.landingToggle}
        </button>
        <button
          className="lunar-scene__toggle"
          type="button"
          aria-pressed={wholeMoon}
          onClick={() => setHomeSignal((count) => count + 1)}
        >
          {scene.wholeMoon}
        </button>
        <p className="lunar-scene__landing-status" aria-live="polite">
          {landingStatusText(landing, manifest)}
        </p>
      </div>
      {/* Fora do role="img": lá dentro, o leitor de tela trataria o aviso como parte da imagem e
          não leria. O elemento existe desde o começo, vazio, porque o leitor de tela só anuncia a
          mudança de um role="status" que já estava na página. */}
      <p className="lunar-scene__notice" role="status">
        {notice}
      </p>
    </div>
  )
}
