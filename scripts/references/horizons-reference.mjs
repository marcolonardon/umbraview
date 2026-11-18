/* Gera src/engine/fixtures/horizonsEarthSite.json: onde um ponto do chão da Terra está no espaço,
 * segundo o JPL Horizons, para o teste de src/engine/earthSite.js (card C13).
 *
 * Como rodar, na raiz do repositório (precisa de internet; o Node já traz o fetch):
 *   node scripts/references/horizons-reference.mjs
 *
 * O Horizons não dá "a posição de um ponto do chão": dá o vetor de um centro até um alvo. Aqui o
 * centro é o ponto do chão (latitude e longitude geodésicas, altitude zero) e o alvo é o centro da
 * Terra (399); a posição do ponto é esse vetor com o sinal trocado. O referencial é o ICRF, que
 * para esta conta é o equatorial J2000 do astronomy-engine (a diferença é de 0,02 segundo de arco,
 * menos de 1 m no chão).
 *
 * As tabelas de vetores do Horizons contam o tempo em TDB, e o motor recebe UTC. De 2017 em
 * diante, TDB = UTC + 69,184 s (37 s de segundos intercalados mais os 32,184 s do TT), a menos de
 * 2 ms. Um instante anterior a 2017 teria outra diferença, e o script recusa.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const TDB_MINUS_UTC_MS = 69184
const LAST_LEAP_SECOND_MS = Date.UTC(2017, 0, 1)
const STEP_HOURS = 6
const SAMPLES = 4

/* Duas bases da lista (src/data/launchSites.js), uma em cada hemisfério e em lados opostos do
   mundo, cada uma a partir da hora de um lançamento dela à Lua. */
const CASES = [
  { name: 'Kennedy Space Center, LC-39A', lat: 28.6083, lon: -80.6041, startUtc: '2025-02-27T00:16:30Z' },
  { name: 'Mahia (Rocket Lab LC-1), Pad B', lat: -39.2604, lon: 177.8652, startUtc: '2022-06-28T09:55:00Z' },
]

// "2025-02-27 00:17:39.184", o jeito que o Horizons lê uma data
const horizonsTime = (ms) => new Date(ms).toISOString().replace('T', ' ').replace('Z', '')

async function siteSamples({ lat, lon, startUtc }) {
  const startMs = Date.parse(startUtc)
  if (startMs < LAST_LEAP_SECOND_MS) throw new Error(`${startUtc}: antes de 2017 a diferença TDB − UTC é outra`)
  const lastMs = startMs + (SAMPLES - 1) * STEP_HOURS * 3600e3
  const query = {
    format: 'text',
    COMMAND: "'399'",
    OBJ_DATA: "'NO'",
    MAKE_EPHEM: "'YES'",
    EPHEM_TYPE: "'VECTORS'",
    CENTER: "'coord@399'",
    COORD_TYPE: "'GEODETIC'",
    SITE_COORD: `'${lon},${lat},0'`,
    REF_PLANE: "'FRAME'",
    START_TIME: `'${horizonsTime(startMs + TDB_MINUS_UTC_MS)}'`,
    STOP_TIME: `'${horizonsTime(lastMs + TDB_MINUS_UTC_MS)}'`,
    STEP_SIZE: `'${STEP_HOURS} h'`,
    VEC_TABLE: "'1'",
    OUT_UNITS: "'KM-S'",
    CSV_FORMAT: "'YES'",
  }
  const url = `https://ssd.jpl.nasa.gov/api/horizons.api?${Object.entries(query)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&')}`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Horizons respondeu ${response.status}`)
  const text = await response.text()
  const table = text.split('$$SOE')[1]?.split('$$EOE')[0]
  if (!table) throw new Error(`o Horizons não devolveu a tabela de vetores:\n${text.slice(0, 2000)}`)
  const rows = table.trim().split('\n').map((line) => line.split(',').map((cell) => cell.trim()))
  if (rows.length !== SAMPLES) throw new Error(`esperava ${SAMPLES} instantes, vieram ${rows.length}`)
  return rows.map(([, , x, y, z], i) => ({
    utc: new Date(startMs + i * STEP_HOURS * 3600e3).toISOString(),
    // do centro da Terra até o ponto: o vetor do Horizons, que vai do ponto ao centro, ao contrário
    positionKm: [-Number(x), -Number(y), -Number(z)],
  }))
}

const cases = []
for (const site of CASES) {
  cases.push({ name: site.name, lat: site.lat, lon: site.lon, samples: await siteSamples(site) })
}

const fixture = {
  source: 'JPL Horizons API (https://ssd.jpl.nasa.gov/api/horizons.api): vetor do ponto do chão (CENTER coord@399, geodésico, altitude 0) até o centro da Terra (399), ICRF, com o sinal trocado',
  generatedBy: 'scripts/references/horizons-reference.mjs',
  generatedOn: new Date().toISOString().slice(0, 10),
  units: 'km, a partir do centro da Terra, no equatorial J2000 (ICRF)',
  cases,
}
const file = join(process.cwd(), 'src', 'engine', 'fixtures', 'horizonsEarthSite.json')
writeFileSync(file, `${JSON.stringify(fixture, null, 2)}\n`)
console.log(`gravado: ${file} (${cases.length} bases, ${SAMPLES} instantes cada)`)
