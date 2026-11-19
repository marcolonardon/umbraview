/* A linha de controles das vistas do espaço (a do sistema e a da missão): o botão de tocar, o
 * cursor do relógio da vista e a hora em que ele está, em UTC. Os botões próprios de cada vista
 * entram depois, como filhos, na mesma linha. */
import { formatUtc } from '../panel/format.js'
import './ViewClock.css'

const HOUR_MS = 3600e3

/* clock: o relógio da vista (useViewClock). startUtc: a data em que ele começa (um Date).
   periodHours: quantas horas ele cobre. stepHours: de quanto em quanto o cursor anda, em horas; 1
   por padrão. A missão usa menos (card C16): a subida e a órbita de espera cabem na primeira hora.
   labels: os textos, { play, pause, timeLabel }, do arquivo de textos de cada vista. */
export function ViewClock({ clock, startUtc, periodHours, stepHours = 1, labels, children }) {
  /* O cursor conta em passos inteiros, e não em horas quebradas: 0,1 + 0,2 não dá 0,3 em ponto
     flutuante, e o navegador arredondaria o valor para o passo mais próximo por conta própria. */
  const step = Math.floor(clock.hour / stepHours + 1e-9)
  const steps = Math.round(periodHours / stepHours)
  const startMs = startUtc.getTime()
  return (
    <div className="view-clock">
      <button
        className="view-clock__button"
        type="button"
        aria-pressed={clock.playing}
        onClick={() => clock.setPlaying((value) => !value)}
      >
        {clock.playing ? labels.pause : labels.play}
      </button>
      <input
        className="view-clock__range"
        type="range"
        min="0"
        max={steps - 1}
        step="1"
        value={step}
        onChange={(event) => clock.seek(Number(event.target.value) * stepHours)}
        aria-label={labels.timeLabel}
        aria-valuetext={formatUtc(new Date(startMs + clock.hour * HOUR_MS))}
      />
      <span className="view-clock__when">{formatUtc(new Date(startMs + step * stepHours * HOUR_MS))}</span>
      {children}
    </div>
  )
}
