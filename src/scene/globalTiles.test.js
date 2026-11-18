// @vitest-environment node
/* O relevo da Lua inteira na cena (experimento da branch exp/lua-inteira-com-relevo): quais pedaços
 * da grade de 1,9 km a cena desenha, com quanto detalhe, e como cada um vira malha. As contas não
 * conhecem o three, para serem testadas no Node; que a Lua aparece com relevo e sombra se confere
 * no navegador. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { MOON_RADIUS_M } from '../engine/geometry.js'
import { latLonToScene, sceneToLatLon } from './coordinates.js'
import {
  GLOBAL_CHUNK_PX,
  GLOBAL_CHUNK_STEPS,
  GLOBAL_FLATTEN_FROM,
  GLOBAL_MAX_ALTITUDE,
  GLOBAL_TILE_STEPS,
  buildGlobalChunk,
  flattenAmount,
  chunkTileNames,
  globalChunks,
  globalHeightReader,
  skirtDepthM,
} from './globalTiles.js'
import { globeTextureUv } from './moonGlobe.js'

const manifest = JSON.parse(readFileSync(join(process.cwd(), 'public', 'data', 'relief', 'global', 'manifest.json'), 'utf8'))
const { pixelsPerDegree: PPD, tilePx: TILE_PX, rows: ROWS, columns: COLUMNS } = manifest

/* A cena com a janela maximizada do Marco (1114 × 761) e o fov de 36° (framing.js): uns 1.171
   pixels por radiano no meio, e a quina a 33,8° do meio. */
const HALF_FOV = (18 * Math.PI) / 180
const view = (width, height) => ({
  pixelsPerRadian: height / (2 * Math.tan(HALF_FOV)),
  viewHalfAngleRad: Math.atan(Math.tan(HALF_FOV) * Math.hypot(1, width / height)),
})
const VIEW = view(1114, 761)
// uma janela pequena (uns 130 pixels de altura) com uma lente aberta (a quina a 60° do meio): com a
// câmera de verdade, abaixo do limite de altura, o chão visível sai todo com um vértice por pixel da
// grade, e o detalhe só cai com a distância numa tela assim
const SMALL = { pixelsPerRadian: 200, viewHalfAngleRad: (60 * Math.PI) / 180 }

const cameraAt = (lat, lon, distance) => latLonToScene(lat, lon).map((v) => v * distance)

// o ângulo, no centro da Lua, entre dois pontos dados em latitude e longitude
function angleBetween(a, b) {
  const p = latLonToScene(a.lat, a.lon)
  const q = latLonToScene(b.lat, b.lon)
  return Math.acos(Math.max(-1, Math.min(1, p[0] * q[0] + p[1] * q[1] + p[2] * q[2])))
}

// o centro de um pedaço, em latitude e longitude
function chunkCenter({ row0, col0, size }) {
  return { lat: 90 - (row0 + size / 2) / PPD, lon: (col0 + size / 2) / PPD }
}

// se o pedaço cobre o ponto: a malha vai do centro do primeiro pixel ao do primeiro pixel do vizinho
function covers({ row0, col0, size }, { lat, lon }) {
  const row = (90 - lat) * PPD
  let col = (((lon % 360) + 360) % 360) * PPD
  if (col < col0 + 0.5) col += COLUMNS
  return row >= row0 + 0.5 && row <= row0 + size + 0.5 && col >= col0 + 0.5 && col <= col0 + size + 0.5
}

/* Alturas de mentira para os ladrilhos: uma função da linha e da coluna da grade inteira, para o
   teste saber a altura de cada pixel sem arquivo. */
function fakeTiles(heightOf, names) {
  const tiles = new Map()
  for (const name of names) {
    const [, r, c] = name.match(/^r(\d+)c(\d+)$/).map(Number)
    const heights = new Int16Array(TILE_PX * TILE_PX)
    for (let i = 0; i < TILE_PX; i++) {
      for (let j = 0; j < TILE_PX; j++) heights[i * TILE_PX + j] = heightOf(r * TILE_PX + i, c * TILE_PX + j)
    }
    tiles.set(name, heights)
  }
  return tiles
}

const allTileNames = () => {
  const names = []
  for (let r = 0; r < manifest.tileRows; r++) for (let c = 0; c < manifest.tileColumns; c++) names.push(`r${String(r).padStart(2, '0')}c${String(c).padStart(2, '0')}`)
  return names
}

