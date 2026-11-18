/* Onde uma nave está depois de um tempo, dada a posição, a velocidade e o instante de partida: o
 * propagador de órbitas (card C14). A missão simulada (card C15) é desenhada em cima dele.
 *
 * A nave obedece à gravidade da Terra, da Lua e do Sol, cada um como um ponto com toda a massa no
 * centro, e cada um na posição de verdade em cada instante (o astronomy-engine, o mesmo das
 * outras contas do motor). Não entram: o achatamento da Terra, o ar, a pressão da luz do Sol, a
 * gravidade desigual da Lua e o motor da nave. Uma queima é uma troca de velocidade entre duas
 * chamadas, feita por quem chama.
 *
 * Tudo é contado a partir do centro da Terra, no equatorial J2000, em km e km/s: o mesmo
 * referencial do earthSiteEquatorialKm (earthSite.js). Um estado é
 * { dateMs, positionKm: [x, y, z], velocityKmS: [vx, vy, vz] }, com o instante em milissegundos
 * UTC.
 *
 * Contra a trajetória voada da Artemis I (JPL Horizons), a conta fica a menos de 3 m depois de
 * 4 horas de voo livre e a 40 m depois de 20 horas; sem o Sol, a 56 km nas mesmas 20 horas
 * (orbit.test.js, medido em 18/11/2026).
 *
 * O instante vira data pelo MakeTime, como no resto do motor. Para 2022 ele põe o tempo das
 * efemérides 4 s adiante do de verdade (73,2 s depois do UTC, e não 69,2 s), e a Lua anda 4 km
 * nesse tempo. Com o tempo de verdade no lugar, a comparação com a Artemis I deu o mesmo: 2,2 m
 * contra 2,8 m nos pedaços de 4 horas, e 40 m nas 20 horas (medido em 18/11/2026).
 */
import { Body, GeoMoonState, HelioState, MakeTime } from 'astronomy-engine'

import { ORBIT } from './config.js'
import { AU_KM } from './system.js'

/* A gravidade de cada corpo: a constante G vezes a massa dele, em km³/s². JPL, Astrodynamic
   Parameters, com os valores da efeméride DE440 (ssd.jpl.nasa.gov/astro_par.html, lida em
   18/11/2026; CREDITS.md). O do Sol está lá em m³/s²: 1.32712440041279419 × 10²⁰. */
export const GM_KM3_S2 = Object.freeze({
  earth: 398600.435507,
  moon: 4902.800118,
  sun: 132712440041.279419,
})

const DAY_S = 86400
const ALL_GRAVITY = Object.freeze({ moon: 1, sun: 1 })

/* A Lua e o Sol entre startMs e endMs, lidos do astronomy-engine uma vez, de ORBIT.gridStepS em
   ORBIT.gridStepS, e depois só interpolados. O propagador pergunta onde eles estão 4 vezes por
   passo, e a missão do card C15 refaz o caminho dezenas de vezes: chamar o astronomy-engine em
   cada pergunta é o que deixaria a conta lenta.

   Entre dois pontos da grade, a posição segue uma curva de 3º grau que passa pelos dois com a
   velocidade certa em cada um (a interpolação de Hermite). Por isso a grade guarda a velocidade
   também.

   Devolve { startMs, endMs, moon(dateMs), sun(dateMs) }: cada um dá { positionKm, velocityKmS }
   a partir do centro da Terra, e recusa um instante fora do período. moonInto e sunInto são os
   mesmos, para o propagador: escrevem em out, sem criar objeto e sem conferir o período. */
