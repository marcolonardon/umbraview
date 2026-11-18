// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { AIMING, HORIZON, MIN_LANDING_WINDOW_HOURS, MISSION, NEAR_LAYER_UP_TO_M, ORBIT, PERIOD_DAYS } from './config.js'

/* O config.js não tem conta, mas um número errado aqui muda o horizonte inteiro sem nenhum outro
   teste perceber: o motor roda com qualquer valor. Estes testes seguram o que o resto do motor
   supõe sobre eles. */

describe('parâmetros do motor (config.js)', () => {
  it('o passo ao longo do chão é de 40 m até 40 km e de 0,1% da distância dali em diante', () => {
    expect(HORIZON.step(0)).toBe(40)
    expect(HORIZON.step(39999)).toBe(40)
    expect(HORIZON.step(40000)).toBe(40)
    expect(HORIZON.step(100000)).toBe(100)
    expect(HORIZON.step(HORIZON.maxDistanceM)).toBe(200)
  })

  it('o relevo fino vale perto do ponto, antes de onde o horizonte para de olhar', () => {
    expect(NEAR_LAYER_UP_TO_M).toBeGreaterThan(0)
    expect(NEAR_LAYER_UP_TO_M).toBeLessThan(HORIZON.maxDistanceM)
  })

  it('o horizonte tem um número inteiro de direções e um mastro de altura positiva', () => {
    expect(Number.isInteger(HORIZON.directions)).toBe(true)
    expect(HORIZON.directions).toBeGreaterThan(0)
    expect(HORIZON.mastM).toBeGreaterThan(0)
  })

  it('os parâmetros do horizonte não mudam com o site rodando', () => {
    expect(Object.isFrozen(HORIZON)).toBe(true)
  })

  it('a janela mínima de pouso é de 24 h, decisão do Enzo em 12/11 (card I6)', () => {
    // o mínimo decide quais pontos mostram janela (medição no card I1): trocar o valor é decisão
    // da equipe, e não ajuste de código, por isso o teste segura o número
    expect(MIN_LANDING_WINDOW_HOURS).toBe(24)
  })

  it('o período da tela cobre um dia lunar inteiro, em dias inteiros', () => {
    // 29,53 dias: o mês sinódico, o tempo que o Sol leva para dar uma volta no céu da Lua. Com
    // menos que isso, um ponto pode aparecer sempre no Sol ou sempre no escuro só pela data.
    expect(PERIOD_DAYS).toBeGreaterThanOrEqual(29.53)
    // a série tem PERIOD_DAYS · 24 instantes, e o tamanho de um Float32Array não pode ser quebrado
    expect(Number.isInteger(PERIOD_DAYS)).toBe(true)
  })

  it('o passo do propagador é uma fração pequena do tempo da gravidade, com um teto', () => {
    expect(ORBIT.stepFraction).toBeGreaterThan(0)
    // acima de 0,05 a elipse até a Lua já erra a chegada por quilômetros (medição no config.js)
    expect(ORBIT.stepFraction).toBeLessThanOrEqual(0.02)
    expect(ORBIT.maxStepS).toBeGreaterThan(0)
    expect(Object.isFrozen(ORBIT)).toBe(true)
  })

  it('a grade da Lua e do Sol é mais larga que o passo do propagador, e fina o bastante para a Lua', () => {
    // mais fina que o passo, a grade custaria mais que perguntar direto ao astronomy-engine
    expect(ORBIT.gridStepS).toBeGreaterThan(ORBIT.maxStepS)
    // com 6 horas a Lua interpolada já fica a 16 m da lida direto (medição no config.js)
    expect(ORBIT.gridStepS).toBeLessThanOrEqual(7200)
  })

  it('os números da missão são os provisórios do plano, e não mudam com o site rodando', () => {
    /* 185 km, 4 dias e 100 km são os do rascunho de 17/11 (docs/mission-simulation-plan.md), e os
       outros foram postos para a conta fechar. Trocar qualquer um é decisão do Marco e do Enzo,
       com a fonte ou a razão escrita, e não ajuste de código: por isso o teste segura os números. */
    expect(MISSION).toEqual({
      parkingAltitudeKm: 185,
      crossingDays: 4,
      lunarOrbitAltitudeKm: 100,
      lunarOrbitStayHours: 12,
      landingAimHours: 12,
      ascentMinutes: 10,
      ascentArcDeg: 20,
      descentLowPointKm: 15,
      poweredDescentArcDeg: 15,
      poweredDescentMinutes: 12,
    })
    expect(Object.isFrozen(MISSION)).toBe(true)
  })

  it('a descida termina acima do chão e abaixo da órbita lunar', () => {
    expect(MISSION.descentLowPointKm).toBeGreaterThan(0)
    expect(MISSION.descentLowPointKm).toBeLessThan(MISSION.lunarOrbitAltitudeKm)
  })

  it('a mira começa só com a Terra e termina com a Lua e o Sol inteiros', () => {
    expect(AIMING.gravitySteps[0]).toBe(0)
    expect(AIMING.gravitySteps.at(-1)).toBe(1)
    // cada degrau liga um pouco mais que o anterior
    for (let i = 1; i < AIMING.gravitySteps.length; i += 1) {
      expect(AIMING.gravitySteps[i]).toBeGreaterThan(AIMING.gravitySteps[i - 1])
    }
    expect(AIMING.toleranceKm).toBeGreaterThan(0)
    expect(AIMING.toleranceS).toBeGreaterThan(0)
    expect(AIMING.maxCorrections).toBeGreaterThan(3)
    expect(Object.isFrozen(AIMING)).toBe(true)
    expect(Object.isFrozen(AIMING.gravitySteps)).toBe(true)
  })
})
