// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { EARTH_EQUATORIAL_RADIUS_KM, EARTH_SIDEREAL_DAY_HOURS, earthSiteEquatorialKm, earthSiteKm } from './earthSite.js'
import { latLonToUnit } from './geometry.js'
import { systemStateAt } from './system.js'

/* A referência de fora: o JPL Horizons, para duas bases da lista, uma em cada hemisfério
   (scripts/references/horizons-reference.mjs). */
const HORIZONS = JSON.parse(
  readFileSync(join(process.cwd(), 'src', 'engine', 'fixtures', 'horizonsEarthSite.json'), 'utf8'),
)

const GRAU = 180 / Math.PI
const HORA = 3600e3
/* O raio da Terra no equador e no polo, e o tempo de uma volta dela em relação às estrelas: NASA
   NSSDCA, Earth Fact Sheet ("Equatorial radius (km) 6378.137", "Polar radius (km) 6356.752",
   "Sidereal rotation period (hrs) 23.9345"), lida em 18/11/2026 (CREDITS.md). */
const RAIO_NO_EQUADOR_KM = 6378.137
const RAIO_NO_POLO_KM = 6356.752
const DIA_SIDERAL_H = 23.9345
const DIA_SIDERAL = DIA_SIDERAL_H * HORA
const FEV_27 = Date.UTC(2025, 1, 27, 0, 16, 30)
const KENNEDY = { lat: 28.6083, lon: -80.6041 }

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const tamanho = (v) => Math.hypot(...v)
const angulo = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (tamanho(a) * tamanho(b))))) * GRAU
const distancia = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
// a matriz 4 × 4 em colunas do system.js vezes um vetor da esfera do three
const girar = (m, [x, y, z]) => [0, 1, 2].map((k) => m[k] * x + m[4 + k] * y + m[8 + k] * z)
// o polo norte da Terra no desenho: a coluna 1 da matriz dela (system.js)
const poloDaTerra = (dateMs) => {
  const m = systemStateAt(dateMs).earthMatrix
  return [m[4], m[5], m[6]]
}
// a latitude vista do centro da Terra: 90° menos o ângulo até o polo
const latitudeNoEspaco = (lat, lon, dateMs) => 90 - angulo(earthSiteKm(lat, lon, dateMs), poloDaTerra(dateMs))