export function createEphemeris(startMs, endMs) {
  if (!(endMs >= startMs)) throw new RangeError('o período da efeméride termina antes de começar')
  const stepS = ORBIT.gridStepS
  const stepMs = stepS * 1000
  const intervals = Math.max(1, Math.ceil((endMs - startMs) / stepMs))
  const moonGrid = new Float64Array((intervals + 1) * 6)
  const sunGrid = new Float64Array((intervals + 1) * 6)
  const speed = AU_KM / DAY_S // de UA por dia, a unidade do astronomy-engine, para km/s
  for (let i = 0; i <= intervals; i += 1) {
    const time = MakeTime(new Date(startMs + i * stepMs))
    const moon = GeoMoonState(time)
    moonGrid.set([moon.x * AU_KM, moon.y * AU_KM, moon.z * AU_KM, moon.vx * speed, moon.vy * speed, moon.vz * speed], i * 6)
    // o Sol visto da Terra é a Terra vista do Sol, ao contrário
    const earth = HelioState(Body.Earth, time)
    sunGrid.set([-earth.x * AU_KM, -earth.y * AU_KM, -earth.z * AU_KM, -earth.vx * speed, -earth.vy * speed, -earth.vz * speed], i * 6)
  }

  const interpolate = (grid, dateMs, out) => {
    const position = (dateMs - startMs) / stepMs
    const i = Math.min(intervals - 1, Math.max(0, Math.floor(position)))
    const u = position - i
    const a = i * 6
    const b = a + 6
    const u2 = u * u
    const u3 = u2 * u
    // os quatro pesos de Hermite, e a derivada de cada um, que dá a velocidade
    const p0 = 2 * u3 - 3 * u2 + 1
    const p1 = -2 * u3 + 3 * u2
    const v0 = (u3 - 2 * u2 + u) * stepS
    const v1 = (u3 - u2) * stepS
    const dp = (6 * u2 - 6 * u) / stepS // a de p1 é a mesma com o sinal trocado
    const dv0 = 3 * u2 - 4 * u + 1
    const dv1 = 3 * u2 - 2 * u
    for (let k = 0; k < 3; k += 1) {
      out[k] = p0 * grid[a + k] + p1 * grid[b + k] + v0 * grid[a + 3 + k] + v1 * grid[b + 3 + k]
      out[3 + k] = dp * (grid[a + k] - grid[b + k]) + dv0 * grid[a + 3 + k] + dv1 * grid[b + 3 + k]
    }
    return out
  }
  const checked = (grid) => (dateMs) => {
    if (!(dateMs >= startMs && dateMs <= endMs)) {
      throw new RangeError(`o instante ${new Date(dateMs).toISOString()} está fora do período da efeméride`)
    }
    const state = interpolate(grid, dateMs, new Float64Array(6))
    return { positionKm: [state[0], state[1], state[2]], velocityKmS: [state[3], state[4], state[5]] }
  }
  return {
    startMs,
    endMs,
    moon: checked(moonGrid),
    sun: checked(sunGrid),
    moonInto: (dateMs, out) => interpolate(moonGrid, dateMs, out),
    sunInto: (dateMs, out) => interpolate(sunGrid, dateMs, out),
  }
}

/* A nave num instante, e como andar um passo com ela. y são os 6 números do estado: a posição e a
   velocidade. O passo é o Runge-Kutta de 4ª ordem: a aceleração é calculada no começo, duas vezes
   no meio e no fim do passo, e a média pesada das quatro leva a nave adiante. */
