/* As direções de lançamento de uma base (card C19). Cada base só lança para alguns lados: a subida
 * não pode passar por cima de cidade nem de outro país. A faixa permitida de cada base fica em
 * src/data/launchSites.js (azimuthLimits), com a fonte; sem fonte ela é null, e nada é barrado.
 *
 * O azimute é medido no chão da base, do norte para o leste, de 0° a 360°, na direção em que a
 * nave anda no plano da órbita no instante do lançamento. O plano é o do referencial que não gira
 * com a Terra (o do motor da missão, mission.js): o giro da Terra, que a nave já leva de saída,
 * desloca o rumo de verdade no chão em alguns graus, e não entra aqui (o card C19 diz quanto).
 */

const DEG = 180 / Math.PI

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = (a) => {
  const length = Math.hypot(a[0], a[1], a[2])
  return [a[0] / length, a[1] / length, a[2] / length]
}

/* pad: a direção da base a partir do centro da Terra. planeNormal: a normal do plano da órbita (de
   tamanho 1), no sentido em que a nave gira (posição × velocidade). earthPole: o polo norte da
   Terra, de tamanho 1. Os três no mesmo referencial. Devolve o azimute em graus, de 0 a 360. */
export function launchAzimuthDeg(pad, planeNormal, earthPole) {
  const up = unit(pad)
  const east = unit(cross(earthPole, up))
  const north = cross(up, east)
  const heading = cross(planeNormal, up)
  const azimuth = Math.atan2(dot(heading, east), dot(heading, north)) * DEG
  return azimuth < 0 ? azimuth + 360 : azimuth
}

/* limits: a lista de faixas permitidas, [{ minDeg, maxDeg }], ou null quando a base não tem fonte
   conferida. azimuthDeg: o azimute, de 0 a 360. marginDeg: quanto cada faixa encolhe por dentro;
   a busca do horário usa uma margem, porque a mira ainda gira um pouco o plano depois dela.
   Devolve se o azimute pode ser usado. */
export function allowsAzimuth(limits, azimuthDeg, marginDeg = 0) {
  if (limits === null || limits === undefined) return true
  return limits.some(({ minDeg, maxDeg }) => azimuthDeg >= minDeg + marginDeg && azimuthDeg <= maxDeg - marginDeg)
}
