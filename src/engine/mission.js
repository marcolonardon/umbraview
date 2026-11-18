/* A missão de referência: de uma base de lançamento na Terra até um local de pouso na Lua, dentro
 * de uma janela de pouso (card C15). É um jeito fisicamente válido de chegar lá, calculado pelo
 * motor, e não o plano de voo de nenhuma missão de verdade.
 *
 * A conta começa pelo fim, que é o que o resto do motor já sabe: o local e a janela de pouso.
 *   1. O pouso é mirado numa hora dentro da janela.
 *   2. A órbita lunar é um círculo cujo plano contém o local de pouso naquela hora.
 *   3. A nave chega da Terra passando à altura desse círculo, e uma queima ali a deixa nele.
 *   4. A travessia são uns 4 dias sem motor, com a Terra, a Lua e o Sol puxando (orbit.js).
 *   5. A saída é uma queima na direção do movimento, na órbita de espera em volta da Terra.
 *   6. O plano da órbita de espera contém a base no instante do lançamento.
 *   7. O lançamento é na hora do dia em que esse plano fica menos inclinado.
 *
 * A mira tem três escolhas, as mesmas de uma missão de verdade: a velocidade no fim da queima de
 * saída, quanto tempo a nave espera na órbita antes dela (que é onde e quando a queima acontece)
 * e a inclinação do plano em volta da base (a direção do lançamento). E três alvos: a altura da
 * passagem pela Lua, o plano dela contendo o local de pouso, e a hora. São resolvidos pelo método
 * de Newton, com o caminho integrado a cada tentativa.
 *
 * O que é conta e o que é desenho: as órbitas e a travessia são integradas; as queimas são trocas
 * de velocidade num instante; a subida da base até a órbita e a descida final até o chão são
 * curvas desenhadas entre dois pontos calculados, e saem marcadas como 'schematic'.
 *
 * designMission devolve a missão no referencial do motor (equatorial J2000, a partir do centro da
 * Terra), com os estados de cada evento, para os testes e para quem precisar da física.
 * computeMission devolve o que a tela usa: os instantes, os números e os trechos do caminho.
 */
import { AIMING, MISSION } from './config.js'
import { EARTH_EQUATORIAL_RADIUS_KM, EARTH_SIDEREAL_DAY_HOURS, earthSiteEquatorialKm } from './earthSite.js'
import { moonFixedFrameAt } from './ephemeris.js'
import { MOON_RADIUS_M, latLonToUnit } from './geometry.js'
import { GM_KM3_S2, createEphemeris, propagate, propagateToMoonPass } from './orbit.js'
import { ECLIPTIC_SKY_MATRIX } from './system.js'

const DEG = Math.PI / 180
const TWO_PI = 2 * Math.PI
const HOUR_MS = 3600e3
const DAY_MS = 24 * HOUR_MS
const MOON_RADIUS_KM = MOON_RADIUS_M / 1000
const ALL_GRAVITY = Object.freeze({ moon: 1, sun: 1 })

/* De quanto em quanto tempo a inclinação é olhada para achar a hora do lançamento, antes de
   refinar: em 4 minutos a Terra gira 1°, e os dois mínimos do dia ficam a horas um do outro. */
const LAUNCH_SEARCH_STEP_MS = 4 * 60e3
// dois horários contam como "a menor inclinação" se diferem menos que isto
const SAME_INCLINATION = 0.05 * DEG
/* Se o primeiro chute põe a queima de saída a menos que isto da entrada na órbita, a nave dá mais
   uma volta antes: a mira pode puxar a queima para mais cedo, e ela não pode cair antes de a
   nave estar na órbita. */
const MIN_COAST_S = 300
/* De quanto cada escolha é mexida para medir o efeito dela na passagem: 1 mm/s na velocidade,
   1 ms na espera e 1 milionésimo de radiano no plano. Cada um desloca a passagem em centenas de
   metros a poucos km: bem mais que o arredondamento do integrador, e pouco para a curva entortar. */
