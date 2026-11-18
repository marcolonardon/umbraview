/* A câmera da v2: o enquadramento da Lua inteira em qualquer tela, a chegada na primeira carga,
 * o voo até o ponto escolhido, a volta ao quadro amplo e a ida para a vista Terra–Lua–Sol.
 *
 * Os controles são o CameraControls do Drei (a biblioteca camera-controls), no lugar do
 * OrbitControls da v1: ele anima sozinho até um destino e avisa quando a câmera para, que é quando
 * o painel abre. As contas ficam em framing.js, testadas sem WebGL; aqui só se aplica na câmera.
 *
 * Todo movimento tem um motivo (mostrar para onde a câmera foi) e respeita o pedido de menos
 * movimento do sistema: com ele, a câmera pula para o destino sem voar. Nada aqui força quadro com
 * a cena parada: os controles pedem quadro só enquanto a câmera anda (card C9).
 */
import { CameraControls, CameraControlsImpl } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Spherical } from 'three'

import { latLonToScene } from './coordinates.js'
import {
  EARTH_RADIUS, ROTATE_SPEED_MAX, WHEEL_DOLLY_SPEED, approach, azimuthSpeedAt, clampPolar, dollySpeedAt, fitDistance,
  heroDirection, lensShift, nearestAzimuth, orbitAngles, rotateSpeedAt, shortestTurn,
} from './framing.js'

const { ACTION } = CameraControlsImpl

/* Quanto os controles demoram para alcançar o destino, em segundos (o smoothTime do
   camera-controls: a câmera chega a 1% do destino em umas 4 vezes este tempo).
   - mexendo com o mouse ou a roda: curto, para a Lua responder na hora;
   - a chegada na primeira carga: uns 1,5 s do quadro aberto até a Lua enquadrada;
   - o voo até um ponto, em dois trechos (o giro e a descida), e a volta: entre 0,8 e 1,6 s no
     total, como a regra de movimento da rodada pede;
   - a ida e a volta da vista Terra–Lua–Sol: um pouco mais longa, porque a câmera anda muito mais. */
const SMOOTH_INTERACTIVE_S = 0.18
const SMOOTH_ENTRY_S = 0.38
const SMOOTH_FLIGHT_TURN_S = 0.22
const SMOOTH_FLIGHT_DESCENT_S = 0.18
const SMOOTH_SYSTEM_S = 0.4

/* De quão longe a câmera chega na primeira carga, em vezes a distância do enquadramento. */
const ENTRY_DISTANCE_FACTOR = 1.55

/* A distância do centro da Lua de onde a câmera olha um ponto escolhido: uns 430 km acima do chão,
   o bastante para as montanhas em volta aparecerem com o marcador no meio. Quem já estava mais
   perto fica onde estava: subir de volta a cada clique tiraria a pessoa do relevo que ela olhava. */
const SITE_DISTANCE = 1.25

// Devagar: é um convite a mexer, não uma animação para assistir (o mesmo ritmo da v1).
const AUTO_ROTATE_RAD_PER_S = 0.03

/* Na vista Terra–Lua–Sol o alvo da câmera é o centro da Terra: o mais perto que ela chega é uma
   vez e meia o raio da Terra. Com o mínimo da Lua (1,02), a roda levaria a câmera para dentro da
   esfera da Terra, que some vista de dentro. */
const SYSTEM_MIN_DISTANCE = EARTH_RADIUS * 1.5

/* Com a cena parada, nenhum quadro é desenhado (card C9), e o relógio do React Three Fiber conta o
   tempo parado inteiro como se fosse o intervalo do quadro seguinte. Os controles andam pelo
   intervalo: depois de um minuto parada, um voo pedido por um botão da página chegaria ao destino
   no primeiro quadro, sem voar, e a promessa dele podia nem resolver (achado da revisão da v2, com
   simulação no camera-controls 3.1.2). Ler o relógio logo antes de pedir o movimento joga fora o
   tempo parado, e o primeiro quadro do voo recebe só os milissegundos de verdade. */
function dropIdleTime(clock) {
  clock.getDelta()
}

// o destino da câmera, lido a cada quadro sem criar um objeto novo
const endSpherical = new Spherical()

/* A roda (e a pinça de dois dedos) e o arrasto pela altura da câmera (dollySpeedAt e rotateSpeedAt,
   em framing.js): perto do chão, um passo da roda pulava centenas de quilômetros, e o chão andava
   centenas de vezes mais que o mouse. A distância é a do destino, e não a de agora: passos da roda
   seguidos se somam sobre o destino, antes de a câmera chegar lá. Na vista Terra–Lua–Sol, a câmera
   mira a Terra, e a distância não é até a Lua: ficam as velocidades de sempre. */