// relevo com morros: muda de pixel para pixel, para a normal e a altura terem o que conferir
const hilly = (row, col) => Math.round(1500 * Math.sin(row / 7) + 900 * Math.cos(col / 5))

describe('globalChunks', () => {
  it('de longe, nenhum pedaço: a esfera lisa já mostra a Lua inteira', () => {
    expect(globalChunks(manifest, cameraAt(0, 15, 1 + GLOBAL_MAX_ALTITUDE + 0.01), VIEW)).toEqual([])
    expect(globalChunks(manifest, cameraAt(0, 15, 6), VIEW)).toEqual([])
  })

  it('perto do chão, o pedaço embaixo da câmera vem com um vértice por pixel', () => {
    const chunks = globalChunks(manifest, cameraAt(1.3, 15.6, 1.02), VIEW)
    const below = chunks.find((chunk) => covers(chunk, { lat: 1.3, lon: 15.6 }))
    expect(below).toBeDefined()
    expect(below.size).toBe(GLOBAL_CHUNK_PX)
    expect(below.step).toBe(1)
  })

  it('numa janela pequena de lente aberta, o detalhe cai com a distância, sempre num passo que divide o pedaço', () => {
    const camera = cameraAt(-20, 40, 1.14)
    const chunks = globalChunks(manifest, camera, SMALL)
    expect(chunks.length).toBeGreaterThan(2)
    for (const chunk of chunks) {
      const steps = chunk.size === TILE_PX ? GLOBAL_TILE_STEPS : GLOBAL_CHUNK_STEPS
      expect(steps).toContain(chunk.step)
      expect(chunk.size % chunk.step).toBe(0)
    }
    const byAngle = chunks
      .map((chunk) => [angleBetween(chunkCenter(chunk), { lat: -20, lon: 40 }), chunk.step])
      .sort((a, b) => a[0] - b[0])
    expect(byAngle[0][1]).toBeLessThan(byAngle.at(-1)[1])
  })

  it('cobre todo o chão que a câmera vê, sem buraco, e nada do outro lado da Lua', () => {
    for (const [lat, lon, distance] of [[3, 20, 1.02], [-35, 200, 1.1], [62, 300, 1.14], [0, 359.9, 1.05]]) {
      const chunks = globalChunks(manifest, cameraAt(lat, lon, distance), VIEW)
      // o chão que a tela mostra: até onde a quina da tela chega, ou até o horizonte
      const hit = Math.asin(Math.min(1, distance * Math.sin(VIEW.viewHalfAngleRad))) - VIEW.viewHalfAngleRad
      const reach = Math.min(Math.acos(1 / distance), distance * Math.sin(VIEW.viewHalfAngleRad) < 1 ? hit : Infinity)
      for (let i = 0; i < 400; i++) {
        // pontos espalhados em volta do ponto embaixo da câmera, até 98% do alcance
        const angle = reach * 0.98 * Math.sqrt((i % 20) / 19)
        const bearing = (Math.floor(i / 20) / 20) * 2 * Math.PI
        const latP = Math.asin(Math.sin(lat * Math.PI / 180) * Math.cos(angle) + Math.cos(lat * Math.PI / 180) * Math.sin(angle) * Math.cos(bearing)) * 180 / Math.PI
        const lonP = lon + Math.atan2(Math.sin(bearing) * Math.sin(angle) * Math.cos(lat * Math.PI / 180), Math.cos(angle) - Math.sin(lat * Math.PI / 180) * Math.sin(latP * Math.PI / 180)) * 180 / Math.PI
        if (latP > 89.9) continue
        expect(chunks.some((chunk) => covers(chunk, { lat: latP, lon: lonP })), `(${latP.toFixed(2)}, ${lonP.toFixed(2)})`).toBe(true)
      }
      const opposite = { lat: -lat, lon: lon + 180 }
      expect(chunks.some((chunk) => covers(chunk, opposite))).toBe(false)
    }
  })

  it('desenha também uns 2° além da quina da tela: as montanhas de fora fazem sombra para dentro', () => {
    const [lat, lon, distance] = [3, 20, 1.02]
    const chunks = globalChunks(manifest, cameraAt(lat, lon, distance), VIEW)
    const corner = Math.asin(distance * Math.sin(VIEW.viewHalfAngleRad)) - VIEW.viewHalfAngleRad
    const angle = corner + (1.9 * Math.PI) / 180
    for (let k = 0; k < 36; k++) {
      const bearing = (k / 36) * 2 * Math.PI
      const latP = Math.asin(Math.sin(lat * Math.PI / 180) * Math.cos(angle) + Math.cos(lat * Math.PI / 180) * Math.sin(angle) * Math.cos(bearing)) * 180 / Math.PI
      const lonP = lon + Math.atan2(Math.sin(bearing) * Math.sin(angle) * Math.cos(lat * Math.PI / 180), Math.cos(angle) - Math.sin(lat * Math.PI / 180) * Math.sin(latP * Math.PI / 180)) * 180 / Math.PI
      expect(chunks.some((chunk) => covers(chunk, { lat: latP, lon: lonP })), `(${latP.toFixed(2)}, ${lonP.toFixed(2)})`).toBe(true)
    }
  })

  it('dois pedaços nunca cobrem o mesmo lugar: o ladrilho inteiro ou os pedaços dele', () => {
    const chunks = globalChunks(manifest, cameraAt(10, 10, 1.12), VIEW)
    const keys = new Set(chunks.map((chunk) => chunk.key))
    expect(keys.size).toBe(chunks.length)
    for (const a of chunks) {
      for (const b of chunks) {
        if (a === b) continue
        const rows = a.row0 < b.row0 + b.size && b.row0 < a.row0 + a.size
        const cols = a.col0 < b.col0 + b.size && b.col0 < a.col0 + a.size
        expect(rows && cols, `${a.key} e ${b.key}`).toBe(false)
      }
    }
  })

  it('ao sul do relevo do polo não há pedaço: lá o relevo grosso e o fino já desenham', () => {
    const chunks = globalChunks(manifest, cameraAt(-74, 100, 1.14), { ...VIEW, skipSouthOfDeg: -77.3 })
    expect(chunks.length).toBeGreaterThan(0)
    // a última linha de ladrilhos, de 80°S a 90°S, fica inteira dentro do relevo do polo
    expect(chunks.every((chunk) => chunk.tileRow < manifest.tileRows - 1)).toBe(true)
    // a de 70°S a 80°S continua: ela passa da borda do relevo do polo
    expect(chunks.some((chunk) => chunk.tileRow === manifest.tileRows - 2)).toBe(true)
  })

  it('na tela maior, com mais pixels por radiano, o detalhe sobe', () => {
    const camera = cameraAt(5, 5, 1.14)
    const total = (chunks) => chunks.reduce((sum, chunk) => sum + (chunk.size / chunk.step) ** 2, 0)
    const small = globalChunks(manifest, camera, SMALL)
    const big = globalChunks(manifest, camera, VIEW)
    expect(total(big)).toBeGreaterThan(total(small))
  })
})