const AIM_STEPS = Object.freeze([1e-6, 1e-3, 1e-6])
// quantos pontos tem cada curva desenhada (a subida e a descida final)
const SCHEMATIC_POINTS = 24

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k]
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const norm = (a) => Math.hypot(a[0], a[1], a[2])
const unit = (a) => scale(a, 1 / norm(a))
const angleBetween = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (norm(a) * norm(b)))))
// gira v em volta do eixo (de tamanho 1) pelo ângulo, no sentido da mão direita
const rotate = (v, axis, angle) => {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return add(add(scale(v, c), scale(cross(axis, v), s)), scale(axis, dot(axis, v) * (1 - c)))
}
// o ângulo de a até b, de 0 a 2π, andando em volta de n
const angleAround = (a, b, n) => {
  const angle = Math.atan2(dot(cross(a, b), n), dot(a, b))
  return angle < 0 ? angle + TWO_PI : angle
}

/* Do fixo da Lua para o equatorial num instante: o giro do ephemeris.js ao contrário. As colunas
   do giro de ida são para onde vão os três eixos do equatorial. */
function moonToEquatorial(dateMs) {
  const toFixed = moonFixedFrameAt(dateMs)
  const columns = [toFixed(1, 0, 0), toFixed(0, 1, 0), toFixed(0, 0, 1)]
  return (v) => columns.map((column) => dot(column, v))
}

/* A elipse em volta da Terra que sai do ponto mais baixo (a perigeeKm do centro) e chega a
   targetKm do centro em flightS segundos. Devolve a velocidade no ponto mais baixo e o ângulo
   andado até lá, ou null se nenhuma elipse faz isso. A mais lenta é a que tem o ponto mais alto
   bem no alvo: é o teto do tempo de travessia. Quanto mais alto o ponto mais alto, mais rápida a
   subida, e a busca corta esse intervalo ao meio até achar o tempo pedido. */
function departureEllipse(perigeeKm, targetKm, flightS) {
  const flight = (apogeeKm) => {
    const a = (perigeeKm + apogeeKm) / 2
    const e = (apogeeKm - perigeeKm) / (apogeeKm + perigeeKm)
    const E = Math.acos(Math.max(-1, Math.min(1, (1 - targetKm / a) / e)))
    return { a, e, timeS: Math.sqrt(a ** 3 / GM_KM3_S2.earth) * (E - e * Math.sin(E)) }
  }
  let slow = targetKm
  let fast = targetKm * 50
  if (flightS > flight(slow).timeS || flightS < flight(fast).timeS) return null
  for (let i = 0; i < 60; i += 1) {
    const middle = Math.sqrt(slow * fast)
    if (flight(middle).timeS > flightS) slow = middle
    else fast = middle
  }
  const { a, e } = flight(fast)
  return {
    speedKmS: Math.sqrt(GM_KM3_S2.earth * (2 / perigeeKm - 1 / a)),
    sweep: Math.acos(Math.max(-1, Math.min(1, ((a * (1 - e * e)) / targetKm - 1) / e))),
  }
}

// resolve A · x = b, com A de 3 × 3, por eliminação; null se A não tem inversa
function solve3(A, b) {
  const m = A.map((row, i) => [...row, b[i]])
  for (let c = 0; c < 3; c += 1) {
    let pivot = c
    for (let r = c + 1; r < 3; r += 1) if (Math.abs(m[r][c]) > Math.abs(m[pivot][c])) pivot = r
    const row = m[pivot]
    m[pivot] = m[c]
    m[c] = row
    if (Math.abs(row[c]) < 1e-300) return null
    for (let r = 0; r < 3; r += 1) {
      if (r === c) continue
      const k = m[r][c] / row[c]
      for (let j = c; j < 4; j += 1) m[r][j] -= k * row[j]
    }
  }
  return [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]]
}

/* launchSite e landingSite: { lat, lon } em graus (a base na Terra e o local na Lua).
   landingWindow: a janela de pouso, { startUtc, endUtc }, como vem em sky.landingWindows.
   parameters: os números da missão (MISSION, no config.js); só os testes trocam.

   Devolve a missão no referencial do motor: os instantes em milissegundos UTC, os estados
   { dateMs, positionKm, velocityKmS } de cada evento, os números e o caminho de cada trecho
   integrado (paths). Lança um erro quando não há caminho: a tela mostra que não achou. */
