/* O relógio próprio das vistas do espaço (a do sistema e a da missão): anda pelo período sem mudar
 * a data do cálculo. */
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useViewClock } from './useViewClock.js'

const PERIODO_H = 720
// tocando, 30 horas do período por segundo de relógio
const HORAS_POR_SEGUNDO = 30

describe('useViewClock', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('começa na hora zero, parado, e parado não anda', () => {
    const { result } = renderHook(() => useViewClock(PERIODO_H, HORAS_POR_SEGUNDO))
    expect(result.current.hour).toBe(0)
    expect(result.current.playing).toBe(false)
    act(() => vi.advanceTimersByTime(3000))
    expect(result.current.hour).toBe(0)
  })

  it('tocando, anda no ritmo pedido, e para onde estava quando a pessoa pausa', () => {
    const { result } = renderHook(() => useViewClock(PERIODO_H, HORAS_POR_SEGUNDO))
    act(() => result.current.setPlaying(true))
    act(() => vi.advanceTimersByTime(2000))
    // 2 s a 30 h por segundo; a folga é de um quadro (16 ms, meia hora do período)
    expect(result.current.hour).toBeGreaterThan(59)
    expect(result.current.hour).toBeLessThanOrEqual(60)

    act(() => result.current.setPlaying(false))
    const parado = result.current.hour
    act(() => vi.advanceTimersByTime(2000))
    expect(result.current.hour).toBe(parado)
  })

  it('no fim do período, volta ao começo', () => {
    const { result } = renderHook(() => useViewClock(PERIODO_H, HORAS_POR_SEGUNDO))
    act(() => result.current.setPlaying(true))
    // 25 s dão 750 h: 30 h depois de uma volta inteira de 720
    act(() => vi.advanceTimersByTime(25000))
    expect(result.current.hour).toBeGreaterThan(29)
    expect(result.current.hour).toBeLessThanOrEqual(30)
  })

  it('levar o cursor a uma hora (seek) vai para ela e para de tocar', () => {
    // sem parar, o relógio arrancaria o cursor da mão de quem o arrasta
    const { result } = renderHook(() => useViewClock(PERIODO_H, HORAS_POR_SEGUNDO))
    act(() => result.current.setPlaying(true))
    act(() => result.current.seek(240))
    expect(result.current.hour).toBe(240)
    expect(result.current.playing).toBe(false)
    act(() => vi.advanceTimersByTime(2000))
    expect(result.current.hour).toBe(240)
  })
})
