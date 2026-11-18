/* A malha do relevo do polo (card C2). Primeiro com uma grade pequena, inventada, onde dá para
 * conferir cada vértice de cabeça; depois com o far.bin do site, que é o que a cena desenha. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { MOON_RADIUS_M, polarXYToUnit, unitToPolarXY } from '../engine/geometry.js'
import { engineToScene, sceneToEngine } from './coordinates.js'
import {
  buildNormalMap,
  buildReliefCap,
  coverTriangles,
  polarDistanceToAngle,
  reliefUvs,
  reliefVertexLabels,
  smoothSphereThetaLength,
} from './reliefMesh.js'

/* 5 × 5 pixels de 1 km, com o polo no centro do pixel do meio, e todas as alturas iguais. */
function gradePequena({ altura = 0, reachM = 10000 } = {}) {
  return {
    heights: new Int16Array(25).fill(altura),
    heightScale: 0.5,
    resolutionM: 1000,
    reachM,
    x0: -2500,
    y0: 2500,
    columns: 5,
    rows: 5,
  }
}

const SEM_BORDA = { step: 1, overlapM: 0, fadeM: 1e-9 }

/* As posições saem em Float32Array, o que a placa de vídeo usa: perto do raio 1, ele guarda uns
   7 algarismos, ou seja, uns 10 cm na Lua. Comparar com mais casas que isso reprovaria o
   arredondamento, e não a conta. */
const CASAS_FLOAT32 = 7

function vertices(positions) {
  const lista = []
  for (let i = 0; i < positions.length; i += 3) lista.push([positions[i], positions[i + 1], positions[i + 2]])
  return lista
}

/* Quantos triângulos têm a frente virada para dentro da Lua: o produto vetorial dos lados aponta
   para o lado da frente, e para fora é o mesmo lado do vetor do centro até o triângulo. */
function triangulosVirados(positions, indices) {
  const v = vertices(positions)
  let virados = 0
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = [v[indices[i]], v[indices[i + 1]], v[indices[i + 2]]]
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]]
    if (n[0] * a[0] + n[1] * a[1] + n[2] * a[2] <= 0) virados++
  }
  return virados
}

