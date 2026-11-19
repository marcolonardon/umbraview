// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { EARTH_EQUATORIAL_RADIUS_KM } from '../engine/earthSite.js'
import { computeMission } from '../engine/mission.js'
import { systemStateAt } from '../engine/system.js'
import {
  craftCamera, craftViewDirection, flownPoints, landingStartHeight, landingViewDirection, landingViewUp, launchViewDirection,
  missionEvents, moonViewDirection, nextEvent,
  orbitNormal, pathLength, segmentUnits, spacecraftAt, telemetryAt, timeAtTrack, trackAtTime, trackLayout, watchesMoon,
} from './missionPath.js'

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

/* No passo do pouso a câmera olha o polo sul da Lua de perto: os dez locais conhecidos ficam a até
   6,4° dele (src/data/sites.js). Da vista de sempre, de lado, eles se amontoam na borda de baixo.
   A câmera gira em volta do centro da Lua, como um globo, e o que fica no meio da tela é o ponto
   embaixo dela: por isso ela fica quase em cima do polo, a 3°, com os locais em volta do meio. Só
   não fica bem em cima: os controles giram em volta do eixo vertical do desenho, que é quase o
   eixo da Lua, e em cima dele não há lado para onde girar. */
describe('de onde a câmera olha a Lua no passo do pouso (landingViewDirection)', () => {
  const GRAU = 180 / Math.PI
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  const angulo = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(a, b)))) * GRAU

  it.each([Date.UTC(2026, 10, 19), Date.UTC(2026, 11, 3), Date.UTC(2027, 1, 14)])('fica a 3° do polo sul, do lado do Sol (%i)', (dateMs) => {
    const { moonMatrix, sunDirection } = systemStateAt(dateMs)
    // a coluna 1 da matriz do system.js é o polo norte do corpo
    const poloSul = [-moonMatrix[4], -moonMatrix[5], -moonMatrix[6]]
    const direcao = landingViewDirection(moonMatrix, sunDirection)
    expect(Math.hypot(...direcao)).toBeCloseTo(1, 9)
    expect(angulo(direcao, poloSul)).toBeCloseTo(3, 6)
    // inclinada para o lado iluminado: mais virada para o Sol que o próprio polo
    expect(dot(direcao, sunDirection)).toBeGreaterThan(dot(poloSul, sunDirection) + 0.04)
  })
})

/* Os controles giram a câmera em volta de um eixo, o "para cima" deles, e em cima desse eixo não
   há lado para onde girar: arrastar para o lado só roda a vista. No desenho esse eixo é quase o
   eixo da Lua, e os locais de pouso ficam todos em volta do polo: no passo do pouso a pessoa
   ficava o tempo todo no pior lugar (visto no navegador em 18/11/2026: um arrasto curto para o
   lado dava meia volta em torno do polo). Nesse passo o eixo dos controles se deita. */
describe('o "para cima" dos controles no passo do pouso (landingViewUp)', () => {
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

  it.each([Date.UTC(2026, 10, 19), Date.UTC(2026, 11, 3), Date.UTC(2027, 1, 14)])('fica deitado no equador da Lua, do lado do Sol (%i)', (dateMs) => {
    const { moonMatrix, sunDirection } = systemStateAt(dateMs)
    const poloNorte = [moonMatrix[4], moonMatrix[5], moonMatrix[6]]
    const cima = landingViewUp(moonMatrix, sunDirection)
    expect(Math.hypot(...cima)).toBeCloseTo(1, 9)
    // a 90° do eixo da Lua: o polo sul fica no "equador" dos controles, o mais longe do eixo deles
    expect(dot(cima, poloNorte)).toBeCloseTo(0, 9)
    // para o lado do Sol: na tela, a luz vem de cima
    expect(dot(cima, sunDirection)).toBeGreaterThan(0.9)
  })

  it('com o Sol bem em cima do polo, não há lado do Sol: usa outro eixo do equador, sem quebrar', () => {
    const { moonMatrix } = systemStateAt(Date.UTC(2026, 10, 19))
    const poloNorte = [moonMatrix[4], moonMatrix[5], moonMatrix[6]]
    const cima = landingViewUp(moonMatrix, poloNorte)
    expect(cima.every(Number.isFinite)).toBe(true)
    expect(Math.hypot(...cima)).toBeCloseTo(1, 9)
    expect(dot(cima, poloNorte)).toBeCloseTo(0, 9)
  })
})

