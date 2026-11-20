// @vitest-environment node
/* O estilo global e quem pediu menos movimento no sistema (README, "Accessibility").
 *
 * A regra antiga deixava toda transição com 1 ms. Parece o mesmo que nenhuma, mas não é: o que muda
 * a cada quadro (o ponto da nave e a linha voada do arco do painel de voo, o arco aceso dos
 * mostradores) começava uma transição nova a cada quadro, a partir do valor de antes, e ficava parado
 * no começo. Visto em 19/11/2026 num Chrome sem janela, que lê o "menos movimento" do Windows do
 * Marco: o ponto da nave parado no lançamento com o relógio em T+ 14 h, e o estilo calculado de um
 * elemento qualquer da página sem mudar depois de trocar o style dele. Sem transição nenhuma, não há o
 * que travar. */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const css = readFileSync(join(process.cwd(), 'src', 'styles', 'global.css'), 'utf8')
// o bloco de quem pediu menos movimento, do @media até a chave que fecha ele
const start = css.indexOf('@media (prefers-reduced-motion: reduce)')
const block = css.slice(start, css.indexOf('\n}', start) + 2)

describe('global.css, para quem pediu menos movimento', () => {
  it('o bloco existe', () => {
    expect(start).toBeGreaterThan(-1)
  })

  it('tira as transições de vez, em vez de deixá-las com 1 ms', () => {
    expect(block).toMatch(/transition:\s*none\s*!important/)
    expect(block).not.toMatch(/transition-duration/)
  })
})
