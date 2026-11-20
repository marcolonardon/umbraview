// @vitest-environment node
import { MeshStandardMaterial, SphereGeometry } from 'three'
import { describe, expect, it } from 'vitest'

import { sites } from '../data/sites.js'
import { latLonToUnit, unitToPolarXY } from '../engine/geometry.js'
import { latLonToScene } from './coordinates.js'
import {
  applySouthColor, bodyLandingShader, globalLandingShader, globeTextureUv, globeTextureWindow, landingUniforms, setGlobalLandingMask, setLandingMask,
  buildNorthCap, northCapPoint, northCapUv, onUnitSphere, reprojectNorthCap, southCapUvs, southColorUv, southColorUniforms,
} from './moonGlobe.js'

const FAR = { x0: -384960, y0: 384960, columns: 802, rows: 802, resolutionM: 960 }

describe('a cor da Lua inteira na esfera da cena', () => {
  it('a esfera do three põe cada latitude e longitude no ponto da imagem em que a NASA pôs', () => {
    // a esfera inteira, como a cena monta: o three dá a cada vértice a posição e o ponto da imagem
    const esfera = new SphereGeometry(1, 72, 36)
    const posicao = esfera.getAttribute('position')
    const uv = esfera.getAttribute('uv')
    const im2 = sites.find((site) => site.id === 'im-2')
    for (const [lat, lon] of [[im2.lat, im2.lon], [0, 0], [26.13, 3.63], [-43.3, -11.2], [60, 175], [10, -120]]) {
      const [u, v] = globeTextureUv(lat, lon)
      const alvo = latLonToScene(lat, lon)
      // o vértice da esfera mais perto do ponto: o ponto da imagem dele é o do ponto, a menos de um passo da malha
      let melhor = 0
      let menor = Infinity
      for (let i = 0; i < posicao.count; i++) {
        const d = Math.hypot(posicao.getX(i) - alvo[0], posicao.getY(i) - alvo[1], posicao.getZ(i) - alvo[2])
        if (d < menor) [menor, melhor] = [d, i]
      }
      expect(Math.abs(uv.getX(melhor) - u)).toBeLessThan(1 / 72)
      expect(Math.abs(uv.getY(melhor) - v)).toBeLessThan(1 / 36)
    }
  })

  it('a longitude 0° fica no meio da imagem, o leste à direita e o norte em cima', () => {
    expect(globeTextureUv(0, 0)).toEqual([0.5, 0.5])
    expect(globeTextureUv(0, 90)[0]).toBeCloseTo(0.75, 12)
    expect(globeTextureUv(90, 0)[1]).toBe(1)
  })

  it('a esfera aberta no polo sul usa só o pedaço de cima da imagem', () => {
    // inteira: a imagem toda
    expect(globeTextureWindow(Math.PI)).toEqual({ repeatY: 1, offsetY: 0 })
    // parando a 12° do polo sul: a borda de baixo da esfera cai na latitude −78°, e não no fim da imagem
    const { repeatY, offsetY } = globeTextureWindow(Math.PI * (168 / 180))
    expect(offsetY).toBeCloseTo(globeTextureUv(-78, 0)[1], 12)
    expect(offsetY + repeatY).toBeCloseTo(1, 12)
  })
})

