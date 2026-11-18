/* O relevo da Lua inteira na cena (experimento da branch exp/lua-inteira-com-relevo).
 *
 * Fora do polo sul, a cena desenhava uma esfera lisa, e o relevo só aparecia na luz, pelo mapa de
 * normais: nenhuma montanha fazia sombra. Aqui a grade da Lua inteira que o motor já usa para o
 * horizonte (public/data/relief/global/, 1/16 de grau por pixel, 1,9 km no equador) vira malha de
 * verdade, em volta do ponto embaixo da câmera.
 *
 * A Lua inteira nessa grade são 16,6 milhões de pixels: desenhar tudo, duas vezes por quadro (a
 * cena e a sombra), não cabe em nenhum notebook da equipe. Por isso a cena só desenha o chão que a
 * câmera vê, em pedaços, e cada pedaço com o detalhe que a tela consegue mostrar: um vértice por
 * pixel embaixo da câmera, e menos à medida que o chão se afasta. De longe, a esfera lisa continua:
 * a 1.000 km de altura, os 1,9 km entre dois pixels já cabem num pixel da tela.
 *
 * Os pedaços seguem os ladrilhos de 10° × 10° do arquivo. Longe da câmera, o ladrilho inteiro vira
 * um pedaço só; perto, ele se divide em 4 × 4 pedaços de 2,5°, para o detalhe mudar mais aos poucos.
 * Dois pedaços vizinhos com detalhes diferentes não se encontram vértice a vértice, e a fresta entre
 * eles é coberta por uma saia: uma faixa que desce da borda de cada pedaço para dentro da Lua.
 *
 * Este arquivo não conhece o three nem o React: devolve números, e é testado no Node (o mesmo
 * motivo de reliefMesh.js e nearTiles.js).
 */
import { MOON_RADIUS_M } from '../engine/geometry.js'
import { latLonToScene } from './coordinates.js'

/* Até que altura da câmera, acima da esfera de raio 1, o relevo da Lua inteira aparece: 0,15 raio,
   uns 260 km. Mais alto, a câmera vê cada vez mais ladrilhos, e cada um é uma malha desenhada duas
   vezes por quadro (a cena e a sombra). Medido no navegador do CIT-DES06 em 17/11/2026 (Intel UHD
   630, cena de 1128 × 548, a janela maximizada numa tela de 1920 × 1080), com o cronômetro da
   placa de vídeo, o quadro sem e com o relevo da Lua inteira:
   - a 430 km, com o limite em 0,35 raio: de 5,6 ms para 13,1 ms (200 malhas, 817 mil triângulos);
   - perto deste limite, a 245 km: de 4,5 ms para 8,7 ms (65 malhas, p90 de 9,0 ms), o mesmo nível
     do relevo fino do polo nesta máquina (9,0 ms, C6). Numa segunda rodada, a 258 km, com o alvo
     de 8 px: de 4,5 ms para 9,0 ms e 11,2 ms nas duas medidas intercaladas (67 malhas, 417 mil
     triângulos, p90 de até 13,8 ms);
   - a 175 km, de 4,5 ms para 6,9 ms; a 90 km, para 5,2 ms; a 35 km (a distância mínima), 4,5 ms.
   O limite saiu do custo, e não da imagem: a 260 km, com o fov de 36° da cena (framing.js), um
   pixel da grade ainda ocupa uns 6 pixels da tela, e a esfera lisa, com o mapa de normais de 1/8
   de grau, mostra menos que isso. Visto no navegador em 17/11: a troca aparecia, a imagem perdia
   nitidez de uma vez quando a câmera passava do limite. Por isso o relevo se achata aos poucos
   até ficar igual à esfera antes de chegar aqui (GLOBAL_FLATTEN_FROM). */
export const GLOBAL_MAX_ALTITUDE = 0.15