describe('chunkTileNames', () => {
  it('um pedaço no meio do ladrilho só precisa dele', () => {
    const chunk = { row0: 9 * TILE_PX + 40, col0: 3 * TILE_PX + 40, size: GLOBAL_CHUNK_PX }
    expect(chunkTileNames(manifest, chunk)).toEqual(['r09c03'])
  })

  it('na borda, precisa dos vizinhos, dando a volta na longitude 0°', () => {
    // o primeiro pedaço do ladrilho r09c00: a normal da borda lê um pixel a oeste, no r09c35
    const first = { row0: 9 * TILE_PX, col0: 0, size: GLOBAL_CHUNK_PX }
    expect(chunkTileNames(manifest, first)).toEqual(['r08c00', 'r08c35', 'r09c00', 'r09c35'])
    // o último do ladrilho r09c35: o último vértice é o primeiro pixel do r09c00
    const last = { row0: 9 * TILE_PX + 120, col0: COLUMNS - GLOBAL_CHUNK_PX, size: GLOBAL_CHUNK_PX }
    expect(chunkTileNames(manifest, last)).toEqual(['r09c00', 'r09c35', 'r10c00', 'r10c35'])
  })
})

describe('buildGlobalChunk', () => {
  const tiles = fakeTiles(hilly, allTileNames().filter((name) => /^r0[7-9]c0[0-2]$|^r0[7-9]c35$/.test(name)))
  const heightAt = globalHeightReader(manifest, tiles)
  const chunk = { row0: 8 * TILE_PX + 40, col0: 1 * TILE_PX + 80, size: GLOBAL_CHUNK_PX, step: 2 }

  it('cada vértice fica na latitude, longitude e altura do pixel dele', () => {
    const { positions } = buildGlobalChunk(manifest, chunk, heightAt)
    const across = chunk.size / chunk.step + 1
    for (const [i, j] of [[0, 0], [3, 7], [across - 1, across - 1], [10, 0]]) {
      const row = chunk.row0 + i * chunk.step
      const col = chunk.col0 + j * chunk.step
      const k = (i * across + j) * 3
      const point = [positions[k], positions[k + 1], positions[k + 2]]
      const { lat, lon } = sceneToLatLon(point)
      expect(lat).toBeCloseTo(90 - (row + 0.5) / PPD, 4)
      expect(lon).toBeCloseTo((col + 0.5) / PPD, 4)
      expect((Math.hypot(...point) - 1) * MOON_RADIUS_M).toBeCloseTo(hilly(row, col), -1)
    }
  })

  it('dois pedaços vizinhos se encontram sem fresta: o último vértice de um é o primeiro do outro', () => {
    const east = { ...chunk, col0: chunk.col0 + chunk.size }
    const a = buildGlobalChunk(manifest, chunk, heightAt).positions
    const b = buildGlobalChunk(manifest, east, heightAt).positions
    const across = chunk.size / chunk.step + 1
    for (let i = 0; i < across; i++) {
      const ka = (i * across + across - 1) * 3
      const kb = i * across * 3
      for (let axis = 0; axis < 3; axis++) expect(a[ka + axis]).toBe(b[kb + axis])
    }
  })

  it('a frente dos triângulos do chão fica para fora da Lua: a luz do three só ilumina a frente', () => {
    const { positions, indices, groundIndexCount } = buildGlobalChunk(manifest, chunk, heightAt)
    expect(groundIndexCount).toBe((chunk.size / chunk.step) ** 2 * 6)
    for (let t = 0; t < groundIndexCount; t += 3) {
      const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]].map((v) => positions.subarray(v * 3, v * 3 + 3))
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
      const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
      const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]]
      expect(n[0] * a[0] + n[1] * a[1] + n[2] * a[2]).toBeGreaterThan(0)
    }
  })

  it('no chão plano, a normal aponta para fora da Lua', () => {
    const flat = globalHeightReader(manifest, fakeTiles(() => 0, ['r08c01']))
    const inner = { row0: 8 * TILE_PX + 40, col0: TILE_PX + 40, size: GLOBAL_CHUNK_PX, step: 4 }
    const { positions, normals } = buildGlobalChunk(manifest, inner, flat)
    const across = inner.size / inner.step + 1
    for (let v = 0; v < across * across; v++) {
      const p = positions.subarray(v * 3, v * 3 + 3)
      const length = Math.hypot(...p)
      for (let axis = 0; axis < 3; axis++) expect(normals[v * 3 + axis]).toBeCloseTo(p[axis] / length, 5)
    }
  })

  it('a normal vem do relevo de 1 pixel: igual nos dois pedaços vizinhos, qualquer que seja o passo de cada um', () => {
    // sem isto, a luz mudaria em linha reta na emenda entre um pedaço fino e um grosso
    const fine = { ...chunk, step: 1 }
    const coarse = { ...chunk, col0: chunk.col0 + chunk.size, step: 4 }
    const a = buildGlobalChunk(manifest, fine, heightAt)
    const b = buildGlobalChunk(manifest, coarse, heightAt)
    const acrossFine = fine.size + 1
    const acrossCoarse = coarse.size / coarse.step + 1
    for (let i = 0; i < acrossCoarse; i++) {
      const ka = (i * coarse.step * acrossFine + acrossFine - 1) * 3
      const kb = i * acrossCoarse * 3
      for (let axis = 0; axis < 3; axis++) expect(a.normals[ka + axis]).toBeCloseTo(b.normals[kb + axis], 6)
    }
  })

  it('a cor bate com a da esfera (globeTextureUv), sem pular na longitude 180°', () => {
    const crossing = { row0: 8 * TILE_PX, col0: 18 * TILE_PX - GLOBAL_CHUNK_PX, size: GLOBAL_CHUNK_PX, step: 4 }
    const reader = globalHeightReader(manifest, fakeTiles(() => 0, ['r07c17', 'r07c18', 'r08c17', 'r08c18', 'r09c17', 'r09c18']))
    const { positions, uvs } = buildGlobalChunk(manifest, crossing, reader)
    const across = crossing.size / crossing.step + 1
    for (let v = 0; v < across * across; v++) {
      const { lat, lon } = sceneToLatLon(positions.subarray(v * 3, v * 3 + 3))
      const [u, vv] = globeTextureUv(lat, lon)
      // a textura repete na horizontal: o u do pedaço pode passar de 1 para não pular na emenda
      expect(((uvs[v * 2] % 1) + 1) % 1).toBeCloseTo(u % 1, 4)
      expect(uvs[v * 2 + 1]).toBeCloseTo(vv, 4)
    }
    // dentro de uma linha, o u só cresce, em passos iguais
    for (let j = 1; j < across; j++) expect(uvs[j * 2] - uvs[(j - 1) * 2]).toBeCloseTo(crossing.step / PPD / 360, 6)
  })

  it('a saia desce da borda, com a mesma normal e a mesma cor da borda', () => {
    const { positions, normals, uvs } = buildGlobalChunk(manifest, chunk, heightAt)
    const across = chunk.size / chunk.step + 1
    const ground = across * across
    const border = 4 * (across - 1)
    expect(positions.length / 3).toBe(ground + border)
    const depth = skirtDepthM(chunk.step) / MOON_RADIUS_M
    // a primeira volta da borda começa no canto de cima, à esquerda
    const top = positions.subarray(0, 3)
    const skirt = positions.subarray(ground * 3, ground * 3 + 3)
    expect(Math.hypot(...top) - Math.hypot(...skirt)).toBeCloseTo(depth, 6)
    for (let axis = 0; axis < 3; axis++) expect(skirt[axis] / Math.hypot(...skirt)).toBeCloseTo(top[axis] / Math.hypot(...top), 6)
    for (let axis = 0; axis < 3; axis++) expect(normals[ground * 3 + axis]).toBe(normals[axis])
    expect(uvs[ground * 2]).toBe(uvs[0])
    expect(uvs[ground * 2 + 1]).toBe(uvs[1])
  })

  it('o leitor de alturas dá a volta na longitude e para no último pixel do polo', () => {
    const reader = globalHeightReader(manifest, fakeTiles((row, col) => row * 3 + col, ['r00c00', 'r17c35']))
    expect(reader(0, COLUMNS)).toBe(reader(0, 0))
    expect(reader(ROWS + 2, COLUMNS - 1)).toBe(reader(ROWS - 1, COLUMNS - 1))
  })
})