/* A que altura do chão a câmera começa no passo do pouso. Numa cena larga, os dez locais, que
   ficam a até 6,4° do polo, cabem na altura dela. Numa cena em pé, de celular, o que aperta é a
   largura: da mesma altura os locais iam para fora das bordas e para baixo do cartão (visto no
   navegador em 18/11/2026). */
describe('a altura de onde a câmera começa no passo do pouso (landingStartHeight)', () => {
  const RAIO_DA_LUA = 1737.4 / 6378.137
  const MEIO_CAMPO = Math.tan((17.5 * Math.PI) / 180)
  // onde fica, na largura da cena, um local a 6,4° do polo: 0 é o meio, 1 é a borda
  const naLargura = (aspect) => (RAIO_DA_LUA * Math.sin((6.4 * Math.PI) / 180)) / (landingStartHeight(aspect) * MEIO_CAMPO * aspect)

  it('numa cena larga é a de sempre', () => {
    expect(landingStartHeight(2.4)).toBeCloseTo(0.17, 9)
    expect(landingStartHeight(1.6)).toBeCloseTo(0.17, 9)
  })

  it('numa cena em pé a câmera começa mais alta, e os locais ficam longe das bordas dos lados', () => {
    expect(landingStartHeight(0.66)).toBeGreaterThan(0.35)
    for (const aspect of [1.2, 0.9, 0.66, 0.5]) expect(naLargura(aspect)).toBeLessThan(0.4)
  })
})

/* Em volta da Lua a câmera não acompanha a nave (o Marco viu a vista pulando, em 18/11/2026): a
   órbita lunar são seis voltas em dez segundos de tela, e a câmera, que se punha do lado de fora
   da Lua em cima da nave a cada passo do trilho, dava as seis voltas junto. Ela passa a olhar a
   Lua de um lugar parado, e quem dá a volta é a nave. */