/* De que altura da câmera o relevo da Lua inteira começa a se achatar: 0,09 raio, uns 155 km. Daí
   até GLOBAL_MAX_ALTITUDE, os vértices descem até o raio 1, a normal passa da do relevo para a da
   esfera e o mapa de normais da esfera entra no material (reliefLayers.js). No limite, o relevo
   fica com a mesma imagem, o mesmo mapa de normais e o mesmo raio da esfera, e a troca entre os
   dois não aparece. Abaixo daqui, o relevo fica na altura real, como o motor o vê.
   Dentro da faixa, as montanhas aparecem mais baixas do que são, e a sombra mais curta: é o preço
   de a troca não aparecer. Começando mais embaixo, a faixa fica mais suave, mas o relevo mais
   longe da altura real numa parte maior do zoom. */
export const GLOBAL_FLATTEN_FROM = 0.09

/* Quanto o relevo da Lua inteira se achata com a câmera a `altitude` raios do chão: 0 até
   GLOBAL_FLATTEN_FROM, 1 de GLOBAL_MAX_ALTITUDE em diante, e no meio a curva suave de 3t² − 2t³, que
   começa e termina devagar: sem ela, o relevo começaria a baixar de repente, num tranco. */
export function flattenAmount(altitude) {
  const t = Math.max(0, Math.min(1, (altitude - GLOBAL_FLATTEN_FROM) / (GLOBAL_MAX_ALTITUDE - GLOBAL_FLATTEN_FROM)))
  return t * t * (3 - 2 * t)
}

/* O lado de um pedaço perto da câmera, em pixels da grade: 40 pixels, ou 2,5°, 76 km no equador.
   Divide os 160 pixels do ladrilho em 4 × 4. O ladrilho só se divide embaixo da câmera, onde o
   detalhe é de um vértice por pixel: inteiro, ele seria 25.600 quadradinhos num pedaço que a tela
   mostra só em parte. */
export const GLOBAL_CHUNK_PX = 40

/* Os passos possíveis, em pixels da grade entre dois vértices: os do pedaço de 40 pixels e os do
   ladrilho inteiro. Todos dividem o lado do pedaço, para a última linha de vértices cair
   exatamente na borda do vizinho. O ladrilho inteiro desce até o passo 2 antes de se dividir:
   simulado no Node (cena de 1128 × 548, fov de 36°), a 430 km de altura, dividindo já no passo 8,
   a conta pedia 138 pedaços; descendo até o passo 2, 16. Cada malha a mais é uma chamada de
   desenho a mais, duas vezes por quadro. Até GLOBAL_MAX_ALTITUDE, o navegador mostrou no máximo 65. */
export const GLOBAL_CHUNK_STEPS = [1]
export const GLOBAL_TILE_STEPS = [2, 4, 8, 16, 32]

/* O maior lado de um quadradinho da malha na tela, em pixels. O passo de cada pedaço é o maior em
   que o lado do quadradinho, visto da câmera, não passa disto. Com menos, a malha fica mais pesada
   sem mostrar mais, porque a grade não tem mais detalhe que um pixel; com mais, os triângulos
   aparecem na borda das crateras. Com o fov de 36° e a cena de 1128 × 548, o chão que a tela mostra
   sai todo com um vértice por pixel da grade até uns 210 km de altura, com 8 ou com 10 (simulado no
   Node). A 245 km, com 10, o ladrilho inteiro fica no passo 2 e cobre chão fora da tela: 264 mil
   triângulos, contra 219 mil com 8. Numa tela menor, como a de um celular, o passo sobe antes. */
export const GLOBAL_TARGET_PX = 8

/* Quanto o chão desenhado passa da quina da tela, em radianos (2°, uns 60 km). As montanhas logo
   fora da tela fazem sombra para dentro dela quando o Sol está baixo: um morro de 3 km com o Sol a
   3° do horizonte faz uma sombra de uns 57 km. */
export const GLOBAL_VIEW_MARGIN_RAD = (2 * Math.PI) / 180

const DEG = Math.PI / 180

const tileName = (r, c) => `r${String(r).padStart(2, '0')}c${String(c).padStart(2, '0')}`

