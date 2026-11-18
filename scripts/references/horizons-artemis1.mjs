/* Gera src/engine/fixtures/horizonsArtemis1.json: onde a nave Orion da Artemis I esteve, de
 * verdade, num trecho da ida à Lua, segundo o JPL Horizons, para o teste de src/engine/orbit.js
 * (card C14).
 *
 * Como rodar, na raiz do repositório (precisa de internet; o Node já traz o fetch):
 *   node scripts/references/horizons-artemis1.mjs
 *
 * O Horizons tem a trajetória voada da Orion (objeto −1023), da navegação da NASA/JSC: o arquivo
 * "Post_TLI_Orion_AsFlown_20221213_EPH_OEM", de 16/11/2022 08:46 a 11/12/2022 17:20 TDB, como o
 * próprio Horizons diz no cabeçalho da resposta. Aqui o centro é o da Terra (500@399) e o
 * referencial é o ICRF, que para esta conta é o equatorial J2000 do astronomy-engine.
 *
 * O trecho: 68 horas a partir de 17/11/2022 14:00 TDB, com a nave a 226 mil km da Terra. Ele tem
 * que ser um trecho sem motor ligado, porque o propagador só conhece a gravidade: uma queima no
 * meio apareceria como erro dele. Medido em 18/11/2026, com os dados de 10 em 10 minutos e o
 * próprio propagador: a velocidade da nave muda de repente em 17/11 11:30 TDB (0,22 m/s) e em
 * 20/11 12:10 TDB (0,87 m/s), o que tem cara de correção de rota (não conferi com a NASA), e o
 * trecho fica entre as duas.
 *
 * O que o trecho tem são 5 emendas do arquivo, que o Horizons chama de "concatenado": em 17/11
 * 17:50, 18/11 04:50, 19/11 03:50, 19/11 18:30 e 20/11 07:10 TDB, a posição salta de 3 a 24 km
 * de um instante para o outro, quase sem mudar a velocidade. Elas caem em 5 dos 17 pedaços de
 * 4 horas daqui; nos outros 12 a conta chega na posição seguinte a menos de 3 m. O teste do
 * orbit.js confere as duas coisas. Por que cada emenda está lá, não conferi.
 *
 * As tabelas de vetores do Horizons contam o tempo em TDB, e o motor recebe UTC. De 2017 em
 * diante, TDB = UTC + 69,184 s (37 s de segundos intercalados mais os 32,184 s do TT), a menos de
 * 2 ms.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const TDB_MINUS_UTC_MS = 69184
const START_TDB = '2022-11-17 14:00'
const STEP_HOURS = 4
const SAMPLES = 18 // 17 passos de 4 h: 68 horas

const startTdbMs = Date.parse(`${START_TDB.replace(' ', 'T')}:00Z`)
// "2022-11-20 10:00", o jeito que o Horizons lê uma data
const horizonsTime = (ms) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ')

const query = {
  format: 'text',
  COMMAND: "'-1023'",
  OBJ_DATA: "'NO'",
  MAKE_EPHEM: "'YES'",
  EPHEM_TYPE: "'VECTORS'",
  CENTER: "'500@399'",
  REF_PLANE: "'FRAME'",
  START_TIME: `'${START_TDB}'`,
  STOP_TIME: `'${horizonsTime(startTdbMs + (SAMPLES - 1) * STEP_HOURS * 3600e3)}'`,
  STEP_SIZE: `'${STEP_HOURS} h'`,
  VEC_TABLE: "'2'",
  OUT_UNITS: "'KM-S'",
  CSV_FORMAT: "'YES'",
}
const url = `https://ssd.jpl.nasa.gov/api/horizons.api?${Object.entries(query)
  .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
  .join('&')}`
const response = await fetch(url)
if (!response.ok) throw new Error(`Horizons respondeu ${response.status}`)
const text = await response.text()
if (!text.includes('Reference frame : ICRF')) throw new Error('a resposta do Horizons não diz que o referencial é o ICRF')
const table = text.split('$$SOE')[1]?.split('$$EOE')[0]
if (!table) throw new Error(`o Horizons não devolveu a tabela de vetores:\n${text.slice(0, 2000)}`)
const rows = table.trim().split('\n').map((line) => line.split(',').map((cell) => cell.trim()))
if (rows.length !== SAMPLES) throw new Error(`esperava ${SAMPLES} instantes, vieram ${rows.length}`)

const samples = rows.map(([, , x, y, z, vx, vy, vz], i) => ({
  utc: new Date(startTdbMs + i * STEP_HOURS * 3600e3 - TDB_MINUS_UTC_MS).toISOString(),
  positionKm: [Number(x), Number(y), Number(z)],
  velocityKmS: [Number(vx), Number(vy), Number(vz)],
}))

const fixture = {
  source: 'JPL Horizons API (https://ssd.jpl.nasa.gov/api/horizons.api): a trajetória voada da Orion na Artemis I (objeto -1023, da navegação da NASA/JSC), posição e velocidade a partir do centro da Terra (500@399), ICRF',
  generatedBy: 'scripts/references/horizons-artemis1.mjs',
  generatedOn: new Date().toISOString().slice(0, 10),
  units: 'km e km/s, a partir do centro da Terra, no equatorial J2000 (ICRF)',
  time: `de ${STEP_HOURS} em ${STEP_HOURS} horas a partir de ${START_TDB} TDB; o campo utc é o TDB menos 69,184 s`,
  samples,
}
const file = join(process.cwd(), 'src', 'engine', 'fixtures', 'horizonsArtemis1.json')
writeFileSync(file, `${JSON.stringify(fixture, null, 2)}\n`)
console.log(`gravado: ${file} (${samples.length} instantes, de ${samples[0].utc} a ${samples.at(-1).utc})`)
