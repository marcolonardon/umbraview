/* A câmera das vistas do espaço (a do sistema e a da missão): gira em volta do alvo com o mouse e
 * aproxima e afasta com a roda ou a pinça, deslizando até parar, do mesmo jeito da câmera da cena
 * da Lua (CameraRig.jsx). É o CameraControls do Drei, no lugar do OrbitControls: a roda anda em
 * passos suaves, e dá para afastar até a órbita inteira ficar pequena no meio do céu.
 *
 * Só pede quadro enquanto a câmera anda: a vista parada não desenha. O CameraControls do Drei pede
 * o quadro seguinte de dentro de cada quadro em que a câmera andou, mas não pede o primeiro: um
 * pedido feito aqui (ir a outro alvo, virar para um lado) precisa pedir o quadro ele mesmo. Sem
 * isto, um pedido que chegava fora de um clique (a missão que acabou de ser calculada) movia a
 * câmera sem ninguém desenhar, e a tela ficava na vista anterior até alguém mexer nela (card C17,
 * fase 5).
 */
import { CameraControls, CameraControlsImpl } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { Spherical, Vector3 } from 'three'

import { ROTATE_SPEED_MAX, azimuthSpeedAt, dollySpeedAt, rotateSpeedAt } from './framing.js'

/* Quanto os controles demoram para alcançar o destino, em segundos: curto, para responder na hora
   (o mesmo tempo da cena da Lua). */
const SMOOTH_S = 0.18

/* Quanto a roda anda por passo, em vezes o padrão dos controles: o zoom vai de perto da Terra até
   o céu virar um aglomerado, quase 400 vezes a distância, e no passo padrão a roda não chegava. */
const DOLLY_SPEED = 2

/* Depois de quanto tempo sem desenhar a cena conta como parada, em milissegundos: bem mais que um
   quadro (17 ms), bem menos que o tempo de um gesto. */
const IDLE_MS = 100

const ORIGIN = Object.freeze([0, 0, 0])
// o "para cima" do desenho: o norte da eclíptica
const WORLD_UP = Object.freeze([0, 1, 0])

// o destino da câmera, lido a cada quadro sem criar um objeto novo
const endSpherical = new Spherical()
const endPosition = new Vector3()
const endTarget = new Vector3()

/* O giro e a roda pela altura da câmera sobre o chão de um corpo de raio surfaceRadius, com as
   contas da cena da Lua (framing.js): o chão embaixo do meio da tela anda junto com o mouse. A
   distância é a do destino da câmera, e não a de agora, como lá. */
function applySurfaceSpeeds(c, surfaceRadius, fovDeg) {
  const { radius, phi } = c.getSpherical(endSpherical, true)
  const distance = radius / surfaceRadius
  c.azimuthRotateSpeed = azimuthSpeedAt(distance, phi, fovDeg)
  c.polarRotateSpeed = rotateSpeedAt(distance, fovDeg)
  c.dollySpeed = dollySpeedAt(distance)
}

/* minDistance e maxDistance: os limites do zoom, a partir do alvo. reducedMotion: a pessoa pediu
   menos movimento; a câmera para onde o mouse a deixou, sem deslizar. target: o ponto para onde a
   câmera olha, [x, y, z]; pode mudar a cada quadro (a Terra andando), e a câmera vai junto.
   targetName: qual corpo é o alvo; quando ele troca, a câmera desliza até o novo alvo e vai para
   distance, a distância de onde ele é visto.
   facing: { key, direction }, ou null. Quando a key muda, a câmera dá a volta no alvo até ficar do
   lado para onde direction aponta (de tamanho 1, a partir do alvo), a distance dele. É o que
   mostra a base de lançamento escolhida na lista (card C13): quem usa só o teclado não tem como
   arrastar a Terra até ela. direction pode mudar a cada quadro (a base gira com a Terra); só a
   troca da key move a câmera.
   minPolarAngle e maxPolarAngle: até onde a câmera sobe e desce em volta do alvo, em radianos a
   partir do "para cima" do desenho; 0 e π, o padrão, deixam chegar em cima e embaixo. O passo do
   pouso (card C17) fica a 1° dos dois: bem em cima do eixo não há lado para onde girar.
   surfaceRadius: o raio do corpo em volta do qual a câmera gira, quando dá para chegar perto do
   chão dele (a Lua, no passo do pouso), ou null. Com ele, o giro e a roda acompanham a altura da
   câmera: na velocidade de sempre, a 300 km do chão, arrastar meia tela dava meia volta na Lua.
   up: o "para cima" dos controles, [x, y, z] de tamanho 1; o do desenho, por padrão. É o eixo em
   volta do qual o arrasto para os lados gira a câmera, e bem em cima dele não há lado para onde
   girar: quem olha um polo de perto deita esse eixo (o passo do pouso, card C17). */