/* Quanto a saia de um pedaço desce, em metros, pelo passo dele. A fresta entre dois pedaços vem da
   diferença entre a borda reta do mais grosso e os pixels que o mais fino desenha no meio dela:
   quanto maior o passo, maior a diferença possível num terreno acidentado. */
export function skirtDepthM(step) {
  return 500 + 250 * step
}

/* A direção do ponto (linha, coluna) da grade, na cena, com tamanho 1. A linha 0 é a de cima (o
   norte) e a coluna 0 começa na longitude 0°, crescendo para o leste (prepare_moon_global.py e
   cylindricalWindowRelief, em relief.js); o centro do pixel fica no meio dele. A latitude para no
   polo: a linha antes da primeira, ou depois da última, é o próprio polo. */
function gridDirection(global, row, col) {
  const lat = Math.max(-90, Math.min(90, 90 - (row + 0.5) / global.pixelsPerDegree))
  return latLonToScene(lat, (col + 0.5) / global.pixelsPerDegree)
}

/* O centro de um pedaço e o maior ângulo do centro até um canto, no centro da Lua. A malha vai do
   centro do primeiro pixel ao do primeiro pixel do vizinho, e os cantos são esses dois centros. */
function regionShape(global, { row0, col0, size }) {
  const center = gridDirection(global, row0 + size / 2, col0 + size / 2)
  let radius = 0
  for (const [row, col] of [[row0, col0], [row0, col0 + size], [row0 + size, col0], [row0 + size, col0 + size]]) {
    const corner = gridDirection(global, row, col)
    radius = Math.max(radius, angleOf(center, corner))
  }
  return { center, radius }
}

function angleOf(a, b) {
  return Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])))
}

// o maior passo da lista que não passa de `need`, ou o menor de todos
function pickStep(steps, need) {
  let chosen = steps[0]
  for (const step of steps) if (step <= need) chosen = step
  return chosen
}

/* Os pedaços que a cena desenha agora. global: o manifest.json de public/data/relief/global/.
   cameraPosition: a posição da câmera na cena, em raios da Lua; a câmera olha sempre para o
   centro da Lua (CameraRig.jsx), então o ponto embaixo dela é o centro da tela.
   pixelsPerRadian: quantos pixels da tela cabem num radiano, no meio dela (a altura da tela sobre
   2·tan(fov/2)). viewHalfAngleRad: o ângulo do meio da tela até a quina, visto da câmera.
   skipSouthOfDeg: a latitude ao sul da qual o relevo do polo já desenha; a linha de ladrilhos que
   fica inteira ao sul dela fica de fora.
   Devolve [{ key, tileRow, tileColumn, row0, col0, size, step }], em ordem de key: o primeiro pixel
   do pedaço na grade inteira, o lado em pixels e o passo entre dois vértices. Nenhum, se a câmera
   estiver alta. */
