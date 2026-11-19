// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { MISSION } from './config.js'
import { EARTH_EQUATORIAL_RADIUS_KM, earthSiteEquatorialKm, earthSiteKm } from './earthSite.js'
import { MOON_RADIUS_M } from './geometry.js'
import { computeMission, designMission, launchReach } from './mission.js'
import { GM_KM3_S2 } from './orbit.js'
import { systemStateAt } from './system.js'

const GRAU = 180 / Math.PI
const HORA = 3600e3
const DIA = 24 * HORA
const RAIO_DA_LUA_KM = MOON_RADIUS_M / 1000

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const tamanho = (v) => Math.hypot(...v)
const unit = (v) => v.map((value) => value / tamanho(v))
const angulo = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (tamanho(a) * tamanho(b))))) * GRAU
const distancia = (a, b) => tamanho(sub(a, b))

// o pouso da IM-2 (src/data/sites.js) e bases de src/data/launchSites.js, em latitudes bem diferentes
const IM2 = { lat: -84.7906, lon: 29.1957 }
const KENNEDY = { lat: 28.6083, lon: -80.6041 }
const KOUROU = { lat: 5.2375, lon: -52.7687 }
const BAIKONUR = { lat: 46.059, lon: 62.983 }
const MAHIA = { lat: -39.2604, lon: 177.8652 }
const ALCANTARA = { lat: -2.3177, lon: -44.368 }

// uma janela de pouso de 3 dias a partir de um dia de dezembro de 2026, no formato do sky.landingWindows
const janela = (dia, dias = 3) => {
  const startUtc = new Date(Date.UTC(2026, 11, dia))
  return { startUtc, endUtc: new Date(startUtc.getTime() + dias * DIA) }
}
const pedido = (launchSite, dia) => ({ launchSite, landingSite: IM2, landingWindow: janela(dia) })

// a missão de referência dos testes: de Kennedy ao pouso da IM-2, na janela que abre em 05/12/2026
const PEDIDO = pedido(KENNEDY, 5)
const projeto = designMission(PEDIDO)
const missao = computeMission(PEDIDO)

// o polo norte da Terra no espaço no instante: é dele que se mede a latitude e a inclinação
const poloDaTerra = (dateMs) => unit(earthSiteEquatorialKm(90, 0, dateMs))
const daLua = (state) => {
  const lua = projeto.ephemeris.moon(state.dateMs)
  return { positionKm: sub(state.positionKm, lua.positionKm), velocityKmS: sub(state.velocityKmS, lua.velocityKmS) }
}

describe('o lançamento (designMission)', () => {
  const base = earthSiteEquatorialKm(KENNEDY.lat, KENNEDY.lon, projeto.launchMs)

  it('a base está no plano da órbita de espera no instante do lançamento', () => {
    expect(Math.abs(dot(unit(base), projeto.parkingNormal))).toBeLessThan(1e-9)
    // e a nave entra na órbita nesse mesmo plano, andando nele
    expect(Math.abs(dot(unit(projeto.insertion.positionKm), projeto.parkingNormal))).toBeLessThan(1e-9)
    expect(Math.abs(dot(unit(projeto.insertion.velocityKmS), projeto.parkingNormal))).toBeLessThan(1e-9)
  })

  /* Um plano que passa pela base não consegue ficar menos inclinado que a latitude dela vista do
     centro da Terra (28,45° em Kennedy). O lançamento escolhido é o que chega mais perto disso:
     quase para o leste, que é o que mais aproveita o giro da Terra. Medido em 18/11/2026: 28,53°. */
  it('a inclinação da órbita de espera é a menor que a base permite: a latitude dela, a menos de 0,2°', () => {
    const latitude = 90 - angulo(base, poloDaTerra(projeto.launchMs))
    const inclinacao = angulo(projeto.parkingNormal, poloDaTerra(projeto.launchMs))
    expect(inclinacao).toBeGreaterThanOrEqual(latitude - 1e-6)
    expect(inclinacao - latitude).toBeLessThan(0.2)
    expect(projeto.parkingInclinationDeg).toBeCloseTo(inclinacao, 5)
  })

  it('a nave entra na órbita de espera a 185 km, na velocidade de uma órbita circular', () => {
    const raio = EARTH_EQUATORIAL_RADIUS_KM + MISSION.parkingAltitudeKm
    expect(tamanho(projeto.insertion.positionKm)).toBeCloseTo(raio, 6)
    expect(tamanho(projeto.insertion.velocityKmS)).toBeCloseTo(Math.sqrt(GM_KM3_S2.earth / raio), 9)
    // a velocidade é de lado, sem subir nem descer
    expect(Math.abs(dot(unit(projeto.insertion.positionKm), unit(projeto.insertion.velocityKmS)))).toBeLessThan(1e-9)
    expect(projeto.insertion.dateMs - projeto.launchMs).toBe(MISSION.ascentMinutes * 60e3)
  })

  it('a direção do lançamento é para o leste', () => {
    expect(projeto.launchAzimuthDeg).toBeGreaterThan(45)
    expect(projeto.launchAzimuthDeg).toBeLessThan(135)
  })
})

