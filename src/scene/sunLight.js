/* Onde a cena põe a luz do Sol (card C2).
 *
 * A luz do three é paralela (directionalLight): só a direção dela conta para iluminar, e a
 * direção é do alvo para a posição. O alvo fica no polo sul, e não no centro da Lua, por causa da
 * sombra: o three desenha a sombra numa caixa em volta do alvo, e com o alvo no polo a caixa
 * cobre só o relevo do C2, com detalhe de umas centenas de metros. Em volta do centro, ela teria
 * que cobrir a Lua inteira, com um detalhe quatro vezes pior.
 *
 * Com o relevo da Lua inteira (experimento da branch exp/lua-inteira-com-relevo), as montanhas de
 * fora do polo também fazem sombra, e a caixa passa a acompanhar a câmera (shadowFrame): fica no
 * ponto embaixo dela, do tamanho do chão que a tela mostra. Em cima da área de escolha, perto do
 * chão, ela continua a caixa do polo, acertada no C2 e no C11.
 */
import { latLonToScene } from './coordinates.js'
import { GLOBAL_MAX_ALTITUDE, GLOBAL_VIEW_MARGIN_RAD } from './globalTiles.js'

export const SUN_TARGET = [0, -1, 0]

/* A distância da luz até o alvo, em raios da Lua. Não muda a luz (ela é paralela); só põe a
   caixa da sombra numa distância conhecida, que é de onde saem o near e o far dela na cena. */
export const SUN_DISTANCE = 2

/* O lado do mapa da sombra, em pixels: 2048 é o tamanho que o WebGL 2 garante em qualquer placa de
   vídeo. */
export const SHADOW_MAP_SIZE = 2048

/* A caixa do polo (C2): 0,25 raio para cada lado cobre o relevo do polo visto de qualquer direção,
   com pixels de uns 420 m. Os descontos, em raios da Lua, tiram a sombra listrada que a superfície
   faz nela mesma com o Sol a 1 ou 2 graus do horizonte (o "shadow acne", C11): o normalBias afasta
   a conta uns 350 m da superfície, menos que um pixel da sombra. */
export const POLE_SHADOW = { halfSize: 0.25, bias: -0.00005, normalBias: 0.0002 }

/* Fora do polo, a luz fica a 3 raios do alvo: a caixa cobre a profundidade da Lua inteira (de −1 a
   +1 raio em volta do centro), e com 3 o começo dela nunca chega a zero, qualquer que seja o lado
   do Sol em que o alvo está. */
const FREE_DISTANCE = 3

/* Os tamanhos que a caixa pode ter, de 0,06 raio (uns 100 km) em passos de 1,5 vezes, até cobrir a
   Lua inteira. Mudando aos saltos, e não a cada passo da roda, a grade dos pixels da sombra fica
   parada enquanto a câmera desce, e a borda das sombras não treme. */
const SIZES = (() => {
  const sizes = []
  for (let size = 0.06; size < 1.1; size *= 1.5) sizes.push(size)
  return [...sizes, 1.1]
})()

/* subsolar: { lat, lon }, o ponto onde o Sol está a pino (useSubsolarPoint). A luz vem dessa
   direção, vista do centro da Lua: o Sol está a 150 milhões de km, então visto do polo ele vem
   da mesma direção que visto do centro. */
