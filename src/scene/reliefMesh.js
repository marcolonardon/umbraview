/* A malha do relevo do polo sul (card C2), a partir do relevo grosso do card E2 (far.bin).
 *
 * A grade do far.bin está na projeção polar dos arquivos LOLA: 802 × 802 alturas, 960 m por pixel,
 * a linha 0 é a de cima. Cada pixel vira um vértice no lugar dele na Lua (polarXYToUnit), na altura
 * real: o raio da cena é 1, e a altura entra como fração do raio da Lua. Sem exagero de propósito:
 * a altura exagerada alonga a sombra na mesma proporção, e a cena mostraria sombra onde o motor diz
 * que o Sol está à vista (decisão do Marco no C2, 06/11/2026).
 *
 * Só ficam os pixels até o reachM do manifesto, o círculo que o script garante ter dado. Na borda,
 * a altura vai a zero aos poucos, para a malha encostar na esfera lisa do resto da Lua. Essa faixa
 * fica por volta de 77°S, longe da área que a pessoa escolhe (até 84°S, card E2).
 *
 * Este arquivo não conhece o three: devolve números, e a cena monta a geometria com eles. Assim a
 * conta é testada no Node, sem WebGL.
 */
import { MOON_RADIUS_M, polarXYToUnit } from '../engine/geometry.js'
import { engineToScene } from './coordinates.js'

/* Um vértice a cada 2 pixels: 1,9 km entre vértices e uns 126 mil vértices no círculo. Com todos os
   pixels seriam 4 vezes mais, e cada um é desenhado duas vezes por quadro (a cena e a sombra). O C4
   mede o peso nos notebooks da equipe; se sobrar folga, este número pode cair para 1. */
export const RELIEF_STEP = 2

/* Quanto a esfera lisa entra por baixo da malha. A borda da malha é feita de quadradinhos da
   grade, então fica dentesada até um passo da grade inteiro (√2 · 2 · 960 m ≈ 2,7 km) para dentro
   do círculo; com 4 km de folga não sobra fresta entre as duas. */
export const EDGE_OVERLAP_M = 4000

/* A largura da faixa em que a altura vai a zero, antes da folga acima. Larga demais, aplainaria
   montanhas que fazem sombra na área de escolha; estreita demais, a borda vira um degrau. */
export const EDGE_FADE_M = 10000

/* Distância na projeção polar (a partir do polo) para o ângulo no centro da Lua, em radianos. A
   projeção estereográfica põe o ponto a 2R·tan(θ/2) do polo (geometry.js). */
export function polarDistanceToAngle(rhoM) {
  return 2 * Math.atan(rhoM / (2 * MOON_RADIUS_M))
}

/* O thetaLength da sphereGeometry do three (o ângulo a partir do polo norte) para a esfera lisa
   parar onde começa a malha do relevo, com a folga de EDGE_OVERLAP_M por baixo dela. */
export function smoothSphereThetaLength(reachM, overlapM = EDGE_OVERLAP_M) {
  return Math.PI - polarDistanceToAngle(reachM - overlapM)
}

/* grid: o campo far do manifest.json (resolutionM, reachM, x0, y0, columns, rows), mais heights (o
   Int16Array do far.bin) e heightScale (do manifesto: metros por unidade guardada). Um ladrilho do
   relevo fino entra no mesmo formato (nearTileGrid, card C6).
   start: o primeiro pixel usado em cada linha e coluna. O ladrilho do relevo fino traz um pixel
   repetido do vizinho de cada lado; começando no 1, a malha de um termina onde a do outro começa.
   Devolve { positions, indices }: três números por vértice, na cena, e três índices por
   triângulo, com a frente virada para fora da Lua (a luz do three só ilumina a frente). Cada
   quadrado da grade são dois triângulos seguidos, (a, c, b) e (b, c, d): o coverTriangles conta
   com isso. */
export function buildReliefCap(
  { heights, heightScale, resolutionM, reachM, x0, y0, columns, rows },
  { step = RELIEF_STEP, overlapM = EDGE_OVERLAP_M, fadeM = EDGE_FADE_M, start = 0 } = {},
) {
  // de onde em diante a altura já é zero: dali para fora a esfera lisa também está desenhada
  const flatFromM = reachM - overlapM
  const positions = []
  const layout = layOutGrid({ resolutionM, reachM, x0, y0, columns, rows }, { step, start }, (r, c, px, py, rho) => {
    // sem transição, nada desce: no alcance exato, a conta abaixo daria 0 / 0
    const fade = fadeM > 0 ? Math.max(0, Math.min(1, (flatFromM - rho) / fadeM)) : 1
    const heightM = heights[r * columns + c] * heightScale * fade
    const radius = 1 + heightM / MOON_RADIUS_M
    const [x, y, z] = engineToScene(polarXYToUnit(px, py))
    positions.push(x * radius, y * radius, z * radius)
  })
  return { positions: new Float32Array(positions), indices: triangles(layout) }
}

