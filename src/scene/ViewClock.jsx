/* A linha de controles das vistas do espaço (a do sistema e a da missão): o botão de tocar, o
 * cursor do relógio da vista e a hora em que ele está, em UTC. Os botões próprios de cada vista
 * entram depois, como filhos, na mesma linha. */
import { formatUtc } from '../panel/format.js'
import './ViewClock.css'

const HOUR_MS = 3600e3

/* clock: o relógio da vista (useViewClock). startUtc: a data em que ele começa (um Date).
   periodHours: quantas horas ele cobre. labels: os textos, { play, pause, timeLabel }, do arquivo
   de textos de cada vista. */
export function ViewClock({ clock, startUtc, periodHours, labels, children }) {
  const wholeHour = Math.floor(clock.hour)
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
        max={periodHours - 1}
        step="1"
        value={wholeHour}
        onChange={(event) => clock.seek(Number(event.target.value))}
        aria-label={labels.timeLabel}
        aria-valuetext={formatUtc(new Date(startMs + clock.hour * HOUR_MS))}
      />
      <span className="view-clock__when">{formatUtc(new Date(startMs + wholeHour * HOUR_MS))}</span>
      {children}
    </div>
  )
}
