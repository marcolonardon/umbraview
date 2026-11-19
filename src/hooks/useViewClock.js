/* O relógio próprio das vistas do espaço (a do sistema e a da missão): a hora em que a vista está,
 * contada a partir da data escolhida, e se está tocando.
 *
 * Ele anda pelo período sem mudar a data do cálculo, porque trocar a data refaz a conta do céu do
 * ponto, e fazer isso a cada quadro travaria a página. Só começa a tocar quando a pessoa pede.
 */
import { useCallback, useEffect, useState } from 'react'

/* periodHours: quantas horas o relógio cobre; chegando ao fim, volta ao começo. hoursPerSecond:
   quantas horas do período passam por segundo, tocando. Devolve { hour, playing, setPlaying, seek }:
   hour vai de 0 até periodHours, com fração; seek(hora) leva o relógio até uma hora e para de
   tocar, que é o que o cursor faz.
   resetKey: o que o relógio está cobrindo; quando troca, ele volta à hora zero e para. A vista da
   missão passa do período para a missão (card C16), e a hora de um não quer dizer nada no outro. */
export function useViewClock(periodHours, hoursPerSecond, resetKey = null) {
  const [hour, setHour] = useState(0)
  const [playing, setPlaying] = useState(false)
  /* A troca é vista durante o próprio render, e não num efeito: assim nenhum quadro é desenhado
     com a hora velha no relógio novo, e o lint do projeto não aceita setState direto num efeito. */
  const [coveredKey, setCoveredKey] = useState(resetKey)
  if (coveredKey !== resetKey) {
    setCoveredKey(resetKey)
    setHour(0)
    setPlaying(false)
  }

  useEffect(() => {
    if (!playing) return
    let frame
    let last = performance.now()
    /* O tempo vem do performance.now(), e não do número que o navegador entrega ao quadro: os dois
       são o mesmo relógio no navegador, mas com dois relógios diferentes (o dos testes) o primeiro
       quadro daria um salto. */
    const tick = () => {
      const now = performance.now()
      const elapsed = (now - last) / 1000
      last = now
      setHour((value) => (value + elapsed * hoursPerSecond) % periodHours)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, periodHours, hoursPerSecond])

  const seek = useCallback((value) => {
    setPlaying(false)
    setHour(value)
  }, [])

  return { hour, playing, setPlaying, seek }
}
