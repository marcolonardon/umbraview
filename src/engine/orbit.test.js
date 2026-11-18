// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { Body, GeoMoonState, HelioState, MakeTime } from 'astronomy-engine'
import { describe, expect, it } from 'vitest'

import { ORBIT } from './config.js'
import { GM_KM3_S2, createEphemeris, propagate, propagateToMoonPass } from './orbit.js'

/* A referência de fora: a trajetória voada da Orion na Artemis I, do JPL Horizons, num trecho de
   68 horas da ida à Lua (scripts/references/horizons-artemis1.mjs). */
const ARTEMIS = JSON.parse(
  readFileSync(join(process.cwd(), 'src', 'engine', 'fixtures', 'horizonsArtemis1.json'), 'utf8'),
).samples.map((sample) => ({
  dateMs: Date.parse(sample.utc),
  positionKm: sample.positionKm,
  velocityKmS: sample.velocityKmS,
}))

const HORA = 3600e3
const GRAU = 180 / Math.PI
const AU_KM = 149597870.7
const DIA_S = 86400
/* A gravidade da Terra, da Lua e do Sol (GM, em km³/s²): JPL, Astrodynamic Parameters, com os
   valores da efeméride DE440 ("Earth 398600.435507", "Moon 4902.800118" e "GM sun
   1.32712440041279419 x 10^20 m^3 s^-2"), lida em 18/11/2026 (CREDITS.md). */
const GM_TERRA = 398600.435507
const GM_LUA = 4902.800118
const GM_SOL = 132712440041.279419
// o raio da Terra no equador (NASA NSSDCA, Earth Fact Sheet; CREDITS.md) mais os 185 km do plano
const RAIO_DA_ORBITA_BAIXA_KM = 6378.137 + 185
const DISTANCIA_DA_LUA_KM = 384400

const SO_A_TERRA = { moon: 0, sun: 0 }
const SEM_O_SOL = { moon: 1, sun: 0 }

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const tamanho = (v) => Math.hypot(...v)
const distancia = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const angulo = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (tamanho(a) * tamanho(b))))) * GRAU
// a energia de quem orbita só a Terra, por kg: a do movimento menos a da gravidade
const energia = ({ positionKm, velocityKmS }) => dot(velocityKmS, velocityKmS) / 2 - GM_TERRA / tamanho(positionKm)
const periodoS = (semieixoKm) => 2 * Math.PI * Math.sqrt(semieixoKm ** 3 / GM_TERRA)

// uma órbita inclinada de propósito: um erro num eixo só não se esconde no plano do equador
const INCLINACAO = 28.5 / GRAU
const naOrbitaBaixa = (velocidadeKmS) => ({
  dateMs: ARTEMIS[0].dateMs,
  positionKm: [RAIO_DA_ORBITA_BAIXA_KM, 0, 0],
  velocityKmS: [0, velocidadeKmS * Math.cos(INCLINACAO), velocidadeKmS * Math.sin(INCLINACAO)],
})

describe('as constantes da gravidade (GM_KM3_S2)', () => {
  it('são as do JPL, da efeméride DE440', () => {
    expect(GM_KM3_S2).toEqual({ earth: GM_TERRA, moon: GM_LUA, sun: GM_SOL })
    expect(Object.isFrozen(GM_KM3_S2)).toBe(true)
  })
})