describe('buildReliefCap, com uma grade pequena', () => {
  it('o pixel do meio vira o polo sul, na altura dele', () => {
    // 2000 unidades de meio metro: 1 km acima do raio de referência
    const { positions } = buildReliefCap(gradePequena({ altura: 2000 }), SEM_BORDA)
    const polo = vertices(positions)[12]
    expect(polo[0]).toBeCloseTo(0, 9)
    expect(polo[1]).toBeCloseTo(-(1 + 1000 / MOON_RADIUS_M), CASAS_FLOAT32)
    expect(polo[2]).toBeCloseTo(0, 9)
  })

  it('a altura zero fica exatamente na esfera de raio 1', () => {
    const { positions } = buildReliefCap(gradePequena(), SEM_BORDA)
    for (const p of vertices(positions)) expect(Math.hypot(...p)).toBeCloseTo(1, CASAS_FLOAT32)
  })

  it('pixel fora do alcance do manifesto não vira vértice', () => {
    // distâncias dos centros ao polo: 0, 1000 (4), 1414 (4), 2000 (4), 2236 (8) e 2828 (4) m
    const { positions } = buildReliefCap(gradePequena({ reachM: 2100 }), SEM_BORDA)
    expect(positions.length / 3).toBe(13)
  })

  it('com a grade inteira dentro do alcance, são 16 quadrados, 32 triângulos', () => {
    const { indices } = buildReliefCap(gradePequena(), SEM_BORDA)
    expect(indices.length / 3).toBe(32)
  })

  it('pulando pixels, pega um a cada step', () => {
    const { positions, indices } = buildReliefCap(gradePequena(), { ...SEM_BORDA, step: 2 })
    expect(positions.length / 3).toBe(9)
    expect(indices.length / 3).toBe(8)
  })

  it('todo triângulo tem a frente virada para fora da Lua', () => {
    const { positions, indices } = buildReliefCap(gradePequena({ altura: 3000 }), SEM_BORDA)
    expect(triangulosVirados(positions, indices)).toBe(0)
  })

  it('começando num pixel depois do primeiro, pula a borda: o relevo fino usa isso (card C6)', () => {
    // pixels 1 e 3 de cada lado da grade de 5 × 5
    const { positions } = buildReliefCap(gradePequena(), { ...SEM_BORDA, step: 2, start: 1 })
    expect(positions.length / 3).toBe(4)
    const pixelCenters = vertices(positions).map((p) => Math.round(Math.hypot(p[0], p[2]) * MOON_RADIUS_M))
    // os quatro ficam a √(1000² + 1000²) ≈ 1414 m do polo, nos cantos em volta do pixel do meio
    for (const distance of pixelCenters) expect(distance).toBeCloseTo(1414, -1)
  })

  it('na borda, a altura vai a zero para encostar na esfera lisa', () => {
    // alcance de 2500 m, folga de 400 m e transição de 1000 m: o pixel a 2236 m fica na folga
    const { positions } = buildReliefCap(gradePequena({ altura: 2000, reachM: 2500 }), {
      step: 1,
      overlapM: 400,
      fadeM: 1000,
    })
    const v = vertices(positions)
    const polo = v.find((p) => Math.abs(p[0]) < 1e-9 && Math.abs(p[2]) < 1e-9)
    expect(Math.hypot(...polo)).toBeCloseTo(1 + 1000 / MOON_RADIUS_M, CASAS_FLOAT32)
    const maisLonge = v.reduce((longe, p) => (Math.hypot(p[0], p[2]) > Math.hypot(longe[0], longe[2]) ? p : longe))
    expect(Math.hypot(...maisLonge)).toBeCloseTo(1, CASAS_FLOAT32)
  })

  it('sem transição e sem folga, a borda fica na altura real: o relevo da Lua inteira encosta nela', () => {
    // com o relevo da Lua inteira em volta (globalTiles.js), descer a borda até o raio 1 abriria
    // um degrau de alguns quilômetros em volta do polo
    const { positions } = buildReliefCap(gradePequena({ altura: 2000, reachM: 2500 }), { step: 1, overlapM: 0, fadeM: 0 })
    for (const p of vertices(positions)) expect(Math.hypot(...p)).toBeCloseTo(1 + 1000 / MOON_RADIUS_M, 6)
  })

  it('sem transição, o pixel exatamente no alcance também fica na altura real, e não vira NaN', () => {
    // o pixel do canto fica a √(2000² + 2000²) m do polo: com o alcance igual, a conta da
    // transição daria 0 / 0
    const reachM = Math.hypot(2000, 2000)
    const { positions } = buildReliefCap(gradePequena({ altura: 2000, reachM }), { step: 1, overlapM: 0, fadeM: 0 })
    expect(positions.length / 3).toBe(25)
    for (const p of vertices(positions)) expect(Math.hypot(...p)).toBeCloseTo(1 + 1000 / MOON_RADIUS_M, 6)
  })
})

/* O ponto da projeção polar de cada vértice, lido de volta das posições. */
function polarOf(positions) {
  return vertices(positions).map((p) => {
    const engine = sceneToEngine(p)
    const length = Math.hypot(...engine)
    return unitToPolarXY(engine.map((v) => v / length))
  })
}