describe('flattenAmount, quanto o relevo da Lua inteira se achata com a altura da câmera', () => {
  it('perto do chão, nada: o relevo fica na altura real', () => {
    expect(flattenAmount(0.02)).toBe(0)
    expect(flattenAmount(GLOBAL_FLATTEN_FROM)).toBe(0)
  })

  it('no limite de altura, achatado de todo: igual à esfera lisa que entra no lugar dele', () => {
    // sem isto, o relevo some de uma vez no limite, e a imagem perde nitidez num salto
    expect(flattenAmount(GLOBAL_MAX_ALTITUDE)).toBe(1)
    expect(flattenAmount(GLOBAL_MAX_ALTITUDE + 0.5)).toBe(1)
  })

  it('a faixa começa abaixo do limite, e não em cima dele', () => {
    expect(GLOBAL_FLATTEN_FROM).toBeGreaterThan(0)
    expect(GLOBAL_FLATTEN_FROM).toBeLessThan(GLOBAL_MAX_ALTITUDE)
  })

  it('no meio da faixa, só cresce, sem degrau, e sem tranco nas pontas', () => {
    let previous = 0
    for (let altitude = GLOBAL_FLATTEN_FROM; altitude <= GLOBAL_MAX_ALTITUDE + 1e-9; altitude += 0.0005) {
      const amount = flattenAmount(altitude)
      expect(amount).toBeGreaterThanOrEqual(previous)
      expect(amount - previous).toBeLessThan(0.02)
      previous = amount
    }
    // nas pontas, a mudança começa e termina devagar: o relevo não começa a baixar de repente
    const span = GLOBAL_MAX_ALTITUDE - GLOBAL_FLATTEN_FROM
    expect(flattenAmount(GLOBAL_FLATTEN_FROM + span * 0.05)).toBeLessThan(0.01)
    expect(flattenAmount(GLOBAL_MAX_ALTITUDE - span * 0.05)).toBeGreaterThan(0.99)
  })
})
