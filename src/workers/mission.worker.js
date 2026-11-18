/* A missão simulada, calculada fora da linha principal da página: a mira integra o caminho da
 * Terra à Lua dezenas de vezes, e na linha principal a página daria um tranco a cada troca de
 * base ou de janela. A conta é do motor (mission.js); aqui fica só a conversa com a página.
 *
 * A página manda { id, launchSite, landingSite, landingWindow }: o número do pedido, a base e o
 * local de pouso ({ lat, lon } em graus) e a janela de pouso ({ startUtc, endUtc }, dois Date). A
 * resposta é { id, mission, elapsedMs } ou { id, error }: error quando nenhum caminho foi achado.
 */
import { computeMission } from '../engine/mission.js'

self.onmessage = ({ data: { id, launchSite, landingSite, landingWindow } }) => {
  try {
    const started = performance.now()
    const mission = computeMission({ launchSite, landingSite, landingWindow })
    const elapsedMs = performance.now() - started
    // os pontos do caminho mudam de dono em vez de serem copiados: são uns 8 mil por missão
    const buffers = mission.segments.flatMap((segment) => [segment.timesMs.buffer, segment.positionsKm.buffer])
    self.postMessage({ id, mission, elapsedMs }, buffers)
  } catch (error) {
    self.postMessage({ id, error: String(error) })
  }
}