export function designMission({ launchSite, landingSite, landingWindow }, parameters = MISSION) {
  const windowStartMs = landingWindow.startUtc.getTime()
  const windowEndMs = landingWindow.endUtc.getTime()
  if (!(windowEndMs > windowStartMs)) throw new Error('a janela de pouso termina antes de começar')
  const landingAimMs = windowStartMs + Math.min(parameters.landingAimHours * HOUR_MS, (windowEndMs - windowStartMs) / 2)

  const parkingKm = EARTH_EQUATORIAL_RADIUS_KM + parameters.parkingAltitudeKm
  const parkingSpeed = Math.sqrt(GM_KM3_S2.earth / parkingKm)
  const parkingRate = parkingSpeed / parkingKm // radianos por segundo
  const ascentMs = parameters.ascentMinutes * 60e3
  const ascentArc = parameters.ascentArcDeg * DEG

  const lunarKm = MOON_RADIUS_KM + parameters.lunarOrbitAltitudeKm
  const lunarRate = Math.sqrt(GM_KM3_S2.moon / lunarKm ** 3)
  const lowPointKm = MOON_RADIUS_KM + parameters.descentLowPointKm
  // a elipse de descida: meia volta, do círculo até o ponto baixo
  const descentMs = Math.PI * Math.sqrt(((lunarKm + lowPointKm) / 2) ** 3 / GM_KM3_S2.moon) * 1000
  const poweredMs = parameters.poweredDescentMinutes * 60e3
  const poweredArc = parameters.poweredDescentArcDeg * DEG
  const stayMs = parameters.lunarOrbitStayHours * HOUR_MS
  const crossingMs = parameters.crossingDays * DAY_MS

  // o local de pouso e o polo norte da Lua no espaço, no instante do pouso
  const toEquatorial = moonToEquatorial(landingAimMs)
  const landingSiteDirection = toEquatorial(latLonToUnit(landingSite.lat, landingSite.lon))
  const moonPole = toEquatorial([0, 0, 1])

  // a hora de chegada à Lua, antes de a mira acertar a espera na órbita lunar
  const arrivalMs = landingAimMs - poweredMs - descentMs - stayMs
  const ephemeris = createEphemeris(arrivalMs - crossingMs - 3 * DAY_MS, landingAimMs + DAY_MS)
  const moonAtArrivalKm = ephemeris.moon(arrivalMs).positionKm
  const moonDirection = unit(moonAtArrivalKm)

  /* O lançamento. A travessia é um arco em volta da Terra que termina na Lua, então o plano dela
     contém a direção da Lua na chegada; e contém a base, no instante do lançamento. Conforme a
     Terra gira, a base muda de lugar e esse plano muda de inclinação: duas vezes por dia ele fica
     o menos inclinado que dá, que é a latitude da base ou a altura da Lua sobre o equador, a que
     for maior. A inclinação é medida do polo da Terra na data, e não do de J2000. */
  const nominalLaunchMs = arrivalMs - crossingMs - ascentMs - (Math.PI / parkingRate) * 1000
  const earthPole = unit(earthSiteEquatorialKm(90, 0, nominalLaunchMs))
  const padDirection = (dateMs) => unit(earthSiteEquatorialKm(launchSite.lat, launchSite.lon, dateMs))
  const planeNormal = (dateMs) => {
    const n = cross(padDirection(dateMs), moonDirection)
    const length = norm(n)
    // a base bem embaixo da Lua: todo plano serve, e a conta de um só não existe
    if (length < 1e-9) return null
    // no sentido em que a Terra gira
    return scale(n, (dot(n, earthPole) < 0 ? -1 : 1) / length)
  }
  const inclination = (dateMs) => {
    const n = planeNormal(dateMs)
    return n ? Math.acos(Math.min(1, dot(n, earthPole))) : Math.PI / 2
  }

  const searchMs = EARTH_SIDEREAL_DAY_HOURS * HOUR_MS
  const count = Math.round((2 * searchMs) / LAUNCH_SEARCH_STEP_MS)
  const firstMs = nominalLaunchMs - searchMs
  const samples = Array.from({ length: count + 1 }, (_, i) => inclination(firstMs + i * LAUNCH_SEARCH_STEP_MS))
  const candidates = []
  for (let i = 1; i < count; i += 1) {
    if (samples[i] > samples[i - 1] || samples[i] >= samples[i + 1]) continue
    // o mínimo está entre o ponto de antes e o de depois: corta o intervalo em três até fechar
    let low = firstMs + (i - 1) * LAUNCH_SEARCH_STEP_MS
    let high = low + 2 * LAUNCH_SEARCH_STEP_MS
    for (let k = 0; k < 40; k += 1) {
      const a = low + (high - low) / 3
      const b = high - (high - low) / 3
      if (inclination(a) < inclination(b)) high = b
      else low = a
    }
    const launchMs = (low + high) / 2
    candidates.push({ launchMs, inclination: inclination(launchMs) })
  }
  if (candidates.length === 0) throw new Error('nenhum horário de lançamento encontrado para a base')
  const lowest = Math.min(...candidates.map((candidate) => candidate.inclination))
  // entre os de menor inclinação, primeiro o que deixa a travessia mais perto do tempo pedido
  const ordered = candidates
    .filter((candidate) => candidate.inclination < lowest + SAME_INCLINATION)
    .sort((a, b) => Math.abs(a.launchMs - nominalLaunchMs) - Math.abs(b.launchMs - nominalLaunchMs))

  let failure = null
  for (const candidate of ordered) {
    try {
      return aimFrom(candidate.launchMs)
    } catch (error) {
      failure = error
    }
  }
  throw failure

  function aimFrom(launchMs) {
    const pad = padDirection(launchMs)
    const firstNormal = planeNormal(launchMs)
    const insertionMs = launchMs + ascentMs
    // tilt: quanto o plano é girado em volta da base, a partir do de menor inclinação
    const insertionWith = (tilt) => {
      const normal = rotate(firstNormal, pad, tilt)
      const direction = rotate(pad, normal, ascentArc)
      return {
        normal,
        state: { dateMs: insertionMs, positionKm: scale(direction, parkingKm), velocityKmS: scale(cross(normal, direction), parkingSpeed) },
      }
    }

    /* O primeiro chute, só com a Terra: a elipse que sai da órbita de espera e chega à distância
       da Lua na hora da chegada. O ponto de saída fica do outro lado da Terra, o ângulo da elipse
       antes da Lua; e a hora da saída depende de onde ele fica, por isso a conta dá umas voltas. */
    let coastS = Math.PI / parkingRate
    let tliSpeed = 0
    for (let i = 0; i < 6; i += 1) {
      const flightS = (arrivalMs - insertionMs) / 1000 - coastS
      const ellipse = departureEllipse(parkingKm, norm(moonAtArrivalKm), flightS)
      if (!ellipse) throw new Error('nenhuma elipse chega à Lua no tempo de travessia pedido')
      tliSpeed = ellipse.speedKmS
      const tliDirection = rotate(moonDirection, firstNormal, -ellipse.sweep)
      coastS = angleAround(insertionWith(0).state.positionKm, tliDirection, firstNormal) / parkingRate
      if (coastS < MIN_COAST_S) coastS += TWO_PI / parkingRate
    }

    // de que lado da Lua passar, e quantas voltas dar nela: decididos na primeira conta e mantidos
    let side = 0
    let stayAngle = lunarRate * (stayMs / 1000)

    /* Uma tentativa: com as três escolhas, integra da entrada na órbita de espera até a passagem
       pela Lua e diz quanto faltou em cada alvo. paths, quando vem, recebe o caminho. */
    const attempt = ([speed, coast, tilt], gravity, paths) => {
      if (!(coast >= 0)) return null
      const options = { ephemeris, gravity }
      const { normal, state: insertion } = insertionWith(tilt)
      const tliMs = insertionMs + coast * 1000
      const beforeTli = propagate(insertion, tliMs, { ...options, onStep: paths && ((state) => paths.parking.push(state)) })
      const tli = { ...beforeTli, velocityKmS: scale(unit(beforeTli.velocityKmS), speed) }
      /* A passagem que vale é a de perto da Lua. Logo depois da saída, do outro lado da Terra, a
         nave pode se aproximar e se afastar da Lua uma vez só por estar dando a volta na Terra:
         essa não conta, e a busca segue dali. */
      let from = tli
      let pass = null
      for (;;) {
        pass = propagateToMoonPass(from, landingAimMs, { ...options, onStep: paths && ((state) => paths.crossing.push(state)) })
        if (!pass) return null
        if (pass.distanceKm < norm(pass.positionKm)) break
        from = pass
      }

      /* Os alvos, no plano que a nave atravessa ao passar pela Lua (o plano perpendicular à
         velocidade dela vista da Lua). O plano da órbita contém o local de pouso quando o ponto
         da passagem fica na direção do local projetada nesse plano (across), de um lado ou do
         outro; a distância é o raio da órbita lunar. */
      const along = unit(pass.fromMoonKmS)
      const across = unit(sub(landingSiteDirection, scale(along, dot(landingSiteDirection, along))))
      // o lado em que a órbita lunar gira no mesmo sentido da Lua
      if (side === 0) side = dot(cross(across, along), moonPole) > 0 ? 1 : -1
      const lunarNormal = scale(cross(across, along), side)
      /* A hora: da passagem, a nave anda na órbita lunar até o ponto de onde larga a órbita, do
         lado oposto ao ponto baixo da descida, que fica poweredArc antes do local de pouso. Esse
         ângulo, mais as voltas inteiras que cabem na espera pedida, dá quanto antes do pouso a
         passagem tem que acontecer. */
      const lowPointDirection = rotate(landingSiteDirection, lunarNormal, -poweredArc)
      const untilLeaving = angleAround(scale(across, side), scale(lowPointDirection, -1), lunarNormal)
      stayAngle = untilLeaving + TWO_PI * Math.max(0, Math.round((stayAngle - untilLeaving) / TWO_PI))
      const passAimMs = landingAimMs - poweredMs - descentMs - (stayAngle / lunarRate) * 1000
      return {
        miss: [dot(pass.fromMoonKm, across) - side * lunarKm, dot(pass.fromMoonKm, cross(along, across)), (pass.dateMs - passAimMs) / 1000],
        normal, insertion, beforeTli, tli, pass, stayAngle,
      }
    }
    const closed = (miss) =>
      Math.abs(miss[0]) < AIMING.toleranceKm && Math.abs(miss[1]) < AIMING.toleranceKm && Math.abs(miss[2]) < AIMING.toleranceS
    // um número só para dizer se uma tentativa ficou melhor que a outra: 1 s de atraso vale o 1,6 km que a nave anda nele
    const size = (miss) => Math.hypot(miss[0], miss[1], miss[2] * 1.6)

    let choices = [tliSpeed, coastS, 0]
    for (const fraction of AIMING.gravitySteps) {
      const gravity = { moon: fraction, sun: fraction }
      let current = attempt(choices, gravity)
      if (!current) throw new Error('a nave não chega perto da Lua')
      for (let correction = 0; !closed(current.miss); correction += 1) {
        if (correction === AIMING.maxCorrections) throw new Error('a mira não fechou')
        // quanto cada escolha muda cada alvo: mexe uma de cada vez e integra de novo
        const effect = [[], [], []]
        for (let k = 0; k < 3; k += 1) {
          const moved = choices.slice()
          moved[k] += AIM_STEPS[k]
          const other = attempt(moved, gravity)
          if (!other) throw new Error('a nave não chega perto da Lua')
          for (let r = 0; r < 3; r += 1) effect[r][k] = (other.miss[r] - current.miss[r]) / AIM_STEPS[k]
        }
        const change = solve3(effect, current.miss.map((value) => -value))
        if (!change) throw new Error('a mira não fechou')
        // se a correção inteira piora, tenta a metade, e a metade da metade
        let next = null
        let nextChoices = null
        for (let factor = 1; factor > 0.01; factor /= 2) {
          nextChoices = choices.map((value, k) => value + factor * change[k])
          next = attempt(nextChoices, gravity)
          if (next && size(next.miss) < size(current.miss)) break
          next = null
        }
        if (!next) throw new Error('a mira não fechou')
        choices = nextChoices
        current = next
      }
    }

    // a missão fechada, agora guardando o caminho
    const paths = { parking: [], crossing: [], lunarOrbit: [], descent: [] }
    const { normal, insertion, beforeTli, tli, pass } = attempt(choices, ALL_GRAVITY, paths)
    paths.parking.unshift(insertion)
    paths.crossing.unshift(tli)
    const options = { ephemeris }
    const seenFromMoon = (state) => {
      const moon = ephemeris.moon(state.dateMs)
      return { positionKm: sub(state.positionKm, moon.positionKm), velocityKmS: sub(state.velocityKmS, moon.velocityKmS), moon }
    }
    // a mesma posição, com outra velocidade a partir da Lua: uma queima na direção do movimento
    const burn = (state, speedFromMoon) => {
      const { velocityKmS, moon } = seenFromMoon(state)
      return { ...state, velocityKmS: add(moon.velocityKmS, scale(unit(velocityKmS), speedFromMoon)) }
    }

    // a chegada: a queima que deixa a órbita circular, e a espera nela
    const afterLoi = burn(pass, Math.sqrt(GM_KM3_S2.moon / pass.distanceKm))
    const doiMs = pass.dateMs + (stayAngle / lunarRate) * 1000
    paths.lunarOrbit.push(afterLoi)
    const beforeDoi = propagate(afterLoi, doiMs, { ...options, onStep: (state) => paths.lunarOrbit.push(state) })

    // a descida: a queima que baixa o outro lado da órbita até o ponto baixo, e a meia volta até lá
    const leaving = seenFromMoon(beforeDoi)
    const leavingKm = norm(leaving.positionKm)
    const descentSpeed = Math.sqrt(GM_KM3_S2.moon * (2 / leavingKm - 2 / (leavingKm + lowPointKm)))
    const afterDoi = burn(beforeDoi, descentSpeed)
    paths.descent.push(afterDoi)
    const lowPoint = propagate(afterDoi, doiMs + descentMs, { ...options, onStep: (state) => paths.descent.push(state) })

    const east = unit(cross(earthPole, pad))
    const heading = cross(normal, pad)
    const azimuth = Math.atan2(dot(heading, east), dot(heading, cross(pad, east))) / DEG
    const lunarNormal = unit(cross(pass.fromMoonKm, pass.fromMoonKmS))
    return {
      launchMs,
      doiMs,
      landingMs: lowPoint.dateMs + poweredMs,
      launchSiteKm: earthSiteEquatorialKm(launchSite.lat, launchSite.lon, launchMs),
      parkingNormal: normal,
      lunarNormal,
      landingSiteDirection,
      insertion, beforeTli, tli, pass, afterLoi, beforeDoi, afterDoi, lowPoint,
      launchAzimuthDeg: azimuth < 0 ? azimuth + 360 : azimuth,
      parkingInclinationDeg: angleBetween(normal, earthPole) / DEG,
      lunarInclinationDeg: angleBetween(lunarNormal, moonPole) / DEG,
      tliDeltaVKmS: norm(tli.velocityKmS) - norm(beforeTli.velocityKmS),
      loiDeltaVKmS: norm(pass.fromMoonKmS) - norm(seenFromMoon(afterLoi).velocityKmS),
      doiDeltaVKmS: norm(leaving.velocityKmS) - descentSpeed,
      crossingHours: (pass.dateMs - tli.dateMs) / HOUR_MS,
      paths,
      ephemeris,
    }
  }
}

