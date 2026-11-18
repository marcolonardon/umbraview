/* A escala da vista da missão (card C13): a Terra, a Lua e a distância entre elas na mesma régua, e
 * onde fica a marca de uma base. O desenho 3D é do WebGL; estas contas são as que dá para conferir
 * sem ele. */
import { describe, expect, it } from 'vitest'

import { EARTH_EQUATORIAL_RADIUS_KM, earthSiteKm } from '../engine/earthSite.js'
import { systemStateAt } from '../engine/system.js'
import { EARTH_RADIUS, MARKER_LIFT, MOON_RADIUS, facesCamera, kmToUnits, markerPosition, markerScale } from './missionScale.js'

const FEV_27 = Date.UTC(2025, 1, 27, 0, 16, 30)
const tamanho = (v) => Math.hypot(...v)

describe('a escala da vista da missão', () => {
  it('a régua é o raio da Terra: ela tem 1 unidade, e a Lua, 27% disso', () => {
    expect(EARTH_RADIUS).toBe(1)
    expect(tamanho(kmToUnits([EARTH_EQUATORIAL_RADIUS_KM, 0, 0]))).toBeCloseTo(1, 12)
    // 1737,4 km de raio contra 6378,137 km
    expect(MOON_RADIUS).toBeCloseTo(0.2724, 4)
  })

  it('a Lua fica a uns 60 raios da Terra, na mesma régua dos tamanhos', () => {
    const distancia = tamanho(kmToUnits(systemStateAt(FEV_27).moonKm))
    // do perigeu ao apogeu: de 356 a 407 mil km
    expect(distancia).toBeGreaterThan(55.8)
    expect(distancia).toBeLessThan(63.9)
  })
})

describe('a marca de uma base (markerPosition)', () => {
  it('fica na direção da base, um fio acima do chão desenhado, em qualquer latitude', () => {
    for (const lat of [0, 28.6083, -39.2604, 90]) {
      const siteKm = earthSiteKm(lat, -80.6041, FEV_27)
      const marca = markerPosition(siteKm)
      /* A Terra desenhada é uma esfera de raio 1, e a de verdade é achatada: no polo o chão fica a
         0,9966. Sem levantar a marca até a esfera, a de uma base em latitude alta nasceria
         enterrada. */
      expect(tamanho(marca)).toBeCloseTo(MARKER_LIFT, 12)
      expect(MARKER_LIFT).toBeGreaterThan(1)
      // mesma direção: o produto interno das duas, já de tamanho 1, dá 1
      const direcao = siteKm.map((v) => v / tamanho(siteKm))
      expect(marca.reduce((soma, v, k) => soma + (v / MARKER_LIFT) * direcao[k], 0)).toBeCloseTo(1, 12)
    }
  })
})

describe('se um ponto da Terra está virado para a câmera (facesCamera)', () => {
  const ponto = [1, 0, 0]

  it('de frente, sim; do outro lado da Terra, não', () => {
    expect(facesCamera(ponto, [4, 0, 0])).toBe(true)
    expect(facesCamera(ponto, [-4, 0, 0])).toBe(false)
    expect(facesCamera(ponto, [0, 4, 0])).toBe(false)
  })

  /* O ponto some atrás da borda da Terra antes de a câmera chegar a 90° dele: de perto, a borda
     fica mais perto ainda. A 4 raios, a câmera vê até 75,5° do ponto embaixo dela (o arco cujo
     cosseno é 1/4). */
  it('a borda depende da distância da câmera: a 4 raios, vê até 75,5° de onde ela está', () => {
    const graus = (angulo) => (angulo * Math.PI) / 180
    const cameraA = (angulo) => [4 * Math.cos(graus(angulo)), 4 * Math.sin(graus(angulo)), 0]
    expect(facesCamera(ponto, cameraA(75))).toBe(true)
    expect(facesCamera(ponto, cameraA(76))).toBe(false)
  })
})

/* De perto, a marca de tamanho fixo virava um disco de 140 km em cima da base, tampando a costa e o
   próprio nome (visto no navegador). Ela encolhe junto com a distância da câmera, para ficar do
   mesmo tamanho na tela. */
describe('o tamanho da marca conforme a câmera chega perto (markerScale)', () => {
  it('da distância da vista da Terra para longe, o tamanho é o cheio', () => {
    expect(markerScale(3.2)).toBe(1)
    expect(markerScale(50)).toBe(1)
  })

  it('mais perto, encolhe na mesma proporção da distância: na tela, fica do mesmo tamanho', () => {
    expect(markerScale(1.6)).toBeCloseTo(0.5, 12)
    expect(markerScale(0.32)).toBeCloseTo(0.1, 12)
    // tamanho na tela é tamanho dividido pela distância: o mesmo nos dois casos
    expect(markerScale(1.6) / 1.6).toBeCloseTo(markerScale(0.32) / 0.32, 12)
  })
})
