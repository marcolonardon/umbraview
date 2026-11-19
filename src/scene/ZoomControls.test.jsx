/* A câmera das vistas do espaço (ZoomControls.jsx). A câmera de verdade é do WebGL, que o jsdom não
 * tem: o CameraControls do Drei vira um substituto que só anota o que lhe pedem, e o teste confere
 * os pedidos. Dois contratos ficam aqui:
 *
 *   - Todo pedido à câmera pede também um quadro. A cena só desenha quando alguém pede
 *     (frameloop="demand"), e o CameraControls só pede quadro de dentro de um quadro. Sem isto, um
 *     pedido que chegava fora de um clique (a missão que acabou de ser calculada, as janelas de
 *     pouso que chegaram) movia a câmera sem ninguém desenhar: a tela ficava na vista anterior até
 *     alguém mexer nela (visto no navegador em 18/11/2026, card C17, fase 5).
 *   - Com o pedido de menos movimento, a câmera corta em vez de deslizar.
 *   - Em volta de um corpo de que se chega perto (a Lua, no passo do pouso), o chão anda junto com
 *     o mouse: a velocidade de giro acompanha a altura da câmera, como na cena da Lua.
 */
import { render } from '@testing-library/react'
import { useLayoutEffect } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ZoomControls } from './ZoomControls.jsx'

const { controls, invalidate, frame, seen, clock } = vi.hoisted(() => ({
  // o relógio da cena: ler o intervalo dele joga fora o tempo que passou desde a última leitura
  clock: { getDelta: vi.fn() },
  controls: {
    moveTo: vi.fn(), dollyTo: vi.fn(), setLookAt: vi.fn(), distance: 5, mouseButtons: {}, touches: {},
    // o "para cima" dos controles: o da câmera, e o aviso de que ele mudou
    camera: { up: { set: vi.fn() } },
    updateCameraUp: vi.fn(),
    getPosition: (out) => Object.assign(out, { x: 1, y: 2, z: 3 }),
    // os avisos da câmera: quem pediu para ouvir qual, e a ação do arrasto de agora
    listeners: {},
    addEventListener: (type, listener) => {
      controls.listeners[type] = listener
    },
    removeEventListener: (type) => {
      delete controls.listeners[type]
    },
    currentAction: 0,
    getTarget: (out) => Object.assign(out, { x: 60, y: 1, z: 17 }),
    // onde a câmera vai parar: a distância até o alvo e o ângulo a partir do "para cima"
    end: { radius: 5, phi: Math.PI / 2 },
    getSpherical(out) {
      return Object.assign(out, controls.end)
    },
  },
  invalidate: vi.fn(),
  // o que o ZoomControls faz a cada quadro desenhado, para o teste chamar
  frame: { run: () => {} },
  // o que o ZoomControls passou ao CameraControls
  seen: { props: null },
}))

vi.mock('@react-three/fiber', () => ({
  useThree: (selector) => selector({ invalidate, camera: { fov: 35 }, clock }),
  useFrame: (callback) => {
    frame.run = callback
  },
}))
vi.mock('@react-three/drei', async () => {
  const { useImperativeHandle } = await import('react')
  // o substituto entrega ao ZoomControls o objeto que anota os pedidos, no lugar da câmera
  function CameraControls({ ref, ...props }) {
    seen.props = props
    useImperativeHandle(ref, () => controls)
    return null
  }
  return { CameraControls, CameraControlsImpl: { ACTION: { NONE: 0, ROTATE: 1, DOLLY: 8, TOUCH_ROTATE: 64, TOUCH_DOLLY: 512 } } }
})

const LUA = [60, 1, 17]
const TERRA = [0, 0, 0]
const limites = { minDistance: 1, maxDistance: 400 }

beforeEach(() => {
  vi.clearAllMocks()
})

/* O alvo anda a cada quadro (a Lua, com a missão tocando), e a cena já sai do React com ele no
   lugar novo. A câmera tem que ser avisada no mesmo instante, antes de o navegador desenhar: um
   pouco depois, um quadro podia sair com a Lua no lugar novo e a câmera no antigo, e a Lua dava
   um tranco na tela. Quem é irmão do ZoomControls e olha no instante do desenho já vê o pedido. */