describe('só com a Terra (propagate)', () => {
  const circular = naOrbitaBaixa(Math.sqrt(GM_TERRA / RAIO_DA_ORBITA_BAIXA_KM))
  const umaVolta = periodoS(RAIO_DA_ORBITA_BAIXA_KM) * 1000

  it('uma órbita circular a 185 km fecha no tempo que a fórmula dá: 88 minutos', () => {
    expect(umaVolta / 60e3).toBeGreaterThan(88)
    expect(umaVolta / 60e3).toBeLessThan(89)
    const depois = propagate(circular, circular.dateMs + umaVolta, { gravity: SO_A_TERRA })
    // medido em 18/11/2026: 0,4 m. Com o período 1 s errado, a nave estaria a 7,8 km dali.
    expect(distancia(depois.positionKm, circular.positionKm)).toBeLessThan(0.005)
    expect(distancia(depois.velocityKmS, circular.velocityKmS)).toBeLessThan(0.00001)
    // na metade da volta, do outro lado da Terra
    const metade = propagate(circular, circular.dateMs + umaVolta / 2, { gravity: SO_A_TERRA })
    expect(angulo(metade.positionKm, circular.positionKm)).toBeGreaterThan(179.999)
  })

  it('para no instante pedido, e não no fim do último passo', () => {
    const ate = circular.dateMs + 1234567
    expect(propagate(circular, ate, { gravity: SO_A_TERRA }).dateMs).toBe(ate)
    // pedir o instante em que já está devolve o mesmo estado
    const parado = propagate(circular, circular.dateMs, { gravity: SO_A_TERRA })
    expect(parado.positionKm).toEqual(circular.positionKm)
    expect(parado.velocityKmS).toEqual(circular.velocityKmS)
  })

  it('não mexe no estado que recebeu', () => {
    const copia = structuredClone(circular)
    propagate(circular, circular.dateMs + HORA, { gravity: SO_A_TERRA })
    expect(circular).toEqual(copia)
  })

  it('a energia não escorrega em 10 voltas e meia, nem a altura', () => {
    const depois = propagate(circular, circular.dateMs + 10.5 * umaVolta, { gravity: SO_A_TERRA })
    // a meia volta é para o teste não passar com um propagador que deixa a nave parada
    expect(angulo(depois.positionKm, circular.positionKm)).toBeGreaterThan(179.99)
    expect(Math.abs(energia(depois) / energia(circular) - 1)).toBeLessThan(1e-9)
    expect(Math.abs(tamanho(depois.positionKm) - RAIO_DA_ORBITA_BAIXA_KM)).toBeLessThan(0.001)
  })

  /* A elipse que sai da órbita baixa e chega à distância da Lua, a forma da travessia: 5 dias de
     subida, com a nave a 10,9 km/s embaixo e a 0,19 km/s em cima. É aqui que o passo que
     acompanha a distância faz diferença: curto perto da Terra, longo lá em cima. */
  it('uma elipse até a distância da Lua chega lá em cima na metade do período, do lado oposto', () => {
    const semieixo = (RAIO_DA_ORBITA_BAIXA_KM + DISTANCIA_DA_LUA_KM) / 2
    const partida = naOrbitaBaixa(Math.sqrt(GM_TERRA * (2 / RAIO_DA_ORBITA_BAIXA_KM - 1 / semieixo)))
    const subida = (periodoS(semieixo) / 2) * 1000
    expect(subida / (24 * HORA)).toBeGreaterThan(4.9)
    expect(subida / (24 * HORA)).toBeLessThan(5)
    const emCima = propagate(partida, partida.dateMs + subida, { gravity: SO_A_TERRA })
    // medido em 18/11/2026: 19 m em 384 mil km, depois de 5 dias
    expect(Math.abs(tamanho(emCima.positionKm) - DISTANCIA_DA_LUA_KM)).toBeLessThan(0.05)
    expect(angulo(emCima.positionKm, partida.positionKm)).toBeGreaterThan(179.9999)
    // medido em 18/11/2026: 5 partes em 100 milhões (a energia desta elipse é pequena: quase solta da Terra)
    expect(Math.abs(energia(emCima) / energia(partida) - 1)).toBeLessThan(1e-6)
    // lá em cima a velocidade é a da fórmula: v² = GM (2/r − 1/a)
    const esperada = Math.sqrt(GM_TERRA * (2 / DISTANCIA_DA_LUA_KM - 1 / semieixo))
    expect(tamanho(emCima.velocityKmS)).toBeCloseTo(esperada, 6)
  })

  it('avisa a cada passo, com o estado daquele instante, para quem desenha o caminho', () => {
    const passos = []
    const ate = circular.dateMs + umaVolta
    propagate(circular, ate, { gravity: SO_A_TERRA, onStep: (state) => passos.push(structuredClone(state)) })
    expect(passos.length).toBeGreaterThan(50)
    expect(passos.at(-1).dateMs).toBe(ate)
    // os instantes só crescem, nenhum passo passa do limite, e todos os pontos estão na órbita
    for (let i = 1; i < passos.length; i += 1) {
      const passoS = (passos[i].dateMs - passos[i - 1].dateMs) / 1000
      expect(passoS).toBeGreaterThan(0)
      expect(passoS).toBeLessThanOrEqual(ORBIT.maxStepS + 1e-6)
    }
    for (const passo of passos) {
      expect(Math.abs(tamanho(passo.positionKm) - RAIO_DA_ORBITA_BAIXA_KM)).toBeLessThan(0.001)
    }
  })

  it('recusa andar para trás no tempo', () => {
    expect(() => propagate(circular, circular.dateMs - 1, { gravity: SO_A_TERRA })).toThrow(RangeError)
  })

  it('sem efeméride, só aceita a gravidade da Terra', () => {
    expect(() => propagate(circular, circular.dateMs + HORA)).toThrow(/efeméride/)
  })
})