describe('o buraco no relevo grosso, embaixo de outra malha (card C6)', () => {
  // rótulo 0 para x < 0 e 1 para o resto: dois "ladrilhos" lado a lado na grade pequena
  const sideOf = (px) => (px < 0 ? 0 : 1)
  const coverOnly = (...labels) => {
    const covered = new Uint8Array(4)
    for (const label of labels) covered[label] = 1
    return covered
  }

  it('o rótulo de cada vértice é o do ponto dele, também com pixels fora do alcance e pulando pixels', () => {
    // sem a mesma ordem dos vértices, o buraco seria aberto embaixo do vértice errado
    for (const [grid, options] of [
      [gradePequena({ reachM: 2100 }), SEM_BORDA],
      [gradePequena(), { ...SEM_BORDA, step: 2, start: 1 }],
    ]) {
      const labelAt = (px, py) => Math.round(px / 1000) * 10 + Math.round(py / 1000)
      const labels = reliefVertexLabels(grid, labelAt, options)
      const points = polarOf(buildReliefCap(grid, options).positions)
      expect(labels).toBeInstanceOf(Int32Array)
      expect(Array.from(labels)).toEqual(points.map(([px, py]) => labelAt(px, py)))
    }
  })

  it('o quadrado com os quatro cantos cobertos sai, e o coberto só em parte fica', () => {
    // a metade de x < 0 coberta: as colunas 0 e 1 (x = −2000 e −1000 m) ficam cobertas
    const { indices } = buildReliefCap(gradePequena(), SEM_BORDA)
    const labels = reliefVertexLabels(gradePequena(), sideOf, SEM_BORDA)
    // dos 16 quadrados, saem os 4 entre as colunas 0 e 1; os da coluna 1 para a 2 ficam
    expect(coverTriangles(indices, labels, coverOnly(0)).length / 3).toBe((16 - 4) * 2)
  })

  it('o buraco no meio, com borda dos quatro lados, tira só os quadrados de dentro', () => {
    // cobertos os 3 × 3 vértices do meio (x e y de −1000 a 1000 m): saem os 2 × 2 quadrados de dentro
    const middle = (px, py) => (Math.abs(px) < 1500 && Math.abs(py) < 1500 ? 2 : 3)
    const { indices } = buildReliefCap(gradePequena(), SEM_BORDA)
    const labels = reliefVertexLabels(gradePequena(), middle, SEM_BORDA)
    expect(coverTriangles(indices, labels, coverOnly(2)).length / 3).toBe((16 - 4) * 2)
  })

  /* O bloco incompleto na borda da grade deixa buracos em L, com a quina virada para qualquer lado:
     o quarto canto de fora segura o quadrado. Para o canto de fora ser o d, o c, o b e o a (os
     quatro cantos do quadrado, triangles), o quadrante descoberto é, nessa ordem, o de x e y com
     estes sinais. */
  it.each([
    ['d', 1, -1],
    ['c', -1, -1],
    ['b', 1, 1],
    ['a', -1, 1],
  ])('na quina de dentro de um buraco em L, com o canto %s de fora, o quadrado de três cantos cobertos fica', (_, sx, sy) => {
    const lShape = (px, py) => (sx * px > 0 && sy * py > 0 ? 1 : 0)
    const { indices } = buildReliefCap(gradePequena(), SEM_BORDA)
    const labels = reliefVertexLabels(gradePequena(), lShape, SEM_BORDA)
    // dos 16 quadrados, ficam só os 4 com um canto no quadrante descoberto, um deles com três
    // cantos cobertos
    expect(coverTriangles(indices, labels, coverOnly(0)).length / 3).toBe(4 * 2)
  })

  it('sem nada coberto, ficam todos os triângulos, na mesma ordem; o rótulo negativo nunca é coberto', () => {
    const { indices } = buildReliefCap(gradePequena(), SEM_BORDA)
    const outside = reliefVertexLabels(gradePequena(), () => -1, SEM_BORDA)
    expect(Array.from(coverTriangles(indices, outside, coverOnly()))).toEqual(Array.from(indices))
    // com o rótulo −1 em toda parte, nem um covered com tudo marcado tira algum quadrado
    expect(coverTriangles(indices, outside, new Uint8Array(4).fill(1)).length).toBe(indices.length)
  })

  it('os triângulos que ficam são os mesmos da malha inteira, sem os quadrados tirados', () => {
    // a frente de cada triângulo continua para fora: a troca é só de quais ficam
    const grid = gradePequena({ altura: 3000 })
    const { positions, indices } = buildReliefCap(grid, SEM_BORDA)
    const kept = coverTriangles(indices, reliefVertexLabels(grid, sideOf, SEM_BORDA), coverOnly(0))
    expect(triangulosVirados(positions, kept)).toBe(0)
    const all = new Set()
    for (let i = 0; i < indices.length; i += 3) all.add(`${indices[i]},${indices[i + 1]},${indices[i + 2]}`)
    for (let i = 0; i < kept.length; i += 3) expect(all.has(`${kept[i]},${kept[i + 1]},${kept[i + 2]}`)).toBe(true)
  })
})

