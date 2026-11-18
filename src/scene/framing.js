/* O enquadramento da Lua e os ângulos dos voos da câmera (v2, itens 1 e 3).
 *
 * Este arquivo não conhece o three nem o React: recebe números e devolve números, para as contas
 * serem testadas no Node, sem WebGL (o mesmo motivo de picking.js). Quem aplica na câmera é o
 * CameraRig.jsx.
 *
 * As medidas estão em raios da Lua, como em LunarScene.jsx: a Lua tem raio 1 e fica no centro.
 */
import { latLonToScene } from './coordinates.js'

const DEG = Math.PI / 180

/* A abertura vertical da câmera. Mais fechada que os 75° do React Three Fiber: com a Lua enchendo
   a tela, uma lente aberta estica a borda dela em direção aos cantos. */
export const CAMERA_FOV_DEG = 36

/* Quanto de folga sobra em volta da Lua enquadrada: 1,18 deixa uns 8% da área livre de cada lado.
   Sem folga, a borda de cima e a de baixo encostavam na beira da tela e cortavam (o defeito que a
   equipe apontou na v1). */
export const FRAME_MARGIN = 1.18

/* De onde a câmera olha a Lua inteira: abaixo do equador, para o polo sul (o assunto do produto)
   ficar na parte de baixo do disco, e 65° a oeste do ponto onde o Sol está a pino, para a linha
   entre o dia e a noite cruzar o disco em vez de a Lua aparecer toda clara ou toda escura. */
const HERO_LAT_DEG = -38
const HERO_SUN_OFFSET_DEG = -65

/* A distância da câmera ao centro da Lua para a esfera inteira caber na área livre da tela.
   width e height: o tamanho da cena, em pixels. insetRight e insetBottom: quanto o painel cobre da
   direita (computador) ou de baixo (a gaveta do celular); a Lua cabe no que sobra.
   A esfera vista de d raios de distância tem raio angular asin(1/d); na tela, ela ocupa
   tan(asin(1/d)) / tan(fov/2) da meia altura. A conta vale para a esfera no meio da área livre,
   que é onde o deslocamento da lente a põe (lensShift). */
export function fitDistance({ width, height, fovDeg = CAMERA_FOV_DEG, insetRight = 0, insetBottom = 0, margin = FRAME_MARGIN }) {
  const freeWidth = Math.max(1, width - insetRight)
  const freeHeight = Math.max(1, height - insetBottom)
  const halfFov = Math.tan((fovDeg * DEG) / 2)
  // a meia altura da tela vale tan(fov/2); a área livre, em frações dela
  const vertical = (freeHeight / height) * halfFov
  const horizontal = (freeWidth / height) * halfFov
  const tangent = Math.min(vertical, horizontal) / margin
  return 1 / Math.sin(Math.atan(tangent))
}

/* Quanto deslocar a imagem, em pixels, para o centro da cena cair no meio da área livre: metade
   do que o painel cobre. É o deslocamento de lente da câmera (setViewOffset): ele move a imagem
   inteira por igual, perto e longe, e o clique continua acertando o ponto que a pessoa vê.
   Positivo em x leva a imagem para a esquerda; positivo em y, para cima. */
export function lensShift({ insetRight = 0, insetBottom = 0 }) {
  return { x: insetRight / 2, y: insetBottom / 2 }
}

/* A direção, na cena, de onde a câmera olha a Lua inteira. subsolar: { lat, lon } do ponto onde o
   Sol está a pino (useSubsolarPoint). */
export function heroDirection(subsolar) {
  return latLonToScene(HERO_LAT_DEG, subsolar.lon + HERO_SUN_OFFSET_DEG)
}

/* Os ângulos de órbita dos controles da câmera para ela ficar na direção de um ponto da cena:
   azimuth em volta do eixo y, a partir de +z, e polar a partir de +y (a convenção do Spherical do
   three, que o camera-controls usa). */
export function orbitAngles([x, y, z]) {
  const length = Math.hypot(x, y, z)
  return { azimuth: Math.atan2(x, z), polar: Math.acos(Math.max(-1, Math.min(1, y / length))) }
}

/* O mesmo azimute de target, escrito na volta mais perto de current. Os controles guardam o
   azimute sem limite (depois de duas voltas, ele vale 4π): pedir o ângulo cru faria a câmera
   desenrolar todas as voltas antes de chegar. */
export function nearestAzimuth(target, current) {
  const turn = 2 * Math.PI
  const delta = (((target - current) % turn) + turn + Math.PI) % turn - Math.PI
  return current + delta
}