export function sunLightPosition({ lat, lon }, distance = SUN_DISTANCE) {
  const direction = latLonToScene(lat, lon)
  return SUN_TARGET.map((t, i) => t + direction[i] * distance)
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/* O ângulo do meio da tela até a quina, visto da câmera, quando quem chama não diz: o fov de 36°
   da cena numa janela com 1,8 de largura sobre a altura. */
const DEFAULT_VIEW_HALF_ANGLE_RAD = (33.8 * Math.PI) / 180

// a caixa do polo, a de sempre
function poleFrame(subsolar) {
  return {
    target: SUN_TARGET,
    lightPosition: sunLightPosition(subsolar),
    halfSize: POLE_SHADOW.halfSize,
    near: SUN_DISTANCE - 0.5,
    far: SUN_DISTANCE + 0.5,
    bias: POLE_SHADOW.bias,
    normalBias: POLE_SHADOW.normalBias,
  }
}

/* A caixa da sombra para a câmera em cameraPosition (na cena, em raios da Lua), com o Sol a pino
   em subsolar. viewHalfAngleRad: o ângulo do meio da tela até a quina, visto da câmera.
   Devolve { target, lightPosition, halfSize, near, far, bias, normalBias }: o alvo e a posição da
   luz, a metade do lado da caixa, o começo e o fim dela a partir da luz, e os descontos.
   O tamanho cobre o chão que a tela mostra, até a quina ou até o horizonte, e mais os 2° em que o
   relevo da Lua inteira passa da tela, para as montanhas logo fora dela fazerem sombra para dentro
   (globalChunks, em globalTiles.js), no primeiro dos tamanhos de SIZES que couber. Acima da altura
   do relevo da Lua inteira, só o relevo do polo faz sombra, e fica a caixa do polo. */
export function shadowFrame(cameraPosition, subsolar, viewHalfAngleRad = DEFAULT_VIEW_HALF_ANGLE_RAD) {
  const distance = Math.hypot(...cameraPosition)
  if (!(distance - 1 <= GLOBAL_MAX_ALTITUDE)) return poleFrame(subsolar)
  const below = cameraPosition.map((v) => v / distance)
  const sine = distance * Math.sin(viewHalfAngleRad)
  const seen = sine < 1 ? Math.asin(sine) - viewHalfAngleRad : Math.acos(Math.min(1, 1 / distance))
  const wanted = seen + GLOBAL_VIEW_MARGIN_RAD
  const halfSize = SIZES.find((size) => size >= wanted) ?? SIZES.at(-1)

  // a câmera perto do chão, em cima do polo: a caixa de sempre, se ela cobre tudo o que a de agora
  // cobriria
  const fromPole = Math.acos(Math.max(-1, Math.min(1, -below[1])))
  if (fromPole + halfSize <= POLE_SHADOW.halfSize) return poleFrame(subsolar)

  /* O alvo vai para a grade dos pixels da sombra. Os eixos dela são os da câmera da luz do three:
     ela olha do Sol para o alvo, com o "para cima" em +y, então o eixo x é +y × sol e o y é
     sol × x. Sem isto, cada passo da câmera deslocava a grade um pedaço de pixel, e a borda das
     sombras tremia. */
  const sun = latLonToScene(subsolar.lat, subsolar.lon)
  const across = [sun[2], 0, -sun[0]]
  const acrossLength = Math.hypot(...across)
  const e1 = across.map((v) => v / acrossLength)
  const e2 = [sun[1] * e1[2] - sun[2] * e1[1], sun[2] * e1[0] - sun[0] * e1[2], sun[0] * e1[1] - sun[1] * e1[0]]
  const texel = (2 * halfSize) / SHADOW_MAP_SIZE
  const shift1 = Math.round(dot(below, e1) / texel) * texel - dot(below, e1)
  const shift2 = Math.round(dot(below, e2) / texel) * texel - dot(below, e2)
  const target = below.map((v, i) => v + e1[i] * shift1 + e2[i] * shift2)

  // a profundidade de um ponto p é dot(luz − p, sol): a Lua inteira, com as montanhas, fica entre
  // dot(alvo, sol) + 3 − 1,02 e dot(alvo, sol) + 3 + 1,02
  const along = dot(target, sun) + FREE_DISTANCE
  const ratio = halfSize / POLE_SHADOW.halfSize
  return {
    target,
    lightPosition: target.map((v, i) => v + sun[i] * FREE_DISTANCE),
    halfSize,
    near: along - 1.02,
    far: along + 1.02,
    bias: POLE_SHADOW.bias * ratio,
    normalBias: POLE_SHADOW.normalBias * ratio,
  }
}
