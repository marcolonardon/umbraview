/* O painel de voo da missão (card C17, fase 3): o que fica na tela depois do lançamento.
 *
 *   - O trilho: um controle só para o tempo, da Terra à Lua, com o botão de tocar e pausar e a
 *     velocidade. Substitui a linha do tempo de seis botões mais o cursor do relógio, que eram sete
 *     controles para a mesma coisa. Embaixo dele ficam os nomes das fases, só como legenda.
 *   - O cartão de voo: a fase, o tempo de missão e a nave em números (a altura e a velocidade).
 *   - O resumo, quando a nave pousa.
 *
 * O trilho não é uma régua de tempo: cada fase ocupa um pedaço dele pelo peso dela (trackLayout,
 * em missionPath.js), para o lançamento e o pouso, que duram minutos, não sumirem ao lado da
 * travessia, que dura dias. Todo número daqui vem dos pontos do caminho que o motor calculou; nos
 * dois trechos desenhados o cartão diz que é desenho e não mostra número.
 */
import { useId } from 'react'

import { missionView } from '../data/missionView.js'
import { formatElapsed } from '../panel/format.js'
import './MissionControl.css'

const HOUR_MS = 3600e3
/* Em quantos passos o trilho é dividido: 100 por unidade de peso das fases. É o que as setas do
   teclado andam de cada vez. */
export const TRACK_STEPS = 900

/* layout: os pedaços do trilho (trackLayout). position: onde a missão está no trilho, de 0 a 1.
   phase: a fase em que a nave está. elapsedHours: o tempo de missão. playing e onTogglePlay: o
   botão de tocar. fast e onToggleFast: a velocidade. onSeek: chamada com o lugar do trilho, de 0 a
   1, para onde a pessoa levou o cursor. freeCamera e onToggleFreeCamera: o botão que solta a
   câmera, que voando se põe sozinha. focusTarget: a ref do botão de tocar, para onde o foco vai
   quando o botão Launch sai da página (useKeepFocus). */
export function MissionTrack({
  layout, position, phase, elapsedHours, playing, onTogglePlay, fast, onToggleFast, onSeek, freeCamera, onToggleFreeCamera, focusTarget,
}) {
  return (
    <div className="mission-track">
      <button ref={focusTarget} className="view-clock__button" type="button" aria-pressed={playing} onClick={onTogglePlay}>
        {playing ? missionView.pause : missionView.play}
      </button>
      <span className="mission-track__end">{missionView.earth}</span>
      <div className="mission-track__rail">
        {/* Um <input type="range"> comum: já anda com as setas e é lido como um controle deslizante.
            O leitor de tela ouve a fase e o tempo de missão, e não um número de 0 a 900. */}
        <input
          className="mission-track__range"
          type="range"
          min="0"
          max={TRACK_STEPS}
          step="1"
          value={Math.round(position * TRACK_STEPS)}
          onChange={(event) => onSeek(Number(event.target.value) / TRACK_STEPS)}
          aria-label={missionView.progressLabel}
          aria-valuetext={missionView.progressValue(missionView.phaseNames[phase], formatElapsed(elapsedHours))}
        />
        {/* A legenda do trilho: o nome de cada fase embaixo do pedaço dela. Não são botões: quem
            leva a missão a uma fase é o próprio trilho. */}
        <ol className="mission-track__phases" aria-label={missionView.timelineLabel}>
          {layout.map((piece) => (
            <li
              key={piece.phase}
              className="mission-track__phase"
              // a largura do pedaço é a da fase no trilho: é um dado da missão, e não um tamanho do desenho
              style={{ flexGrow: piece.to - piece.from }}
              aria-current={piece.phase === phase ? 'step' : undefined}
              data-done={position >= piece.to}
            >
              {/* num trilho estreito o nome sai da vista e fica só para o leitor de tela (MissionControl.css) */}
              <span className="mission-track__phase-name">{missionView.phaseNames[piece.phase]}</span>
            </li>
          ))}
        </ol>
      </div>
      <span className="mission-track__end">{missionView.moon}</span>
      <button className="view-clock__button" type="button" aria-pressed={fast} onClick={onToggleFast}>
        {missionView.fastLabel}
      </button>
      <button className="view-clock__button" type="button" aria-pressed={freeCamera} onClick={onToggleFreeCamera}>
        {missionView.freeCamera}
      </button>
    </div>
  )
}

/* O cartão de voo, por cima da cena. telemetry: a nave em números (telemetryAt). elapsedHours: o
   tempo de missão. É um grupo com nome, e não um aviso: tocando, os números mudam a cada quadro, e
   um aviso faria o leitor de tela falar sem parar. */
export function MissionTelemetry({ telemetry, elapsedHours }) {
  return (
    <div className="mission-telemetry" role="group" aria-label={missionView.flightStatus}>
      <span className="mission-telemetry__phase">{missionView.phaseNames[telemetry.phase]}</span>
      <span className="mission-telemetry__time">{missionView.elapsedValue(formatElapsed(elapsedHours))}</span>
      <span className="mission-telemetry__numbers">
        {telemetry.kind === 'schematic'
          ? missionView.drawnValue
          : missionView.telemetryValue(telemetry.altitudeKm, telemetry.body, telemetry.speedKmS)}
      </span>
    </div>
  )
}

/* O resumo, quando o relógio chega ao pouso. Só tem números que o motor calculou: quanto tempo a
   missão levou e quanto as três queimas mudaram a velocidade. Não é placar: não há com o que
   comparar, e o projeto não inventa número. mission: a missão da ponte. onRelaunch: lança de novo. */
export function MissionComplete({ mission, onRelaunch }) {
  const titleId = useId()
  const totalHours = (mission.landingUtc.getTime() - mission.launchUtc.getTime()) / HOUR_MS
  const totalDeltaV = mission.tliDeltaVKmS + mission.loiDeltaVKmS + mission.descentDeltaVKmS
  return (
    <section className="mission-complete" aria-labelledby={titleId}>
      <h3 id={titleId} className="mission-complete__title">
        {missionView.completeTitle}
      </h3>
      <dl className="mission-complete__facts">
        <div>
          <dt>{missionView.totalTime}</dt>
          {/* o mesmo jeito de escrever do tempo de missão do cartão de voo: os dois têm que dizer o mesmo número */}
          <dd>{formatElapsed(totalHours)}</dd>
        </div>
        <div>
          <dt>{missionView.totalDeltaV}</dt>
          <dd>{missionView.totalDeltaVValue(totalDeltaV)}</dd>
        </div>
      </dl>
      <button className="view-clock__button" type="button" onClick={onRelaunch}>
        {missionView.launchAgain}
      </button>
    </section>
  )
}