describe('ZoomControls: os pedidos saem antes do desenho', () => {
  function NoInstanteDoDesenho({ ver }) {
    useLayoutEffect(() => {
      ver()
    })
    return null
  }

  it('seguir o alvo, virar para um lado e trocar o eixo já foram pedidos quando a tela vai ser desenhada', () => {
    const visto = { moveTo: 0, setLookAt: 0, up: 0 }
    const ver = () => {
      visto.moveTo = controls.moveTo.mock.calls.length
      visto.setLookAt = controls.setLookAt.mock.calls.length
      visto.up = controls.updateCameraUp.mock.calls.length
    }
    const { rerender } = render(
      <>
        <ZoomControls {...limites} target={LUA} targetName="moon" distance={1.3} />
        <NoInstanteDoDesenho ver={ver} />
      </>,
    )
    vi.clearAllMocks()
    rerender(
      <>
        <ZoomControls {...limites} target={[61, 1, 17]} targetName="moon" distance={1.3} up={[1, 0, 0]} facing={{ key: 'lado', direction: [0, 1, 0] }} />
        <NoInstanteDoDesenho ver={ver} />
      </>,
    )
    expect(visto.moveTo).toBe(1)
    expect(visto.up).toBe(1)
    // o que segura a câmera na troca do eixo e o que a vira para o lado
    expect(visto.setLookAt).toBe(2)
  })
})

describe('ZoomControls: os pedidos à câmera', () => {
  it('trocar de alvo desliza até ele, vai para a distância dele e pede um quadro', () => {
    const { rerender } = render(<ZoomControls {...limites} target={LUA} targetName="moon" distance={1.3} />)
    vi.clearAllMocks()
    rerender(<ZoomControls {...limites} target={TERRA} targetName="earth" distance={4} />)
    expect(controls.moveTo).toHaveBeenCalledWith(0, 0, 0, true)
    expect(controls.dollyTo).toHaveBeenCalledWith(4, true)
    expect(invalidate).toHaveBeenCalled()
  })

  it('seguir o mesmo alvo, que anda, é seco, e também pede um quadro', () => {
    const { rerender } = render(<ZoomControls {...limites} target={LUA} targetName="moon" distance={1.3} />)
    vi.clearAllMocks()
    rerender(<ZoomControls {...limites} target={[61, 1, 17]} targetName="moon" distance={1.3} />)
    expect(controls.moveTo).toHaveBeenCalledWith(61, 1, 17, false)
    expect(controls.dollyTo).not.toHaveBeenCalled()
    expect(invalidate).toHaveBeenCalled()
  })

  it('virar para um lado põe a câmera desse lado do alvo, à distância dele, e pede um quadro', () => {
    const { rerender } = render(<ZoomControls {...limites} target={TERRA} targetName="earth" distance={4} />)
    vi.clearAllMocks()
    rerender(<ZoomControls {...limites} target={TERRA} targetName="earth" distance={4} facing={{ key: 'base', direction: [0, 1, 0] }} />)
    expect(controls.setLookAt).toHaveBeenCalledWith(0, 4, 0, 0, 0, 0, true)
    expect(invalidate).toHaveBeenCalled()
  })

  it('só a troca da chave vira a câmera: a direção pode mudar a cada quadro sem movê-la', () => {
    const { rerender } = render(
      <ZoomControls {...limites} target={TERRA} targetName="earth" distance={4} facing={{ key: 'base', direction: [0, 1, 0] }} />,
    )
    vi.clearAllMocks()
    rerender(<ZoomControls {...limites} target={TERRA} targetName="earth" distance={4} facing={{ key: 'base', direction: [1, 0, 0] }} />)
    expect(controls.setLookAt).not.toHaveBeenCalled()
  })
})

/* No passo do pouso a câmera gira em volta do centro da Lua, e chega a 300 km do chão. Na
   velocidade de sempre, arrastar meia tela dava meia volta na Lua: o chão passava voando. */