function createStepper(state, ephemeris, gravity) {
  const moonGm = GM_KM3_S2.moon * gravity.moon
  const sunGm = GM_KM3_S2.sun * gravity.sun
  if ((moonGm !== 0 || sunGm !== 0) && !ephemeris) {
    throw new Error('sem efeméride, o propagador só tem a gravidade da Terra: passe { ephemeris } ou gravity { moon: 0, sun: 0 }')
  }
  if (ephemeris && state.dateMs < ephemeris.startMs) {
    throw new RangeError('o estado de partida é anterior ao período da efeméride')
  }
  const y = Float64Array.of(...state.positionKm, ...state.velocityKmS)
  const body = new Float64Array(6)
  const k1 = new Float64Array(3)
  const k2 = new Float64Array(3)
  const k3 = new Float64Array(3)
  const k4 = new Float64Array(3)

  /* O puxão de um corpo que não é a Terra, visto de quem está preso ao centro da Terra: o que ele
     faz na nave menos o que faz na própria Terra. É a diferença que importa: o Sol puxa a Terra e
     a nave quase igual, e só o "quase" muda o caminho de uma em relação à outra. */
  const addThirdBody = (gm, px, py, pz, out) => {
    const dx = body[0] - px
    const dy = body[1] - py
    const dz = body[2] - pz
    const d2 = dx * dx + dy * dy + dz * dz
    const s2 = body[0] * body[0] + body[1] * body[1] + body[2] * body[2]
    const toCraft = gm / (d2 * Math.sqrt(d2))
    const toEarth = gm / (s2 * Math.sqrt(s2))
    out[0] += toCraft * dx - toEarth * body[0]
    out[1] += toCraft * dy - toEarth * body[1]
    out[2] += toCraft * dz - toEarth * body[2]
  }
  const acceleration = (dateMs, px, py, pz, out) => {
    const r2 = px * px + py * py + pz * pz
    const earth = -GM_KM3_S2.earth / (r2 * Math.sqrt(r2))
    out[0] = earth * px
    out[1] = earth * py
    out[2] = earth * pz
    if (moonGm !== 0) {
      ephemeris.moonInto(dateMs, body)
      addThirdBody(moonGm, px, py, pz, out)
    }
    if (sunGm !== 0) {
      ephemeris.sunInto(dateMs, body)
      addThirdBody(sunGm, px, py, pz, out)
    }
  }

  const stepper = {
    dateMs: state.dateMs,
    y,
    /* O tamanho do próximo passo, em segundos: uma fração do tempo que a gravidade leva para
       mudar o caminho ali, que é √(distância³ / GM) (para uma órbita circular, o período dividido
       por 2π). Vale o corpo que manda mais: perto da Terra ou da Lua o passo encurta, e no meio
       do caminho bate no teto. */
    nextStepS() {
      const r2 = y[0] * y[0] + y[1] * y[1] + y[2] * y[2]
      let pace = (r2 * Math.sqrt(r2)) / GM_KM3_S2.earth
      if (moonGm !== 0) {
        ephemeris.moonInto(stepper.dateMs, body)
        const d2 = (body[0] - y[0]) ** 2 + (body[1] - y[1]) ** 2 + (body[2] - y[2]) ** 2
        pace = Math.min(pace, (d2 * Math.sqrt(d2)) / moonGm)
      }
      return Math.min(ORBIT.maxStepS, ORBIT.stepFraction * Math.sqrt(pace))
    },
    step(dtS) {
      const t = stepper.dateMs
      const half = dtS / 2
      const [px, py, pz, vx, vy, vz] = y
      acceleration(t, px, py, pz, k1)
      const v2x = vx + half * k1[0]
      const v2y = vy + half * k1[1]
      const v2z = vz + half * k1[2]
      acceleration(t + half * 1000, px + half * vx, py + half * vy, pz + half * vz, k2)
      const v3x = vx + half * k2[0]
      const v3y = vy + half * k2[1]
      const v3z = vz + half * k2[2]
      acceleration(t + half * 1000, px + half * v2x, py + half * v2y, pz + half * v2z, k3)
      const v4x = vx + dtS * k3[0]
      const v4y = vy + dtS * k3[1]
      const v4z = vz + dtS * k3[2]
      acceleration(t + dtS * 1000, px + dtS * v3x, py + dtS * v3y, pz + dtS * v3z, k4)
      const sixth = dtS / 6
      y[0] = px + sixth * (vx + 2 * v2x + 2 * v3x + v4x)
      y[1] = py + sixth * (vy + 2 * v2y + 2 * v3y + v4y)
      y[2] = pz + sixth * (vz + 2 * v2z + 2 * v3z + v4z)
      y[3] = vx + sixth * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0])
      y[4] = vy + sixth * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])
      y[5] = vz + sixth * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2])
      stepper.dateMs = t + dtS * 1000
    },
    /* Um passo pela regra do nextStepS, sem passar de untilMs: o último passo é mais curto e
       termina no instante exato, sem a sobra da soma de muitos passos. */
    stepToward(untilMs) {
      const dtS = stepper.nextStepS()
      if (stepper.dateMs + dtS * 1000 >= untilMs) {
        stepper.step((untilMs - stepper.dateMs) / 1000)
        stepper.dateMs = untilMs
      } else {
        stepper.step(dtS)
      }
    },
    state: () => ({ dateMs: stepper.dateMs, positionKm: [y[0], y[1], y[2]], velocityKmS: [y[3], y[4], y[5]] }),
  }
  return stepper
}

function checkLimit(state, untilMs, ephemeris) {
  if (untilMs < state.dateMs) throw new RangeError('o propagador só anda para a frente no tempo')
  if (ephemeris && untilMs > ephemeris.endMs) {
    throw new RangeError('o instante pedido passa do período da efeméride')
  }
}

