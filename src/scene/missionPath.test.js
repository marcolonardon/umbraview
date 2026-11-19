// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { EARTH_EQUATORIAL_RADIUS_KM } from '../engine/earthSite.js'
import { computeMission } from '../engine/mission.js'
import { craftCamera, missionEvents, pathLength, segmentUnits, spacecraftAt } from './missionPath.js'

/* Dois trechos de mentira, com números fáceis: um contado da Terra, de 0 a 10 s, e um contado da
   Lua, de 10 a 30 s. */
const TRECHOS = [
  {
    phase: 'crossing', kind: 'integrated', center: 'earth',
    timesMs: Float64Array.of(0, 4000, 10000),
    positionsKm: Float32Array.of(0, 0, 0, 400, 0, 0, 400, 600, 0),
  },
  {
    phase: 'landing', kind: 'schematic', center: 'moon',
    timesMs: Float64Array.of(10000, 30000),
    positionsKm: Float32Array.of(10, 0, 0, 10, 0, 40),
  },
]

// uma missão de verdade, do motor: de Kennedy ao pouso da IM-2, na janela de 05/12/2026
const MISSAO = computeMission({
  launchSite: { lat: 28.6083, lon: -80.6041 },
  landingSite: { lat: -84.7906, lon: 29.1957 },
  landingWindow: { startUtc: new Date(Date.UTC(2026, 11, 5)), endUtc: new Date(Date.UTC(2026, 11, 8)) },
})
const tamanho = (v) => Math.hypot(...v)

describe('onde a nave está num instante (spacecraftAt)', () => {
  it('entre dois pontos do caminho, fica na reta entre eles, na proporção do tempo', () => {
    expect(spacecraftAt(TRECHOS, 1000).positionKm).toEqual([100, 0, 0])
    expect(spacecraftAt(TRECHOS, 7000).positionKm).toEqual([400, 300, 0])
    expect(spacecraftAt(TRECHOS, 20000).positionKm).toEqual([10, 0, 20])
  })

  it('em cima de um ponto do caminho, está nele', () => {
    expect(spacecraftAt(TRECHOS, 4000).positionKm).toEqual([400, 0, 0])
    expect(spacecraftAt(TRECHOS, 0).positionKm).toEqual([0, 0, 0])
    expect(spacecraftAt(TRECHOS, 30000).positionKm).toEqual([10, 0, 40])
  })

  it('diz em que fase a nave está, se o trecho é conta ou desenho, e de onde a posição é contada', () => {
    expect(spacecraftAt(TRECHOS, 5000)).toMatchObject({ phase: 'crossing', kind: 'integrated', center: 'earth' })
    expect(spacecraftAt(TRECHOS, 15000)).toMatchObject({ phase: 'landing', kind: 'schematic', center: 'moon' })
    // na emenda, já é o trecho seguinte: a posição é a mesma, contada de outro centro
    expect(spacecraftAt(TRECHOS, 10000)).toMatchObject({ phase: 'landing', center: 'moon', positionKm: [10, 0, 0] })
  })

  it('antes do lançamento fica no primeiro ponto, e depois do pouso, no último', () => {
    expect(spacecraftAt(TRECHOS, -5000)).toMatchObject({ phase: 'crossing', positionKm: [0, 0, 0] })
    expect(spacecraftAt(TRECHOS, 99000)).toMatchObject({ phase: 'landing', positionKm: [10, 0, 40] })
  })

  it('numa missão do motor, passa por todas as fases em ordem, do lançamento ao pouso', () => {
    const inicio = MISSAO.launchUtc.getTime()
    const fim = MISSAO.landingUtc.getTime()
    const fases = []
    for (let i = 0; i <= 2000; i += 1) {
      const { phase } = spacecraftAt(MISSAO.segments, inicio + (i / 2000) * (fim - inicio))
      if (fases.at(-1) !== phase) fases.push(phase)
    }
    expect(fases).toEqual(['ascent', 'parking', 'crossing', 'lunarOrbit', 'descent', 'landing'])
  })
})