describe('a Lua e o Sol lidos uma vez, numa grade no tempo (createEphemeris)', () => {
  const inicio = ARTEMIS[0].dateMs
  const fim = inicio + 5 * 24 * HORA
  const efemeride = createEphemeris(inicio, fim)
  // instantes fora dos pontos da grade, espalhados pelo período, com as duas pontas
  const instantes = [inicio, fim, ...Array.from({ length: 40 }, (_, i) => inicio + (i + 0.37) * 2.9 * HORA)]

  it('a Lua da grade é a do astronomy-engine, a menos de 1 m e de 1 mm/s', () => {
    let pior = 0
    let piorVelocidade = 0
    for (const dateMs of instantes) {
      const direto = GeoMoonState(MakeTime(new Date(dateMs)))
      const lua = efemeride.moon(dateMs)
      pior = Math.max(pior, distancia(lua.positionKm, [direto.x * AU_KM, direto.y * AU_KM, direto.z * AU_KM]))
      const velocidade = [direto.vx, direto.vy, direto.vz].map((v) => (v * AU_KM) / DIA_S)
      piorVelocidade = Math.max(piorVelocidade, distancia(lua.velocityKmS, velocidade))
    }
    // medido em 18/11/2026: 8 cm e 0,15 mm/s. Com a reta entre dois pontos da grade, 4,6 km.
    expect(pior).toBeLessThan(0.001)
    expect(piorVelocidade).toBeLessThan(1e-6)
  })

  it('o Sol da grade é o do astronomy-engine, a menos de 1 km em 150 milhões', () => {
    // medido em 18/11/2026: 20 cm
    let pior = 0
    for (const dateMs of instantes) {
      const terra = HelioState(Body.Earth, MakeTime(new Date(dateMs)))
      const sol = efemeride.sun(dateMs).positionKm
      pior = Math.max(pior, distancia(sol, [-terra.x * AU_KM, -terra.y * AU_KM, -terra.z * AU_KM]))
      // o Sol a partir da Terra, e não a Terra a partir do Sol
      expect(tamanho(sol)).toBeGreaterThan(0.98 * AU_KM)
    }
    expect(pior).toBeLessThan(1)
  })

  it('recusa um instante fora do período, em vez de inventar a posição', () => {
    expect(() => efemeride.moon(inicio - HORA)).toThrow(RangeError)
    expect(() => efemeride.sun(fim + HORA)).toThrow(RangeError)
    expect(() => propagate(ARTEMIS[0], fim + HORA, { ephemeris: efemeride })).toThrow(RangeError)
  })
})

/* O arquivo da Artemis I no Horizons é a navegação da NASA/JSC "concatenada", como o próprio
   Horizons diz: pedaços emendados. Nas emendas a posição dá um salto de 3 a 24 km de um instante
   para o outro, quase sem mudar a velocidade, o que uma nave não faz. Medido em 18/11/2026 com os
   dados de 10 em 10 minutos, o trecho tem 5 emendas: em 17/11 17:50, 18/11 04:50, 19/11 03:50,
   19/11 18:30 e 20/11 07:10 TDB. Elas caem nestes 5 dos 17 pedaços de 4 horas; os outros 12 são
   voo livre do começo ao fim. Por que cada emenda está lá, não conferi. */
const PEDACOS_COM_EMENDA = [0, 3, 9, 13, 16]
// de 18/11 06:00 a 19/11 02:00 TDB: o maior trecho da fixture sem emenda, 20 horas
const VINTE_HORAS = { de: 4, ate: 9 }