/* O polar preso longe dos polos da órbita: exatamente em cima do eixo y, a direção da câmera e o
   "para cima" dos controles ficam paralelos e o giro dela fica indefinido (o mesmo motivo do 0,01
   da câmera da v1). 1° de folga desloca um ponto do polo 1° do centro da tela, que não se nota. */
const POLAR_EDGE = 1 * DEG
export function clampPolar(polar) {
  return Math.max(POLAR_EDGE, Math.min(Math.PI - POLAR_EDGE, polar))
}

/* Quanto a roda anda por passo, em vezes o padrão dos controles, com a câmera longe da Lua: o zoom
   vai do chão da Lua até o céu virar um aglomerado, quase 3.000 vezes a distância, e no passo
   padrão a roda não chegava. No Windows, um passo da roda multiplica a distância por 1,41. */
export const WHEEL_DOLLY_SPEED = 2

/* O dollySpeed dos controles com a câmera a `distance` raios do centro da Lua.
   O camera-controls multiplica a distância até o centro a cada passo da roda (e da pinça de dois
   dedos): perto do chão, isso é um pulo enorme na altura. A 35 km, um passo para fora levava a
   câmera a 757 km, e de 806 km um passo para dentro levava a 70 km (medido no navegador do
   CIT-DES06 em 17/11/2026, na main): da Lua inteira até o chão eram 5 passos.
   Com a velocidade proporcional a (d − 1) / d, o passo multiplica a altura, e não a distância:
   para passos pequenos, ln(altura nova / altura) = ln(distância nova / distância) · d / (d − 1).
   Um passo inteiro da roda é grande para essa conta, e ela erra um pouco: para fora, a altura vai
   ×1,34 perto do chão e ×1,41 longe; para dentro, ÷1,51 e ÷1,43 (framing.test.js). De longe, a
   velocidade é a de hoje (WHEEL_DOLLY_SPEED). Dentro da Lua, zero: a roda não anda. */
export function dollySpeedAt(distance) {
  return (WHEEL_DOLLY_SPEED * Math.max(0, distance - 1)) / distance
}

/* A velocidade de giro dos controles de hoje, o padrão do camera-controls. */
export const ROTATE_SPEED_MAX = 1

/* O azimuthRotateSpeed e o polarRotateSpeed dos controles com a câmera a `distance` raios do centro
   da Lua: o chão embaixo do meio da tela anda junto com o mouse.
   O camera-controls gira a câmera 2π · velocidade · pixels / altura da tela, em qualquer altura. A
   35 km, arrastar 20 pixels movia o chão 351 km, com a tela inteira mostrando 22 km de largura: o
   chão andava 381 vezes mais que o mouse (medido no navegador do CIT-DES06 em 17/11/2026, na main).
   Um pixel da tela, no meio dela, cobre 2 · altura · tan(fov / 2) / altura da tela de chão (em
   raios, que é o ângulo no centro da Lua); igualando ao giro de um pixel de arrasto, a velocidade é
   altura · tan(fov / 2) / π. Ela fica presa na de hoje: de longe, com a Lua pequena na tela, girar
   na velocidade da mão seria rápido demais. */
export function rotateSpeedAt(distance, fovDeg = CAMERA_FOV_DEG) {
  const follow = (Math.max(0, distance - 1) * Math.tan((fovDeg * DEG) / 2)) / Math.PI
  return Math.min(ROTATE_SPEED_MAX, follow)
}

/* O azimuthRotateSpeed dos controles: a velocidade de rotateSpeedAt dividida pelo seno do ângulo
   polar da câmera (`polar`, a partir de +y, o phi do Spherical do three), que é o cosseno da
   latitude do ponto embaixo dela.
   Arrastar para os lados gira a câmera em volta do eixo da Lua, e o ponto embaixo dela anda o giro
   vezes esse seno. Em Haworth, a 87°S, ele vale 0,05: com a velocidade do arrasto para cima e para
   baixo, o chão andava para os lados umas 19 vezes menos que o mouse (o Marco sentiu no navegador
   em 17/11/2026). O seno nunca fica menor que o do POLAR_EDGE, onde clampPolar segura a câmera, e a
   velocidade fica presa na de hoje: em cima do polo, ela não dispara. */
export function azimuthSpeedAt(distance, polar, fovDeg = CAMERA_FOV_DEG) {
  const follow = (Math.max(0, distance - 1) * Math.tan((fovDeg * DEG) / 2)) / Math.PI
  const sine = Math.max(Math.sin(POLAR_EDGE), Math.sin(polar))
  return Math.min(ROTATE_SPEED_MAX, follow / sine)
}

/* O passo de um valor que persegue o alvo sem pular: a fração que falta cai pela metade a cada
   halfLifeS segundos. Devolve o alvo quando a diferença some, para quem chama saber que parou e
   não pedir mais quadros (a cena parada não desenha, card C9). */