/* Um rótulo para cada vértice da malha de buildReliefCap, na mesma ordem dos vértices: labelAt(px,
   py) recebe o ponto da projeção de cada um. Os mesmos grid, step e start do buildReliefCap. No
   relevo grosso, o rótulo é o ladrilho do relevo fino que fica em cima do vértice (nearTileIndexAt,
   card C6): calculado uma vez por relevo, ele deixa o buraco ser refeito sem percorrer a grade. */
export function reliefVertexLabels(
  { resolutionM, reachM, x0, y0, columns, rows },
  labelAt,
  { step = RELIEF_STEP, start = 0 } = {},
) {
  const labels = []
  layOutGrid({ resolutionM, reachM, x0, y0, columns, rows }, { step, start }, (r, c, px, py) => labels.push(labelAt(px, py)))
  return Int32Array.from(labels)
}

/* O buraco que o relevo grosso abre embaixo de outra malha (o relevo fino, card C6): os triângulos
   de indices (os do buildReliefCap) sem os quadrados com os quatro cantos cobertos. labels: o rótulo
   de cada vértice (reliefVertexLabels); covered (um Uint8Array) tem 1 no rótulo onde a outra malha
   desenha. O rótulo −1 (fora da grade) lê undefined no Uint8Array e nunca é coberto. O quadrado
   coberto só em parte fica, para não abrir fresta na emenda.
   Percorrer a grade de novo a cada troca levava uns 31 ms, e a página engasgava no quadro seguinte;
   aqui é só uma passada nos índices. */
export function coverTriangles(indices, labels, covered) {
  const isCovered = (vertex) => covered[labels[vertex]] === 1
  const kept = new Uint32Array(indices.length)
  let count = 0
  for (let i = 0; i < indices.length; i += 6) {
    // os quatro cantos do quadrado, de (a, c, b) e (b, c, d)
    if (isCovered(indices[i]) && isCovered(indices[i + 1]) && isCovered(indices[i + 2]) && isCovered(indices[i + 5])) continue
    for (let k = 0; k < 6; k++) kept[count++] = indices[i + k]
  }
  return kept.subarray(0, count)
}

/* Onde cada vértice da malha de buildReliefCap cai no mapa de normais (buildNormalMap), com os
   mesmos grid, step e start: dois números por vértice (u, v), na ordem dos vértices. O texel k do
   mapa é o pixel start + k, e o u do vértice é o centro do texel do pixel dele. O último vértice
   (o pixel columns − 1) fica um pouco além da borda do mapa, e a textura repete a borda ali. */
export function reliefUvs(
  { resolutionM, reachM, x0, y0, columns, rows },
  { step = RELIEF_STEP, start = 0 } = {},
) {
  const width = columns - 1 - start
  const height = rows - 1 - start
  const uvs = []
  layOutGrid({ resolutionM, reachM, x0, y0, columns, rows }, { step, start }, (r, c) => {
    uvs.push((c - start + 0.5) / width, (r - start + 0.5) / height)
  })
  return Float32Array.from(uvs)
}

/* O mapa de normais de um ladrilho do relevo fino (card C6): a direção "para fora" da superfície em
   cada pixel de 80 m, de start a columns − 2 (e o mesmo nas linhas), no espaço da cena. A malha tem
   um vértice a cada 400 m ou 800 m, mas é a normal que faz a cratera aparecer: com o Sol a um ou
   dois graus do horizonte, a encosta virada para ele clareia e a de costas escurece. Com o mapa, a
   luz usa os dados de 80 m na tela inteira (o material lê o mapa em cada pixel da tela, no espaço
   do objeto, que é o da cena). Medido no navegador em 12/11/2026, em quatro lugares: o detalhe do
   anel de 800 m (a variação de brilho entre pixels vizinhos) subiu de 2,2 a 3,6 vezes, para o
   nível do centro.
   A normal é o produto vetorial das diferenças entre os pixels vizinhos, de cada lado (80 m). Na
   borda, o vizinho é o pixel que o ladrilho repete do lado (start ≥ 1): assim a normal da emenda é a
   mesma nos dois ladrilhos, e a luz não muda em linha reta de um para o outro, como acontecia com a
   normal calculada pela malha de cada um.
   Devolve { normals, width, height }: três números por pixel, linha a linha, a linha 0 em cima. */