function applyHandSpeeds(c, isSystem) {
  if (isSystem) {
    c.dollySpeed = WHEEL_DOLLY_SPEED
    c.azimuthRotateSpeed = ROTATE_SPEED_MAX
    c.polarRotateSpeed = ROTATE_SPEED_MAX
    return
  }
  // radius: a distância até o centro da Lua; phi: o ângulo polar, que perto do polo deixa o giro
  // para os lados mais curto no chão (azimuthSpeedAt)
  const { radius, phi } = c.getSpherical(endSpherical, true)
  c.dollySpeed = dollySpeedAt(radius)
  c.azimuthRotateSpeed = azimuthSpeedAt(radius, phi)
  c.polarRotateSpeed = rotateSpeedAt(radius)
}

/* Quanto a distância da câmera pode fugir da do enquadramento e a Lua inteira ainda contar como
   "no quadro": 2%, menos do que um passo da roda do mouse. */
const WIDE_TOLERANCE = 0.02

/* Troca o modo da câmera e avisa a cena quando a Lua inteira entra ou sai do quadro, que é o que
   acende e apaga o botão "Show the whole Moon". Só na passagem: cada aviso redesenha a cena.
   mode, wide e latest são as refs do CameraRig. */
function changeMode(mode, wide, latest, next) {
  mode.current = next
  const isWide = next === 'wide'
  if (isWide === wide.current) return
  wide.current = isWide
  latest.current.onWideChange?.(isWide)
}

/* Em quanto tempo o deslocamento da lente chega na metade do caminho quando o painel abre ou
   fecha, em segundos: a Lua desliza para o meio da área livre em uns 240 ms. */
const SHIFT_HALF_LIFE_S = 0.05

/* subsolar: { lat, lon } do Sol a pino, para a direção da primeira vista. insets: { right, bottom },
   quanto o painel cobre da cena, em pixels. site: o ponto escolhido, ou null. reducedMotion: a
   pessoa pediu menos movimento. autoRotate: a Lua gira devagar sozinha. homeSignal: um número que
   sobe a cada pedido de volta ao quadro amplo. system: null, ou { target, direction, radius } da
   vista Terra–Lua–Sol, na cena (framing.js): a câmera mira o alvo, na direção dada, da distância
   em que uma esfera daquele raio cabe na tela. turn: o ângulo do céu na data da vista (skyAngle);
   quando ele muda, a câmera gira junto, para as estrelas ficarem paradas na tela. onUserStart: a
   pessoa mexeu na câmera. onArrive: a câmera parou em cima do ponto escolhido. onWideChange:
   chamada com true quando a Lua inteira entra no quadro e com false quando sai dele (a pessoa
   chegou perto, afastou ou voou até um ponto). */
