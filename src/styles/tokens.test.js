/* Contraste dos tokens de cor, conferido pela fórmula da WCAG 2.1 (critérios 1.4.3 e 1.4.11).
 *
 * Os pares abaixo são os que a interface usa: texto sobre fundo, texto sobre superfície,
 * borda de controle e anel de foco. Se alguém escurecer o texto secundário "porque ficou mais
 * bonito", este teste diz qual par caiu abaixo do mínimo antes de o juiz com leitor de tela,
 * ou com o projetor da sala, descobrir. Texto normal precisa de 4,5:1; borda de controle e
 * anel de foco, de 3:1.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const CSS = readFileSync(join(process.cwd(), 'src', 'styles', 'tokens.css'), 'utf8')

function token(nome) {
  const achado = CSS.match(new RegExp(`--${nome}:\\s*(#[0-9a-fA-F]{6})\\s*;`))
  if (!achado) throw new Error(`token --${nome} não definido (ou não está em #rrggbb) em tokens.css`)
  return achado[1]
}

/* Luminância relativa e razão de contraste, como a WCAG define. */
function luminancia(hex) {
  const canal = (i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5)
}
function contraste(a, b) {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x)
  return (claro + 0.05) / (escuro + 0.05)
}

describe('fórmula de contraste', () => {
  it('confere com os valores conhecidos: branco e preto dão 21:1, cor igual dá 1:1', () => {
    expect(contraste('#ffffff', '#000000')).toBeCloseTo(21, 5)
    expect(contraste('#777777', '#777777')).toBeCloseTo(1, 5)
  })
})

const TEXTO = 4.5
const CONTROLE = 3

describe.each([
  ['color-text', 'color-bg', TEXTO],
  ['color-text', 'color-surface', TEXTO],
  ['color-text', 'color-surface-raised', TEXTO],
  ['color-text-secondary', 'color-bg', TEXTO],
  ['color-text-secondary', 'color-surface', TEXTO],
  ['color-text-secondary', 'color-surface-raised', TEXTO],
  ['color-text-muted', 'color-bg', TEXTO],
  ['color-text-muted', 'color-surface', TEXTO],
  ['color-accent', 'color-bg', TEXTO],
  ['color-accent', 'color-surface', TEXTO],
  ['color-on-accent', 'color-accent', TEXTO],
  ['color-sun', 'color-surface', TEXTO],
  ['color-earth', 'color-surface', TEXTO],
  ['color-danger', 'color-surface', TEXTO],
  // o título do resumo do pouso e o visto das etiquetas do painel da missão (card C17)
  ['color-success', 'color-surface', TEXTO],
  ['color-border-control', 'color-surface', CONTROLE],
  // A Lua é o objeto que a pessoa precisa achar na cena (WCAG 1.4.11, como um controle).
  ['color-moon', 'color-surface', CONTROLE],
  // As linhas dos gráficos precisam se destacar do fundo como um controle (WCAG 1.4.11).
  ['color-terrain-line', 'color-bg', CONTROLE],
  ['color-success', 'color-bg', CONTROLE],
  ['color-sun', 'color-bg', CONTROLE],
  ['color-earth', 'color-bg', CONTROLE],
  ['color-focus', 'color-bg', CONTROLE],
  ['color-focus', 'color-surface', CONTROLE],
])('--%s sobre --%s', (frente, fundo, minimo) => {
  it(`tem contraste de pelo menos ${minimo}:1`, () => {
    const razao = contraste(token(frente), token(fundo))
    expect(razao, `${token(frente)} sobre ${token(fundo)} = ${razao.toFixed(2)}:1`).toBeGreaterThanOrEqual(minimo)
  })
})