export function globalChunks(global, cameraPosition, { pixelsPerRadian, viewHalfAngleRad, skipSouthOfDeg = -90 }) {
  const distance = Math.hypot(...cameraPosition)
  // escrito assim para um NaN também ficar de fora
  if (!(distance - 1 <= GLOBAL_MAX_ALTITUDE)) return []
  const below = cameraPosition.map((v) => v / distance)

  /* Até onde a câmera vê: o horizonte, contando o chão mais baixo e o pico mais alto da Lua, ou a
     quina da tela, se o raio da quina acerta a Lua antes do horizonte (o ângulo no centro da Lua
     entre o ponto embaixo da câmera e onde o raio acerta é asin(d·sen θ) − θ). */
  const lowest = 1 + global.minHeightM / MOON_RADIUS_M
  const highest = 1 + global.maxHeightM / MOON_RADIUS_M
  const horizon = Math.acos(Math.min(1, lowest / distance)) + Math.acos(lowest / highest)
  const sine = distance * Math.sin(viewHalfAngleRad)
  const screen = sine < 1 ? Math.asin(sine) - viewHalfAngleRad + GLOBAL_VIEW_MARGIN_RAD : Infinity
  const reach = Math.min(horizon, screen)

  // quantos pixels da grade cabem no lado de um quadradinho de GLOBAL_TARGET_PX pixels da tela, a
  // uma distância da câmera (em raios); o pixel da grade é medido no equador, onde ele é maior
  const pixelAngle = DEG / global.pixelsPerDegree
  const neededStep = (distanceToGround) => (GLOBAL_TARGET_PX * distanceToGround) / (pixelAngle * pixelsPerRadian)

  // o ângulo do ponto embaixo da câmera até o ponto mais perto do pedaço, e a distância da câmera
  // até lá, no raio 1; null se o pedaço inteiro fica além de onde a câmera vê
  function nearest(region) {
    const { center, radius } = regionShape(global, region)
    const angle = Math.max(0, angleOf(below, center) - radius)
    if (angle > reach) return null
    return Math.sqrt(Math.max(0, distance * distance + 1 - 2 * distance * Math.cos(angle)))
  }

  const { tilePx, tileRows, tileColumns, pixelsPerDegree } = global
  const tileDegrees = tilePx / pixelsPerDegree
  const perTile = tilePx / GLOBAL_CHUNK_PX
  const chunks = []
  for (let r = 0; r < tileRows; r++) {
    // a borda norte do ladrilho; ele inteiro ao sul do relevo do polo fica de fora
    if (90 - r * tileDegrees <= skipSouthOfDeg) continue
    for (let c = 0; c < tileColumns; c++) {
      const tile = { row0: r * tilePx, col0: c * tilePx, size: tilePx }
      const toTile = nearest(tile)
      if (toTile === null) continue
      const need = neededStep(toTile)
      if (need >= GLOBAL_TILE_STEPS[0]) {
        const step = pickStep(GLOBAL_TILE_STEPS, need)
        chunks.push({ key: `${tileName(r, c)}/${step}`, tileRow: r, tileColumn: c, ...tile, step })
        continue
      }
      for (let i = 0; i < perTile; i++) {
        for (let j = 0; j < perTile; j++) {
          const part = { row0: tile.row0 + i * GLOBAL_CHUNK_PX, col0: tile.col0 + j * GLOBAL_CHUNK_PX, size: GLOBAL_CHUNK_PX }
          const toPart = nearest(part)
          if (toPart === null) continue
          const step = pickStep(GLOBAL_CHUNK_STEPS, neededStep(toPart))
          chunks.push({ key: `${tileName(r, c)}-${i}${j}/${step}`, tileRow: r, tileColumn: c, ...part, step })
        }
      }
    }
  }
  return chunks.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
}

/* Os ladrilhos que a malha de um pedaço lê: os pixels dele, o primeiro pixel do vizinho do leste e
   do sul (onde a malha termina) e um pixel em volta de tudo, para a normal da borda (buildGlobalChunk).
   A longitude dá a volta; a linha antes da primeira e a depois da última ficam no polo. */
export function chunkTileNames(global, { row0, col0, size }) {
  const { tilePx, rows, columns } = global
  const names = new Set()
  const firstRow = Math.max(0, row0 - 1)
  const lastRow = Math.min(rows - 1, row0 + size + 1)
  for (let row = firstRow; row <= lastRow; row++) {
    for (let col = col0 - 1; col <= col0 + size + 1; col++) {
      const wrapped = ((col % columns) + columns) % columns
      names.add(tileName(Math.floor(row / tilePx), Math.floor(wrapped / tilePx)))
    }
  }
  return [...names].sort()
}

/* A altura de um pixel da grade inteira, em metros, lida dos ladrilhos baixados. tiles: um Map do
   nome do ladrilho (r09c03) para as alturas dele (tilePx × tilePx, a linha 0 em cima). A longitude
   dá a volta; a linha fora da grade lê a primeira ou a última, a do polo. Um ladrilho que falta é
   erro de quem chamou: a malha só é montada com todos os ladrilhos dela (chunkTileNames). */