/* Do equatorial para o desenho do system.js (y para o norte da eclíptica): as três primeiras
   colunas da matriz dele. É o referencial da vista da missão, o mesmo do earthSiteKm e do
   systemStateAt, para a linha cair em cima da Terra e da Lua desenhadas. */
const M = ECLIPTIC_SKY_MATRIX
const writeDrawing = ([x, y, z], out, at) => {
  out[at] = M[0] * x + M[4] * y + M[8] * z
  out[at + 1] = M[1] * x + M[5] * y + M[9] * z
  out[at + 2] = M[2] * x + M[6] * y + M[10] * z
}

// points: [{ dateMs, positionKm }], já contados do centro certo
function segment(phase, kind, center, points) {
  const timesMs = new Float64Array(points.length)
  const positionsKm = new Float32Array(points.length * 3)
  points.forEach((point, i) => {
    timesMs[i] = point.dateMs
    writeDrawing(point.positionKm, positionsKm, 3 * i)
  })
  return { phase, kind, center, timesMs, positionsKm }
}

/* Uma curva desenhada, de um ponto a outro em volta do mesmo centro: a direção gira por igual, o
   tempo corre por igual, e a altura segue height(u), com u de 0 a 1. */
function schematic(fromKm, toKm, fromMs, toMs, height) {
  const start = unit(fromKm)
  const axis = unit(cross(fromKm, toKm))
  const angle = angleBetween(fromKm, toKm)
  return Array.from({ length: SCHEMATIC_POINTS }, (_, i) => {
    const u = i / (SCHEMATIC_POINTS - 1)
    return { dateMs: fromMs + u * (toMs - fromMs), positionKm: scale(rotate(start, axis, angle * u), height(u)) }
  })
}