describe('ZoomControls: em volta de um corpo de que se chega perto', () => {
  const RAIO = 0.27

  it('perto do chão o giro é lento, para o chão andar junto com o mouse; de longe é o de sempre', () => {
    render(<ZoomControls {...limites} target={LUA} targetName="pole" distance={0.45} surfaceRadius={RAIO} />)
    controls.end = { radius: RAIO * 1.2, phi: Math.PI / 2 }
    frame.run()
    expect(controls.polarRotateSpeed).toBeGreaterThan(0)
    expect(controls.polarRotateSpeed).toBeLessThan(0.05)
    expect(controls.azimuthRotateSpeed).toBeCloseTo(controls.polarRotateSpeed, 9)
    const perto = controls.dollySpeed
    controls.end = { radius: RAIO * 40, phi: Math.PI / 2 }
    frame.run()
    expect(controls.polarRotateSpeed).toBe(1)
    expect(controls.azimuthRotateSpeed).toBe(1)
    // e a roda também anda menos perto do chão
    expect(perto).toBeLessThan(controls.dollySpeed)
  })

  /* O giro do globo não tem amortecimento: o chão fica na mão. Com o amortecimento de sempre, o
     chão vinha atrás do mouse, 24 px num arrasto lento e 126 px num rápido, e levava 150 ms para
     alcançar (medido no navegador em 19/11/2026; o Marco achou a Lua "lagada" ao arrastar). A
     roda continua deslizando: é o mesmo número da câmera para os dois, e ele só vai a zero
     enquanto dura um arrasto que gira. */
  it('o arrasto que gira o globo não tem amortecimento, e a roda continua deslizando', () => {
    render(<ZoomControls {...limites} target={LUA} targetName="pole" distance={0.45} surfaceRadius={RAIO} />)
    const amortecido = controls.draggingSmoothTime
    expect(amortecido).toBeGreaterThan(0)
    for (const acao of [1, 64]) {
      controls.currentAction = acao
      controls.listeners.controlstart()
      expect(controls.draggingSmoothTime).toBe(0)
      controls.currentAction = 0
      controls.listeners.controlend()
      expect(controls.draggingSmoothTime).toBe(amortecido)
    }
    // a pinça de dois dedos, que só aproxima, continua amortecida
    controls.currentAction = 512
    controls.listeners.controlstart()
    expect(controls.draggingSmoothTime).toBe(amortecido)
  })

  it('fora do globo o arrasto continua amortecido, e ao sair dele a câmera para de ouvir', () => {
    const { rerender } = render(<ZoomControls {...limites} target={LUA} targetName="pole" distance={0.45} surfaceRadius={RAIO} />)
    const amortecido = controls.draggingSmoothTime
    controls.currentAction = 1
    controls.listeners.controlstart()
    rerender(<ZoomControls {...limites} target={TERRA} targetName="earth" distance={4} />)
    expect(controls.draggingSmoothTime).toBe(amortecido)
    expect(controls.listeners.controlstart).toBeUndefined()
    expect(controls.listeners.controlend).toBeUndefined()
  })

  it('perto do polo, girar para os lados é mais rápido que para cima: o chão anda o mesmo nos dois', () => {
    render(<ZoomControls {...limites} target={LUA} targetName="pole" distance={0.45} surfaceRadius={RAIO} />)
    controls.end = { radius: RAIO * 1.2, phi: (170 * Math.PI) / 180 }
    frame.run()
    expect(controls.azimuthRotateSpeed).toBeGreaterThan(controls.polarRotateSpeed * 5)
  })

  it('sem isso, as velocidades são as de sempre, e voltam a ser quando o corpo sai', () => {
    const { rerender } = render(<ZoomControls {...limites} target={LUA} targetName="pole" distance={0.45} surfaceRadius={RAIO} />)
    controls.end = { radius: RAIO * 1.2, phi: Math.PI / 2 }
    frame.run()
    rerender(<ZoomControls {...limites} target={TERRA} targetName="earth" distance={4} />)
    frame.run()
    expect(controls.polarRotateSpeed).toBe(1)
    expect(controls.azimuthRotateSpeed).toBe(1)
    expect(controls.dollySpeed).toBe(2)
  })

  it('os limites de cima e de baixo do giro vão para a câmera', () => {
    render(<ZoomControls {...limites} target={LUA} targetName="pole" minPolarAngle={0.02} maxPolarAngle={3.12} />)
    expect(seen.props).toMatchObject({ minPolarAngle: 0.02, maxPolarAngle: 3.12 })
  })
})

/* O eixo em volta do qual os controles giram. Bem em cima dele não há lado para onde girar; o
   passo do pouso, que olha o polo da Lua, deita esse eixo (landingViewUp, em missionPath.js). */