export function buildNormalMap({ heights, heightScale, resolutionM, x0, y0, columns, rows }, { start = 1 } = {}) {
  /* A posição de cada pixel na cena, na altura dele. É a conta de engineToScene(polarXYToUnit(px,
     py)) escrita aqui dentro: as duas funções criam dois arrays por pixel, e com os 63 mil pixels
     do ladrilho isso levava uns 10 ms, num quadro que já monta a malha. O polarXYToUnit devolve
     [py·f, px·f, Z] no motor, e o engineToScene troca para [x, z, −y]; o teste do chão plano longe
     do polo (reliefMesh.test.js) compara com as duas. */
  const positions = new Float64Array(columns * rows * 3)
  const k4 = 4 * MOON_RADIUS_M * MOON_RADIUS_M
  for (let r = 0; r < rows; r++) {
    const py = y0 - (r + 0.5) * resolutionM
    for (let c = 0; c < columns; c++) {
      const px = x0 + (c + 0.5) * resolutionM
      const rho2 = px * px + py * py
      const Z = (rho2 - k4) / (rho2 + k4)
      const f = (1 - Z) / (2 * MOON_RADIUS_M)
      const radius = 1 + (heights[r * columns + c] * heightScale) / MOON_RADIUS_M
      const k = (r * columns + c) * 3
      positions[k] = py * f * radius
      positions[k + 1] = Z * radius
      positions[k + 2] = -px * f * radius
    }
  }

  const width = columns - 1 - start
  const height = rows - 1 - start
  const normals = new Float32Array(width * height * 3)
  for (let tr = 0; tr < height; tr++) {
    const r = start + tr
    for (let tc = 0; tc < width; tc++) {
      const c = start + tc
      const west = (r * columns + c - 1) * 3
      const east = (r * columns + c + 1) * 3
      const north = ((r - 1) * columns + c) * 3
      const south = ((r + 1) * columns + c) * 3
      const ax = positions[east] - positions[west]
      const ay = positions[east + 1] - positions[west + 1]
      const az = positions[east + 2] - positions[west + 2]
      const bx = positions[south] - positions[north]
      const by = positions[south + 1] - positions[north + 1]
      const bz = positions[south + 2] - positions[north + 2]
      let nx = ay * bz - az * by
      let ny = az * bx - ax * bz
      let nz = ax * by - ay * bx
      // para fora da Lua: do mesmo lado da posição do pixel
      const here = (r * columns + c) * 3
      const outward = nx * positions[here] + ny * positions[here + 1] + nz * positions[here + 2] > 0 ? 1 : -1
      const length = Math.sqrt(nx * nx + ny * ny + nz * nz) * outward
      const o = (tr * width + tc) * 3
      normals[o] = nx / length
      normals[o + 1] = ny / length
      normals[o + 2] = nz / length
    }
  }
  return { normals, width, height }
}

/* Percorre a grade na ordem dos vértices e diz qual vértice cada ponto dela virou (vertexOf, −1
   para fora do alcance). onVertex(r, c, px, py, rho) é chamada para cada vértice, na ordem: é ela
   que guarda a posição ou o rótulo. As funções de cima passam por aqui para a numeração dos
   vértices sair igual em todas. */
function layOutGrid({ resolutionM, reachM, x0, y0, columns, rows }, { step, start }, onVertex) {
  const gridColumns = Math.floor((columns - 1 - start) / step) + 1
  const gridRows = Math.floor((rows - 1 - start) / step) + 1
  const vertexOf = new Int32Array(gridColumns * gridRows).fill(-1)
  let vertexCount = 0

  for (let gr = 0; gr < gridRows; gr++) {
    const r = start + gr * step
    const py = y0 - (r + 0.5) * resolutionM // centro do pixel; a linha 0 é a de cima
    for (let gc = 0; gc < gridColumns; gc++) {
      const c = start + gc * step
      const px = x0 + (c + 0.5) * resolutionM
      const rho = Math.hypot(px, py)
      if (rho > reachM) continue
      vertexOf[gr * gridColumns + gc] = vertexCount++
      onVertex(r, c, px, py, rho)
    }
  }
  return { gridColumns, gridRows, vertexOf }
}

function triangles({ gridColumns, gridRows, vertexOf }) {
  const indices = []
  for (let gr = 0; gr < gridRows - 1; gr++) {
    for (let gc = 0; gc < gridColumns - 1; gc++) {
      const a = vertexOf[gr * gridColumns + gc]
      const b = vertexOf[gr * gridColumns + gc + 1]
      const c = vertexOf[(gr + 1) * gridColumns + gc]
      const d = vertexOf[(gr + 1) * gridColumns + gc + 1]
      // quadrado com um canto fora do círculo fica de fora: a esfera lisa cobre o lugar dele
      if (a < 0 || b < 0 || c < 0 || d < 0) continue
      // Nesta ordem a frente fica para fora: a coluna cresce para −z e a linha para −x na cena, e
      // o polo sul olha para −y. A ordem contrária deixaria a Lua escura vista de fora.
      indices.push(a, c, b, b, c, d)
    }
  }
  return new Uint32Array(indices)
}