/* A missão no formato da tela ("What the bridge delivers to the screen", docs/backlog.md):
   os instantes (Date), os números e segments, um trecho por fase.
   Cada trecho: phase ('ascent', 'parking', 'crossing', 'lunarOrbit', 'descent' ou 'landing');
   kind ('integrated', conta, ou 'schematic', desenho); center ('earth' ou 'moon': de onde os
   pontos são contados; os da Lua andam com ela); timesMs, um instante por ponto, em milissegundos
   UTC; e positionsKm, três números por ponto, em km, no desenho do system.js. */
export function computeMission(request, parameters = MISSION) {
  const design = designMission(request, parameters)
  const { ephemeris, paths } = design
  const fromMoon = (state) => ({ dateMs: state.dateMs, positionKm: sub(state.positionKm, ephemeris.moon(state.dateMs).positionKm) })

  const padKm = norm(design.launchSiteKm)
  const orbitKm = norm(design.insertion.positionKm)
  // a subida deixa o chão quase na vertical e chega à órbita já de lado
  const ascent = schematic(design.launchSiteKm, design.insertion.positionKm, design.launchMs, design.insertion.dateMs,
    (u) => padKm + (orbitKm - padKm) * Math.sin((u * Math.PI) / 2))
  const low = fromMoon(design.lowPoint)
  const lowKm = norm(low.positionKm)
  // a descida final sai do ponto baixo de lado e chega ao chão descendo
  const landing = schematic(low.positionKm, design.landingSiteDirection, low.dateMs, design.landingMs,
    (u) => MOON_RADIUS_KM + (lowKm - MOON_RADIUS_KM) * Math.cos((u * Math.PI) / 2))

  return {
    launchUtc: new Date(design.launchMs),
    tliUtc: new Date(design.tli.dateMs),
    loiUtc: new Date(design.pass.dateMs),
    descentUtc: new Date(design.doiMs),
    landingUtc: new Date(design.landingMs),
    launchAzimuthDeg: design.launchAzimuthDeg,
    parkingInclinationDeg: design.parkingInclinationDeg,
    lunarInclinationDeg: design.lunarInclinationDeg,
    tliDeltaVKmS: design.tliDeltaVKmS,
    loiDeltaVKmS: design.loiDeltaVKmS,
    descentDeltaVKmS: design.doiDeltaVKmS,
    crossingHours: design.crossingHours,
    lunarOrbitHours: (design.doiMs - design.pass.dateMs) / HOUR_MS,
    segments: [
      segment('ascent', 'schematic', 'earth', ascent),
      segment('parking', 'integrated', 'earth', paths.parking),
      segment('crossing', 'integrated', 'earth', paths.crossing),
      segment('lunarOrbit', 'integrated', 'moon', paths.lunarOrbit.map(fromMoon)),
      segment('descent', 'integrated', 'moon', paths.descent.map(fromMoon)),
      segment('landing', 'schematic', 'moon', landing),
    ],
  }
}
