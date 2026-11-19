/* O foco do teclado que não se perde (useKeepFocus). Quando a pessoa escolhe numa lista e a lista
 * sai da página, o navegador deixa o foco no corpo da página: o Tab seguinte recomeça do topo, e o
 * leitor de tela não diz o que mudou. O hook leva o foco a um alvo, mas só quando ele se perdeu:
 * quem está com o foco em outro controle continua nele.
 */
import { render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { describe, expect, it } from 'vitest'

import { useKeepFocus } from './useKeepFocus.js'

// uma tela de mentira: uma lista que só existe no passo 0, e a pergunta do passo, que é o alvo
function Tela({ passo }) {
  const alvo = useRef(null)
  useKeepFocus(alvo, passo)
  return (
    <>
      <button type="button">outro</button>
      {passo === 0 && <input aria-label="lista" />}
      <p ref={alvo} tabIndex={-1}>
        pergunta
      </p>
    </>
  )
}

describe('useKeepFocus', () => {
  it('não mexe no foco quando a tela aparece', () => {
    render(<Tela passo={0} />)
    expect(document.body).toHaveFocus()
  })

  it('quando o que tinha o foco sai da página, leva o foco ao alvo', () => {
    const { rerender } = render(<Tela passo={0} />)
    screen.getByLabelText('lista').focus()
    rerender(<Tela passo={1} />)
    expect(screen.getByText('pergunta')).toHaveFocus()
  })

  it('quando o foco está em outro controle, deixa onde está', () => {
    const { rerender } = render(<Tela passo={0} />)
    screen.getByRole('button', { name: 'outro' }).focus()
    rerender(<Tela passo={1} />)
    expect(screen.getByRole('button', { name: 'outro' })).toHaveFocus()
  })

  it('sem mudança de passo, não faz nada, mesmo com o foco perdido', () => {
    const { rerender } = render(<Tela passo={1} />)
    rerender(<Tela passo={1} />)
    expect(document.body).toHaveFocus()
  })
})