describe('a cor do polo sul nas malhas do relevo', () => {
  it('o ponto da imagem polar é o pixel da grade do relevo grosso onde o ponto cai', () => {
    const lado = FAR.columns * FAR.resolutionM
    for (const [lat, lon] of [[-90, 0], [-85, 30], [-80, -140], [-84.79, 29.2]]) {
      const [px, py] = unitToPolarXY(latLonToUnit(lat, lon))
      const [u, v] = southColorUv(latLonToScene(lat, lon), FAR)
      expect(u).toBeCloseTo((px - FAR.x0) / lado, 9)
      // o v do three cresce para cima, e a linha 0 da imagem é a de cima
      expect(v).toBeCloseTo(1 - (FAR.y0 - py) / lado, 9)
    }
    // o polo fica no meio da imagem
    const [u, v] = southColorUv(latLonToScene(-90, 0), FAR)
    expect(u).toBeCloseTo(0.5, 9)
    expect(v).toBeCloseTo(0.5, 9)
  })

  /* A vista da missão desenha a malha do polo com a Lua em outro lugar e virada, e por isso não
     usa o shader da cena (que lê a posição do ponto no mundo): cada vértice leva o ponto da imagem
     polar pronto. Sem a malha e a imagem polar, o polo sul saía em raios (o Marco viu em
     19/11/2026): na imagem de latitude e longitude o polo é um ponto esticado numa linha inteira. */
  it('cada vértice da malha do polo leva o ponto da imagem polar em que ele cai (southCapUvs)', () => {
    // três vértices em fila: o polo sul, um ponto a 85°S e outro a 80°S, este acima do raio 1
    const pontos = [latLonToScene(-90, 0), latLonToScene(-85, 30), latLonToScene(-80, -140).map((value) => value * 1.004)]
    const uvs = southCapUvs(Float32Array.from(pontos.flat()), FAR)
    expect(uvs).toBeInstanceOf(Float32Array)
    expect(uvs).toHaveLength(6)
    pontos.forEach((ponto, i) => {
      const [u, v] = southColorUv(ponto, FAR)
      expect(uvs[2 * i]).toBeCloseTo(u, 6)
      expect(uvs[2 * i + 1]).toBeCloseTo(v, 6)
    })
    // o polo no meio da imagem, e a altura do vértice não muda o ponto dele
    expect(uvs[0]).toBeCloseTo(0.5, 6)
    expect(uvs[1]).toBeCloseTo(0.5, 6)
    expect(Array.from(uvs).every((value) => value > 0 && value < 1)).toBe(true)
  })

  /* Na vista da missão a malha do polo fica no raio da esfera, e o relevo dela aparece só na luz
     (as normais, calculadas antes, com as alturas de verdade). Com as alturas, a borda da malha
     tinha que descer até a esfera, e essa rampa em volta do polo pegava luz: um anel a 77°S (visto
     no navegador em 19/11/2026). A 1.700 km de raio, 8 km de altura não fazem falta no contorno. */
  it('os vértices de uma malha levados para o raio 1, cada um na direção em que estava (onUnitSphere)', () => {
    const pontos = Float32Array.from([0, -1.004, 0, 0.3, -0.9, 0.1, 3, 0, 4])
    const naEsfera = onUnitSphere(pontos)
    expect(naEsfera).toBeInstanceOf(Float32Array)
    expect(naEsfera).not.toBe(pontos)
    for (let i = 0; i < 9; i += 3) expect(Math.hypot(naEsfera[i], naEsfera[i + 1], naEsfera[i + 2])).toBeCloseTo(1, 6)
    expect(Array.from(naEsfera.slice(0, 3))).toEqual([0, -1, 0])
    expect(naEsfera[6]).toBeCloseTo(0.6, 6)
    expect(naEsfera[8]).toBeCloseTo(0.8, 6)
    // os de entrada ficam como estavam: é deles que saem as normais
    expect(pontos[1]).toBeCloseTo(-1.004, 6)
  })

  it('o material do relevo ganha a cor polar no shader, com os mesmos uniformes para todas as malhas', () => {
    const material = applySouthColor(new MeshStandardMaterial())
    const shader = {
      uniforms: {},
      vertexShader: '#include <common>\nvoid main() {\n#include <begin_vertex>\n}',
      fragmentShader: '#include <common>\nvoid main() {\n#include <color_fragment>\n}',
    }
    material.onBeforeCompile(shader)
    expect(shader.uniforms.uSouthColor).toBe(southColorUniforms.uSouthColor)
    expect(shader.uniforms.uSouthColorMix).toBe(southColorUniforms.uSouthColorMix)
    expect(shader.vertexShader).toContain('vSouthPosition =')
    expect(shader.fragmentShader).toContain('texture2D(uSouthColor')
    // sem a imagem carregada, a mistura é zero: o relevo fica com a cor lisa, e não preto
    expect(southColorUniforms.uSouthColorMix.value).toBe(0)
  })

  it('o mapa das áreas de pouso entra no mesmo shader, desligado até a máscara chegar', () => {
    const material = applySouthColor(new MeshStandardMaterial())
    const shader = {
      uniforms: {},
      vertexShader: '#include <common>\nvoid main() {\n#include <begin_vertex>\n}',
      fragmentShader: '#include <common>\nvoid main() {\n#include <color_fragment>\n}',
    }
    material.onBeforeCompile(shader)
    expect(shader.uniforms.uLandingMask).toBe(landingUniforms.uLandingMask)
    expect(shader.fragmentShader).toContain('texture2D(uLandingMask')
    expect(landingUniforms.uLandingStrength.value).toBe(0)

    const mascara = { nome: 'textura' }
    setLandingMask(mascara, { x0: -185000, y0: 185000, columns: 74, stepM: 5000 }, [0.2, 0.8, 0.5])
    expect(landingUniforms.uLandingMask.value).toBe(mascara)
    expect(landingUniforms.uLandingStrength.value).toBe(1)
    // a grade de 74 quadrados de 5 km tem 370 km de lado, em raios da Lua
    expect(landingUniforms.uLandingFrame.value[2]).toBeCloseTo(370000 / 1737400, 12)
    setLandingMask(null)
    expect(landingUniforms.uLandingStrength.value).toBe(0)
  })

  it('a esfera da Lua lê o mapa da Lua inteira, e o relevo do polo também, fora da grade fina', () => {
    const fonte = () => ({
      uniforms: {},
      vertexShader: '#include <common>\nvoid main() {\n#include <begin_vertex>\n}',
      fragmentShader: '#include <common>\nvoid main() {\n#include <color_fragment>\n}',
    })
    const esfera = fonte()
    globalLandingShader(esfera)
    expect(esfera.uniforms.uGlobalLandingMask).toBe(landingUniforms.uGlobalLandingMask)
    expect(esfera.fragmentShader).toContain('globalLandingAt(normalize(vGlobePosition))')
    const relevo = fonte()
    applySouthColor(new MeshStandardMaterial()).onBeforeCompile(relevo)
    expect(relevo.fragmentShader).toContain('globalLandingAt(southUnit)')

    expect(landingUniforms.uGlobalLandingStrength.value).toBe(0)
    const mascara = { nome: 'textura' }
    setGlobalLandingMask(mascara, [0.2, 0.8, 0.5])
    expect(landingUniforms.uGlobalLandingMask.value).toBe(mascara)
    expect(landingUniforms.uGlobalLandingStrength.value).toBe(1)
    setGlobalLandingMask(null)
    expect(landingUniforms.uGlobalLandingStrength.value).toBe(0)
  })
})