describe('o mapa de normais de um ladrilho (card C6)', () => {
  // o raio de um ponto da projeção, na cena, na altura zero
  const radialAt = (px, py) => engineToScene(polarXYToUnit(px, py))
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  const normalAt = ({ normals, width }, tr, tc) => Array.from(normals.slice((tr * width + tc) * 3, (tr * width + tc) * 3 + 3))

  it('cada vértice aponta o pixel dele no mapa, na ordem dos vértices', () => {
    // pixels 1 e 3 de cada lado da grade de 5 × 5; o mapa vai do pixel 1 ao 3 (3 texels)
    const uvs = reliefUvs(gradePequena(), { ...SEM_BORDA, step: 2, start: 1 })
    expect(uvs).toBeInstanceOf(Float32Array)
    const expected = [1 / 6, 1 / 6, 5 / 6, 1 / 6, 1 / 6, 5 / 6, 5 / 6, 5 / 6]
    Array.from(uvs).forEach((v, i) => expect(v).toBeCloseTo(expected[i], 6))
  })

  it('no chão plano, a normal é a direção para cima de cada pixel', () => {
    const map = buildNormalMap(gradePequena(), { start: 1 })
    expect([map.width, map.height]).toEqual([3, 3])
    for (let tr = 0; tr < 3; tr++) {
      for (let tc = 0; tc < 3; tc++) {
        const up = radialAt(-2500 + (tc + 1 + 0.5) * 1000, 2500 - (tr + 1 + 0.5) * 1000)
        expect(dot(normalAt(map, tr, tc), up)).toBeCloseTo(1, 6)
      }
    }
  })

  it('no chão plano longe do polo, a normal é a direção para cima de cada pixel, coordenada a coordenada', () => {
    /* O buildNormalMap faz a conta de engineToScene(polarXYToUnit(...)) por dentro, sem chamar as
       duas. Perto do polo, o "para cima" de todo pixel é quase o mesmo, e uma conta errada passaria
       (o chão plano ali de cima fica a no máximo 1,4 km do polo). A uns 180 km, a uns 84°S, a conta
       com o chão achatado no polo erraria a normal em uns 5°, e com o Sol a 1,5° isso acende ou apaga
       o ladrilho inteiro. */
    const grid = { ...gradePequena(), x0: 150000, y0: -100000 }
    const map = buildNormalMap(grid, { start: 1 })
    for (let tr = 0; tr < 3; tr++) {
      for (let tc = 0; tc < 3; tc++) {
        const up = radialAt(150000 + (tc + 1 + 0.5) * 1000, -100000 - (tr + 1 + 0.5) * 1000)
        normalAt(map, tr, tc).forEach((v, i) => expect(v).toBeCloseTo(up[i], 5))
      }
    }
  })

  it('numa rampa de 10% subindo com a coluna, a normal inclina 5,7° para o lado que desce', () => {
    // 200 unidades de meio metro por pixel de 1 km: 100 m a cada 1 km
    const grid = gradePequena()
    grid.heights = Int16Array.from({ length: 25 }, (_, i) => (i % 5) * 200)
    const map = buildNormalMap(grid, { start: 1 })
    // no pixel do meio, o polo: a direção da coluna é a da diferença dos vizinhos no chão
    const up = radialAt(0, 0)
    const towardColumn = radialAt(1000, 0).map((v, i) => v - radialAt(-1000, 0)[i])
    const length = Math.hypot(...towardColumn)
    const normal = normalAt(map, 1, 1)
    expect(dot(normal, up)).toBeCloseTo(Math.cos(Math.atan(0.1)), 4)
    expect(dot(normal, towardColumn) / length).toBeCloseTo(-Math.sin(Math.atan(0.1)), 4)
  })

  // com ladrilhos de verdade (tamanho, sentido e emenda), em nearTiles.test.js
})

