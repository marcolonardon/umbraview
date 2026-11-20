// @vitest-environment node
/* As contas do painel de voo em estilo de transmissão (o HUD, pedido pelo Marco em 19/11/2026): o
 * arco por onde a missão anda, com um ponto por fase, e os mostradores redondos da nave. Ficam aqui,
 * sem React, para serem testadas no Node. */
import { describe, expect, it } from 'vitest'

import { MOON_RADIUS_M } from '../engine/geometry.js'
import { arcPath, arcPoint, gaugeArc, gaugeScale, moonDistanceKm, timeWarp } from './missionHud.js'

const ARCO = { width: 600, sag: 40 }

describe('o arco do trilho (arcPoint)', () => {
  it('começa e termina embaixo, nas pontas, e passa no alto pelo meio', () => {
    expect(arcPoint(0, ARCO)).toEqual([0, 40])
    const [xFim, yFim] = arcPoint(1, ARCO)
    expect(xFim).toBeCloseTo(600, 9)
    expect(yFim).toBeCloseTo(40, 9)
    const [xMeio, yMeio] = arcPoint(0.5, ARCO)
    expect(xMeio).toBeCloseTo(300, 9)
    expect(yMeio).toBeCloseTo(0, 9)
  })

  /* O x anda por igual com o lugar no trilho: é o que deixa o controle deslizante comum, que fica por
     cima do arco, apontar o mesmo lugar que o desenho. */
  it('o x é o lugar no trilho vezes a largura, e o arco é simétrico', () => {
    expect(arcPoint(0.25, ARCO)[0]).toBeCloseTo(150, 9)
    expect(arcPoint(0.25, ARCO)[1]).toBeCloseTo(arcPoint(0.75, ARCO)[1], 9)
    expect(arcPoint(0.25, ARCO)[1]).toBeGreaterThan(0)
    expect(arcPoint(0.25, ARCO)[1]).toBeLessThan(40)
  })

  it('o caminho de um pedaço do arco começa e termina nos pontos dele', () => {
    const d = arcPath(0.2, 0.6, ARCO)
    const [x0, y0] = arcPoint(0.2, ARCO)
    const [x1, y1] = arcPoint(0.6, ARCO)
    expect(d.startsWith(`M${x0.toFixed(2)},${y0.toFixed(2)}`)).toBe(true)
    expect(d.endsWith(`${x1.toFixed(2)},${y1.toFixed(2)}`)).toBe(true)
  })
})

describe('o mostrador redondo (gaugeArc)', () => {
  it('a parte acesa é a fração do valor no máximo, sem passar de 0 a 1', () => {
    expect(gaugeArc(5, 10)).toBeCloseTo(0.5, 9)
    expect(gaugeArc(-1, 10)).toBe(0)
    expect(gaugeArc(20, 10)).toBe(1)
    // sem máximo (a missão ainda sem número), apagado
    expect(gaugeArc(3, 0)).toBe(0)
  })
})

/* A escala automática dos mostradores (pedida pelo Marco em 19/11/2026): com a escala fixa no
   máximo da missão, a altura de 185 km acendia 0,05% do mostrador, que ficava apagado até perto da
   Lua. A escala sobe em degraus de 1, 2 e 5 vezes uma potência de dez, sempre o primeiro acima do
   valor: o mostrador fica entre um quinto e cheio, e o degrau aparece escrito. */
describe('a escala automática do mostrador (gaugeScale)', () => {
  it('é o primeiro degrau de 1, 2 ou 5 vezes uma potência de dez que passa do valor', () => {
    expect(gaugeScale(185)).toBe(200)
    expect(gaugeScale(201)).toBe(500)
    expect(gaugeScale(7.79)).toBe(10)
    expect(gaugeScale(10.9)).toBe(20)
    expect(gaugeScale(1.63)).toBe(2)
    expect(gaugeScale(0.47)).toBe(0.5)
    expect(gaugeScale(169278)).toBe(200000)
  })

  it('um valor exato no degrau fica nele: o mostrador cheio', () => {
    expect(gaugeScale(500)).toBe(500)
    expect(gaugeArc(500, gaugeScale(500))).toBe(1)
  })

  it('com o valor na escala, o mostrador nunca fica com menos de um quinto aceso', () => {
    for (const valor of [0.13, 1.7, 23, 410, 9999, 384400]) {
      expect(gaugeArc(valor, gaugeScale(valor))).toBeGreaterThan(0.2 - 1e-9)
    }
  })

  it('zero ou nada não quebra: a menor escala, e o mostrador apagado', () => {
    expect(gaugeScale(0)).toBe(1)
    expect(gaugeArc(0, gaugeScale(0))).toBe(0)
  })
})

/* O terceiro mostrador (pedido pelo Marco em 19/11/2026): a distância da nave até o chão da Lua. Ele
   anda o tempo todo, também na órbita de espera, onde a altura e a velocidade ficam paradas. */
describe('a distância até a Lua (moonDistanceKm)', () => {
  const RAIO_DA_LUA_KM = MOON_RADIUS_M / 1000

  it('contada da Terra, é a distância entre a nave e o centro da Lua, menos o raio dela', () => {
    const nave = { center: 'earth', positionKm: [7000, 0, 0] }
    const lua = [7000, 300000, 400000]
    expect(moonDistanceKm(nave, lua)).toBeCloseTo(500000 - RAIO_DA_LUA_KM, 6)
  })

  it('contada da Lua, é a distância até o centro dela, menos o raio: a altura sobre a Lua', () => {
    const nave = { center: 'moon', positionKm: [0, RAIO_DA_LUA_KM + 100, 0] }
    expect(moonDistanceKm(nave, [384400, 0, 0])).toBeCloseTo(100, 6)
  })

  it('no chão, nunca negativa', () => {
    expect(moonDistanceKm({ center: 'moon', positionKm: [RAIO_DA_LUA_KM - 2, 0, 0] }, [0, 0, 0])).toBe(0)
  })
})

/* Quanto o tempo da missão anda por segundo de tela, em cada fase (pedido pelo Marco em
   19/11/2026): o trilho dá a cada fase um pedaço pelo peso dela, e não pelo tempo, então a aceleração
   muda de uma fase para outra. */
describe('a aceleração do tempo (timeWarp)', () => {
  const HORA = 3600e3
  // uma fase de 50 minutos que ocupa um nono do trilho, numa missão tocada em 45 segundos
  const pedaco = { from: 1 / 9, to: 2 / 9, startMs: 0, endMs: 50 * 60e3 }

  it('é o tempo da fase sobre os segundos de tela dela: 3000 s em 5 s dão 600 vezes', () => {
    expect(timeWarp(pedaco, 45, 1)).toBeCloseTo(600, 6)
  })

  it('a velocidade de tocar multiplica a aceleração', () => {
    expect(timeWarp(pedaco, 45, 4)).toBeCloseTo(2400, 6)
  })

  it('uma travessia de 4 dias em três nonos do trilho anda dezenas de milhares de vezes', () => {
    const travessia = { from: 2 / 9, to: 5 / 9, startMs: 0, endMs: 96 * HORA }
    expect(timeWarp(travessia, 45, 1)).toBeCloseTo((96 * 3600) / 15, 6)
  })
})