describe('voando em volta da Lua, a câmera olha a Lua de um lugar parado', () => {
  const GRAU = 180 / Math.PI
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  const angulo = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(a, b)))) * GRAU

  it('são as três fases em volta da Lua; nas outras a câmera acompanha a nave', () => {
    expect(['lunarOrbit', 'descent', 'landing'].map(watchesMoon)).toEqual([true, true, true])
    expect(['ascent', 'parking', 'crossing'].map(watchesMoon)).toEqual([false, false, false])
  })

  it('o plano de uma órbita sai dos pontos dela: a normal, de tamanho 1 (orbitNormal)', () => {
    // um círculo no plano xy, em oito pontos em fila
    const circulo = Array.from({ length: 8 }, (_, i) => [Math.cos(i * 0.7), Math.sin(i * 0.7), 0]).flat()
    const normal = orbitNormal(circulo)
    expect(Math.abs(normal[2])).toBeCloseTo(1, 9)
    expect(Math.hypot(...normal)).toBeCloseTo(1, 9)
  })

  it('na missão de verdade, a normal é perpendicular a todos os pontos da órbita lunar', () => {
    const orbita = MISSAO.segments.find((segment) => segment.phase === 'lunarOrbit')
    const pontos = Array.from(orbita.positionsKm)
    const normal = orbitNormal(pontos)
    for (let i = 0; i < pontos.length; i += 3) {
      const raio = Math.hypot(pontos[i], pontos[i + 1], pontos[i + 2])
      expect(Math.abs(dot(normal, pontos.slice(i, i + 3))) / raio).toBeLessThan(0.01)
    }
  })

  const sol = [1, 0, 0]
  const normalDaOrbita = [0, 0, -1]
  const pouso = [0, -1, 0]
  const vista = (phase, extra = {}) =>
    moonViewDirection({ phase, orbitNormal: normalDaOrbita, landingDirection: pouso, sunDirection: sol, ...extra })

  /* A órbita lunar fica a 100 km do chão: o anel dela é só 6% maior que a Lua. Olhando quase de
     frente para o plano dela, o anel aparece inteiro, por fora da borda da Lua, e a nave não some
     atrás dela; a 50°, que foi a primeira tentativa, metade do anel ficava escondida (visto no
     navegador em 18/11/2026). A 12°, o anel achatado ainda tem 1,03 raio no lado mais curto. */
  it('na órbita lunar fica a 12° da normal do plano dela, para o lado do Sol: o anel aparece inteiro', () => {
    const direcao = vista('lunarOrbit')
    expect(Math.hypot(...direcao)).toBeCloseTo(1, 9)
    expect(angulo(direcao, normalDaOrbita)).toBeCloseTo(12, 6)
    expect(dot(direcao, sol)).toBeGreaterThan(0)
    // o lado mais curto do anel de uma órbita a 100 km, em raios da Lua: ainda por fora da borda
    expect((1837.4 / 1737.4) * Math.cos((angulo(direcao, normalDaOrbita) * Math.PI) / 180)).toBeGreaterThan(1.02)
  })

  it('das duas faces do plano da órbita, escolhe a que está virada para o Sol', () => {
    const quaseNoSol = [0.6, 0, 0.8]
    const direcao = vista('lunarOrbit', { sunDirection: quaseNoSol })
    // a normal dada aponta para longe do Sol: a câmera fica do outro lado do plano
    expect(angulo(direcao, [0, 0, 1])).toBeCloseTo(12, 6)
    expect(dot(direcao, quaseNoSol)).toBeGreaterThan(0)
  })

  it('na descida e no pouso fica a 25° do local de pouso, do lado do Sol', () => {
    for (const phase of ['descent', 'landing']) {
      const direcao = vista(phase)
      expect(Math.hypot(...direcao)).toBeCloseTo(1, 9)
      expect(angulo(direcao, pouso)).toBeCloseTo(25, 6)
      expect(dot(direcao, sol)).toBeGreaterThan(0.4)
    }
  })

  it('com o Sol bem em cima do local, não há lado para inclinar: fica em cima dele, sem quebrar', () => {
    const direcao = vista('landing', { sunDirection: pouso })
    expect(direcao.every(Number.isFinite)).toBe(true)
    expect(Math.hypot(...direcao)).toBeCloseTo(1, 9)
    expect(angulo(direcao, pouso)).toBeLessThan(26)
  })
})

/* No passo da base a câmera volta para a Terra. Vindo do polo sul da Lua, ela chegava olhando a
   Terra por baixo: a Antártida no meio da tela, e nenhuma base à vista (visto no navegador). As
   bases ficam quase todas no hemisfério norte. */
describe('de onde a câmera olha a Terra no passo da base (launchViewDirection)', () => {
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

  it.each([Date.UTC(2026, 10, 19), Date.UTC(2026, 11, 21), Date.UTC(2027, 5, 21)])('do lado do dia, ao norte do equador (%i)', (dateMs) => {
    const { earthMatrix, sunDirection } = systemStateAt(dateMs)
    // a coluna 1 da matriz do system.js é o polo norte do corpo
    const norte = [earthMatrix[4], earthMatrix[5], earthMatrix[6]]
    const direcao = launchViewDirection(earthMatrix, sunDirection)
    expect(Math.hypot(...direcao)).toBeCloseTo(1, 9)
    // do lado iluminado, para as bases aparecerem de dia (no solstício de dezembro o Sol fica 23° ao sul, e dá 0,66)
    expect(dot(direcao, sunDirection)).toBeGreaterThan(0.6)
    // 25° ao norte do equador, em qualquer época: perto da latitude do meio das bases, que é 28,6°
    expect(Math.asin(dot(direcao, norte)) * (180 / Math.PI)).toBeCloseTo(25, 6)
  })
})