export function CameraRig({
  subsolar, insets, site = null, reducedMotion, autoRotate, homeSignal = 0, system = null, turn = 0,
  minDistance, maxDistance, systemMaxDistance, onUserStart, onArrive, onWideChange,
}) {
  const controls = useRef(null)
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  const invalidate = useThree((state) => state.invalidate)
  const clock = useThree((state) => state.clock)

  // a distância em que uma esfera de raio 1 cabe na área livre; a da Lua inteira é ela, até o máximo
  const unitFit = fitDistance({ width: size.width, height: size.height, insetRight: insets.right, insetBottom: insets.bottom })
  const fit = Math.min(maxDistance, unitFit)
  const shiftTarget = lensShift({ insetRight: insets.right, insetBottom: insets.bottom })
  const interactiveSmooth = reducedMotion ? 0 : SMOOTH_INTERACTIVE_S

  // o que os efeitos e o quadro leem do último render, sem entrar nas dependências deles
  const latest = useRef({})
  useEffect(() => {
    latest.current = {
      fit, unitFit, subsolar, reducedMotion, interactiveSmooth, onArrive, onUserStart, onWideChange, minDistance,
      maxDistance, systemMaxDistance, clock,
    }
  })

  // 'wide': a Lua inteira; 'site': em cima de um ponto; 'free': a pessoa escolheu o zoom; 'system'
  const mode = useRef('wide')
  // se a Lua inteira está no quadro, como a cena sabe por último (changeMode)
  const wide = useRef(true)
  /* De onde a câmera saiu no último pedido de Lua inteira: { azimuth, polar, distance }, ou null.
     Apertar o botão de novo, com a Lua inteira no quadro, leva a câmera de volta para lá. */
  const previous = useRef(null)
  // o voo em andamento: um voo novo, ou a pessoa mexendo, cancela a continuação do anterior
  const flight = useRef(0)
  const pendingArrival = useRef(false)
  const started = useRef(false)
  const shift = useRef({ x: 0, y: 0, width: 0, height: 0 })
  const lastHome = useRef(homeSignal)
  const lastTurn = useRef(turn)
  const lastPreference = useRef(reducedMotion)

  /* A chegada: a câmera nasce no quadro aberto e assenta na Lua enquadrada. Com menos movimento,
     ou depois de qualquer clique (handleControlStart), ela já está no lugar. */
  useEffect(() => {
    const c = controls.current
    if (!c || started.current) return
    started.current = true
    // o botão direito e os três dedos arrastariam a Lua para fora do centro; dois dedos só aproximam
    c.mouseButtons.right = ACTION.NONE
    c.touches.two = ACTION.TOUCH_DOLLY
    c.touches.three = ACTION.NONE
    c.minPolarAngle = clampPolar(0)
    c.maxPolarAngle = clampPolar(Math.PI)
    const [x, y, z] = heroDirection(subsolar)
    const from = reducedMotion ? fit : Math.min(maxDistance, fit * ENTRY_DISTANCE_FACTOR)
    c.setLookAt(x * from, y * from, z * from, 0, 0, 0, false)
    applyHandSpeeds(c, false)
    if (!reducedMotion) {
      c.smoothTime = SMOOTH_ENTRY_S
      c.dollyTo(fit, true).then(() => {
        c.smoothTime = latest.current.interactiveSmooth
      })
    } else {
      c.smoothTime = 0
    }
    c.draggingSmoothTime = reducedMotion ? 0 : SMOOTH_INTERACTIVE_S / 2
  }, [subsolar, fit, reducedMotion, maxDistance])

  /* A preferência de movimento pode mudar com a página aberta. Só na mudança: na montagem este
     efeito roda logo depois do da chegada, e escreveria o tempo de interação por cima do dela, que
     ficaria com a metade da duração. */
  useEffect(() => {
    const c = controls.current
    if (!c || lastPreference.current === reducedMotion) return
    lastPreference.current = reducedMotion
    c.smoothTime = interactiveSmooth
    c.draggingSmoothTime = reducedMotion ? 0 : SMOOTH_INTERACTIVE_S / 2
  }, [interactiveSmooth, reducedMotion])

  /* A tela mudou de tamanho, ou o painel abriu ou fechou: na vista da Lua inteira, ela continua
     inteira. Quem escolheu o próprio zoom, ou está em cima de um ponto, fica onde está. */
  useEffect(() => {
    const c = controls.current
    if (!c || !started.current || mode.current !== 'wide') return
    dropIdleTime(latest.current.clock)
    c.dollyTo(fit, !latest.current.reducedMotion)
  }, [fit])

  // o deslocamento da lente e o giro sozinho andam por quadro; os dois pedem o quadro que precisam
  useEffect(() => {
    dropIdleTime(clock)
    invalidate()
  }, [shiftTarget.x, shiftTarget.y, size.width, size.height, invalidate, clock])

  useFrame((_, delta) => {
    const s = shift.current
    const resized = s.width !== size.width || s.height !== size.height
    if (resized || s.x !== shiftTarget.x || s.y !== shiftTarget.y) {
      // no primeiro quadro, na troca de tamanho e com menos movimento, a lente já nasce no lugar
      const jump = resized || latest.current.reducedMotion
      s.x = jump ? shiftTarget.x : approach(s.x, shiftTarget.x, delta, SHIFT_HALF_LIFE_S)
      s.y = jump ? shiftTarget.y : approach(s.y, shiftTarget.y, delta, SHIFT_HALF_LIFE_S)
      s.width = size.width
      s.height = size.height
      camera.setViewOffset(size.width, size.height, s.x, s.y, size.width, size.height)
      if (s.x !== shiftTarget.x || s.y !== shiftTarget.y) invalidate()
    }
    if (autoRotate) controls.current?.rotate(AUTO_ROTATE_RAD_PER_S * delta, 0, false)
    // há quadro justamente enquanto a câmera anda (card C9), que é quando a altura muda
    if (controls.current) applyHandSpeeds(controls.current, mode.current === 'system')
  })

  /* O voo até o ponto escolhido, em dois trechos encadeados: a câmera gira em volta da Lua até
     ficar em cima do ponto e depois desce. Só quando ela para o painel abre (onArrive). */
  const siteKey = site ? `${site.lat} ${site.lon}` : null
  useEffect(() => {
    const c = controls.current
    if (!c || siteKey === null) return
    /* Na vista Terra–Lua–Sol a câmera não desce até o ponto (a pessoa escolheu ver de longe), mas
       o painel não pode ficar esperando uma chegada que não vem: o ponto escolhido pela lista
       mostra os números na hora. */
    if (mode.current === 'system') {
      latest.current.onArrive?.()
      return
    }
    const [lat, lon] = siteKey.split(' ').map(Number)
    const token = ++flight.current
    previous.current = null
    changeMode(mode, wide, latest, 'site')
    const { azimuth, polar } = orbitAngles(latLonToScene(lat, lon))
    const toAzimuth = nearestAzimuth(azimuth, c.azimuthAngle)
    const toPolar = clampPolar(polar)
    const toDistance = Math.min(c.distance, SITE_DISTANCE)
    const arrive = () => {
      pendingArrival.current = false
      c.smoothTime = latest.current.interactiveSmooth
      latest.current.onArrive?.()
    }
    if (latest.current.reducedMotion) {
      c.moveTo(0, 0, 0, false)
      c.rotateTo(toAzimuth, toPolar, false)
      c.dollyTo(toDistance, false)
      arrive()
      return
    }
    pendingArrival.current = true
    dropIdleTime(latest.current.clock)
    c.smoothTime = SMOOTH_FLIGHT_TURN_S
    c.moveTo(0, 0, 0, true)
    c.rotateTo(toAzimuth, toPolar, true)
      .then(() => {
        if (flight.current !== token) return null
        c.smoothTime = SMOOTH_FLIGHT_DESCENT_S
        return c.dollyTo(toDistance, true)
      })
      .then(() => {
        if (flight.current === token) arrive()
      })
  }, [siteKey])

  /* O botão "Show the whole Moon" é um liga e desliga. Ligar: de volta ao quadro amplo, na direção
     em que a câmera já está, guardando de onde ela saiu. Desligar (apertar com a Lua inteira já no
     quadro): a câmera volta para onde estava antes. Sem ter de onde voltar, a Lua inteira fica. */
  useEffect(() => {
    const c = controls.current
    if (!c || homeSignal === lastHome.current) return
    lastHome.current = homeSignal
    if (mode.current === 'system') return
    flight.current++
    // um voo até um ponto que este pedido interrompe não chega mais: o painel abre agora
    if (pendingArrival.current) {
      pendingArrival.current = false
      latest.current.onArrive?.()
    }
    const animate = !latest.current.reducedMotion
    const settle = () => {
      c.smoothTime = latest.current.interactiveSmooth
    }
    dropIdleTime(latest.current.clock)
    c.smoothTime = animate ? SMOOTH_FLIGHT_TURN_S : 0
    const back = previous.current
    if (mode.current === 'wide' && back) {
      previous.current = null
      changeMode(mode, wide, latest, 'free')
      c.rotateTo(nearestAzimuth(back.azimuth, c.azimuthAngle), back.polar, animate)
      c.dollyTo(back.distance, animate).then(settle)
      return
    }
    if (mode.current !== 'wide') {
      previous.current = { azimuth: c.azimuthAngle, polar: c.polarAngle, distance: c.distance }
    }
    changeMode(mode, wide, latest, 'wide')
    c.moveTo(0, 0, 0, animate)
    c.dollyTo(latest.current.fit, animate).then(settle)
  }, [homeSignal])

  /* A vista Terra–Lua–Sol: a mesma câmera recua da Lua até caberem a Terra e a órbita, num
     movimento só, e volta do mesmo jeito. Não é troca de tela: a Lua que estava na frente da
     pessoa é a mesma que fica pequena. */
  const systemKey = system ? [...system.target, ...system.direction, system.radius].map((v) => v.toFixed(3)).join(' ') : null
  useEffect(() => {
    const c = controls.current
    if (!c) return
    const animate = !latest.current.reducedMotion
    if (systemKey !== null) {
      const [tx, ty, tz, dx, dy, dz, radius] = systemKey.split(' ').map(Number)
      const entering = mode.current !== 'system'
      flight.current++
      // o mesmo do pedido de volta: o voo interrompido não chega, e o painel não fica esperando
      if (pendingArrival.current) {
        pendingArrival.current = false
        latest.current.onArrive?.()
      }
      changeMode(mode, wide, latest, 'system')
      c.maxDistance = latest.current.systemMaxDistance
      // só a entrada voa: depois, o alvo acompanha a Terra sem a câmera sair de onde a pessoa a pôs
      if (entering) {
        const distance = Math.min(latest.current.systemMaxDistance, latest.current.unitFit * radius)
        dropIdleTime(latest.current.clock)
        c.smoothTime = animate ? SMOOTH_SYSTEM_S : 0
        const flown = c.setLookAt(tx + dx * distance, ty + dy * distance, tz + dz * distance, tx, ty, tz, animate)
        /* O azimute dos controles soma as voltas que a pessoa já deu, e o setLookAt pede o destino
           entre −180° e 180°: sem trazer o de agora para a volta mais perto, a câmera desenrolaria
           todas as voltas durante o recuo. */
        c.normalizeRotations()
        // o mais perto da Terra só depois de o destino estar pedido: a câmera sai de perto da Lua
        c.minDistance = SYSTEM_MIN_DISTANCE
        flown.then(() => {
          c.smoothTime = latest.current.interactiveSmooth
        })
      } else {
        c.moveTo(tx, ty, tz, false)
      }
      return
    }
    if (mode.current !== 'system') return
    changeMode(mode, wide, latest, 'wide')
    const [x, y, z] = heroDirection(latest.current.subsolar)
    const d = latest.current.fit
    dropIdleTime(latest.current.clock)
    // o mínimo volta a ser o da Lua antes do voo: com o da Terra, a câmera não chegaria perto dela
    c.minDistance = latest.current.minDistance
    c.smoothTime = animate ? SMOOTH_SYSTEM_S : 0
    const flown = c.setLookAt(x * d, y * d, z * d, 0, 0, 0, animate)
    c.normalizeRotations()
    flown.then(() => {
      if (mode.current === 'system') return
      c.maxDistance = latest.current.maxDistance
      c.smoothTime = latest.current.interactiveSmooth
    })
  }, [systemKey])

  // na vista Terra–Lua–Sol, a câmera gira com o céu: as estrelas ficam paradas e a Lua anda na órbita
  useEffect(() => {
    const c = controls.current
    const delta = shortestTurn(lastTurn.current, turn)
    lastTurn.current = turn
    if (!c || delta === 0 || mode.current !== 'system') return
    c.rotate(delta, 0, false)
  }, [turn])

  function handleControlStart() {
    const c = controls.current
    // qualquer clique pula a chegada e o voo: a câmera obedece à pessoa, e o painel não fica esperando
    if (c && pendingArrival.current) {
      flight.current++
      pendingArrival.current = false
      c.smoothTime = latest.current.interactiveSmooth
      latest.current.onArrive?.()
    }
    latest.current.onUserStart?.()
  }

  /* A roda do mouse não avisa o controlstart (ela chega em pedaços, sem começo nem fim), só o
     control. Quem muda a distância na vista da Lua inteira escolheu o próprio zoom, e a troca de
     tamanho da tela deixa de reenquadrar. */
  function handleControl() {
    const c = controls.current
    if (c && mode.current === 'wide' && Math.abs(c.distance - latest.current.fit) > WIDE_TOLERANCE * latest.current.fit) {
      changeMode(mode, wide, latest, 'free')
    }
    /* Cada passo da roda avisa aqui, logo depois de mudar o destino: o passo seguinte, que pode
       chegar antes do próximo quadro numa roda girada depressa, já usa a velocidade da altura nova. */
    if (c) applyHandSpeeds(c, mode.current === 'system')
    latest.current.onUserStart?.()
  }

  /* A câmera parou. A roda avisa o control antes de a câmera andar, e um passo só dela passava sem
     o modo mudar: o botão ficava aceso com a Lua já de perto. Parada, a distância é a de verdade:
     perto da do enquadramento, a Lua inteira está no quadro, e o botão acende, mesmo que a pessoa
     tenha voltado até ali com a roda; longe dela, não está.
     Vale para o rest e para o sleep dos controles: enquanto a Lua gira sozinha a câmera nunca
     dorme, e o camera-controls só avisa o rest de novo depois de ela dormir e acordar. O primeiro
     movimento da pessoa, que é o que para o giro, só chega pelo sleep (visto no navegador). */
  function handleRest() {
    const c = controls.current
    if (!c || mode.current === 'system') return
    const isWide = Math.abs(c.distance - latest.current.fit) <= WIDE_TOLERANCE * latest.current.fit
    if (isWide) changeMode(mode, wide, latest, 'wide')
    else if (mode.current === 'wide') changeMode(mode, wide, latest, 'free')
  }

  return (
    <CameraControls
      ref={controls}
      minDistance={minDistance}
      maxDistance={maxDistance}
      onControlStart={handleControlStart}
      onControl={handleControl}
      onRest={handleRest}
      onSleep={handleRest}
    />
  )
}