describe('a esfera lisa em volta da malha', () => {
  it('a 0 m do polo o ângulo é zero; a um quarto da volta, 90°', () => {
    expect(polarDistanceToAngle(0)).toBe(0)
    // na estereográfica, o equador fica a 2R do polo
    expect(polarDistanceToAngle(2 * MOON_RADIUS_M)).toBeCloseTo(Math.PI / 2, 12)
  })

  it('para um pouco depois de onde a malha começa, para não abrir fresta', () => {
    const semFolga = smoothSphereThetaLength(383485, 0)
    expect(smoothSphereThetaLength(383485)).toBeGreaterThan(semFolga)
    expect(semFolga).toBeCloseTo(Math.PI - polarDistanceToAngle(383485), 12)
  })
})

describe('buildReliefCap, com o far.bin do site', () => {
  const pasta = join(process.cwd(), 'public', 'data', 'relief')
  const manifest = JSON.parse(readFileSync(join(pasta, 'manifest.json'), 'utf8'))
  const arquivo = readFileSync(join(pasta, manifest.far.file))
  const heights = new Int16Array(arquivo.buffer.slice(arquivo.byteOffset, arquivo.byteOffset + arquivo.byteLength))
  const { positions, indices } = buildReliefCap({ ...manifest.far, heights, heightScale: manifest.heightScale })

  it('nenhum vértice sai sem número', () => {
    expect(positions.every(Number.isFinite)).toBe(true)
  })

  it('todo vértice fica perto da superfície: as montanhas do polo têm poucos quilômetros', () => {
    // a altura guardada vai de −15418 a 13952 meios metros, ou seja, de −7,7 km a +7,0 km
    /* Um expect por vértice são 250 mil chamadas, e só elas levavam o teste para perto do limite
       de 5 s que o Vitest dava (hoje a suíte dá 30 s, card E15), e ele já estourou esse limite uma
       vez sem nada de errado na malha (card C7). O laço guarda o menor e o maior raio; conferir o
       maior afastamento da esfera de raio 1 é o mesmo que conferir os dois limites. */
    let minRadius = Infinity
    let maxRadius = -Infinity
    for (const p of vertices(positions)) {
      const radius = Math.hypot(...p)
      minRadius = Math.min(minRadius, radius)
      maxRadius = Math.max(maxRadius, radius)
    }
    const maxOffsetM = Math.max(1 - minRadius, maxRadius - 1) * MOON_RADIUS_M
    expect(maxOffsetM).toBeLessThan(8000)
  })

  it('todo vértice fica no hemisfério sul da cena, dentro do círculo do relevo', () => {
    const anguloMaximo = polarDistanceToAngle(manifest.far.reachM)
    // um expect só, no fim, pelo mesmo motivo do teste de cima (card C7)
    let maxFromPole = 0
    for (const p of vertices(positions)) {
      maxFromPole = Math.max(maxFromPole, Math.acos(-p[1] / Math.hypot(...p)))
    }
    expect(maxFromPole).toBeLessThanOrEqual(anguloMaximo + 1e-6)
  })

  it('todo triângulo tem a frente virada para fora da Lua', () => {
    expect(indices.length).toBeGreaterThan(0)
    expect(triangulosVirados(positions, indices)).toBe(0)
  })
})
