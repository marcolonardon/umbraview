/* O céu de um ponto no período que a tela mostra, com o relevo do site: o caminho do card E1
 * (horizonte, posição do Sol e da Terra, série hora a hora e resumo) num lugar só, para a ponte
 * (src/hooks/useSiteSky.js) não repetir a ordem nem os parâmetros.
 *
 * Ele guarda o que dá para aproveitar de um pedido para o outro, porque a tela pede de novo a
 * cada troca de ponto ou de data, e a conta trava a página enquanto roda:
 * - o manifest.json, lido uma vez, e o relevo já baixado (o cache de loadReliefLayers);
 * - a posição do Sol e da Terra de cada período já calculado, que depende só da data e serve para
 *   qualquer ponto: os da busca da próxima janela também (card C18);
 * - o último horizonte, que depende só do ponto e serve para qualquer data.
 *
 * readFile(caminho) é a de loadReliefLayers (reliefFiles.js): devolve uma Promise de ArrayBuffer,
 * com o caminho relativo a public/data/relief/, e o manifest.json chega por ela também. No site,
 * ela usa fetch; nos testes, lê do disco. Assim este arquivo não toca na página, e a conta pode ir
 * para um Web Worker sem mudar (card E3).
 */
import { HORIZON, MIN_LANDING_WINDOW_HOURS, NEXT_WINDOW_PERIODS, PERIOD_DAYS } from './config.js'
import { computeEphemeris } from './ephemeris.js'
import { latLonToUnit } from './geometry.js'
import { computeHorizon } from './horizon.js'
import { globalMetersPerPixel, isInsideReliefArea, loadGlobalReliefLayers, loadReliefLayers } from './reliefFiles.js'
import { computeSeries } from './series.js'
import { summarizeSky } from './summary.js'

/* Hora a hora, o mesmo passo da comparação com a NASA (scripts/prepare-data/compare-nasa.mjs). */
const STEP_HOURS = 1
const COUNT = (PERIOD_DAYS * 24) / STEP_HOURS
const PERIOD_MS = PERIOD_DAYS * 24 * 3600e3
/* Quantos períodos de Sol e Terra ficam guardados: os da busca de um ponto, duas vezes. Sem
   limite, quem passeia de data em data encheria a memória (cada um tem uns 100 KB). */
const EPHEMERIS_KEPT = 2 * (NEXT_WINDOW_PERIODS + 1)

/* Guarda a Promise, e não o resultado: dois pedidos ao mesmo tempo esperam pela mesma conta. Se
   ela falhar, sai da gaveta, para o pedido seguinte tentar de novo em vez de receber a mesma falha
   para sempre. */
function remember(drawer, key, load) {
  if (drawer.entry === null || drawer.entry.key !== key) {
    const entry = { key, promise: load() }
    drawer.entry = entry
    entry.promise.catch(() => {
      if (drawer.entry === entry) drawer.entry = null
    })
  }
  return drawer.entry.promise
}

export function createSiteSky(readFile) {
  const reliefCache = new Map()
  const manifest = { entry: null }
  const globalManifest = { entry: null }
  const horizon = { entry: null }
  const ephemerides = new Map()
  // o Sol e a Terra do período que começa em startMs, guardados (o mais velho sai primeiro)
  const ephemerisFrom = (startMs) => {
    if (!ephemerides.has(startMs)) {
      if (ephemerides.size >= EPHEMERIS_KEPT) ephemerides.delete(ephemerides.keys().next().value)
      ephemerides.set(startMs, computeEphemeris(startMs, COUNT, STEP_HOURS))
    }
    return ephemerides.get(startMs)
  }
  const summarize = (pointHorizon, startMs) =>
    summarizeSky(computeSeries(pointHorizon, ephemerisFrom(startMs)), {
      minWindowHours: MIN_LANDING_WINDOW_HOURS,
      horizon: pointHorizon,
    })

  /* Sem janela no período, a próxima, olhando os períodos seguintes um a um (card C18). Devolve
     { landingWindow, periodStartUtc, searchedUntilUtc, earthEverAboveHorizon }: a primeira janela achada e
     o começo do período dela (ou null nos dois), até onde a busca foi, e se a Terra passou do
     horizonte matemático alguma vez. Nunca passar é o lado oculto, e aí nenhuma data resolve: a
     regra da janela pede a Terra à vista, para o contato direto. */
  const searchAhead = (pointHorizon, startMs, first) => {
    let earthEverAboveHorizon = first.earthBelowHorizonFraction < 1
    for (let k = 1; k <= NEXT_WINDOW_PERIODS; k++) {
      const periodStartMs = startMs + k * PERIOD_MS
      const sky = summarize(pointHorizon, periodStartMs)
      if (sky.earthBelowHorizonFraction < 1) earthEverAboveHorizon = true
      if (sky.landingWindows.length > 0) {
        return {
          landingWindow: sky.landingWindows[0],
          periodStartUtc: new Date(periodStartMs),
          searchedUntilUtc: new Date(periodStartMs + PERIOD_MS),
          earthEverAboveHorizon,
        }
      }
    }
    return {
      landingWindow: null,
      periodStartUtc: null,
      searchedUntilUtc: new Date(startMs + (NEXT_WINDOW_PERIODS + 1) * PERIOD_MS),
      earthEverAboveHorizon,
    }
  }

  const readJson = async (path) => JSON.parse(new TextDecoder().decode(await readFile(path)))
  const readManifest = () => remember(manifest, 'manifest.json', () => readJson('manifest.json'))
  // o manifesto do relevo da Lua inteira só é lido quando alguém escolhe um ponto fora do polo
  const readGlobalManifest = () => remember(globalManifest, 'global/manifest.json', () => readJson('global/manifest.json'))

  /* site: { lat, lon } em graus. startMs: o começo do período, em milissegundos UTC. Devolve o sky
     de "O que a ponte entrega para a tela" (docs/backlog.md). Dentro da área do polo sul
     (manifest.areaMaxLatDeg), o horizonte vem do relevo fino; fora dela, do relevo da Lua inteira,
     bem mais grosso, e o resultado avisa (sky.terrain). */
  return async function siteSky({ lat, lon }, startMs) {
    const point = latLonToUnit(lat, lon)
    const manifestData = await readManifest()
    const polar = isInsideReliefArea(manifestData, lat)
    const globalData = polar ? null : await readGlobalManifest()
    const pointHorizon = await remember(horizon, `${lat} ${lon}`, async () =>
      computeHorizon(
        polar
          ? await loadReliefLayers(manifestData, point, readFile, reliefCache)
          : await loadGlobalReliefLayers(globalData, point, readFile, reliefCache),
        point,
        HORIZON,
      ),
    )
    const sky = summarize(pointHorizon, startMs)
    return {
      ...sky,
      // null com janela no período; sem nenhuma, o que a busca adiante achou (card C18)
      nextWindow: sky.landingWindows.length > 0 ? null : searchAhead(pointHorizon, startMs, sky),
      terrain: polar
        ? { coarse: false, metersPerPixel: manifestData.near.resolutionM }
        : { coarse: true, metersPerPixel: globalMetersPerPixel(globalData) },
    }
  }
}