/* O trilho do painel de voo (card C17, fase 3): um controle só para o tempo, da Terra à Lua. Ele
   não anda igual ao relógio: a travessia leva 87% do tempo da missão, e a subida, 0,2%; numa régua
   de tempo, o lançamento e o pouso, que são o que mais se quer ver, sumiriam nas pontas. Cada fase
   ganha um pedaço do trilho pelo peso dela, e dentro do pedaço o tempo anda por igual. */
describe('o trilho da missão (trackLayout, timeAtTrack e trackAtTime)', () => {
  const trilho = trackLayout(MISSAO.segments)

  it('tem as seis fases em ordem, emendadas, de 0 a 1, com a travessia três vezes mais larga que a subida', () => {
    expect(trilho.map((pedaco) => pedaco.phase)).toEqual(['ascent', 'parking', 'crossing', 'lunarOrbit', 'descent', 'landing'])
    expect(trilho[0].from).toBe(0)
    expect(trilho.at(-1).to).toBeCloseTo(1, 12)
    for (let i = 1; i < trilho.length; i += 1) expect(trilho[i].from).toBeCloseTo(trilho[i - 1].to, 12)
    const largura = (phase) => { const { from, to } = trilho.find((pedaco) => pedaco.phase === phase); return to - from }
    expect(largura('crossing') / largura('ascent')).toBeCloseTo(3, 9)
    expect(largura('lunarOrbit') / largura('ascent')).toBeCloseTo(2, 9)
    expect(largura('landing')).toBeCloseTo(largura('ascent'), 12)
  })

  it('as pontas do trilho são o lançamento e o pouso, e o começo de cada pedaço é o começo da fase', () => {
    expect(timeAtTrack(MISSAO.segments, 0)).toBe(MISSAO.segments[0].timesMs[0])
    expect(timeAtTrack(MISSAO.segments, 1)).toBe(MISSAO.segments.at(-1).timesMs.at(-1))
    trilho.forEach((pedaco, i) => {
      expect(timeAtTrack(MISSAO.segments, pedaco.from)).toBeCloseTo(MISSAO.segments[i].timesMs[0], 3)
    })
  })

  it('dentro de um pedaço o tempo anda por igual: no meio do pedaço, o meio da fase', () => {
    const travessia = trilho[2]
    const [inicio, fim] = [MISSAO.segments[2].timesMs[0], MISSAO.segments[2].timesMs.at(-1)]
    expect(timeAtTrack(MISSAO.segments, (travessia.from + travessia.to) / 2)).toBeCloseTo((inicio + fim) / 2, 3)
  })

  it('ida e volta dão no mesmo lugar, e o trilho só anda para a frente com o tempo', () => {
    let anterior = -1
    for (let i = 0; i <= 200; i += 1) {
      const u = i / 200
      const instante = timeAtTrack(MISSAO.segments, u)
      expect(trackAtTime(MISSAO.segments, instante)).toBeCloseTo(u, 9)
      expect(instante).toBeGreaterThan(anterior)
      anterior = instante
    }
  })

  it('fora das pontas, fica nas pontas', () => {
    expect(timeAtTrack(MISSAO.segments, -0.5)).toBe(MISSAO.segments[0].timesMs[0])
    expect(timeAtTrack(MISSAO.segments, 2)).toBe(MISSAO.segments.at(-1).timesMs.at(-1))
    expect(trackAtTime(MISSAO.segments, 0)).toBe(0)
    expect(trackAtTime(MISSAO.segments, Number.MAX_SAFE_INTEGER)).toBe(1)
  })
})

/* A parte da linha que a nave já voou é desenhada forte, e o resto, fraco: é o próprio desenho
   que diz onde a missão está. A conta é quantos pontos de cada trecho já ficaram para trás. */