describe('ZoomControls: o "para cima" dos controles', () => {
  it('no começo é o do desenho, e nada é pedido à câmera por causa dele', () => {
    render(<ZoomControls {...limites} target={LUA} targetName="moon" distance={1.3} />)
    expect(controls.updateCameraUp).not.toHaveBeenCalled()
  })

  it('quando muda, troca o da câmera, avisa os controles e deixa a câmera onde estava, sem deslizar', () => {
    const { rerender } = render(<ZoomControls {...limites} target={LUA} targetName="moon" distance={1.3} />)
    vi.clearAllMocks()
    rerender(<ZoomControls {...limites} target={LUA} targetName="moon" distance={1.3} up={[1, 0, 0]} />)
    expect(controls.camera.up.set).toHaveBeenCalledWith(1, 0, 0)
    expect(controls.updateCameraUp).toHaveBeenCalledTimes(1)
    expect(controls.setLookAt).toHaveBeenCalledWith(1, 2, 3, 60, 1, 17, false)
    expect(invalidate).toHaveBeenCalled()
  })

  it('vem antes de virar a câmera para um lado: o lado pedido é o que fica', () => {
    const { rerender } = render(<ZoomControls {...limites} target={LUA} targetName="moon" distance={1.3} />)
    vi.clearAllMocks()
    rerender(
      <ZoomControls {...limites} target={LUA} targetName="pole" distance={0.45} up={[1, 0, 0]} facing={{ key: 'landing', direction: [0, -1, 0] }} />,
    )
    const ordem = controls.setLookAt.mock.calls.map((call) => call[6])
    // primeiro o que segura a câmera no lugar (sem deslizar), por último o que a vira (deslizando)
    expect(ordem).toEqual([false, true])
  })

  it('sem mudança, não é pedido de novo', () => {
    const { rerender } = render(<ZoomControls {...limites} target={LUA} targetName="pole" distance={0.45} up={[1, 0, 0]} />)
    vi.clearAllMocks()
    rerender(<ZoomControls {...limites} target={LUA} targetName="pole" distance={0.45} up={[1, 0, 0]} />)
    expect(controls.updateCameraUp).not.toHaveBeenCalled()
  })
})

/* A cena só desenha quando algo muda, e o relógio dela conta o tempo parado inteiro como se fosse
   o intervalo do quadro seguinte. A câmera anda pelo intervalo: depois de uns segundos parada, o
   primeiro passo da roda chegava ao fim num quadro só, sem deslizar, e só do segundo em diante
   deslizava (medido no navegador em 19/11/2026). É o mesmo cuidado da cena da Lua (CameraRig.jsx). */
describe('ZoomControls: a roda depois de a cena ficar parada', () => {
  it('joga fora o tempo parado, para o primeiro passo deslizar como os outros', () => {
    const agora = vi.spyOn(performance, 'now').mockReturnValue(1000)
    render(<ZoomControls {...limites} target={LUA} targetName="moon" distance={1.3} />)
    frame.run()
    vi.clearAllMocks()
    agora.mockReturnValue(5000)
    controls.listeners.control()
    expect(clock.getDelta).toHaveBeenCalledTimes(1)
    agora.mockRestore()
  })

  it('com a cena andando, não mexe no relógio: o intervalo do quadro é o de verdade', () => {
    const agora = vi.spyOn(performance, 'now').mockReturnValue(1000)
    render(<ZoomControls {...limites} target={LUA} targetName="moon" distance={1.3} />)
    frame.run()
    vi.clearAllMocks()
    agora.mockReturnValue(1016)
    controls.listeners.control()
    expect(clock.getDelta).not.toHaveBeenCalled()
    agora.mockRestore()
  })
})

describe('ZoomControls: com o pedido de menos movimento', () => {
  it('a câmera corta em vez de deslizar: troca de alvo, de distância e de lado sem transição', () => {
    const { rerender } = render(<ZoomControls {...limites} reducedMotion target={LUA} targetName="moon" distance={1.3} />)
    vi.clearAllMocks()
    rerender(
      <ZoomControls
        {...limites} reducedMotion target={TERRA} targetName="earth" distance={4} facing={{ key: 'base', direction: [0, 1, 0] }}
      />,
    )
    expect(controls.moveTo).toHaveBeenCalledWith(0, 0, 0, false)
    expect(controls.dollyTo).toHaveBeenCalledWith(4, false)
    expect(controls.setLookAt).toHaveBeenCalledWith(0, 4, 0, 0, 0, 0, false)
    // e o mouse também não desliza depois de solto
    expect(controls.smoothTime).toBe(0)
    expect(controls.draggingSmoothTime).toBe(0)
  })

  it('sem o pedido, o mouse desliza até parar', () => {
    render(<ZoomControls {...limites} target={LUA} targetName="moon" distance={1.3} />)
    expect(controls.smoothTime).toBeGreaterThan(0)
  })
})