describe('a saída da Terra', () => {
  // medido em 18/11/2026: a Lua e o Sol tiram a nave do círculo em 2 m, no máximo, em 26 missões
  it('a órbita de espera fica a 185 km do começo ao fim, a menos de 50 m', () => {
    expect(projeto.paths.parking.length).toBeGreaterThan(5)
    for (const state of projeto.paths.parking) {
      expect(Math.abs(tamanho(state.positionKm) - EARTH_EQUATORIAL_RADIUS_KM - MISSION.parkingAltitudeKm)).toBeLessThan(0.05)
    }
    expect(projeto.paths.parking.at(-1).dateMs).toBe(projeto.tli.dateMs)
  })

  it('a queima de saída é na direção do movimento: só muda o tamanho da velocidade', () => {
    expect(projeto.tli.positionKm).toEqual(projeto.beforeTli.positionKm)
    expect(projeto.tli.dateMs).toBe(projeto.beforeTli.dateMs)
    expect(angulo(projeto.tli.velocityKmS, projeto.beforeTli.velocityKmS)).toBeLessThan(1e-4)
    const ganho = tamanho(projeto.tli.velocityKmS) - tamanho(projeto.beforeTli.velocityKmS)
    expect(projeto.tliDeltaVKmS).toBeCloseTo(ganho, 12)
    // medido em 18/11/2026: 3,141 km/s; os livros dão uns 3,1 a 3,2 km/s para sair de uma órbita baixa (não conferi a fonte)
    expect(ganho).toBeGreaterThan(3.1)
    expect(ganho).toBeLessThan(3.2)
  })
})

describe('a chegada à Lua', () => {
  it('a nave passa a 100 km do chão da Lua, a menos de 1 m', () => {
    expect(Math.abs(projeto.pass.distanceKm - RAIO_DA_LUA_KM - MISSION.lunarOrbitAltitudeKm)).toBeLessThan(0.001)
    // e é uma passagem: a velocidade a partir da Lua é de lado
    expect(Math.abs(angulo(projeto.pass.fromMoonKm, projeto.pass.fromMoonKmS) - 90)).toBeLessThan(1e-3)
  })

  it('o plano da órbita lunar contém o local de pouso no instante do pouso, a menos de 0,001°', () => {
    const plano = unit(cross(projeto.pass.fromMoonKm, projeto.pass.fromMoonKmS))
    expect(Math.abs(90 - angulo(plano, projeto.landingSiteDirection))).toBeLessThan(0.001)
    expect(angulo(plano, projeto.lunarNormal)).toBeLessThan(1e-6)
  })

  it('a queima de chegada é contra o movimento e deixa a órbita circular', () => {
    const antes = projeto.pass.fromMoonKmS
    const depois = daLua(projeto.afterLoi).velocityKmS
    expect(angulo(antes, depois)).toBeLessThan(1e-3)
    expect(tamanho(depois)).toBeCloseTo(Math.sqrt(GM_KM3_S2.moon / projeto.pass.distanceKm), 6)
    expect(projeto.loiDeltaVKmS).toBeCloseTo(tamanho(antes) - tamanho(depois), 6)
    // medido em 18/11/2026: 0,838 km/s
    expect(projeto.loiDeltaVKmS).toBeGreaterThan(0.75)
    expect(projeto.loiDeltaVKmS).toBeLessThan(0.95)
  })

  it('a órbita lunar passa perto do polo, no mesmo sentido em que a Lua gira', () => {
    // o local de pouso fica a 84,8° S: o plano que passa por ele é quase polar
    expect(projeto.lunarInclinationDeg).toBeGreaterThan(80)
    expect(projeto.lunarInclinationDeg).toBeLessThan(90)
  })

  // medido em 18/11/2026: a Terra e o Sol tiram a nave do círculo em 50 m, no máximo, em 12 horas
  it('a órbita lunar fica a 100 km do chão o tempo todo, a menos de 500 m', () => {
    expect(projeto.paths.lunarOrbit.length).toBeGreaterThan(100)
    for (const state of projeto.paths.lunarOrbit) {
      expect(Math.abs(tamanho(daLua(state).positionKm) - RAIO_DA_LUA_KM - MISSION.lunarOrbitAltitudeKm)).toBeLessThan(0.5)
    }
  })
})

