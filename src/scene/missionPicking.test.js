/* O clique na marca de uma base, na vista da missão (card C13): qual base ele escolhe. O clique em
 * si não dá para simular sem WebGL, porque quem diz quais marcas o mouse atravessou é o raio que o
 * three lança na cena; aqui fica a regra, com os números que esse raio entrega. */
import { describe, expect, it } from 'vitest'

import { systemStateAt } from '../engine/system.js'
import { landingMarkerPosition, readLandingClick, readSiteClick } from './missionPicking.js'
import { MOON_RADIUS, kmToUnits } from './missionScale.js'
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

  /* Num passo reaberto, clicar de novo na base escolhida é o que diz que a pessoa quer essa mesma: o
     painel segue. Antes o clique não fazia nada, e o painel ficava parado (visto pelo Marco em
     19/11/2026). */
  it('clicar na marca que já está escolhida, sozinha, escolhe ela de novo', () => {
    expect(clique([2], 2)).toBe(2)
  })

  it('a mesma marca repetida nos acertos conta uma vez só, e o que não é marca é ignorado', () => {
    expect(clique([0, 0, 1, undefined], 0)).toBe(1)
    // repetida, a escolhida conta como uma marca só: é escolhida de novo
    expect(clique([0, 0], 0)).toBe(0)
    expect(clique([undefined])).toBe(NADA)
  })
})

/* O clique na Lua da vista da missão escolhe o local de pouso (card C17). O raio do clique dá um
   ponto do desenho; a conta desfaz a posição e o giro da Lua naquele instante para chegar à
   latitude e à longitude. O caminho de ida é o landingMarkerPosition, que põe a marca do local. */
describe('o clique na Lua escolhe o local de pouso (readLandingClick)', () => {
  const estado = systemStateAt(Date.UTC(2026, 11, 5, 12))
  const lua = kmToUnits(estado.moonKm)
  const noDesenho = (site) => landingMarkerPosition(site, estado.moonMatrix).map((value, k) => value + lua[k])

  it('devolve a latitude e a longitude do ponto clicado, a menos de 0,0001°', () => {
    for (const site of [{ lat: -84.7906, lon: 29.1957 }, { lat: 12.5, lon: -140.25 }, { lat: 60, lon: 179.5 }, { lat: -89.9, lon: -45 }]) {
      const lido = readLandingClick({ point: noDesenho(site), delta: 0 }, lua, estado.moonMatrix)
      expect(lido.lat).toBeCloseTo(site.lat, 3)
      expect(lido.lon).toBeCloseTo(site.lon, 3)
    }
  })

  it('a marca do local fica no chão da Lua, um fio acima da esfera', () => {
    const marca = landingMarkerPosition({ lat: -84.7906, lon: 29.1957 }, estado.moonMatrix)
    expect(Math.hypot(...marca)).toBeGreaterThan(MOON_RADIUS)
    expect(Math.hypot(...marca)).toBeLessThan(MOON_RADIUS * 1.02)
  })

  it('a marca do polo norte fica na ponta do eixo da Lua desenhada', () => {
    // a coluna 1 da matriz do system.js é o polo norte do corpo
    const m = estado.moonMatrix
    const marca = landingMarkerPosition({ lat: 90, lon: 0 }, m)
    const tamanho = Math.hypot(...marca)
    expect(marca[0] / tamanho).toBeCloseTo(m[4], 9)
    expect(marca[1] / tamanho).toBeCloseTo(m[5], 9)
    expect(marca[2] / tamanho).toBeCloseTo(m[6], 9)
  })

  it('o fim de um arrasto não é clique: girar a Lua não troca o local', () => {
    const ponto = noDesenho({ lat: -84.7906, lon: 29.1957 })
    expect(readLandingClick({ point: ponto, delta: 5 }, lua, estado.moonMatrix)).toBeNull()
    expect(readLandingClick({ point: ponto, delta: 4 }, lua, estado.moonMatrix)).not.toBeNull()
  })

  it('arredonda para 4 casas: o mesmo clique não vira um pedido novo por um arredondamento', () => {
    const lido = readLandingClick({ point: noDesenho({ lat: -84.79061234, lon: 29.19574321 }), delta: 0 }, lua, estado.moonMatrix)
    expect(lido).toEqual({ lat: -84.7906, lon: 29.1957 })
  })
})
