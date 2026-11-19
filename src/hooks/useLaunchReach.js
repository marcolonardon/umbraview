/* A ponte da conta rápida de quais bases servem para a janela escolhida (card C19): para cada base,
 * se ela lança na direção que permite até a órbita da missão (launchReach, em src/engine/mission.js).
 *
 * Roda na linha principal, e não num Worker como a missão: é só a geometria do lançamento, sem
 * mirar a travessia, e as 15 bases levam uns 20 ms (medido em 19/11/2026 no Node, no computador do
 * Marco). A conta só é refeita quando a janela muda: as bases e o local de pouso não entram nela.
 */
import { useMemo } from 'react'

import { launchReach } from '../engine/mission.js'

/* launchSites: as bases, com id, lat, lon e azimuthLimits. landingWindow: { startUtc, endUtc }, ou
   null enquanto não há janela. compute: a conta; só os testes trocam. Devolve
   { [id]: 'ok' | 'blocked' | 'unchecked' }, ou null sem janela. */
export function useLaunchReach(launchSites, landingWindow, compute = launchReach) {
  const startMs = landingWindow?.startUtc.getTime()
  const endMs = landingWindow?.endUtc.getTime()
  return useMemo(
    () =>
      startMs === undefined
        ? null
        : compute({ launchSites, landingWindow: { startUtc: new Date(startMs), endUtc: new Date(endMs) } }),
    [launchSites, startMs, endMs, compute],
  )
}