describe('a descida e o pouso', () => {
  const baixo = daLua(projeto.lowPoint)

  /* A órbita lunar e a elipse de descida são integradas com a Terra e o Sol puxando, e a hora de
     largar a órbita vem da conta de uma órbita circular perfeita. A diferença entre as duas é o
     que a curva do pouso, que é desenho, tem que emendar. Medido em 18/11/2026: 0,02 km na
     altura, 0,04° no arco e 0,007° para fora do plano. */
  it('a elipse de descida termina a 15 km do chão, 15° antes do local de pouso, no plano dele', () => {
    expect(Math.abs(tamanho(baixo.positionKm) - RAIO_DA_LUA_KM - MISSION.descentLowPointKm)).toBeLessThan(0.5)
    expect(Math.abs(angulo(baixo.positionKm, projeto.landingSiteDirection) - MISSION.poweredDescentArcDeg)).toBeLessThan(0.2)
    const plano = unit(cross(baixo.positionKm, baixo.velocityKmS))
    expect(Math.abs(90 - angulo(plano, projeto.landingSiteDirection))).toBeLessThan(0.05)
    // a nave chega ao ponto baixo andando para o local de pouso, e não se afastando dele
    expect(dot(baixo.velocityKmS, projeto.landingSiteDirection)).toBeGreaterThan(0)
  })

  it('a queima de descida é contra o movimento, de uns 20 m/s', () => {
    expect(angulo(daLua(projeto.beforeDoi).velocityKmS, daLua(projeto.afterDoi).velocityKmS)).toBeLessThan(1e-3)
    // medido em 18/11/2026: 19,5 m/s
    expect(projeto.doiDeltaVKmS).toBeGreaterThan(0.015)
    expect(projeto.doiDeltaVKmS).toBeLessThan(0.025)
  })

  it('o pouso cai dentro da janela, 12 horas depois de ela abrir', () => {
    const { startUtc, endUtc } = PEDIDO.landingWindow
    expect(projeto.landingMs).toBeGreaterThan(startUtc.getTime())
    expect(projeto.landingMs).toBeLessThan(endUtc.getTime())
    expect(Math.abs(projeto.landingMs - (startUtc.getTime() + MISSION.landingAimHours * HORA))).toBeLessThan(1000)
  })

  it('numa janela de menos de 24 horas, o pouso é mirado no meio dela', () => {
    const curta = { startUtc: new Date(Date.UTC(2026, 11, 5)), endUtc: new Date(Date.UTC(2026, 11, 5, 10)) }
    const noMeio = designMission({ ...PEDIDO, landingWindow: curta })
    expect(Math.abs(noMeio.landingMs - Date.UTC(2026, 11, 5, 5))).toBeLessThan(1000)
  })

  it('a nave fica na órbita lunar umas 12 horas, em voltas inteiras mais o pedaço até a saída', () => {
    const horas = (projeto.doiMs - projeto.pass.dateMs) / HORA
    // uma volta a 100 km leva 1 h 58 min: a espera fecha na saída mais próxima das 12 horas
    expect(Math.abs(horas - MISSION.lunarOrbitStayHours)).toBeLessThan(1)
  })
})