export function globalHeightReader(global, tiles) {
  const { tilePx, rows, columns, heightScale, tileColumns } = global
  // os ladrilhos numa lista pela posição, e não pelo nome: montar o nome a cada leitura pesava na
  // montagem da malha, que lê cada pixel 5 vezes
  const byPosition = []
  for (const [name, heights] of tiles) {
    const [, r, c] = name.match(/^r(\d+)c(\d+)$/).map(Number)
    byPosition[r * tileColumns + c] = heights
  }
  return (row, col) => {
    const r = Math.max(0, Math.min(rows - 1, row))
    const c = ((col % columns) + columns) % columns
    const tileRow = Math.floor(r / tilePx)
    const tileColumn = Math.floor(c / tilePx)
    const heights = byPosition[tileRow * tileColumns + tileColumn]
    if (!heights) throw new Error(`globalHeightReader: o ladrilho ${tileName(tileRow, tileColumn)} não foi baixado`)
    return heights[(r % tilePx) * tilePx + (c % tilePx)] * heightScale
  }
}

/* A malha de um pedaço. chunk: { row0, col0, size, step } (globalChunks). heightAt(row, col): a
   altura de um pixel, em metros (globalHeightReader).
   Devolve { positions, normals, uvs, indices, groundIndexCount }:
   - os vértices do chão, linha a linha, do centro do primeiro pixel ao do primeiro pixel do vizinho
     do leste e do sul, a cada `step` pixels, na altura real (sem exagero, pelo mesmo motivo do
     relevo do polo: reliefMesh.js); e depois os da saia, um para cada vértice da borda, dando a
     volta a partir do canto de cima, à esquerda;
   - a normal de cada vértice, das diferenças entre os pixels vizinhos de 1 pixel, e não entre os
     vértices: assim ela é a mesma nos dois pedaços de uma emenda, qualquer que seja o passo de
     cada um, e a luz não muda em linha reta ali. A saia leva a normal da borda;
   - o ponto de cada vértice na imagem de cor da esfera (globeTextureUv, em moonGlobe.js). O u
     cresce sem voltar a 0 dentro do pedaço, e a textura repete na horizontal: sem isso, o pedaço
     que atravessa a longitude 180° teria uma faixa com a imagem inteira espremida;
   - os triângulos do chão, com a frente para fora da Lua (a luz do three só ilumina a frente), e
     depois os da saia, nas duas voltas, porque a fresta pode ser vista de qualquer lado. */