/* Card C18: o mapa de onde dá para pousar também na vista da missão. Lá a Lua anda e gira, e a
   posição do ponto no mundo não é a dele na Lua: o shader lê a posição do vértice no próprio objeto,
   que gira junto com ela. */
describe('o mapa das áreas de pouso na Lua que anda e gira (vista da missão)', () => {
  const fonte = () => ({
    uniforms: {},
    vertexShader: '#include <common>\nvoid main() {\n#include <begin_vertex>\n}',
    fragmentShader: '#include <common>\nvoid main() {\n#include <color_fragment>\n}',
  })

  it('lê as duas máscaras pela posição do vértice na Lua, e não no mundo', () => {
    const shader = fonte()
    bodyLandingShader(shader)
    expect(shader.uniforms.uLandingMask).toBe(landingUniforms.uLandingMask)
    expect(shader.uniforms.uGlobalLandingMask).toBe(landingUniforms.uGlobalLandingMask)
    expect(shader.vertexShader).toContain('vBodyPosition = transformed;')
    expect(shader.vertexShader).not.toContain('modelMatrix')
    expect(shader.fragmentShader).toContain('texture2D(uLandingMask')
    expect(shader.fragmentShader).toContain('globalLandingAt(bodyUnit)')
  })

  it('desligado, as duas forças ficam em zero: a Lua aparece como é', () => {
    expect(landingUniforms.uLandingStrength.value).toBe(0)
    expect(landingUniforms.uGlobalLandingStrength.value).toBe(0)
  })
})

/* O polo norte da Lua da vista da missão (visto pelo Marco em 20/11/2026): na esfera, a cor e o
   relevo vêm de imagens em latitude e longitude, e no polo elas saem em raios. O polo sul tem malha
   e imagem próprias (MoonSouthCap.jsx); o norte não tem dado polar próprio, e a imagem dele é
   refeita no navegador a partir das duas imagens que o site já baixa, na projeção do próprio polo. */
