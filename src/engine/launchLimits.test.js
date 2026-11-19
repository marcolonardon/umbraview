// @vitest-environment node
/* As direções de lançamento de uma base (card C19): o azimute de um plano de órbita visto da base,
 * e se ele cai na faixa que a base permite. Os casos têm resposta conhecida pela relação clássica
 * cos i = cos φ · sen A, entre a inclinação da órbita (i), a latitude da base (φ) e o azimute (A). */
import { describe, expect, it } from 'vitest'

import { allowsAzimuth, launchAzimuthDeg } from './launchLimits.js'

const GRAU = Math.PI / 180
const POLO = [0, 0, 1]
// a base na latitude dada, na longitude 0, e a normal do plano que passa por ela com a inclinação dada, subindo para o norte
const base = (latDeg) => [Math.cos(latDeg * GRAU), 0, Math.sin(latDeg * GRAU)]
const normalSubindo = (latDeg, inclinacaoDeg) => {
  /* O plano contém a base; a normal faz o ângulo i com o polo. Com a base em (cos φ, 0, sen φ), a
     normal é (−sen i · sen β · ..., ...): aqui ela é achada girando o polo em volta da direção que
     fica no plano e no equador, o nó, que está a um ângulo λ da base em longitude, com
     sen λ = tan φ / tan i. */
  const i = inclinacaoDeg * GRAU
  const lambda = Math.asin(Math.tan(latDeg * GRAU) / Math.tan(i))
  // o nó ascendente fica λ a oeste da base
  const no = [Math.cos(-lambda), Math.sin(-lambda), 0]
  // a normal é o polo girado de i em volta do nó
  const c = Math.cos(i)
  const s = Math.sin(i)
  const cruz = [no[1] * POLO[2] - no[2] * POLO[1], no[2] * POLO[0] - no[0] * POLO[2], no[0] * POLO[1] - no[1] * POLO[0]]
  return [POLO[0] * c + cruz[0] * s, POLO[1] * c + cruz[1] * s, POLO[2] * c + cruz[2] * s]
}

describe('o azimute do lançamento (launchAzimuthDeg)', () => {
  it('do equador, num plano equatorial, o lançamento é para o leste: 90°', () => {
    expect(launchAzimuthDeg(base(0), POLO, POLO)).toBeCloseTo(90, 9)
  })

  it('com a inclinação igual à latitude, também é para o leste', () => {
    expect(launchAzimuthDeg(base(28.6), normalSubindo(28.6, 28.6), POLO)).toBeCloseTo(90, 6)
  })

  it('com mais inclinação, subindo, vale cos i = cos φ · sen A: para o nordeste', () => {
    const esperado = Math.asin(Math.cos(60 * GRAU) / Math.cos(28.6 * GRAU)) / GRAU
    expect(launchAzimuthDeg(base(28.6), normalSubindo(28.6, 60), POLO)).toBeCloseTo(esperado, 6)
  })

  it('fica sempre de 0° a 360°, medido do norte para o leste', () => {
    // o mesmo plano ao contrário: a nave andaria para o oeste
    const contrario = normalSubindo(28.6, 60).map((value) => -value)
    const azimute = launchAzimuthDeg(base(28.6), contrario, POLO)
    expect(azimute).toBeGreaterThan(180)
    expect(azimute).toBeLessThan(360)
  })
})

describe('a faixa permitida (allowsAzimuth)', () => {
  it('sem faixa conferida (null), não barra nada: a gente não inventa regra', () => {
    expect(allowsAzimuth(null, 5)).toBe(true)
    expect(allowsAzimuth(null, 270)).toBe(true)
  })

  it('dentro de uma das faixas, sim; fora de todas, não', () => {
    const faixas = [{ minDeg: 35, maxDeg: 120 }, { minDeg: 150, maxDeg: 160 }]
    expect(allowsAzimuth(faixas, 90)).toBe(true)
    expect(allowsAzimuth(faixas, 155)).toBe(true)
    expect(allowsAzimuth(faixas, 140)).toBe(false)
    expect(allowsAzimuth(faixas, 10)).toBe(false)
  })

  it('a margem estreita a faixa por dentro, para a mira não empurrar o lançamento para fora dela', () => {
    const faixas = [{ minDeg: 35, maxDeg: 120 }]
    expect(allowsAzimuth(faixas, 35.5)).toBe(true)
    expect(allowsAzimuth(faixas, 35.5, 1)).toBe(false)
    expect(allowsAzimuth(faixas, 119, 1)).toBe(true)
  })
})