export function buildGlobalChunk(global, { row0, col0, size, step }, heightAt) {
  const across = size / step + 1
  const groundCount = across * across
  const borderCount = 4 * (across - 1)
  const positions = new Float32Array((groundCount + borderCount) * 3)
  const normals = new Float32Array((groundCount + borderCount) * 3)
  const uvs = new Float32Array((groundCount + borderCount) * 2)
  const { pixelsPerDegree } = global

  /* O seno e o cosseno de cada linha e de cada coluna, uma vez só: cada vértice lê o próprio pixel
     e os 4 vizinhos, e com a conta inteira em cada leitura o ladrilho no passo 2 levava uns 7 ms
     para montar no Node, mais que o tempo que a montagem tem por quadro (GlobalRelief.jsx). */
  const rowTrig = new Map()
  const colTrig = new Map()
  function trigOf(cache, key, degrees) {
    let pair = cache.get(key)
    if (!pair) {
      pair = [Math.sin(degrees * DEG), Math.cos(degrees * DEG)]
      cache.set(key, pair)
    }
    return pair
  }

  // a conta de gridDirection e latLonToScene (coordinates.js), com os senos guardados:
  // x = cos(lat)·cos(lon), y = sen(lat), z = −cos(lat)·sen(lon)
  function pointAt(row, col) {
    const [sinLat, cosLat] = trigOf(rowTrig, row, Math.max(-90, Math.min(90, 90 - (row + 0.5) / pixelsPerDegree)))
    const [sinLon, cosLon] = trigOf(colTrig, col, (col + 0.5) / pixelsPerDegree)
    const radius = 1 + heightAt(row, col) / MOON_RADIUS_M
    return [cosLat * cosLon * radius, sinLat * radius, -cosLat * sinLon * radius]
  }

  // a longitude do primeiro vértice, de −180° a 180°, como na imagem de cor da esfera
  const firstLon = (col0 + 0.5) / pixelsPerDegree
  const signedFirstLon = firstLon > 180 ? firstLon - 360 : firstLon
  const firstU = (signedFirstLon + 180) / 360

  for (let i = 0; i < across; i++) {
    const row = row0 + i * step
    const lat = Math.max(-90, Math.min(90, 90 - (row + 0.5) / pixelsPerDegree))
    for (let j = 0; j < across; j++) {
      const col = col0 + j * step
      const k = i * across + j
      const p = pointAt(row, col)
      positions.set(p, k * 3)
      // a normal: leste − oeste × sul − norte, a 1 pixel de cada lado
      const west = pointAt(row, col - 1)
      const east = pointAt(row, col + 1)
      const north = pointAt(row - 1, col)
      const south = pointAt(row + 1, col)
      const ax = east[0] - west[0]
      const ay = east[1] - west[1]
      const az = east[2] - west[2]
      const bx = south[0] - north[0]
      const by = south[1] - north[1]
      const bz = south[2] - north[2]
      const nx = ay * bz - az * by
      const ny = az * bx - ax * bz
      const nz = ax * by - ay * bx
      // para fora da Lua: do mesmo lado da posição do vértice
      const outward = nx * p[0] + ny * p[1] + nz * p[2] > 0 ? 1 : -1
      const length = Math.sqrt(nx * nx + ny * ny + nz * nz) * outward
      normals.set([nx / length, ny / length, nz / length], k * 3)
      uvs.set([firstU + (col - col0) / pixelsPerDegree / 360, (lat + 90) / 180], k * 2)
    }
  }

  // a volta da borda: em cima da esquerda para a direita, a direita de cima para baixo, embaixo da
  // direita para a esquerda e a esquerda de baixo para cima
  const loop = []
  for (let j = 0; j < across - 1; j++) loop.push(j)
  for (let i = 0; i < across - 1; i++) loop.push(i * across + across - 1)
  for (let j = across - 1; j > 0; j--) loop.push((across - 1) * across + j)
  for (let i = across - 1; i > 0; i--) loop.push(i * across)

  const depth = skirtDepthM(step) / MOON_RADIUS_M
  loop.forEach((vertex, n) => {
    const k = groundCount + n
    const p = positions.subarray(vertex * 3, vertex * 3 + 3)
    const length = Math.hypot(p[0], p[1], p[2])
    const scale = (length - depth) / length
    positions.set([p[0] * scale, p[1] * scale, p[2] * scale], k * 3)
    normals.set(normals.subarray(vertex * 3, vertex * 3 + 3), k * 3)
    uvs.set(uvs.subarray(vertex * 2, vertex * 2 + 2), k * 2)
  })

  const groundIndexCount = (across - 1) * (across - 1) * 6
  const indices = new Uint32Array(groundIndexCount + borderCount * 12)
  let t = 0
  for (let i = 0; i < across - 1; i++) {
    for (let j = 0; j < across - 1; j++) {
      const a = i * across + j
      const b = a + 1
      const c = a + across
      const d = c + 1
      // nesta ordem a frente fica para fora: a coluna cresce para o leste e a linha para o sul
      indices.set([a, c, b, b, c, d], t)
      t += 6
    }
  }
  for (let n = 0; n < borderCount; n++) {
    const g0 = loop[n]
    const g1 = loop[(n + 1) % borderCount]
    const s0 = groundCount + n
    const s1 = groundCount + ((n + 1) % borderCount)
    indices.set([g0, s0, g1, g1, s0, s1, g0, g1, s0, g1, s1, s0], t)
    t += 12
  }
  return { positions, normals, uvs, indices, groundIndexCount }
}
