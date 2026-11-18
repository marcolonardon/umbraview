/* O clique na marca de uma base, na vista da missão (card C13): qual base ele escolhe. O clique em
 * si não dá para simular sem WebGL, porque quem diz quais marcas o mouse atravessou é o raio que o
 * three lança na cena; aqui fica a regra, com os números que esse raio entrega. */
import { describe, expect, it } from 'vitest'

import { readSiteClick } from './missionPicking.js'
import { CLICK_MAX_DRAG_PX } from './picking.js'

/* Quatro marcas numa Terra de raio 1: três do lado de cá (duas quase no mesmo lugar, como as duas
   plataformas de Kennedy) e uma do outro lado. A câmera olha de +x, a 4 raios. */
const MARCAS = [
  [1.004, 0, 0],
  [1.0039, 0.0005, 0],
  [0.7, 0.72, 0],
  [-1.004, 0, 0],
]
const CAMERA = [4, 0, 0]
const NADA = -1
const clique = (hits, selecionada = NADA, delta = 0) => readSiteClick({ delta, hits }, MARCAS, CAMERA, selecionada)

describe('o clique numa marca de base (readSiteClick)', () => {
  it('em cima de uma marca, escolhe a base dela', () => {
    expect(clique([2])).toBe(2)
    expect(clique([0])).toBe(0)
  })

  it('fora de qualquer marca, não faz nada', () => {
    expect(clique([])).toBe(NADA)
  })

  /* O three chama o onClick também no fim de um arrasto, se ele começou e terminou em cima da
     marca: sem o limite, girar a Terra com o mouse em cima de uma base a escolheria. */
  it('o fim de um arrasto não é clique: o limite é o mesmo do clique na Lua', () => {
    expect(clique([2], NADA, CLICK_MAX_DRAG_PX)).toBe(2)
    expect(clique([2], NADA, CLICK_MAX_DRAG_PX + 1)).toBe(NADA)
  })

  /* A Terra não entra na conta do raio: sem conferir o lado, um clique no meio do Pacífico
     escolheria a base que está atrás dele, do outro lado do mundo. */
  it('a marca que está do outro lado da Terra não é escolhida', () => {
    expect(clique([3])).toBe(NADA)
    // o raio atravessa a de cá e a de lá: vale a de cá
    expect(clique([0, 3])).toBe(0)
    // a mesma marca, vista do lado dela, pode
    expect(readSiteClick({ delta: 0, hits: [3] }, MARCAS, [-4, 0, 0], NADA)).toBe(3)
  })

  it('com várias marcas no caminho, escolhe a mais perto da câmera, que vem primeiro', () => {
    expect(clique([1, 0])).toBe(1)
    expect(clique([0, 1])).toBe(0)
  })

  /* As duas plataformas de Kennedy e a de Cabo Canaveral ficam a poucos quilômetros uma da outra:
     as marcas caem uma em cima da outra em qualquer zoom. Clicar de novo no mesmo lugar passa para
     a seguinte, e depois da última volta à primeira. */
  it('clicar de novo num monte de marcas passa para a próxima, e dá a volta', () => {
    expect(clique([0, 1], 0)).toBe(1)
    expect(clique([0, 1], 1)).toBe(0)
    // a escolhida não está no monte: começa pela mais perto
    expect(clique([0, 1], 2)).toBe(0)
  })

  it('clicar na marca que já está escolhida, sozinha, não faz nada', () => {
    expect(clique([2], 2)).toBe(NADA)
  })

  it('a mesma marca repetida nos acertos conta uma vez só, e o que não é marca é ignorado', () => {
    expect(clique([0, 0, 1, undefined], 0)).toBe(1)
    expect(clique([0, 0], 0)).toBe(NADA)
    expect(clique([undefined])).toBe(NADA)
  })
})
