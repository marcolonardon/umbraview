/* A ponte da conta rápida de quais bases servem (card C19): o motor (launchReach, em
 * src/engine/mission.js) diz, para cada base, se ela lança na direção que permite até a órbita da
 * janela escolhida; o hook só pede a conta quando a janela muda. */
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useLaunchReach } from './useLaunchReach.js'

const JANELA = { startUtc: new Date('2026-12-05T00:00:00Z'), endUtc: new Date('2026-12-08T00:00:00Z') }
const BASES = [
  { id: 'livre', lat: 28.6, lon: -80.6, azimuthLimits: null },
  { id: 'oeste', lat: 28.6, lon: -80.6, azimuthLimits: [{ minDeg: 200, maxDeg: 250 }] },
]

describe('useLaunchReach', () => {
  it('sem janela não calcula nada, e devolve null', () => {
    const conta = vi.fn()
    const { result } = renderHook(() => useLaunchReach(BASES, null, conta))
    expect(result.current).toBeNull()
    expect(conta).not.toHaveBeenCalled()
  })

  it('com a janela, entrega o que o motor disse de cada base', () => {
    const { result } = renderHook(() => useLaunchReach(BASES, JANELA))
    expect(result.current).toEqual({ livre: 'unchecked', oeste: 'blocked' })
  })

  it('um objeto novo com a mesma janela não refaz a conta', () => {
    const conta = vi.fn(() => ({}))
    const { rerender } = renderHook(({ janela }) => useLaunchReach(BASES, janela, conta), { initialProps: { janela: JANELA } })
    rerender({ janela: { startUtc: new Date(JANELA.startUtc), endUtc: new Date(JANELA.endUtc) } })
    expect(conta).toHaveBeenCalledTimes(1)
  })
})
