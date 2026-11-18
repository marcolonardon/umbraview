/* Onde a cena põe a luz do Sol (card C2): a luz sai do polo na direção do ponto onde o Sol está a
 * pino, pela mesma conversão do marcador do ponto (coordinates.js). Fora do polo, a caixa da sombra
 * acompanha a câmera (experimento da branch exp/lua-inteira-com-relevo). */
import { describe, expect, it } from 'vitest'

import { latLonToScene } from './coordinates.js'
import { GLOBAL_MAX_ALTITUDE } from './globalTiles.js'
import { POLE_SHADOW, SHADOW_MAP_SIZE, SUN_DISTANCE, SUN_TARGET, shadowFrame, sunLightPosition } from './sunLight.js'

describe('sunLightPosition', () => {
  it('com o Sol a pino em (0°, 0°), a luz fica do lado +x do polo', () => {
    const [x, y, z] = sunLightPosition({ lat: 0, lon: 0 })
    expect(x).toBeCloseTo(SUN_DISTANCE, 12)
    expect(y).toBeCloseTo(-1, 12)
    expect(z).toBeCloseTo(0, 12)
  })

  it('a direção do alvo até a luz é a do ponto subsolar, em qualquer lugar', () => {
    const subsolar = { lat: -1.4, lon: 123.4 }
    const posicao = sunLightPosition(subsolar)
    const direcao = latLonToScene(subsolar.lat, subsolar.lon)
    posicao.forEach((valor, i) => expect((valor - SUN_TARGET[i]) / SUN_DISTANCE).toBeCloseTo(direcao[i], 12))
  })
})