describe('os eventos da missão, para os nomes na cena (missionEvents)', () => {
  const eventos = missionEvents(MISSAO)

  it('são quatro, em ordem: o lançamento, a saída da Terra, a chegada à Lua e o pouso', () => {
    expect(eventos.map((evento) => evento.key)).toEqual(['launch', 'tli', 'loi', 'landing'])
    for (let i = 1; i < eventos.length; i += 1) expect(eventos[i].dateMs).toBeGreaterThan(eventos[i - 1].dateMs)
  })

  it('cada um está no instante da missão e no ponto do caminho em que acontece', () => {
    const [lancamento, saida, chegada, pouso] = eventos
    // o Date da missão corta a fração de milissegundo
    expect(Math.trunc(lancamento.dateMs)).toBe(MISSAO.launchUtc.getTime())
    expect(Math.trunc(saida.dateMs)).toBe(MISSAO.tliUtc.getTime())
    expect(Math.trunc(chegada.dateMs)).toBe(MISSAO.loiUtc.getTime())
    expect(Math.trunc(pouso.dateMs)).toBe(MISSAO.landingUtc.getTime())
    for (const evento of eventos) {
      expect(evento.positionKm).toEqual(spacecraftAt(MISSAO.segments, evento.dateMs).positionKm)
    }
  })

  it('os da Terra são contados da Terra, e os da Lua, da Lua', () => {
    expect(eventos.map((evento) => evento.center)).toEqual(['earth', 'earth', 'moon', 'moon'])
    // o lançamento no chão da Terra, a saída a 185 km dele, a chegada a 100 km da Lua e o pouso no chão dela
    expect(tamanho(eventos[0].positionKm)).toBeLessThan(EARTH_EQUATORIAL_RADIUS_KM)
    expect(tamanho(eventos[1].positionKm)).toBeCloseTo(EARTH_EQUATORIAL_RADIUS_KM + 185, 0)
    expect(tamanho(eventos[2].positionKm)).toBeCloseTo(1737.4 + 100, 0)
    expect(tamanho(eventos[3].positionKm)).toBeCloseTo(1737.4, 1)
  })
})

describe('o caminho nas unidades do desenho (segmentUnits e pathLength)', () => {
  it('são os mesmos pontos, com o raio da Terra valendo 1', () => {
    const subida = segmentUnits(MISSAO.segments[0])
    expect(subida).toHaveLength(MISSAO.segments[0].positionsKm.length)
    // o primeiro ponto é a base, no chão: a menos de 0,4% do raio do equador
    expect(tamanho(subida.slice(0, 3))).toBeGreaterThan(0.996)
    expect(tamanho(subida.slice(0, 3))).toBeLessThanOrEqual(1)
    expect(segmentUnits(TRECHOS[1])[5]).toBeCloseTo(40 / EARTH_EQUATORIAL_RADIUS_KM, 12)
  })

  it('o comprimento de um caminho é a soma dos pedaços entre os pontos', () => {
    expect(pathLength([0, 0, 0, 3, 4, 0, 3, 4, 12])).toBe(17)
    expect(pathLength([1, 1, 1])).toBe(0)
    // a subida anda 20° em volta da Terra: uns 0,35 raio
    const subida = pathLength(segmentUnits(MISSAO.segments[0]))
    expect(subida).toBeGreaterThan(0.3)
    expect(subida).toBeLessThan(0.4)
  })
})

/* A câmera da nave gira em volta dela. Perto da Terra ou da Lua, uma câmera a 2 raios da nave
   pode cair dentro do corpo: no navegador, a tela ficava toda azul com a nave na órbita de espera.
   O limite de perto afasta a câmera o bastante para ela ficar fora, de qualquer lado. */
describe('até onde a câmera chega perto da nave (craftCamera)', () => {
  const LIMITES = { distance: 2, near: 0.3, earthClearance: 1.25, moonClearance: 0.4 }
  // de qualquer lado em que a câmera esteja, a que distância do centro do corpo ela fica, no pior caso
  const piorCaso = (daNaveAoCentro, daCameraANave) => Math.abs(daCameraANave - daNaveAoCentro)

  it('longe dos dois corpos, a câmera fica a 2 raios e chega a 0,3', () => {
    expect(craftCamera([30, 0, 0], [-30, 5, 0], LIMITES)).toEqual({ distance: 2, minDistance: 0.3 })
  })

  it('na órbita de espera, a 185 km do chão, a câmera fica fora da Terra de qualquer lado', () => {
    const naOrbita = [0, 1.029, 0]
    const { distance, minDistance } = craftCamera(naOrbita, [60, 0, 0], LIMITES)
    expect(piorCaso(1.029, minDistance)).toBeGreaterThanOrEqual(1.25 - 1e-9)
    expect(distance).toBeGreaterThanOrEqual(minDistance)
    // sem o limite, a 2 raios da nave a câmera podia ficar a 0,97 raio do centro: dentro da Terra
    expect(piorCaso(1.029, 2)).toBeLessThan(1)
  })

  it('na órbita lunar, a 100 km do chão, a câmera fica fora da Lua de qualquer lado', () => {
    const { distance, minDistance } = craftCamera([55, 20, 0], [0.288, 0, 0], LIMITES)
    expect(minDistance).toBeCloseTo(0.688, 9)
    expect(piorCaso(0.288, minDistance)).toBeGreaterThanOrEqual(0.4 - 1e-9)
    // a distância de sempre já passa do limite: a câmera não se afasta à toa
    expect(distance).toBe(2)
  })

  it('o limite acompanha a nave: quanto mais ela se afasta da Terra, mais longe a câmera tem que ficar, até a Terra sair de perto', () => {
    const a = craftCamera([1.5, 0, 0], [60, 0, 0], LIMITES).minDistance
    const b = craftCamera([3, 0, 0], [60, 0, 0], LIMITES).minDistance
    expect(b).toBeGreaterThan(a)
    expect(craftCamera([8, 0, 0], [52, 0, 0], LIMITES).minDistance).toBe(0.3)
  })
})