describe('quantos pontos de um trecho a nave já voou (flownPoints)', () => {
  it('antes do trecho, nenhum; depois dele, todos; no meio, os que têm instante até o do relógio', () => {
    const trecho = TRECHOS[0] // instantes 0, 4000 e 10000
    expect(flownPoints(trecho, -1)).toBe(0)
    expect(flownPoints(trecho, 0)).toBe(1)
    expect(flownPoints(trecho, 3999)).toBe(1)
    expect(flownPoints(trecho, 4000)).toBe(2)
    expect(flownPoints(trecho, 9999)).toBe(2)
    expect(flownPoints(trecho, 10000)).toBe(3)
    expect(flownPoints(trecho, 99999)).toBe(3)
  })

  it('na travessia de uma missão do motor, na metade do tempo, bem mais da metade dos pontos ficou para trás', () => {
    // os pontos são mais juntos perto da Terra, onde o passo do propagador é curto
    const travessia = MISSAO.segments[2]
    const meio = (travessia.timesMs[0] + travessia.timesMs.at(-1)) / 2
    const voados = flownPoints(travessia, meio)
    expect(voados).toBeGreaterThan(travessia.timesMs.length / 2)
    expect(voados).toBeLessThan(travessia.timesMs.length)
  })
})

/* Os números do cartão de voo saem dos pontos do caminho que o motor calculou: a altura sobre o
   corpo de onde o trecho é contado, e a velocidade em relação a ele. Nos dois trechos desenhados
   (a subida e a descida final) os pontos são desenho, e a tela não mostra número nenhum. */
describe('a nave em números (telemetryAt)', () => {
  it('diz a fase, o corpo de referência e se o trecho é conta ou desenho', () => {
    expect(telemetryAt(TRECHOS, 5000)).toMatchObject({ phase: 'crossing', kind: 'integrated', body: 'earth' })
    expect(telemetryAt(TRECHOS, 15000)).toMatchObject({ phase: 'landing', kind: 'schematic', body: 'moon' })
  })

  it('a velocidade é a do pedaço do caminho em que a nave está: a distância entre os dois pontos pelo tempo', () => {
    // de (0,0,0) a (400,0,0) em 4 s; depois de (400,0,0) a (400,600,0) em 6 s
    expect(telemetryAt(TRECHOS, 1000).speedKmS).toBeCloseTo(100, 9)
    expect(telemetryAt(TRECHOS, 7000).speedKmS).toBeCloseTo(100, 9)
    // contado da Lua: de (10,0,0) a (10,0,40) em 20 s
    expect(telemetryAt(TRECHOS, 20000).speedKmS).toBeCloseTo(2, 9)
    // no primeiro instante de um trecho a nave já tem a velocidade do primeiro pedaço dele
    expect(telemetryAt(TRECHOS, 0).speedKmS).toBeCloseTo(100, 9)
    expect(telemetryAt(TRECHOS, 10000).speedKmS).toBeCloseTo(2, 9)
    // antes do lançamento e depois do pouso, parada
    expect(telemetryAt(TRECHOS, -1).speedKmS).toBe(0)
    expect(telemetryAt(TRECHOS, 30000).speedKmS).toBe(0)
  })

  it('na órbita de espera de uma missão do motor: 185 km sobre a Terra, a 7,8 km/s', () => {
    const espera = MISSAO.segments[1]
    const meio = (espera.timesMs[0] + espera.timesMs.at(-1)) / 2
    const { phase, body, altitudeKm, speedKmS } = telemetryAt(MISSAO.segments, meio)
    expect([phase, body]).toEqual(['parking', 'earth'])
    expect(altitudeKm).toBeCloseTo(185, 0)
    expect(speedKmS).toBeCloseTo(7.79, 1)
  })

  it('na órbita lunar: 100 km sobre a Lua, a 1,6 km/s em relação a ela', () => {
    const orbita = MISSAO.segments[3]
    const meio = (orbita.timesMs[0] + orbita.timesMs.at(-1)) / 2
    const { body, altitudeKm, speedKmS } = telemetryAt(MISSAO.segments, meio)
    expect(body).toBe('moon')
    expect(altitudeKm).toBeCloseTo(100, 0)
    expect(speedKmS).toBeCloseTo(1.63, 1)
  })

  it('no meio da travessia a nave já passou de 100 mil km da Terra e vai a menos de 2 km/s', () => {
    const travessia = MISSAO.segments[2]
    const meio = (travessia.timesMs[0] + travessia.timesMs.at(-1)) / 2
    const { altitudeKm, speedKmS } = telemetryAt(MISSAO.segments, meio)
    expect(altitudeKm).toBeGreaterThan(100000)
    expect(altitudeKm).toBeLessThan(400000)
    expect(speedKmS).toBeGreaterThan(0.5)
    expect(speedKmS).toBeLessThan(2)
  })

  it('a altura nunca é negativa: a base fica um pouco abaixo do raio do equador, e o chão é zero', () => {
    const lancamento = MISSAO.segments[0].timesMs[0]
    expect(telemetryAt(MISSAO.segments, lancamento).altitudeKm).toBe(0)
  })
})

