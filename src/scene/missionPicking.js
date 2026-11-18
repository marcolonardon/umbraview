/* O clique na marca de uma base, na vista da missão (card C13): qual base ele escolhe.
 *
 * Este arquivo não conhece o three nem o React, como o picking.js da cena da Lua: recebe o que o
 * raio do clique acertou e devolve o índice de uma base, para a regra ser testada sem WebGL.
 */
import { facesCamera } from './missionScale.js'
import { CLICK_MAX_DRAG_PX } from './picking.js'

const NOTHING = -1

/* click: { delta, hits }. delta: quanto o mouse andou, em pixels, entre apertar e soltar (o delta
   do evento do React Three Fiber). hits: o índice da base de cada marca que o raio do clique
   atravessou, da mais perto da câmera para a mais longe; pode trazer repetidos e o que não é marca.
   markers: onde fica a marca de cada base, nas unidades do desenho. camera: a posição da câmera.
   selectedIndex: a base escolhida agora, ou −1.
   Devolve o índice da base a escolher, ou −1 para não fazer nada.

   Três cuidados:
   - o fim de um arrasto não é clique, pelo mesmo limite do clique na Lua (picking.js);
   - a marca que está do outro lado da Terra não conta: a Terra não entra na conta do raio, e sem
     isto um clique no mar escolheria a base que está atrás dele;
   - com várias marcas no mesmo lugar (plataformas a poucos quilômetros uma da outra), clicar de
     novo passa para a seguinte, dando a volta. Sem isto, só a da frente poderia ser escolhida pelo
     clique. */
export function readSiteClick({ delta, hits }, markers, camera, selectedIndex) {
  if (delta > CLICK_MAX_DRAG_PX) return NOTHING
  const inView = [...new Set(hits)].filter((index) => markers[index] && facesCamera(markers[index], camera))
  if (inView.length === 0) return NOTHING
  const current = inView.indexOf(selectedIndex)
  if (current === -1) return inView[0]
  if (inView.length === 1) return NOTHING
  return inView[(current + 1) % inView.length]
}
