// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { computeMission } from '../engine/mission.js'
import { moonOrbitPath, systemStateAt } from '../engine/system.js'
import { flownOnMap, mapPoint, missionMap } from './missionMap.js'

// uma missão de verdade, do motor: de Kennedy ao pouso da IM-2, na janela de 05/12/2026
const MISSAO = computeMission({
  launchSite: { lat: 28.6083, lon: -80.6041 },
  landingSite: { lat: -84.7906, lon: 29.1957 },
  landingWindow: { startUtc: new Date(Date.UTC(2026, 11, 5)), endUtc: new Date(Date.UTC(2026, 11, 8)) },
})
const ORBITA = moonOrbitPath(MISSAO.launchUtc.getTime(), 160)
const mapa = missionMap(MISSAO, ORBITA)
const travessia = MISSAO.segments.find((segment) => segment.phase === 'crossing')

/* O mapa pequeno do voo (card C17, fase 4): o trajeto inteiro, da Terra à Lua, numa escala só,
   visto de cima do plano da órbita da Terra. Na cena, em escala, ou se vê a nave ou se vê o
   trajeto: com a câmera na nave, no meio da travessia, sobrava uma linha num céu preto. O mapa
   diz onde a nave está no caminho inteiro. */
describe('o mapa do trajeto (missionMap)', () => {
  it('um ponto do mapa é o ponto do desenho visto de cima: sem a altura sobre o plano', () => {
    // no desenho do system.js o y é o norte da eclíptica: é ele que sai
    expect(mapPoint([100, 7, -30])).toEqual([100, -30])
  })

  it('a linha é a travessia, do começo ao fim, com no máximo 120 pedaços', () => {
    expect(mapa.path.length).toBeGreaterThan(60)
    expect(mapa.path.length).toBeLessThanOrEqual(121)
    const ultimo = travessia.timesMs.length - 1
    expect(mapa.path[0]).toMatchObject({ dateMs: travessia.timesMs[0] })
    expect(mapa.path.at(-1)).toMatchObject({ dateMs: travessia.timesMs[ultimo] })
    expect(mapa.path[0].x).toBeCloseTo(travessia.positionsKm[0], 3)
    expect(mapa.path[0].y).toBeCloseTo(travessia.positionsKm[2], 3)
    expect(mapa.path.at(-1).x).toBeCloseTo(travessia.positionsKm[3 * ultimo], 3)
    expect(mapa.path.at(-1).y).toBeCloseTo(travessia.positionsKm[3 * ultimo + 2], 3)
    for (let i = 1; i < mapa.path.length; i += 1) expect(mapa.path[i].dateMs).toBeGreaterThan(mapa.path[i - 1].dateMs)
  })

  it('a linha sai de perto da Terra e termina na Lua, onde ela está na chegada', () => {
    // a Terra é o centro do mapa: a travessia começa na órbita de espera, a menos de 7 mil km dela
    expect(Math.hypot(mapa.path[0].x, mapa.path[0].y)).toBeLessThan(7000)
    const [luaX, luaY] = mapPoint(systemStateAt(MISSAO.loiUtc.getTime()).moonKm)
    // a passagem é a 1837 km do centro da Lua
    expect(Math.hypot(mapa.path.at(-1).x - luaX, mapa.path.at(-1).y - luaY)).toBeLessThan(2000)
  })

  it('a moldura cabe a Terra e o caminho inteiro, com folga, numa escala só', () => {
    const [x, y, largura, altura] = mapa.viewBox
    const dentro = (px, py) => px > x && px < x + largura && py > y && py < y + altura
    expect(dentro(0, 0)).toBe(true)
    for (const ponto of mapa.path) expect(dentro(ponto.x, ponto.y)).toBe(true)
    // a folga: o caminho não encosta na borda
    const xs = mapa.path.map((ponto) => ponto.x).concat(0)
    expect(Math.min(...xs) - x).toBeGreaterThan(largura * 0.05)
    expect(x + largura - Math.max(...xs)).toBeGreaterThan(largura * 0.05)
    // uns 400 mil km de um lado ao outro: a distância da Terra à Lua
    expect(Math.max(largura, altura)).toBeGreaterThan(300000)
    expect(Math.max(largura, altura)).toBeLessThan(600000)
  })

  it('traz a órbita da Lua, para a linha ter para onde ir', () => {
    expect(mapa.orbit).toHaveLength(ORBITA.length)
    expect(mapa.orbit[0]).toEqual(mapPoint(ORBITA[0]))
  })
})

/* A parte da linha que a nave já voou, desenhada mais forte. Três pontos de mentira, com números
   fáceis, a 10, 20 e 30 s. */
describe('a parte já voada da linha do mapa (flownOnMap)', () => {
  const caminho = [{ x: 0, y: 0, dateMs: 10000 }, { x: 5, y: 1, dateMs: 20000 }, { x: 9, y: 4, dateMs: 30000 }]
  const nave = [7, 2]

  it('antes da travessia não há nada voado', () => {
    expect(flownOnMap(caminho, 9000, nave)).toEqual([])
  })

  it('no meio da travessia, vai até a nave: os pontos que ficaram para trás e ela no fim', () => {
    expect(flownOnMap(caminho, 25000, nave)).toEqual([[0, 0], [5, 1], [7, 2]])
  })

  it('depois da travessia é a linha inteira, sem a nave: ela já está em volta da Lua', () => {
    expect(flownOnMap(caminho, 31000, nave)).toEqual([[0, 0], [5, 1], [9, 4]])
    expect(flownOnMap(caminho, 30000, nave)).toEqual([[0, 0], [5, 1], [9, 4]])
  })
})