describe('os instantes da missão', () => {
  it('vêm em ordem: lançamento, órbita de espera, saída, chegada, descida, ponto baixo e pouso', () => {
    const ordem = [
      projeto.launchMs, projeto.insertion.dateMs, projeto.tli.dateMs, projeto.pass.dateMs, projeto.doiMs, projeto.lowPoint.dateMs, projeto.landingMs,
    ]
    for (let i = 1; i < ordem.length; i += 1) expect(ordem[i]).toBeGreaterThan(ordem[i - 1])
  })

  it('a travessia leva uns 4 dias: o tempo pedido, a menos de meio dia', () => {
    const dias = (projeto.pass.dateMs - projeto.tli.dateMs) / DIA
    expect(Math.abs(dias - MISSION.crossingDays)).toBeLessThan(0.5)
    expect(projeto.crossingHours).toBeCloseTo(dias * 24, 9)
  })
})

/* A mira tem que fechar em qualquer data e de qualquer base, e não só na missão de referência: a
   Lua muda de distância e de altura no céu ao longo do mês, e as bases vão do equador a 46° N. */
describe('a mira fecha ao longo de um mês e de bases em latitudes diferentes', () => {
  const casos = [
    ...[1, 4, 8, 11, 15, 18, 22, 25, 27].map((dia) => ['Kennedy', dia, KENNEDY]),
    ...[1, 9, 17, 25].flatMap((dia) => [['Kourou', dia, KOUROU], ['Baikonur', dia, BAIKONUR], ['Mahia', dia, MAHIA], ['Alcântara', dia, ALCANTARA]]),
  ]

  it.each(casos)('%s, janela de %i/12/2026', (_, dia, base) => {
    const resultado = designMission(pedido(base, dia))
    expect(Math.abs(resultado.pass.distanceKm - RAIO_DA_LUA_KM - MISSION.lunarOrbitAltitudeKm)).toBeLessThan(0.001)
    expect(Math.abs(90 - angulo(resultado.lunarNormal, resultado.landingSiteDirection))).toBeLessThan(0.001)
    // a inclinação nunca é menor que a latitude da base vista do centro da Terra
    const polo = poloDaTerra(resultado.launchMs)
    const latitude = Math.abs(90 - angulo(earthSiteEquatorialKm(base.lat, base.lon, resultado.launchMs), polo))
    expect(resultado.parkingInclinationDeg).toBeGreaterThanOrEqual(latitude - 1e-6)
    // as queimas ficam na faixa de sempre (medido em 18/11/2026: de 3,128 a 3,149 e de 0,815 a 0,874 km/s)
    expect(resultado.tliDeltaVKmS).toBeGreaterThan(3.1)
    expect(resultado.tliDeltaVKmS).toBeLessThan(3.2)
    expect(resultado.loiDeltaVKmS).toBeGreaterThan(0.75)
    expect(resultado.loiDeltaVKmS).toBeLessThan(0.95)
    const baixo = sub(resultado.lowPoint.positionKm, resultado.ephemeris.moon(resultado.lowPoint.dateMs).positionKm)
    expect(Math.abs(angulo(baixo, resultado.landingSiteDirection) - MISSION.poweredDescentArcDeg)).toBeLessThan(0.2)
  })

  /* Perto do equador a base não segura a inclinação: quem manda é a Lua, que em dezembro de 2026
     chega a 28° do equador. O plano do lançamento tem que inclinar até alcançá-la. */
  it('de Alcântara, a 2° do equador, a inclinação acompanha a Lua: de poucos graus a mais de 20°', () => {
    const inclinacoes = [1, 9, 17, 25].map((dia) => designMission(pedido(ALCANTARA, dia)).parkingInclinationDeg)
    expect(Math.min(...inclinacoes)).toBeLessThan(10)
    expect(Math.max(...inclinacoes)).toBeGreaterThan(20)
    expect(Math.max(...inclinacoes)).toBeLessThan(30)
  })
})

describe('quando não há caminho', () => {
  it('uma travessia mais lenta que a elipse mais lenta até a Lua dá erro, e não um caminho errado', () => {
    expect(() => designMission(PEDIDO, { ...MISSION, crossingDays: 7 })).toThrow(/travessia/)
    expect(() => computeMission(PEDIDO, { ...MISSION, crossingDays: 7 })).toThrow(/travessia/)
  })

  it('uma janela que termina antes de começar dá erro', () => {
    const invertida = { startUtc: PEDIDO.landingWindow.endUtc, endUtc: PEDIDO.landingWindow.startUtc }
    expect(() => designMission({ ...PEDIDO, landingWindow: invertida })).toThrow(/janela/)
  })
})