/* Leva a nave de state até o instante untilMs e devolve o estado lá. Não mexe em state.
   ephemeris: a Lua e o Sol do período (createEphemeris); só pode faltar com a gravidade dos dois
   desligada.
   gravity: quanto da gravidade da Lua e do Sol entra, de 0 a 1: { moon, sun }. Por padrão, toda.
   A mira do card C15 começa só com a Terra e vai ligando os outros dois aos poucos.
   onStep: chamada depois de cada passo com o estado daquele instante, para quem guarda o caminho. */
export function propagate(state, untilMs, { ephemeris, gravity = ALL_GRAVITY, onStep } = {}) {
  checkLimit(state, untilMs, ephemeris)
  const stepper = createStepper(state, ephemeris, gravity)
  while (stepper.dateMs < untilMs) {
    stepper.stepToward(untilMs)
    if (onStep) onStep(stepper.state())
  }
  return stepper.state()
}

/* Quantas vezes o instante da passagem é cortado ao meio dentro do passo em que ela aconteceu:
   com 40, um passo de 120 s fica menor que o que um número de ponto flutuante distingue. */
const PASS_BISECTIONS = 40

/* Leva a nave de state até o ponto em que ela passa mais perto do centro da Lua, e devolve o
   estado lá, com a nave vista da Lua:
   { dateMs, positionKm, velocityKmS, fromMoonKm, fromMoonKmS, distanceKm }.
   fromMoonKm e fromMoonKmS são a posição e a velocidade a partir do centro da Lua (no mesmo
   equatorial J2000, sem girar com ela), e distanceKm é o tamanho de fromMoonKm. É o alvo da mira
   do card C15: a altura da passagem, o plano dela e a hora.

   A passagem é o primeiro instante em que a nave para de se aproximar da Lua e começa a se
   afastar. Devolve null se isso não acontece até limitMs. As opções são as do propagate. */
export function propagateToMoonPass(state, limitMs, { ephemeris, gravity = ALL_GRAVITY, onStep } = {}) {
  if (!ephemeris) throw new Error('a passagem pela Lua precisa da efeméride: passe { ephemeris }')
  checkLimit(state, limitMs, ephemeris)
  const stepper = createStepper(state, ephemeris, gravity)
  const { y } = stepper
  const moon = new Float64Array(6)
  /* Positivo quando a nave se afasta da Lua, negativo quando se aproxima: a posição a partir da
     Lua vezes a velocidade a partir dela. Na passagem, vale zero. */
  const separation = () => {
    ephemeris.moonInto(stepper.dateMs, moon)
    return (y[0] - moon[0]) * (y[3] - moon[3]) + (y[1] - moon[1]) * (y[4] - moon[4]) + (y[2] - moon[2]) * (y[5] - moon[5])
  }
  const before = new Float64Array(6)
  let wasApproaching = separation() < 0
  while (stepper.dateMs < limitMs) {
    const startMs = stepper.dateMs
    before.set(y)
    stepper.stepToward(limitMs)
    const approaching = separation() < 0
    if (wasApproaching && !approaching) {
      // a passagem está dentro deste passo: refaz o passo com tamanhos menores até achar o instante
      let low = 0
      let high = (stepper.dateMs - startMs) / 1000
      for (let i = 0; i < PASS_BISECTIONS; i += 1) {
        const middle = (low + high) / 2
        y.set(before)
        stepper.dateMs = startMs
        stepper.step(middle)
        if (separation() < 0) low = middle
        else high = middle
      }
      y.set(before)
      stepper.dateMs = startMs
      stepper.step(high)
      const pass = stepper.state()
      if (onStep) onStep(pass)
      ephemeris.moonInto(pass.dateMs, moon)
      const fromMoonKm = [y[0] - moon[0], y[1] - moon[1], y[2] - moon[2]]
      return {
        ...pass,
        fromMoonKm,
        fromMoonKmS: [y[3] - moon[3], y[4] - moon[4], y[5] - moon[5]],
        distanceKm: Math.hypot(...fromMoonKm),
      }
    }
    if (onStep) onStep(stepper.state())
    wasApproaching = approaching
  }
  return null
}