export function approach(current, target, deltaS, halfLifeS) {
  const next = target + (current - target) * Math.pow(0.5, deltaS / halfLifeS)
  return Math.abs(next - target) < 0.25 ? target : next
}

/* A vista Terra–Lua–Sol (v2, contrato C7). A cena continua em raios da Lua, mas a distância entre
   a Terra e a Lua é encolhida SYSTEM_COMPRESSION vezes: na escala de verdade, com a órbita inteira
   na tela, a Lua teria 2 ou 3 pixels. O tamanho da Terra em relação à Lua continua o de verdade
   (EARTH_RADIUS, em raios da Lua: 6.378,137 km sobre 1.737,4 km). A tela avisa que a vista está
   fora de escala. */
export const SYSTEM_COMPRESSION = 9
export const EARTH_RADIUS = 6378.137 / 1737.4

/* De km, no referencial fixo da Lua (o do motor), para a cena, já encolhido. */
export function systemScale(moonRadiusM) {
  return 1000 / (moonRadiusM * SYSTEM_COMPRESSION)
}

/* O raio, na cena, da esfera que a câmera enquadra na vista Terra–Lua–Sol: a órbita inteira em
   volta da Terra, com a Lua na ponta. earthDistance: a distância da Terra à Lua, na cena. */
export function systemViewRadius(earthDistance) {
  return earthDistance * 1.12
}

/* De onde a câmera olha a vista Terra–Lua–Sol. earth: a posição da Terra na cena (a Lua fica na
   origem). O alvo é a Terra, o centro da órbita. A câmera fica do lado da Lua, um pouco de lado e
   35° acima do plano em que a Terra e a Lua estão: recuando da Lua para lá, a Lua continua na
   frente da pessoa enquanto a Terra e a órbita entram no quadro, num movimento só.
   O lado é o negativo: com ele a Lua fica embaixo e à direita da Terra na tela. Com o positivo
   ela caía embaixo e à esquerda, que é o canto do relógio da vista (SystemClock.jsx), e sumia
   atrás dele (achado da revisão da v2, conferido no navegador em 1366×768).
   Devolve { target, direction }: a direção, de tamanho 1, do alvo para a câmera. */
const SYSTEM_SIDE_DEG = -28
const SYSTEM_TILT_DEG = 35
export function systemCamera(earth) {
  // do alvo (a Terra) para a Lua, no plano horizontal da cena
  const toMoon = Math.atan2(-earth[0], -earth[2])
  const azimuth = toMoon + SYSTEM_SIDE_DEG * DEG
  const polar = (90 - SYSTEM_TILT_DEG) * DEG
  return {
    target: [earth[0], earth[1], earth[2]],
    direction: [Math.sin(polar) * Math.sin(azimuth), Math.cos(polar), Math.sin(polar) * Math.cos(azimuth)],
  }
}

/* O ângulo, em volta do eixo y da cena, de uma direção do céu que não muda (a primeira coluna do
   giro do céu, useSkyRotation): quanto ele muda entre duas datas é quanto as estrelas giraram em
   volta da Lua. Na vista Terra–Lua–Sol a câmera gira junto, para as estrelas ficarem paradas na
   tela e a Lua andar na órbita. rotation: os 9 números do giro do céu para a cena, por linhas. */
export function skyAngle(rotation) {
  return Math.atan2(rotation[0], rotation[6])
}

/* A diferença entre dois ângulos, pelo caminho curto: de 179° para −179° são 2°, e não −358°. */
export function shortestTurn(from, to) {
  const turn = 2 * Math.PI
  return ((((to - from) % turn) + turn + Math.PI) % turn) - Math.PI
}

/* De quantos graus o Sol fica à esquerda de quem olha a vista Terra, Lua e Sol ao abrir: 90 seria
   bem de lado; 100 o põe um pouco atrás da Terra, e ela aparece quase meio iluminada. */
const SUN_SIDE_DEG = 100

/* Onde a câmera da vista do sistema nasce: a posição de base girada em volta do eixo de cima, para
   o Sol ficar à esquerda da tela. A direção do Sol muda ao longo do ano; com a câmera parada, em
   parte dele o Sol nascia entre a câmera e a Terra, cortado pela borda. Só a partida muda: depois
   a pessoa gira como quiser. */
export function sunSideStart([x, y, z], sunDirection) {
  const radius = Math.hypot(x, z)
  const azimuth = Math.atan2(sunDirection[0], sunDirection[2]) + (SUN_SIDE_DEG * Math.PI) / 180
  return [radius * Math.sin(azimuth), y, radius * Math.cos(azimuth)]
}