/* A IM-2 de verdade saiu da 39A em 27/02/2025 às 00:16 UTC (GCAT, src/data/launchSites.js) e
   pousou em 06/03/2025 por volta das 17:30 UTC (src/data/sites.js): 7 dias e 17 horas de viagem,
   num perfil dela. A missão de referência, mirada na mesma hora de pouso, faz a travessia em 4
   dias e fica 12 horas na órbita lunar: o lançamento dela cai em 02/03/2025 às 00:34 UTC, 3,0 dias
   depois do da IM-2 (medido em 18/11/2026). É uma nota, e não uma conferência: são duas missões
   diferentes para o mesmo pouso. */
describe('a missão de referência até o pouso da IM-2, saindo da 39A', () => {
  const pouso = Date.UTC(2025, 2, 6, 17, 30)
  const im2 = designMission({ launchSite: KENNEDY, landingSite: IM2, landingWindow: { startUtc: new Date(pouso - 12 * HORA), endUtc: new Date(pouso + 12 * HORA) } })

  it('pousa na hora em que a IM-2 pousou e sai da Terra uns 3 dias depois dela', () => {
    expect(Math.abs(im2.landingMs - pouso)).toBeLessThan(1000)
    const depoisDaIm2 = (im2.launchMs - Date.UTC(2025, 1, 27, 0, 16, 30)) / DIA
    expect(depoisDaIm2).toBeGreaterThan(2.5)
    expect(depoisDaIm2).toBeLessThan(3.5)
  })
})

