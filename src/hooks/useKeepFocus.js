/* O foco do teclado que não se perde (card C17, fase 5). Quando o controle que tinha o foco sai da
 * página (a lista em que a pessoa acabou de escolher, o botão Launch que ela acabou de apertar), o
 * navegador deixa o foco no corpo da página: o Tab seguinte recomeça do topo, e o leitor de tela
 * não diz o que mudou. Este hook leva o foco a um alvo quando a chave muda, mas só se ele se
 * perdeu: quem está com o foco em outro controle continua nele.
 *
 * target: a ref do elemento que recebe o foco (tem que poder recebê-lo: um botão, ou um elemento
 * com tabIndex={-1}). key: o que diz que a tela mudou de etapa.
 */
import { useEffect, useRef } from 'react'

export function useKeepFocus(target, key) {
  const lastKey = useRef(key)
  useEffect(() => {
    if (lastKey.current === key) return
    lastKey.current = key
    const active = document.activeElement
    if (active && active !== document.body) return
    // sem rolar a página: o alvo está na vista, e um pulo da tela seria um movimento que ninguém pediu
    target.current?.focus({ preventScroll: true })
  }, [target, key])
}
