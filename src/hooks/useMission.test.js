import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useMission } from './useMission.js'

const KENNEDY = { name: 'Kennedy Space Center, LC-39A', lat: 28.6083, lon: -80.6041 }
const MAHIA = { name: 'Mahia', lat: -39.2604, lon: 177.8652 }
const IM2 = { name: 'Athena (IM-2)', lat: -84.7906, lon: 29.1957 }
const JANELA = { startUtc: new Date('2026-12-05T00:00:00Z'), endUtc: new Date('2026-12-08T00:00:00Z'), durationHours: 72 }

/* Um Worker de mentira: guarda os pedidos, e o teste responde quando quiser. */
function fabrica() {
  const worker = {
    pedidos: [],
    ouvintes: new Set(),
    terminate: vi.fn(),
    postMessage(pedido) { this.pedidos.push(pedido) },
    addEventListener(_, ouvinte) { this.ouvintes.add(ouvinte) },
    removeEventListener(_, ouvinte) { this.ouvintes.delete(ouvinte) },
    responde(data) { for (const ouvinte of [...this.ouvintes]) ouvinte({ data }) },
  }
  const criar = vi.fn(() => worker)
  return { worker, criar }
}

const resposta = (id) => ({ id, mission: { launchUtc: new Date('2026-11-30T22:11:46Z'), tliDeltaVKmS: 3.14, segments: [] }, elapsedMs: 70 })

describe('useMission', () => {
  it('sem a base, o local de pouso ou a janela, não cria o Worker nem pede nada', () => {
    const { criar } = fabrica()
    for (const [base, local, janela] of [[null, IM2, JANELA], [KENNEDY, null, JANELA], [KENNEDY, IM2, null]]) {
      const { result } = renderHook(() => useMission(base, local, janela, criar))
      expect(result.current).toEqual({ status: 'idle', mission: null })
    }
    expect(criar).not.toHaveBeenCalled()
  })

  it('com os três, pede a conta e entrega a missão, com o tempo que ela levou', async () => {
    const { worker, criar } = fabrica()
    const { result } = renderHook(() => useMission(KENNEDY, IM2, JANELA, criar))
    await waitFor(() => expect(result.current.status).toBe('loading'))
    expect(result.current.mission).toBeNull()
    expect(worker.pedidos).toHaveLength(1)
    // o pedido leva só os números: o Worker não recebe nome nem o resto da janela
    expect(worker.pedidos[0]).toEqual({
      id: worker.pedidos[0].id,
      launchSite: { lat: KENNEDY.lat, lon: KENNEDY.lon },
      landingSite: { lat: IM2.lat, lon: IM2.lon },
      landingWindow: { startUtc: JANELA.startUtc, endUtc: JANELA.endUtc },
    })
    act(() => worker.responde(resposta(worker.pedidos[0].id)))
    expect(result.current.status).toBe('ready')
    expect(result.current.mission.tliDeltaVKmS).toBe(3.14)
    expect(result.current.mission.elapsedMs).toBe(70)
  })

  it('a resposta de uma base velha, chegando depois da troca, não entra na tela', async () => {
    const { worker, criar } = fabrica()
    const { result, rerender } = renderHook(({ base }) => useMission(base, IM2, JANELA, criar), { initialProps: { base: KENNEDY } })
    await waitFor(() => expect(worker.pedidos).toHaveLength(1))
    rerender({ base: MAHIA })
    await waitFor(() => expect(worker.pedidos).toHaveLength(2))
    act(() => worker.responde(resposta(worker.pedidos[0].id)))
    expect(result.current).toEqual({ status: 'loading', mission: null })
    act(() => worker.responde(resposta(worker.pedidos[1].id)))
    expect(result.current.status).toBe('ready')
    // um Worker só para as duas bases
    expect(criar).toHaveBeenCalledTimes(1)
  })

  it('trocando a base com uma missão pronta, a missão da base anterior sai da tela na hora', async () => {
    const { worker, criar } = fabrica()
    const { result, rerender } = renderHook(({ base }) => useMission(base, IM2, JANELA, criar), { initialProps: { base: KENNEDY } })
    await waitFor(() => expect(worker.pedidos).toHaveLength(1))
    act(() => worker.responde(resposta(worker.pedidos[0].id)))
    expect(result.current.status).toBe('ready')
    rerender({ base: MAHIA })
    // no mesmo render da troca: uma linha saindo de Kennedy com a base em Mahia seria um erro na tela
    expect(result.current).toEqual({ status: 'loading', mission: null })
  })

  it('um objeto novo com a mesma base, o mesmo local e a mesma janela não refaz a conta', async () => {
    const { worker, criar } = fabrica()
    const { rerender } = renderHook(({ base, janela }) => useMission(base, IM2, janela, criar), { initialProps: { base: KENNEDY, janela: JANELA } })
    await waitFor(() => expect(worker.pedidos).toHaveLength(1))
    rerender({ base: { ...KENNEDY }, janela: { startUtc: new Date(JANELA.startUtc), endUtc: new Date(JANELA.endUtc) } })
    await act(async () => {})
    expect(worker.pedidos).toHaveLength(1)
  })

  it('se a conta não acha caminho, diz erro e o motivo vai para o console', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { worker, criar } = fabrica()
    const { result } = renderHook(() => useMission(KENNEDY, IM2, JANELA, criar))
    await waitFor(() => expect(worker.pedidos).toHaveLength(1))
    act(() => worker.responde({ id: worker.pedidos[0].id, error: 'Error: a mira não fechou' }))
    expect(result.current).toEqual({ status: 'error', mission: null })
    expect(erro).toHaveBeenCalled()
    erro.mockRestore()
  })

  it('se o Worker não pode ser criado, diz erro em vez de quebrar a tela', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    const criar = vi.fn(() => {
      throw new Error('sem Worker')
    })
    const { result } = renderHook(() => useMission(KENNEDY, IM2, JANELA, criar))
    await waitFor(() => expect(result.current).toEqual({ status: 'error', mission: null }))
    erro.mockRestore()
  })

  it('tirar a janela volta ao estado de parado, e sair da tela encerra o Worker', async () => {
    const { worker, criar } = fabrica()
    const { result, rerender, unmount } = renderHook(({ janela }) => useMission(KENNEDY, IM2, janela, criar), { initialProps: { janela: JANELA } })
    await waitFor(() => expect(worker.pedidos).toHaveLength(1))
    rerender({ janela: null })
    expect(result.current).toEqual({ status: 'idle', mission: null })
    unmount()
    expect(worker.terminate).toHaveBeenCalled()
  })
})