describe('a missão no formato da tela (computeMission)', () => {
  // o Date corta a fração de milissegundo
  it('os instantes são datas, na mesma ordem e iguais aos do projeto', () => {
    expect(missao.launchUtc).toBeInstanceOf(Date)
    expect(missao.launchUtc.getTime()).toBe(Math.trunc(projeto.launchMs))
    expect(missao.tliUtc.getTime()).toBe(Math.trunc(projeto.tli.dateMs))
    expect(missao.loiUtc.getTime()).toBe(Math.trunc(projeto.pass.dateMs))
    expect(missao.descentUtc.getTime()).toBe(Math.trunc(projeto.doiMs))
    expect(missao.landingUtc.getTime()).toBe(Math.trunc(projeto.landingMs))
  })

  it('os números são os do projeto', () => {
    expect(missao.launchAzimuthDeg).toBe(projeto.launchAzimuthDeg)
    expect(missao.parkingInclinationDeg).toBe(projeto.parkingInclinationDeg)
    expect(missao.lunarInclinationDeg).toBe(projeto.lunarInclinationDeg)
    expect(missao.tliDeltaVKmS).toBe(projeto.tliDeltaVKmS)
    expect(missao.loiDeltaVKmS).toBe(projeto.loiDeltaVKmS)
    expect(missao.descentDeltaVKmS).toBe(projeto.doiDeltaVKmS)
    expect(missao.crossingHours).toBe(projeto.crossingHours)
    expect(missao.lunarOrbitHours).toBeCloseTo((projeto.doiMs - projeto.pass.dateMs) / HORA, 9)
  })

  it('tem um trecho por fase, em ordem, dizendo o que é conta e o que é desenho, e de onde é contado', () => {
    expect(missao.segments.map(({ phase, kind, center }) => [phase, kind, center])).toEqual([
      ['ascent', 'schematic', 'earth'],
      ['parking', 'integrated', 'earth'],
      ['crossing', 'integrated', 'earth'],
      ['lunarOrbit', 'integrated', 'moon'],
      ['descent', 'integrated', 'moon'],
      ['landing', 'schematic', 'moon'],
    ])
  })

  it('cada trecho tem três números por ponto e um instante por ponto, com os instantes em ordem', () => {
    expect(missao.segments).toHaveLength(6)
    for (const segment of missao.segments) {
      expect(segment.positionsKm).toBeInstanceOf(Float32Array)
      expect(segment.timesMs).toBeInstanceOf(Float64Array)
      expect(segment.timesMs.length).toBeGreaterThan(1)
      expect(segment.positionsKm.length).toBe(segment.timesMs.length * 3)
      for (let i = 1; i < segment.timesMs.length; i += 1) expect(segment.timesMs[i]).toBeGreaterThan(segment.timesMs[i - 1])
    }
  })

  const primeiro = (segment) => Array.from(segment.positionsKm.subarray(0, 3))
  const ultimo = (segment) => Array.from(segment.positionsKm.subarray(segment.positionsKm.length - 3))
  const trecho = (phase) => missao.segments.find((segment) => segment.phase === phase)

  /* Os pontos saem no desenho do system.js (y para o norte da eclíptica), o mesmo da base de
     lançamento (earthSiteKm) e da Lua (systemStateAt) da vista da missão: a linha tem que começar
     em cima da marca da base. Os limites de 0,1 km são a precisão do Float32Array a 400 mil km. */
  it('a subida começa na base de lançamento, no desenho da vista da missão, e termina na órbita de espera', () => {
    const subida = trecho('ascent')
    expect(distancia(primeiro(subida), earthSiteKm(KENNEDY.lat, KENNEDY.lon, projeto.launchMs))).toBeLessThan(0.01)
    expect(subida.timesMs[0]).toBe(projeto.launchMs)
    expect(distancia(ultimo(subida), primeiro(trecho('parking')))).toBeLessThan(0.01)
    expect(tamanho(ultimo(subida))).toBeCloseTo(EARTH_EQUATORIAL_RADIUS_KM + MISSION.parkingAltitudeKm, 1)
    // a altura só cresce: a curva não mergulha no chão nem passa da órbita
    let anterior = 0
    for (let i = 0; i < subida.timesMs.length; i += 1) {
      const raio = tamanho(Array.from(subida.positionsKm.subarray(3 * i, 3 * i + 3)))
      expect(raio).toBeGreaterThan(anterior)
      anterior = raio
    }
  })

  it('cada trecho começa onde o anterior termina, e o pouso termina no chão da Lua', () => {
    expect(distancia(ultimo(trecho('parking')), primeiro(trecho('crossing')))).toBeLessThan(0.01)
    // a travessia é contada da Terra e a órbita lunar, da Lua: a diferença é a posição da Lua
    const lua = systemStateAt(projeto.pass.dateMs).moonKm
    expect(distancia(sub(ultimo(trecho('crossing')), lua), primeiro(trecho('lunarOrbit')))).toBeLessThan(0.1)
    expect(tamanho(primeiro(trecho('lunarOrbit')))).toBeCloseTo(RAIO_DA_LUA_KM + MISSION.lunarOrbitAltitudeKm, 1)
    expect(distancia(ultimo(trecho('lunarOrbit')), primeiro(trecho('descent')))).toBeLessThan(0.01)
    expect(distancia(ultimo(trecho('descent')), primeiro(trecho('landing')))).toBeLessThan(0.01)
    const pouso = trecho('landing')
    expect(tamanho(ultimo(pouso))).toBeCloseTo(RAIO_DA_LUA_KM, 2)
    expect(pouso.timesMs.at(-1)).toBe(projeto.landingMs)
    // a altura só diminui
    let anterior = Infinity
    for (let i = 0; i < pouso.timesMs.length; i += 1) {
      const raio = tamanho(Array.from(pouso.positionsKm.subarray(3 * i, 3 * i + 3)))
      expect(raio).toBeLessThan(anterior)
      anterior = raio
    }
  })

  /* O fim do pouso é o local de pouso no chão da Lua. No desenho, a Lua é girada pela moonMatrix
     do system.js: o ponto da esfera do three na latitude e longitude do local, girado por ela,
     tem que cair no fim da linha. É isso que garante que a linha termina em cima do marcador. */
  it('o pouso termina no local de pouso da Lua desenhada pelo system.js', () => {
    const m = systemStateAt(projeto.landingMs).moonMatrix
    const lat = IM2.lat / GRAU
    const lon = IM2.lon / GRAU
    const [x, y, z] = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)]
    // do motor (z para o norte) para a esfera do three (y para o norte): src/scene/coordinates.js
    const naEsfera = [x, z, -y]
    const noDesenho = [0, 1, 2].map((k) => (m[k] * naEsfera[0] + m[4 + k] * naEsfera[1] + m[8 + k] * naEsfera[2]) * RAIO_DA_LUA_KM)
    expect(distancia(ultimo(trecho('landing')), noDesenho)).toBeLessThan(0.5)
  })

  it('não entrega o que é só do motor: a efeméride e os estados ficam no designMission', () => {
    expect(missao.ephemeris).toBeUndefined()
    expect(missao.paths).toBeUndefined()
  })
})