describe('um ponto do chão da Terra no espaço (earthSiteKm)', () => {
  it('fica no chão: a 6378,137 km do centro no equador e a 6356,752 km no polo', () => {
    // a régua da vista da missão é o mesmo raio da ficha da NASA
    expect(EARTH_EQUATORIAL_RADIUS_KM).toBe(RAIO_NO_EQUADOR_KM)
    expect(tamanho(earthSiteKm(0, -44, FEV_27))).toBeCloseTo(RAIO_NO_EQUADOR_KM, 2)
    expect(tamanho(earthSiteKm(90, 0, FEV_27))).toBeCloseTo(RAIO_NO_POLO_KM, 2)
    // no meio do caminho, entre os dois
    const kennedy = tamanho(earthSiteKm(KENNEDY.lat, KENNEDY.lon, FEV_27))
    expect(kennedy).toBeGreaterThan(RAIO_NO_POLO_KM)
    expect(kennedy).toBeLessThan(RAIO_NO_EQUADOR_KM)
  })

  it('dá uma volta por dia sideral: 23,9345 h depois está na mesma direção, e na metade, do outro lado', () => {
    // a duração que a tela escreve é a mesma da ficha da NASA
    expect(EARTH_SIDEREAL_DAY_HOURS).toBe(DIA_SIDERAL_H)
    const agora = earthSiteKm(KENNEDY.lat, KENNEDY.lon, FEV_27)
    expect(angulo(agora, earthSiteKm(KENNEDY.lat, KENNEDY.lon, FEV_27 + DIA_SIDERAL))).toBeLessThan(0.01)
    // do outro lado do eixo: 180° menos duas vezes a latitude
    expect(angulo(agora, earthSiteKm(KENNEDY.lat, KENNEDY.lon, FEV_27 + DIA_SIDERAL / 2))).toBeGreaterThan(120)
    // 24 h de relógio não são uma volta: a Terra passa quase 1° do ponto, o que anda em volta do Sol num dia
    const umDiaDeRelogio = angulo(agora, earthSiteKm(KENNEDY.lat, KENNEDY.lon, FEV_27 + 24 * HORA))
    expect(umDiaDeRelogio).toBeGreaterThan(0.8)
    expect(umDiaDeRelogio).toBeLessThan(1.1)
  })

  /* A latitude do mapa (geodésica) é medida pela vertical do lugar, e a Terra é achatada: vista do
     centro, a mesma base fica até 0,19° mais perto do equador, e a diferença some no equador e nos
     polos. É por isso que a inclinação mínima da órbita de uma base é um pouco menor que a
     latitude dela no mapa. */
  it('a latitude vista do centro é a do mapa no equador e no polo, e até 0,2° menor no meio', () => {
    expect(Math.abs(latitudeNoEspaco(0, 10, FEV_27))).toBeLessThan(0.001)
    expect(latitudeNoEspaco(90, 0, FEV_27)).toBeGreaterThan(89.999)
    const diferenca = 45 - latitudeNoEspaco(45, 10, FEV_27)
    expect(diferenca).toBeGreaterThan(0.18)
    expect(diferenca).toBeLessThan(0.2)
    // no hemisfério sul, o mesmo, para o outro lado
    expect(-45 - latitudeNoEspaco(-45, 10, FEV_27)).toBeCloseTo(-diferenca, 6)
  })

  it('a longitude anda para o leste: 90° a leste, no equador, é onde o ponto estará um quarto de dia sideral depois', () => {
    const depois = earthSiteKm(0, 0, FEV_27 + DIA_SIDERAL / 4)
    expect(angulo(earthSiteKm(0, 90, FEV_27), depois)).toBeLessThan(0.01)
    expect(angulo(earthSiteKm(0, -90, FEV_27), depois)).toBeGreaterThan(179)
  })

  /* A Terra da cena gira pela matriz do system.js (o modelo de rotação) e a base é posta por aqui
     (a posição do observador): são duas contas do astronomy-engine. Se elas se separassem, a
     marca da base cairia no mar. Com a latitude vista do centro, as duas têm que dar o mesmo
     lugar. */
  it('cai no mesmo lugar da Terra desenhada pelo system.js', () => {
    for (const hours of [0, 5, 11, 17]) {
      const dateMs = FEV_27 + hours * HORA
      const [x, y, z] = latLonToUnit(latitudeNoEspaco(KENNEDY.lat, KENNEDY.lon, dateMs), KENNEDY.lon)
      // do motor (z para o norte) para a esfera do three (y para o norte): src/scene/coordinates.js
      const naTerraDesenhada = girar(systemStateAt(dateMs).earthMatrix, [x, z, -y])
      expect(angulo(naTerraDesenhada, earthSiteKm(KENNEDY.lat, KENNEDY.lon, dateMs))).toBeLessThan(0.01)
    }
  })
})

describe('o mesmo ponto no equatorial J2000 (earthSiteEquatorialKm)', () => {
  it('é o mesmo vetor do desenho, só girado: mesmo tamanho, e o norte do desenho é o da eclíptica', () => {
    const equatorial = earthSiteEquatorialKm(KENNEDY.lat, KENNEDY.lon, FEV_27)
    const desenho = earthSiteKm(KENNEDY.lat, KENNEDY.lon, FEV_27)
    expect(tamanho(desenho)).toBeCloseTo(tamanho(equatorial), 9)
    // do equatorial para a eclíptica o giro é em volta do x, de 23,4°: o x não muda
    expect(desenho[0]).toBeCloseTo(equatorial[0], 9)
    expect(desenho[1]).not.toBeCloseTo(equatorial[2], 0)
  })

  /* Medido em 18/11/2026: de 19 a 21 m nos 8 casos. O limite é de 100 m, cinco vezes isso. O que
     sobra é o que o astronomy-engine não modela: o movimento do polo e a diferença entre o UTC e
     a rotação de verdade da Terra (UT1). Um erro de conta é muito maior: com o equador da data no
     lugar do de J2000, a diferença para Kennedy é de 39 km. */
  it('bate com o JPL Horizons a menos de 100 m, nas duas bases, ao longo de um dia', () => {
    const diferencas = HORIZONS.cases.flatMap((site) =>
      site.samples.map((sample) =>
        distancia(earthSiteEquatorialKm(site.lat, site.lon, Date.parse(sample.utc)), sample.positionKm),
      ),
    )
    expect(diferencas).toHaveLength(8)
    expect(Math.max(...diferencas)).toBeLessThan(0.1)
  })
})
