// @vitest-environment node
import { readFile as readFromDisk } from 'node:fs/promises'
import { join } from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { HORIZON, MIN_LANDING_WINDOW_HOURS, NEXT_WINDOW_PERIODS, PERIOD_DAYS } from './config.js'
import { computeEphemeris } from './ephemeris.js'
import { latLonToUnit } from './geometry.js'
import { computeHorizon } from './horizon.js'
import { loadReliefLayers } from './reliefFiles.js'
import { computeSeries } from './series.js'
import { createSiteSky } from './siteSky.js'
import { summarizeSky } from './summary.js'

/* A conta que a ponte (src/hooks/useSiteSky.js) pede, com o motor de verdade e os arquivos de
   verdade de public/data/relief/, lidos do disco no lugar do fetch do site. computeEphemeris e
   computeHorizon continuam sendo as funções de verdade: o vi.fn só embrulha cada uma para contar
   quantas vezes ela rodou. */
vi.mock('./ephemeris.js', async (importOriginal) => {
  const real = await importOriginal()
  return { ...real, computeEphemeris: vi.fn(real.computeEphemeris) }
})
vi.mock('./horizon.js', async (importOriginal) => {
  const real = await importOriginal()
  return { ...real, computeHorizon: vi.fn(real.computeHorizon) }
})

const DIR = join(process.cwd(), 'public', 'data', 'relief')
const HOUR_MS = 3600e3
const NOV_14 = Date.UTC(2026, 10, 14)
const NOV_21 = Date.UTC(2026, 10, 21)
/* Os pontos 1 e 5 da comparação com a NASA (card E1): dois lugares longe um do outro. */
const TOP_1 = { lat: -89.475, lon: -137.44 }
const POINT_5 = { lat: -85.3, lon: 37.1 }

/* A leitura do site (lá, com fetch), aqui do disco, guardando cada caminho pedido. */
function diskReader() {
  const reads = []
  const readFile = async (path) => {
    reads.push(path)
    const bytes = await readFromDisk(join(DIR, path))
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  }
  return { readFile, reads }
}

/* Uma leitura que falha nas primeiras `failures` vezes em que o caminho passa no teste `matches`,
   como a rede caindo no meio. */
