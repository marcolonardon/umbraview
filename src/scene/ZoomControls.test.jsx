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
 */
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ZoomControls } from './ZoomControls.jsx'

const { controls, invalidate } = vi.hoisted(() => ({
  controls: { moveTo: vi.fn(), dollyTo: vi.fn(), setLookAt: vi.fn(), distance: 5, mouseButtons: {}, touches: {} },
  invalidate: vi.fn(),
}))

vi.mock('@react-three/fiber', () => ({ useThree: (selector) => selector({ invalidate }) }))
vi.mock('@react-three/drei', async () => {
  const { useImperativeHandle } = await import('react')
  // o substituto entrega ao ZoomControls o objeto que anota os pedidos, no lugar da câmera
  function CameraControls({ ref }) {
    useImperativeHandle(ref, () => controls)
    return null
  }
  return { CameraControls, CameraControlsImpl: { ACTION: { NONE: 0, TOUCH_DOLLY: 1 } } }
})

const LUA = [60, 1, 17]
const TERRA = [0, 0, 0]
const limites = { minDistance: 1, maxDistance: 400 }

beforeEach(() => {
  vi.clearAllMocks()
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