/* Card C19: cada base só lança para alguns lados (azimuthLimits, em src/data/launchSites.js). A
   missão respeita a faixa, mudando a hora do lançamento no dia, e diz quando a base não alcança. As
   faixas daqui são de teste, e não as de verdade das bases. */
describe('as direções de lançamento permitidas (card C19)', () => {
  const comFaixa = (minDeg, maxDeg) => ({ ...KENNEDY, azimuthLimits: [{ minDeg, maxDeg }] })

  it('uma base sem faixa conferida (null) dá a mesma missão de sempre', () => {
    const semFaixa = designMission({ ...PEDIDO, launchSite: { ...KENNEDY, azimuthLimits: null } })
    expect(semFaixa.launchMs).toBe(projeto.launchMs)
    expect(semFaixa.launchAzimuthDeg).toBeCloseTo(projeto.launchAzimuthDeg, 9)
  })

  it('uma faixa que já contém o lançamento de sempre não muda nada', () => {
    const resultado = designMission({ ...PEDIDO, launchSite: comFaixa(35, 120) })
    expect(resultado.launchMs).toBe(projeto.launchMs)
  })

  it('uma faixa só para o sudeste muda a hora do lançamento, e a missão sai dentro dela e fecha', () => {
    const resultado = designMission({ ...PEDIDO, launchSite: comFaixa(140, 170) })
    expect(resultado.launchAzimuthDeg).toBeGreaterThanOrEqual(140)
    expect(resultado.launchAzimuthDeg).toBeLessThanOrEqual(170)
    expect(resultado.launchMs).not.toBe(projeto.launchMs)
    expect(Math.abs(resultado.pass.distanceKm - RAIO_DA_LUA_KM - MISSION.lunarOrbitAltitudeKm)).toBeLessThan(0.001)
    // mais inclinada que a de sempre: a Terra ajuda menos, e é o preço de lançar para o lado permitido
    expect(resultado.parkingInclinationDeg).toBeGreaterThan(projeto.parkingInclinationDeg + 10)
  })

  /* A mira gira o plano em volta da base depois da busca do horário: de 0,2° a 2,9° nos casos medidos
     em 19/11/2026. Com a folga fixa de 1°, estas duas janelas davam erro mesmo com a base alcançando
     a órbita (visto no navegador). */
  it.each([
    ['19/11', '2026-11-19T20:05:00Z', '2026-11-30T19:17:00Z'],
    ['15/12', '2026-12-15T03:17:00Z', '2026-12-19T19:04:00Z'],
  ])('a mira que empurra o lançamento para fora da faixa tenta de novo mais para dentro (janela de %s)', (_, inicio, fim) => {
    const landingWindow = { startUtc: new Date(inicio), endUtc: new Date(fim) }
    const resultado = designMission({ launchSite: comFaixa(140, 170), landingSite: IM2, landingWindow })
    expect(resultado.launchAzimuthDeg).toBeGreaterThanOrEqual(140)
    expect(resultado.launchAzimuthDeg).toBeLessThanOrEqual(170)
  })

  it('uma faixa só para o oeste não alcança: o erro diz que é a direção do lançamento', () => {
    let erro = null
    try {
      designMission({ ...PEDIDO, launchSite: comFaixa(200, 250) })
    } catch (error) {
      erro = error
    }
    expect(erro).not.toBeNull()
    expect(erro.code).toBe('azimuth')
  })

  it('a conta rápida diz, para cada base, se ela alcança a órbita, sem mirar a missão', () => {
    const bases = [
      { id: 'livre', ...KENNEDY, azimuthLimits: null },
      { id: 'leste', ...comFaixa(35, 120) },
      { id: 'sudeste', ...comFaixa(140, 170) },
      { id: 'oeste', ...comFaixa(200, 250) },
    ]
    const alcance = launchReach({ launchSites: bases, landingSite: IM2, landingWindow: PEDIDO.landingWindow })
    expect(alcance).toEqual({ livre: 'unchecked', leste: 'ok', sudeste: 'ok', oeste: 'blocked' })
  })
})