function flakyReader(matches, failures) {
  const { readFile, reads } = diskReader()
  const attempts = []
  const flaky = (path) => {
    attempts.push(path)
    if (matches(path) && failures-- > 0) return Promise.reject(new Error('rede caiu'))
    return readFile(path)
  }
  return { readFile: flaky, reads, attempts }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('céu de um ponto com o relevo do site (siteSky.js)', () => {
  it('dá o mesmo céu que o caminho do card E1 chamado à mão', async () => {
    const { readFile } = diskReader()
    const manifest = JSON.parse(await readFromDisk(join(DIR, 'manifest.json'), 'utf8'))
    const point = latLonToUnit(TOP_1.lat, TOP_1.lon)
    const horizon = computeHorizon(await loadReliefLayers(manifest, point, readFile), point, HORIZON)
    const ephemeris = computeEphemeris(NOV_14, PERIOD_DAYS * 24, 1)
    const expected = summarizeSky(computeSeries(horizon, ephemeris), { minWindowHours: MIN_LANDING_WINDOW_HOURS, horizon })

    const sky = await createSiteSky(readFile)(TOP_1, NOV_14)
    // com janela no período, a busca adiante não roda: nextWindow é null (card C18)
    expect(sky).toEqual({ ...expected, terrain: { coarse: false, metersPerPixel: 80 }, nextWindow: null })
    // a vista do chão vem com o contorno do relevo do próprio ponto, e não vazia
    expect(sky.groundView.horizonDeg).toHaveLength(360)
  })

  it('as janelas de pouso ficam dentro do período, a partir da data pedida', async () => {
    const sky = await createSiteSky(diskReader().readFile)(TOP_1, NOV_14)
    const lastInstant = NOV_14 + (PERIOD_DAYS * 24 - 1) * HOUR_MS
    expect(sky.landingWindows.length).toBeGreaterThan(0)
    for (const { startUtc, endUtc } of sky.landingWindows) {
      expect(startUtc.getTime()).toBeGreaterThanOrEqual(NOV_14)
      expect(endUtc.getTime()).toBeLessThanOrEqual(lastInstant)
    }
  })

  it('dois pontos na mesma data calculam a posição do Sol e da Terra uma vez só', async () => {
    const siteSky = createSiteSky(diskReader().readFile)
    await siteSky(TOP_1, NOV_14)
    await siteSky(POINT_5, NOV_14)
    expect(computeEphemeris).toHaveBeenCalledTimes(1)
    expect(computeHorizon).toHaveBeenCalledTimes(2)
  })

  it('o mesmo ponto em duas datas calcula o horizonte uma vez só', async () => {
    const siteSky = createSiteSky(diskReader().readFile)
    const first = await siteSky(TOP_1, NOV_14)
    const second = await siteSky(TOP_1, NOV_21)
    expect(computeHorizon).toHaveBeenCalledTimes(1)
    expect(computeEphemeris).toHaveBeenCalledTimes(2)
    expect(second).not.toEqual(first)
  })

  it('o mesmo ponto pedido duas vezes ao mesmo tempo calcula o horizonte uma vez só', async () => {
    // é o que o React faz no modo de desenvolvimento: roda o efeito, desfaz e roda de novo
    const siteSky = createSiteSky(diskReader().readFile)
    const [a, b] = await Promise.all([siteSky(TOP_1, NOV_14), siteSky(TOP_1, NOV_14)])
    expect(computeHorizon).toHaveBeenCalledTimes(1)
    expect(b).toEqual(a)
  })

  it('o manifest.json é lido uma vez, mesmo com dois pontos pedidos ao mesmo tempo', async () => {
    const { readFile, reads } = diskReader()
    const siteSky = createSiteSky(readFile)
    await Promise.all([siteSky(TOP_1, NOV_14), siteSky(POINT_5, NOV_14)])
    await siteSky(TOP_1, NOV_21)
    expect(reads.filter((path) => path === 'manifest.json')).toHaveLength(1)
  })

  it('o manifest.json que não chegou não fica guardado: o pedido seguinte lê de novo', async () => {
    const { readFile, attempts } = flakyReader((path) => path === 'manifest.json', 1)
    const siteSky = createSiteSky(readFile)
    await expect(siteSky(TOP_1, NOV_14)).rejects.toThrow('rede caiu')
    const sky = await siteSky(TOP_1, NOV_14)
    expect(sky.sunFraction).toBeGreaterThan(0)
    expect(attempts.filter((path) => path === 'manifest.json')).toHaveLength(2)
  })

  it('o relevo que não chegou não deixa o horizonte guardado: o mesmo ponto, de novo, calcula', async () => {
    const { readFile } = flakyReader((path) => path.startsWith('near/'), 1)
    const siteSky = createSiteSky(readFile)
    await expect(siteSky(TOP_1, NOV_14)).rejects.toThrow('rede caiu')
    const sky = await siteSky(TOP_1, NOV_14)
    expect(sky.sunFraction).toBeGreaterThan(0)
    expect(computeHorizon).toHaveBeenCalledTimes(1)
  })

  it('ponto fora da área do polo usa o relevo da Lua inteira, sem baixar o relevo fino', async () => {
    const { readFile, reads } = diskReader()
    const sky = await createSiteSky(readFile)({ lat: -80, lon: 0 }, NOV_14)
    expect(sky.terrain.coarse).toBe(true)
    expect(reads.slice(0, 2)).toEqual(['manifest.json', 'global/manifest.json'])
    expect(reads.slice(2).every((path) => path.startsWith('global/r'))).toBe(true)
  })
})

/* Card C18: um ponto escolhido ao acaso quase sempre fica sem janela nos 30 dias da data, e a tela
   só dizia "troque a data". O motor passa a procurar adiante, período depois de período. Os pontos
   foram achados com o próprio motor em 19/11/2026, olhando 13 períodos a partir de 14/11/2026. */
describe('a próxima janela de pouso, quando o período não tem nenhuma (card C18)', () => {
  const DAY_MS = 24 * HOUR_MS
  // perto do polo, sem janela nos seis primeiros períodos e com uma no sétimo
  const LATER = { lat: -87.5, lon: -150 }
  // o meio do lado oculto: a Terra nunca passa do horizonte
  const FAR_SIDE = { lat: 0, lon: 180 }

  it('acha a primeira janela dos períodos seguintes, igual à que o período dela dá', async () => {
    const siteSky = createSiteSky(diskReader().readFile)
    const sky = await siteSky(LATER, NOV_14)
    expect(sky.landingWindows).toEqual([])
    const periodStartMs = NOV_14 + 6 * PERIOD_DAYS * DAY_MS
    expect(sky.nextWindow.periodStartUtc.getTime()).toBe(periodStartMs)
    expect(sky.nextWindow.earthEverAboveHorizon).toBe(true)
    const thatPeriod = await siteSky(LATER, periodStartMs)
    expect(sky.nextWindow.landingWindow).toEqual(thatPeriod.landingWindows[0])
  })

  it('no lado oculto não acha janela e diz que a Terra nunca passou do horizonte', async () => {
    const sky = await createSiteSky(diskReader().readFile)(FAR_SIDE, NOV_14)
    expect(sky.landingWindows).toEqual([])
    expect(sky.nextWindow.landingWindow).toBeNull()
    expect(sky.nextWindow.periodStartUtc).toBeNull()
    expect(sky.nextWindow.earthEverAboveHorizon).toBe(false)
    // até onde procurou: o fim do último período olhado
    expect(sky.nextWindow.searchedUntilUtc.getTime()).toBe(NOV_14 + (NEXT_WINDOW_PERIODS + 1) * PERIOD_DAYS * DAY_MS)
  })

  it('a posição do Sol e da Terra de cada período é guardada: o segundo ponto não refaz', async () => {
    const siteSky = createSiteSky(diskReader().readFile)
    await siteSky(FAR_SIDE, NOV_14)
    const calls = computeEphemeris.mock.calls.length
    expect(calls).toBe(NEXT_WINDOW_PERIODS + 1)
    await siteSky({ lat: 0, lon: 179 }, NOV_14)
    expect(computeEphemeris).toHaveBeenCalledTimes(calls)
  })
})
