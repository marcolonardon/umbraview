/* As bases de lançamento da lista (card C13). Além do que toda lista com fonte confere (link
 * https, coordenada na faixa, id sem repetir), amarram cada linha às linhas copiadas do GCAT
 * (scripts/references/, CREDITS.md): a coordenada é a da plataforma, e o lançamento à Lua é o do
 * registro de lançamentos, na mesma base, na mesma plataforma e na mesma hora. Quem trocar um
 * dígito à mão reprova aqui. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { launchSites } from './launchSites.js'

/* As tabelas do GCAT são texto separado por tabulação: o cabeçalho começa com # e tem as colunas, e
   as outras linhas com # são comentário (as nossas, no topo, e a data de atualização do GCAT). Os
   valores vêm com espaços em volta, para as colunas ficarem alinhadas no arquivo. */
function gcatRows(file) {
  const lines = readFileSync(join(process.cwd(), 'scripts', 'references', file), 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
  const columns = lines
    .find((line) => line.startsWith('#') && line.includes('\t'))
    .slice(1)
    .split('\t')
  return lines
    .filter((line) => !line.startsWith('#'))
    .map((line) => Object.fromEntries(line.split('\t').map((value, i) => [columns[i], value.trim()])))
}

const PADS = gcatRows('gcat-launch-points.tsv')
const LAUNCHES = gcatRows('gcat-lunar-launches.tsv')

/* Baikonur trocou de nome no GCAT em 1989: o Luna-24, de 1976, saiu do "NIIP-5", e a plataforma
   dele está na tabela com o nome de hoje, "GIK-5" (a coluna UCode da tabela de bases do GCAT liga
   os dois). */
const SAME_PLACE = { 'NIIP-5': 'GIK-5' }

/* As duas missões que a linha do GCAT não chama pelo nome: o SMART-1 foi de carona num Ariane 5
   que o registro nomeia pelas cargas principais, e o Clementine aparece com o nome de projeto,
   DSPSE. Para as duas, a ligação entre a missão e o lançamento vem da página da NASA. */
const NAMED_BY_THE_AGENCY = ['kourou-ela3', 'vandenberg-slc4w']

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// "2025 Feb 27 0016:30" ou "2024 Jan  8 0718", sempre em UTC, para milissegundos
function gcatDateMs(text) {
  const [, year, month, day, hour, minute, second] = text.match(
    /^(\d{4}) (\w{3}) +(\d{1,2}) (\d{2})(\d{2})(?::(\d{2}))?$/,
  )
  return Date.UTC(Number(year), MONTHS.indexOf(month), Number(day), Number(hour), Number(minute), Number(second ?? 0))
}

const padOf = (site) => PADS.find((row) => row.Site === site.gcat.site && row.Code === site.gcat.pad)
const launchOf = (site) => LAUNCHES.find((row) => row.Launch_Tag === site.lunarLaunch.gcatTag)
const names = (sites) => sites.map((site) => site.name)

describe('launchSites.js', () => {
  it('a leitura das tabelas do GCAT funciona: 15 plataformas e 14 lançamentos, com as colunas', () => {
    expect(PADS).toHaveLength(15)
    expect(LAUNCHES).toHaveLength(14)
    expect(PADS[0]).toHaveProperty('Latitude')
    expect(LAUNCHES[0]).toHaveProperty('Launch_Pad')
    expect(gcatDateMs('2025 Feb 27 0016:30')).toBe(Date.UTC(2025, 1, 27, 0, 16, 30))
    expect(gcatDateMs('2024 Jan  8 0718')).toBe(Date.UTC(2024, 0, 8, 7, 18, 0))
  })

  it('toda base tem a fonte num link https://, e o lançamento à Lua também', () => {
    const bad = launchSites.filter(
      (site) =>
        !site.sourceUrl?.startsWith('https://') ||
        (site.lunarLaunch && !site.lunarLaunch.sourceUrl?.startsWith('https://')),
    )
    expect(names(bad)).toEqual([])
  })

  it('latitude entre −90 e 90 e longitude entre −180 e 180', () => {
    const bad = launchSites.filter(
      (site) => !(site.lat >= -90 && site.lat <= 90 && site.lon >= -180 && site.lon <= 180),
    )
    expect(names(bad)).toEqual([])
  })

  it('nenhum id se repete', () => {
    const ids = launchSites.map((site) => site.id)
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([])
  })
})

describe('as bases e as linhas do GCAT', () => {
  it('a lista traz todas as plataformas copiadas do GCAT, e só elas', () => {
    const listed = launchSites.map((site) => `${site.gcat.site} ${site.gcat.pad}`).sort()
    expect(listed).toEqual(PADS.map((row) => `${row.Site} ${row.Code}`).sort())
  })

  /* O GCAT dá 4 casas decimais, uns 11 m no chão. A comparação é de número com número, sem
     folga: a coordenada foi copiada, e não calculada. */
  it('a coordenada de cada base é a da plataforma dela no GCAT', () => {
    const wrong = launchSites.filter((site) => {
      const pad = padOf(site)
      return !pad || Number(pad.Latitude) !== site.lat || Number(pad.Longitude) !== site.lon
    })
    expect(names(wrong)).toEqual([])
  })

  it('só Alcântara entra sem lançamento à Lua', () => {
    expect(launchSites.filter((site) => !site.lunarLaunch).map((site) => site.id)).toEqual(['alcantara-vls'])
  })

  it('o lançamento à Lua de cada base é o do registro do GCAT: mesma base, mesma plataforma, mesma hora', () => {
    const wrong = launchSites
      .filter((site) => site.lunarLaunch)
      .filter((site) => {
        const launch = launchOf(site)
        return (
          !launch ||
          (SAME_PLACE[launch.Launch_Site] ?? launch.Launch_Site) !== site.gcat.site ||
          launch.Launch_Pad !== site.gcat.pad ||
          gcatDateMs(launch.Launch_Date) !== site.lunarLaunch.launchedAtUtc.getTime()
        )
      })
    expect(names(wrong)).toEqual([])
  })

  it('cada lançamento do GCAT copiado é usado por uma base, e só por uma', () => {
    const used = launchSites.filter((site) => site.lunarLaunch).map((site) => site.lunarLaunch.gcatTag)
    expect(used.sort()).toEqual(LAUNCHES.map((row) => row.Launch_Tag).sort())
  })

  /* Sem isto, o nome de uma missão com o lançamento de outra passaria: a hora e a plataforma
     bateriam com o GCAT, e a tela diria que outra missão saiu dali. */
  it('o nome da missão está na linha do GCAT; nas duas exceções, a fonte é a página da NASA', () => {
    const wrong = launchSites
      .filter((site) => site.lunarLaunch)
      .filter((site) => {
        const launch = launchOf(site)
        if (!launch) return true
        if (NAMED_BY_THE_AGENCY.includes(site.id)) {
          return !site.lunarLaunch.sourceUrl.startsWith('https://science.nasa.gov/mission/')
        }
        return !`${launch.Flight} ${launch.Mission}`.toLowerCase().includes(site.lunarLaunch.mission.toLowerCase())
      })
    expect(names(wrong)).toEqual([])
  })
})