export function ZoomControls({
  minDistance, maxDistance, reducedMotion, target = ORIGIN, targetName = '', distance = null, facing = null,
  minPolarAngle = 0, maxPolarAngle = Math.PI, surfaceRadius = null, up = WORLD_UP,
}) {
  const controls = useRef(null)
  const invalidate = useThree((state) => state.invalidate)
  const fovDeg = useThree((state) => state.camera.fov)
  const clock = useThree((state) => state.clock)
  // quando a cena foi desenhada pela última vez
  const lastFrameAt = useRef(0)
  const [ux, uy, uz] = up
  const lastUp = useRef(WORLD_UP)

  /* Os três pedidos abaixo saem no useLayoutEffect, e não no useEffect: no mesmo instante em que
     a cena sai do React com o alvo no lugar novo, antes de o navegador desenhar. No useEffect, um
     pouco depois, um quadro podia sair com a Lua no lugar novo e a câmera no antigo: com a
     missão tocando, a Lua dava um tranco na tela. */

  /* Antes dos outros pedidos, de propósito: quando o eixo e o lado para onde virar mudam juntos,
     o lado é pedido já com o eixo novo. Trocar o eixo muda só a inclinação da imagem: a câmera é
     reposta onde estava, sem deslizar. */
  useLayoutEffect(() => {
    const c = controls.current
    const [lx, ly, lz] = lastUp.current
    if (!c || (lx === ux && ly === uy && lz === uz)) return
    lastUp.current = [ux, uy, uz]
    const position = c.getPosition(endPosition, true)
    const aim = c.getTarget(endTarget, true)
    c.camera.up.set(ux, uy, uz)
    c.updateCameraUp()
    c.setLookAt(position.x, position.y, position.z, aim.x, aim.y, aim.z, false)
    invalidate()
  }, [ux, uy, uz, invalidate])
  const lastName = useRef(targetName)
  const lastFacing = useRef(null)
  const [x, y, z] = target

  useLayoutEffect(() => {
    const c = controls.current
    if (!c) return
    const switched = lastName.current !== targetName
    lastName.current = targetName
    /* Trocar de alvo desliza até ele. Seguir o mesmo alvo é seco: deslizando, a câmera ficaria
       sempre um pouco atrás da Terra enquanto ela anda. */
    c.moveTo(x, y, z, switched && !reducedMotion)
    if (switched && distance !== null) c.dollyTo(distance, !reducedMotion)
    invalidate()
  }, [x, y, z, targetName, distance, reducedMotion, invalidate])

  // depois do efeito do alvo, de propósito: quando os dois mudam juntos, este é o que vale
  useLayoutEffect(() => {
    const c = controls.current
    const key = facing?.key ?? null
    if (!c || key === lastFacing.current) return
    lastFacing.current = key
    if (key === null) return
    const [dx, dy, dz] = facing.direction
    const from = distance ?? c.distance
    c.setLookAt(x + dx * from, y + dy * from, z + dz * from, x, y, z, !reducedMotion)
    invalidate()
  }, [facing, x, y, z, distance, reducedMotion, invalidate])

  useEffect(() => {
    const c = controls.current
    if (!c) return
    // o botão direito e os três dedos arrastariam o alvo para fora do centro; dois dedos só aproximam
    const { ACTION } = CameraControlsImpl
    c.mouseButtons.right = ACTION.NONE
    c.touches.two = ACTION.TOUCH_DOLLY
    c.touches.three = ACTION.NONE
    c.smoothTime = reducedMotion ? 0 : SMOOTH_S
    c.draggingSmoothTime = reducedMotion ? 0 : SMOOTH_S / 2
  }, [reducedMotion])

  /* As velocidades da mão. Sem corpo por perto, as de sempre. Com ele, as da altura da câmera,
     postas aqui para o primeiro arrasto e refeitas a cada quadro desenhado (abaixo): a roda e o
     arrasto mudam a altura, e todo quadro em que a câmera anda passa por lá. */
  useEffect(() => {
    const c = controls.current
    if (!c) return
    if (surfaceRadius !== null) {
      applySurfaceSpeeds(c, surfaceRadius, fovDeg)
      return
    }
    c.azimuthRotateSpeed = ROTATE_SPEED_MAX
    c.polarRotateSpeed = ROTATE_SPEED_MAX
    c.dollySpeed = DOLLY_SPEED
  }, [surfaceRadius, fovDeg])
  useFrame(() => {
    lastFrameAt.current = performance.now()
    if (controls.current && surfaceRadius !== null) applySurfaceSpeeds(controls.current, surfaceRadius, fovDeg)
  })

  /* A cena só desenha quando algo muda, e o relógio dela conta o tempo parado inteiro como se fosse
     o intervalo do quadro seguinte. A câmera anda pelo intervalo: depois de uns segundos parada, o
     primeiro passo da roda chegava ao fim num quadro só, sem deslizar (medido no navegador em
     19/11/2026). Ler o relógio quando a pessoa mexe joga fora o tempo parado, como na cena da Lua
     (dropIdleTime, em CameraRig.jsx). Só com a cena parada: andando, o intervalo é o de verdade. */
  useEffect(() => {
    const c = controls.current
    if (!c) return undefined
    const dropIdleTime = () => {
      if (performance.now() - lastFrameAt.current > IDLE_MS) clock.getDelta()
    }
    c.addEventListener('control', dropIdleTime)
    return () => c.removeEventListener('control', dropIdleTime)
  }, [clock])

  /* Em volta de um corpo, o arrasto que gira não tem amortecimento: o chão fica na mão. As
     velocidades de cima fazem o chão andar o mesmo que o mouse; com o amortecimento de sempre ele
     vinha atrás, 24 px num arrasto lento e 126 px num rápido (medido no navegador em 19/11/2026;
     o Marco achou a Lua "lagada" ao arrastar). A roda continua deslizando: a câmera tem um número
     só para os dois (draggingSmoothTime), e ele vai a zero só enquanto dura um arrasto que gira. */
  useEffect(() => {
    const c = controls.current
    if (!c || surfaceRadius === null) return undefined
    const damped = reducedMotion ? 0 : SMOOTH_S / 2
    const { ACTION } = CameraControlsImpl
    const turning = ACTION.ROTATE | ACTION.TOUCH_ROTATE
    const start = () => {
      if (c.currentAction & turning) c.draggingSmoothTime = 0
    }
    const end = () => {
      c.draggingSmoothTime = damped
    }
    c.addEventListener('controlstart', start)
    c.addEventListener('controlend', end)
    return () => {
      c.removeEventListener('controlstart', start)
      c.removeEventListener('controlend', end)
      end()
    }
  }, [surfaceRadius, reducedMotion])

  return (
    <CameraControls
      ref={controls}
      minDistance={minDistance}
      maxDistance={maxDistance}
      minPolarAngle={minPolarAngle}
      maxPolarAngle={maxPolarAngle}
    />
  )
}