describe('contra a trajetória voada da Artemis I (JPL Horizons)', () => {
  const partida = ARTEMIS[0]
  const efemeride = createEphemeris(partida.dateMs, ARTEMIS.at(-1).dateMs)
  // a distância, em km, entre onde a conta chega partindo da amostra i e a amostra j do JPL
  const erro = (i, j, gravity) =>
    distancia(propagate(ARTEMIS[i], ARTEMIS[j].dateMs, { ephemeris: efemeride, gravity }).positionKm, ARTEMIS[j].positionKm)
  const errosDosPedacos = (gravity) => ARTEMIS.slice(0, -1).map((_, i) => erro(i, i + 1, gravity))
  const semEmenda = (erros) => erros.filter((_, i) => !PEDACOS_COM_EMENDA.includes(i))

  it('o trecho tem 68 horas, de 4 em 4, e começa a 226 mil km da Terra', () => {
    expect(ARTEMIS).toHaveLength(18)
    expect(ARTEMIS.at(-1).dateMs - partida.dateMs).toBe(68 * HORA)
    expect(Math.round(tamanho(partida.positionKm) / 1000)).toBe(226)
    for (let i = 1; i < ARTEMIS.length; i += 1) expect(ARTEMIS[i].dateMs - ARTEMIS[i - 1].dateMs).toBe(4 * HORA)
  })

  /* Medido em 18/11/2026: de 0,7 a 2,8 m nos 12 pedaços. É a prova mais forte do propagador: em
     4 horas a nave anda de 10 a 15 mil km, e a conta chega a menos de 3 m de onde ela esteve. */
  it('nos 12 pedaços de 4 horas sem emenda, chega a menos de 10 m da posição seguinte do JPL', () => {
    const erros = semEmenda(errosDosPedacos())
    expect(erros).toHaveLength(12)
    expect(Math.max(...erros)).toBeLessThan(0.01)
  })

  /* Medido em 18/11/2026: 40 m. O que sobra é o que o modelo não tem (a pressão da luz do Sol e
     os jatos de atitude da nave são candidatos; não investiguei). */
  it('em 20 horas seguidas sem emenda, fica a menos de 100 m do JPL', () => {
    expect(erro(VINTE_HORAS.de, VINTE_HORAS.ate)).toBeLessThan(0.1)
  })

  /* Uma referência em que todo modelo passa não prova nada: sem o Sol, e sem a Lua também, os
     mesmos limites têm que reprovar. É isso que diz que os três corpos entram na conta, cada um
     com o tamanho certo. Medido em 18/11/2026: sem o Sol, de 1,8 a 2,8 km nos pedaços e 56 km
     nas 20 horas; só com a Terra, de 3,9 a 35 km e 177 km. */
  it('sem o Sol reprova em todos os pedaços e nas 20 horas, e só com a Terra reprova por mais', () => {
    const semOSol = semEmenda(errosDosPedacos(SEM_O_SOL))
    const soATerra = semEmenda(errosDosPedacos(SO_A_TERRA))
    expect(Math.min(...semOSol)).toBeGreaterThan(1)
    expect(Math.min(...soATerra)).toBeGreaterThan(3)
    soATerra.forEach((semOsDois, i) => expect(semOsDois).toBeGreaterThan(semOSol[i]))
    expect(erro(VINTE_HORAS.de, VINTE_HORAS.ate, SEM_O_SOL)).toBeGreaterThan(50)
    expect(erro(VINTE_HORAS.de, VINTE_HORAS.ate, SO_A_TERRA)).toBeGreaterThan(150)
  })

  it('as emendas do arquivo estão onde a medição achou: só esses 5 pedaços passam de 100 m', () => {
    const acimaDe100m = errosDosPedacos().flatMap((km, i) => (km > 0.1 ? [i] : []))
    expect(acimaDe100m).toEqual(PEDACOS_COM_EMENDA)
  })

  /* O teste que o card C14 pediu, no trecho inteiro, emendas incluídas. Medido em 18/11/2026:
     17,0, 42,8 e 56,1 km, os mesmos números do rascunho de 17/11 (o plano). Esses km são a soma
     das 5 emendas do arquivo, e não erro da conta: o que mede a conta são os testes acima. */
  it('no trecho inteiro, com as emendas, fica a menos de 20, 50 e 65 km depois de 24, 48 e 68 horas', () => {
    expect(erro(0, 6)).toBeLessThan(20)
    expect(erro(0, 12)).toBeLessThan(50)
    expect(erro(0, 17)).toBeLessThan(65)
  })

  // medido em 18/11/2026, depois de 68 horas: 660 km sem o Sol e 2470 km só com a Terra
  it('no trecho inteiro, sem o Sol reprova, e só com a Terra reprova por muito mais', () => {
    expect(erro(0, 17, SEM_O_SOL)).toBeGreaterThan(600)
    expect(erro(0, 17, SO_A_TERRA)).toBeGreaterThan(2000)
    expect(erro(0, 6, SEM_O_SOL)).toBeGreaterThan(60)
    expect(erro(0, 6, SO_A_TERRA)).toBeGreaterThan(150)
  })

  it('a gravidade da Lua e a do Sol podem entrar pela metade, para a mira ir ligando as duas aos poucos', () => {
    const metade = erro(VINTE_HORAS.de, VINTE_HORAS.ate, { moon: 0.5, sun: 0.5 })
    expect(metade).toBeGreaterThan(erro(VINTE_HORAS.de, VINTE_HORAS.ate))
    expect(metade).toBeLessThan(erro(VINTE_HORAS.de, VINTE_HORAS.ate, SO_A_TERRA))
  })
})

