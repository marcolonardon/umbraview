/* Onde um ponto do chão da Terra está no espaço num instante: a base de lançamento da vista da
 * missão (card C13) e, depois, o começo da trajetória (card C15).
 *
 * A Terra gira, e o eixo dela balança devagar (precessão e nutação): o mesmo ponto do mapa aponta
 * para um lugar diferente do céu a cada instante. Quem faz essa conta é o ObserverVector do
 * astronomy-engine, a mesma biblioteca das posições do Sol e da Lua. Ele recebe a latitude do
 * mapa (a geodésica) e põe o ponto no chão de uma Terra achatada: a 6378,1 km do centro no
 * equador e a 6356,8 km no polo. A altitude é zero: uma plataforma fica a poucos metros do mar.
 *
 * O resultado bate com o JPL Horizons a 21 m (earthSite.test.js, medido em 18/11/2026).
 */
import { MakeTime, Observer, ObserverVector } from 'astronomy-engine'

import { AU_KM, toDrawing } from './system.js'

/* O raio da Terra no equador, em km: NASA NSSDCA, Earth Fact Sheet ("Equatorial radius (km)
   6378.137", lida em 18/11/2026; CREDITS.md). É a régua da vista da missão: nela, 1 unidade do
   desenho é este raio. */
export const EARTH_EQUATORIAL_RADIUS_KM = 6378.137

/* O tempo de uma volta da Terra em relação às estrelas, em horas (23 h 56 min): a mesma ficha da
   NASA ("Sidereal rotation period (hrs) 23.9345"). É de quanto em quanto tempo uma base volta a
   apontar para o mesmo lugar do céu. */
export const EARTH_SIDEREAL_DAY_HOURS = 23.9345

/* false: o vetor sai no equador médio de J2000, o referencial das efemérides. Com true, sairia no
   equador da data, que desde 2000 já girou: para Kennedy, em fevereiro de 2025, a base ficaria
   39 km fora do lugar em relação à Lua e às estrelas (medido em 18/11/2026). */
const OF_DATE = false

/* latDeg e lonDeg: a latitude e a longitude do mapa, em graus, com o leste positivo. dateMs: o
   instante, em milissegundos UTC. Devolve [x, y, z] em km, a partir do centro da Terra, no
   referencial equatorial J2000 (o do astronomy-engine): é nele que a órbita é integrada. */
export function earthSiteEquatorialKm(latDeg, lonDeg, dateMs) {
  const site = ObserverVector(MakeTime(new Date(dateMs)), new Observer(latDeg, lonDeg, 0), OF_DATE)
  return [site.x * AU_KM, site.y * AU_KM, site.z * AU_KM]
}

/* O mesmo ponto no desenho do system.js (y para o norte da eclíptica), em km a partir do centro da
   Terra: é o que a cena multiplica pela escala dela para pôr a marca da base. */
export function earthSiteKm(latDeg, lonDeg, dateMs) {
  const time = MakeTime(new Date(dateMs))
  const site = ObserverVector(time, new Observer(latDeg, lonDeg, 0), OF_DATE)
  return toDrawing(site.x, site.y, site.z, time).map((value) => value * AU_KM)
}