describe('o polo norte com malha e imagem próprias', () => {
  const ALCANCE = 12

  it('o ponto da imagem polar: o polo no meio, a borda do alcance na borda do círculo', () => {
    expect(northCapUv([0, 1, 0], ALCANCE)).toEqual([0.5, 0.5])
    for (const lon of [0, 73, -140]) {
      const [u, v] = northCapUv(latLonToScene(90 - ALCANCE, lon), ALCANCE)
      expect(Math.hypot(u - 0.5, v - 0.5)).toBeCloseTo(0.5, 9)
    }
  })

  it('o ponto da imagem e o da Lua são o caminho de ida e o de volta', () => {
    for (const [lat, lon] of [[89, 10], [84, -100], [79, 170]]) {
      const ponto = latLonToScene(lat, lon)
      const volta = northCapPoint(...northCapUv(ponto, ALCANCE), ALCANCE)
      for (let k = 0; k < 3; k++) expect(volta[k]).toBeCloseTo(ponto[k], 9)
    }
  })

  it('a malha: vértices no raio 1, todos dentro do alcance, cada um com o ponto da imagem dele', () => {
    const { positions, uvs, indices } = buildNorthCap(ALCANCE, 24, 64)
    const vertices = positions.length / 3
    expect(uvs.length).toBe(vertices * 2)
    for (let i = 0; i < vertices; i++) {
      const p = [positions[3 * i], positions[3 * i + 1], positions[3 * i + 2]]
      expect(Math.hypot(...p)).toBeCloseTo(1, 6)
      expect(Math.asin(p[1]) * (180 / Math.PI)).toBeGreaterThan(90 - ALCANCE - 1e-6)
      const [u, v] = northCapUv(p, ALCANCE)
      expect(uvs[2 * i]).toBeCloseTo(u, 6)
      expect(uvs[2 * i + 1]).toBeCloseTo(v, 6)
    }
    expect(Math.max(...indices)).toBe(vertices - 1)
    expect(indices.length % 3).toBe(0)
  })

  /* Duas imagens de mentira, em latitude e longitude, como color.jpg e normal.jpg: na de cor o
     vermelho diz a longitude e o verde a latitude; a de normais é toda "reta para cima" ou toda
     "inclinada para o leste". */
  const LARGURA = 360
  const ALTURA = 180
  const imagem = (pixel) => {
    const data = new Uint8ClampedArray(LARGURA * ALTURA * 4)
    for (let row = 0; row < ALTURA; row++) {
      for (let col = 0; col < LARGURA; col++) data.set([...pixel(col, row), 255], (row * LARGURA + col) * 4)
    }
    return { data, width: LARGURA, height: ALTURA }
  }
  // a linha 0 é a de cima, o norte: latitude 90 − (linha + 0,5); a coluna 0 é a longitude −180
  const cor = imagem((col, row) => [Math.round((col / LARGURA) * 255), Math.round((row / ALTURA) * 255), 0])
  const reta = imagem(() => [128, 128, 255])
  const leste = imagem(() => [255, 128, 128])
  const TAMANHO = 64
  const pixelDe = (u, v) => (Math.min(TAMANHO - 1, Math.floor(v * TAMANHO)) * TAMANHO + Math.min(TAMANHO - 1, Math.floor(u * TAMANHO))) * 4

  it('a cor de cada ponto da imagem polar é a da mesma latitude e longitude na imagem da esfera', () => {
    const { color } = reprojectNorthCap({ color: cor, normal: reta }, TAMANHO, ALCANCE)
    for (const [lat, lon] of [[85, 30], [82, -120], [80, 150]]) {
      const [u, v] = northCapUv(latLonToScene(lat, lon), ALCANCE)
      const i = pixelDe(u, v)
      expect(Math.abs(color[i] - ((lon + 180) / 360) * 255)).toBeLessThan(4)
      expect(Math.abs(color[i + 1] - ((90 - lat) / 180) * 255)).toBeLessThan(4)
    }
  })

  /* O relevo vira normais da própria Lua (object space): na esfera elas são contadas do chão de cada
     ponto, a leste e ao norte dele, e na imagem polar esses lados giram de ponto para ponto. */
  it('a normal "reta para cima" vira a direção do próprio ponto; a "para o leste", o leste dele', () => {
    const cima = reprojectNorthCap({ color: cor, normal: reta }, TAMANHO, ALCANCE).normal
    const paraLeste = reprojectNorthCap({ color: cor, normal: leste }, TAMANHO, ALCANCE).normal
    const vetor = (data, i) => [0, 1, 2].map((k) => (data[i + k] / 255) * 2 - 1)
    for (const [lat, lon] of [[86, 40], [81, -75]]) {
      const ponto = latLonToScene(lat, lon)
      const i = pixelDe(...northCapUv(ponto, ALCANCE))
      const n = vetor(cima, i)
      expect(n[0] * ponto[0] + n[1] * ponto[1] + n[2] * ponto[2]).toBeGreaterThan(0.99)
      const lesteDoPonto = latLonToScene(0, lon + 90)
      const e = vetor(paraLeste, i)
      expect(e[0] * lesteDoPonto[0] + e[1] * lesteDoPonto[1] + e[2] * lesteDoPonto[2]).toBeGreaterThan(0.98)
    }
  })
})