/* Um nome por vez na cena (card C17): voando, só o do próximo evento aparece, o lugar para onde a
   nave está indo. Com os quatro à mostra, os dois da Terra e o da base ficavam empilhados em cima
   da nave no lançamento (visto no navegador). */
describe('o próximo evento da missão (nextEvent)', () => {
  const eventos = missionEvents(MISSAO)
  const [lancamento, saida, chegada, pouso] = eventos

  it('é o primeiro que ainda não aconteceu', () => {
    expect(nextEvent(eventos, lancamento.dateMs - 1).key).toBe('launch')
    expect(nextEvent(eventos, lancamento.dateMs + 1).key).toBe('tli')
    expect(nextEvent(eventos, (saida.dateMs + chegada.dateMs) / 2).key).toBe('loi')
    expect(nextEvent(eventos, chegada.dateMs + 1).key).toBe('landing')
  })

  it('no instante de um evento, ainda é ele; depois do pouso, continua sendo o pouso', () => {
    expect(nextEvent(eventos, saida.dateMs).key).toBe('tli')
    expect(nextEvent(eventos, pouso.dateMs).key).toBe('landing')
    expect(nextEvent(eventos, pouso.dateMs + 3600e3).key).toBe('landing')
  })
})

/* A câmera que conta a história (card C17, fase 4): durante o voo ela se põe sozinha, de um jeito
   por fase. A direção é a da nave para a câmera. Perto da Terra, a câmera fica do lado de fora,
   com a Terra atrás da nave; da metade da travessia em diante, do lado de cá da nave, com a Lua
   à frente; na Lua, do lado de fora dela. */
describe('de onde a câmera olha a nave em cada fase (craftViewDirection)', () => {
  const daTerra = [3, 4, 0]
  const daLua = [0, 0, -2]
  const direcao = (phase, phaseProgress = 0) => craftViewDirection({ phase, fromEarth: daTerra, fromMoon: daLua, phaseProgress })

  it('na subida e na órbita de espera, fica para fora da Terra: a Terra aparece atrás da nave', () => {
    expect(direcao('ascent')).toEqual([0.6, 0.8, 0])
    expect(direcao('parking', 0.9)).toEqual([0.6, 0.8, 0])
  })

  it('na primeira metade da travessia continua olhando a Terra ficar para trás', () => {
    expect(direcao('crossing', 0)).toEqual([0.6, 0.8, 0])
    expect(direcao('crossing', 0.49)).toEqual([0.6, 0.8, 0])
  })

  it('da metade da travessia em diante passa para trás da nave em relação à Lua: a Lua aparece à frente', () => {
    // a direção da Lua para a nave: a câmera fica nela, além da nave, e a Lua fica do outro lado
    expect(direcao('crossing', 0.5)).toEqual([0, 0, -1])
    expect(direcao('crossing', 1)).toEqual([0, 0, -1])
  })

  it('na órbita lunar, na descida e no pouso, fica para fora da Lua', () => {
    for (const phase of ['lunarOrbit', 'descent', 'landing']) expect(direcao(phase, 0.3)).toEqual([0, 0, -1])
  })
})