describe('a passagem mais perto da Lua (propagateToMoonPass)', () => {
  const partida = ARTEMIS[0]
  const limite = partida.dateMs + 6 * 24 * HORA
  const efemeride = createEphemeris(partida.dateMs, limite)
  const passagem = propagateToMoonPass(partida, limite, { ephemeris: efemeride })
  const ateALua = (state) => distancia(state.positionKm, efemeride.moon(state.dateMs).positionKm)

  /* A passagem de verdade, no mesmo arquivo do Horizons (a Orion a partir do centro da Lua, de
     minuto em minuto, lido em 18/11/2026): a 1868 km do centro, entre 12:58 e 12:59 TDB de
     21/11/2022. A conta, que parte de quatro dias antes e não tem as duas correções de rota nem a
     queima que a Orion fez na chegada, passa a 1887 km, às 12:56:01 UTC: 19 km mais longe e
     1 minuto e meio mais cedo. Não é uma prova de precisão, é de que o evento acha a passagem
     certa. */
  const PASSAGEM_REAL = { dateMs: Date.parse('2022-11-21T12:57:30Z'), distanceKm: 1868 }

  it('seguindo só a gravidade por quatro dias, passa pela Lua perto de onde e de quando a Orion passou', () => {
    expect(passagem).not.toBeNull()
    expect(Math.abs(passagem.distanceKm - PASSAGEM_REAL.distanceKm)).toBeLessThan(50)
    expect(Math.abs(passagem.dateMs - PASSAGEM_REAL.dateMs)).toBeLessThan(5 * 60e3)
  })

  it('devolve a nave vista da Lua: a posição e a velocidade a partir do centro dela', () => {
    const lua = efemeride.moon(passagem.dateMs)
    expect(distancia(passagem.fromMoonKm, passagem.positionKm.map((v, k) => v - lua.positionKm[k]))).toBeLessThan(1e-6)
    expect(distancia(passagem.fromMoonKmS, passagem.velocityKmS.map((v, k) => v - lua.velocityKmS[k]))).toBeLessThan(1e-9)
    expect(passagem.distanceKm).toBeCloseTo(tamanho(passagem.fromMoonKm), 9)
  })

  it('no instante da passagem a nave não se aproxima nem se afasta: a velocidade é de lado', () => {
    const deLado = angulo(passagem.fromMoonKm, passagem.fromMoonKmS)
    expect(Math.abs(deLado - 90)).toBeLessThan(1e-4)
  })

  it('é o ponto mais perto: 1 minuto antes e 1 minuto depois a nave está mais longe da Lua', () => {
    const antes = propagate(partida, passagem.dateMs - 60e3, { ephemeris: efemeride })
    const depois = propagate(partida, passagem.dateMs + 60e3, { ephemeris: efemeride })
    expect(ateALua(antes)).toBeGreaterThan(passagem.distanceKm)
    expect(ateALua(depois)).toBeGreaterThan(passagem.distanceKm)
    // e é o mesmo caminho do propagate: quem vai direto até aquele instante chega no mesmo lugar
    const direto = propagate(partida, passagem.dateMs, { ephemeris: efemeride })
    expect(distancia(direto.positionKm, passagem.positionKm)).toBeLessThan(0.001)
  })

  it('devolve null quando o limite chega antes da passagem', () => {
    expect(propagateToMoonPass(partida, partida.dateMs + 24 * HORA, { ephemeris: efemeride })).toBeNull()
  })

  it('obedece à gravidade pedida: só com a Terra, a passagem é outra', () => {
    const semLua = propagateToMoonPass(partida, limite, { ephemeris: efemeride, gravity: SO_A_TERRA })
    expect(semLua).not.toBeNull()
    // medido em 18/11/2026: a 5993 km do centro, quase 5 horas depois
    expect(semLua.distanceKm - passagem.distanceKm).toBeGreaterThan(1000)
    expect(semLua.dateMs - passagem.dateMs).toBeGreaterThan(HORA)
  })
})
