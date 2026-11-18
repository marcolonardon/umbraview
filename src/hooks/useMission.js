/* A ponte entre o motor e a tela para a missão simulada (card C15): o caminho de uma base de
 * lançamento até um local de pouso, dentro de uma janela de pouso, no formato de "What the bridge
 * delivers to the screen" (docs/backlog.md).
 *
 * A conta roda num Worker (src/workers/mission.worker.js): são dezenas de caminhos integrados, e
 * na linha principal a página daria um tranco a cada troca de base ou de janela. O Worker só
 * nasce no primeiro pedido.
 *
 * O status 'loading' não é guardado: sai da comparação entre o pedido de agora e o pedido que
 * gerou o último resultado, como no useSiteSky. Assim, no mesmo render em que a base muda, a tela
 * já recebe 'loading' sem a missão anterior: uma linha saindo da base antiga com a marca na nova
 * seria um erro na tela.
 */
import { useEffect, useRef, useState } from 'react'

function workerOfPage() {
  return new Worker(new URL('../workers/mission.worker.js', import.meta.url), { type: 'module' })
}

const IDLE = Object.freeze({ status: 'idle', mission: null })
const LOADING = Object.freeze({ status: 'loading', mission: null })
const ERROR = Object.freeze({ status: 'error', mission: null })

/* launchSite: a base na Terra, { lat, lon } em graus. landingSite: o local na Lua, { lat, lon }.
   landingWindow: uma janela de sky.landingWindows, { startUtc, endUtc }. Qualquer um pode ser null
   enquanto não foi escolhido. createWorker: quem cria o Worker; só os testes trocam, e precisa ser
   sempre a mesma função, porque está nas dependências do efeito.

   Devolve { status, mission }: status é 'idle' (falta escolher algo), 'loading', 'ready' ou
   'error' (nenhum caminho foi achado, ou a conta falhou); mission, no 'ready', é o resultado do
   computeMission (src/engine/mission.js) mais elapsedMs, quanto a conta levou. */
export function useMission(launchSite, landingSite, landingWindow, createWorker = workerOfPage) {
  const launchLat = launchSite?.lat
  const launchLon = launchSite?.lon
  const landingLat = landingSite?.lat
  const landingLon = landingSite?.lon
  const startMs = landingWindow?.startUtc.getTime()
  const endMs = landingWindow?.endUtc.getTime()
  // o pedido é feito de números: um objeto novo com os mesmos valores não refaz a conta
  const request =
    launchSite && landingSite && landingWindow ? `${launchLat} ${launchLon} ${landingLat} ${landingLon} ${startMs} ${endMs}` : null
  const [done, setDone] = useState({ request: null, result: IDLE })
  const worker = useRef(null)
  const lastId = useRef(0)

  // o Worker vive enquanto o componente estiver na tela
  useEffect(
    () => () => {
      worker.current?.terminate()
      worker.current = null
    },
    [],
  )

  useEffect(() => {
    if (request === null) return
    let current = true
    const id = ++lastId.current
    try {
      worker.current ??= createWorker()
    } catch (error) {
      console.error('useMission: a conta da missão não pôde começar', error)
      queueMicrotask(() => current && setDone({ request, result: ERROR }))
      return () => {
        current = false
      }
    }
    const active = worker.current
    const onMessage = ({ data }) => {
      if (!current || data.id !== id) return
      if (data.error) {
        // a tela recebe só o status; o motivo (a mira não fechou, a travessia não cabe...) vai para o console
        console.error('useMission: a conta da missão falhou', data.error)
        setDone({ request, result: ERROR })
      } else {
        setDone({ request, result: { status: 'ready', mission: { ...data.mission, elapsedMs: data.elapsedMs } } })
      }
    }
    active.addEventListener('message', onMessage)
    active.postMessage({
      id,
      launchSite: { lat: launchLat, lon: launchLon },
      landingSite: { lat: landingLat, lon: landingLon },
      landingWindow: { startUtc: new Date(startMs), endUtc: new Date(endMs) },
    })
    return () => {
      current = false
      active.removeEventListener('message', onMessage)
    }
  }, [request, launchLat, launchLon, landingLat, landingLon, startMs, endMs, createWorker])

  if (request === null) return IDLE
  return done.request === request ? done.result : LOADING
}