describe('shadowFrame, a caixa da sombra', () => {
  const SUBSOLAR = { lat: 1.2, lon: -37 }
  const sun = latLonToScene(SUBSOLAR.lat, SUBSOLAR.lon)
  const cameraAt = (lat, lon, distance) => latLonToScene(lat, lon).map((v) => v * distance)
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  // os eixos do pixel da sombra: os da câmera da luz do three, que olha do Sol para o alvo com o
  // "para cima" em +y
  const e1 = (() => {
    const c = [sun[2], 0, -sun[0]]
    const n = Math.hypot(...c)
    return c.map((v) => v / n)
  })()
  const e2 = [sun[1] * e1[2] - sun[2] * e1[1], sun[2] * e1[0] - sun[0] * e1[2], sun[0] * e1[1] - sun[1] * e1[0]]

  it('em cima da área de escolha, perto do chão, é a caixa de sempre, no polo (C2 e C11)', () => {
    const frame = shadowFrame(cameraAt(-88, 30, 1.02), SUBSOLAR)
    expect(frame.target).toEqual(SUN_TARGET)
    expect(frame.lightPosition).toEqual(sunLightPosition(SUBSOLAR))
    expect(frame).toMatchObject({ halfSize: POLE_SHADOW.halfSize, bias: POLE_SHADOW.bias, normalBias: POLE_SHADOW.normalBias })
    expect(frame.near).toBeCloseTo(SUN_DISTANCE - 0.5, 12)
    expect(frame.far).toBeCloseTo(SUN_DISTANCE + 0.5, 12)
  })

  it('longe do polo, a caixa fica no ponto embaixo da câmera, a menos de um pixel da sombra', () => {
    const below = latLonToScene(10, 40)
    const frame = shadowFrame(cameraAt(10, 40, 1.05), SUBSOLAR)
    const texel = (2 * frame.halfSize) / SHADOW_MAP_SIZE
    expect(Math.hypot(...frame.target.map((v, i) => v - below[i]))).toBeLessThan(texel)
    expect(frame.halfSize).toBeLessThan(POLE_SHADOW.halfSize)
    // a luz continua vindo do Sol: do alvo até ela, a direção do ponto subsolar
    const toLight = frame.lightPosition.map((v, i) => v - frame.target[i])
    const length = Math.hypot(...toLight)
    toLight.forEach((v, i) => expect(v / length).toBeCloseTo(sun[i], 12))
  })

  // o chão que a tela mostra, em radianos a partir do ponto embaixo da câmera, mais os 2° das
  // montanhas de fora que fazem sombra para dentro; corner: o ângulo do meio da tela até a quina
  function needed(distance, corner) {
    const sine = distance * Math.sin(corner)
    const seen = sine < 1 ? Math.asin(sine) - corner : Math.acos(1 / distance)
    return seen + (2 * Math.PI) / 180
  }
  // a quina da tela, com o fov de 36° da cena (framing.js): a 33,8° do meio numa janela de 1,8 de
  // largura sobre a altura, e a 36,6° numa de 2,06 (a janela maximizada do CIT-DES06)
  const CORNERS = [(33.8 * Math.PI) / 180, (36.6 * Math.PI) / 180]

  it('cobre o chão que a tela mostra, mais 2° para as montanhas de fora fazerem sombra para dentro', () => {
    for (const corner of CORNERS) {
      for (const distance of [1.02, 1.05, 1.1, 1.14]) {
        const frame = shadowFrame(cameraAt(5, 100, distance), SUBSOLAR, corner)
        expect(frame.halfSize, `a ${distance} raios`).toBeGreaterThanOrEqual(needed(distance, corner))
      }
    }
  })

  it('não passa de um degrau acima do que precisa: a caixa maior tem o pixel maior e a sombra mais borrada', () => {
    for (const corner of CORNERS) {
      for (const distance of [1.02, 1.05, 1.1, 1.14]) {
        const frame = shadowFrame(cameraAt(5, 100, distance), SUBSOLAR, corner)
        expect(frame.halfSize, `a ${distance} raios`).toBeLessThanOrEqual(needed(distance, corner) * 1.5)
      }
    }
  })

  it('a caixa só cresce com a altura, enquanto há relevo da Lua inteira', () => {
    let previous = 0
    for (let distance = 1.02; distance <= 1 + GLOBAL_MAX_ALTITUDE; distance += 0.005) {
      const { halfSize } = shadowFrame(cameraAt(5, 100, distance), SUBSOLAR)
      expect(halfSize).toBeGreaterThanOrEqual(previous)
      previous = halfSize
    }
  })

  it('acima do relevo da Lua inteira, volta a caixa do polo: lá de cima, só o relevo do polo faz sombra', () => {
    for (const distance of [1 + GLOBAL_MAX_ALTITUDE + 0.01, 3]) {
      const frame = shadowFrame(cameraAt(5, 100, distance), SUBSOLAR)
      expect(frame.target).toEqual(SUN_TARGET)
      expect(frame.halfSize).toBe(POLE_SHADOW.halfSize)
    }
  })

  it('o alvo cai sempre na grade dos pixels da sombra: a borda das sombras não treme quando a câmera anda', () => {
    for (const [lat, lon, distance] of [[10, 40, 1.05], [10.01, 40.02, 1.05], [-30, 170, 1.14], [45, -100, 1.02]]) {
      const frame = shadowFrame(cameraAt(lat, lon, distance), SUBSOLAR)
      const texel = (2 * frame.halfSize) / SHADOW_MAP_SIZE
      for (const axis of [e1, e2]) {
        const cells = dot(frame.target, axis) / texel
        expect(Math.abs(cells - Math.round(cells)), `(${lat}, ${lon})`).toBeLessThan(1e-6)
      }
    }
  })

  it('a profundidade da caixa cobre a Lua inteira, com a luz sempre fora dela', () => {
    for (const [lat, lon, distance] of [[10, 40, 1.05], [0, 143, 1.14], [-60, -37, 1.1], [70, 0, 1.12]]) {
      const frame = shadowFrame(cameraAt(lat, lon, distance), SUBSOLAR)
      expect(frame.near).toBeGreaterThan(0)
      for (let k = 0; k < 200; k++) {
        const p = latLonToScene(-90 + (k * 37) % 180, (k * 53) % 360).map((v) => v * (1 + ((k % 3) - 1) * 0.0065))
        const depth = dot(frame.lightPosition.map((v, i) => v - p[i]), sun)
        expect(depth).toBeGreaterThan(frame.near)
        expect(depth).toBeLessThan(frame.far)
      }
    }
  })

  it('o desconto contra a sombra listrada acompanha o tamanho do pixel da sombra', () => {
    // os descontos do polo foram acertados para pixels de uns 420 m (C11); com pixels maiores, a
    // superfície faria sombra nela mesma em listras
    const frame = shadowFrame(cameraAt(5, 100, 1.12), SUBSOLAR)
    const ratio = frame.halfSize / POLE_SHADOW.halfSize
    // fora do polo, a caixa não é a do polo: sem isto, a razão 1 passaria sem provar nada
    expect(frame.target).not.toEqual(SUN_TARGET)
    expect(frame.bias).toBeCloseTo(POLE_SHADOW.bias * ratio, 12)
    expect(frame.normalBias).toBeCloseTo(POLE_SHADOW.normalBias * ratio, 12)
  })
})
