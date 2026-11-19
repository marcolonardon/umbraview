/* O painel de voo da missão (card C17, fase 3, redesenhado em 19/11/2026 no estilo de uma
 * transmissão de lançamento): o que fica na tela depois do lançamento.
 *
 *   - O HUD, numa faixa embaixo da cena: o trilho em arco, um controle só para o tempo, da Terra à
 *     Lua; o tempo de missão grande; dois mostradores da nave; a fase de agora; e os botões de
 *     tocar, da velocidade e da câmera.
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
import { arcPath, arcPoint, gaugeArc, gaugeScale } from './missionHud.js'
import './MissionControl.css'

const HOUR_MS = 3600e3
/* Em quantos passos o trilho é dividido: 100 por unidade de peso das fases. É o que as setas do
   teclado andam de cada vez. */
export const TRACK_STEPS = 900

/* O arco do trilho no desenho: a largura e quanto as pontas ficam abaixo do meio, em pixels do
   viewBox. A altura a mais é para os nomes das fases, em cima de cada ponto. */
const ARC = Object.freeze({ width: 600, sag: 34 })
const ARC_TOP = 22
// o arco inteiro, feito uma vez: a parte voada é ele mesmo, aceso pelo tracejado
const ARC_PATH = arcPath(0, 1, ARC, 96)
const ARC_HEIGHT = ARC_TOP + ARC.sag + 26
// o mostrador redondo: o raio e quanto da volta ele ocupa (três quartos, aberto embaixo)
const GAUGE_RADIUS = 30
const GAUGE_SWEEP = 0.75
const GAUGE_LENGTH = 2 * Math.PI * GAUGE_RADIUS * GAUGE_SWEEP

/* Um mostrador redondo da nave: o rótulo, o número no meio, a unidade embaixo, a escala em que ele
   está e o arco aceso pela fração dela (gaugeArc). A escala acompanha o valor (gaugeScale), em
   degraus de 1, 2 e 5 vezes uma potência de dez. value: o número já em texto, ou null nos trechos
   desenhados. scale: a escala, já em texto. É desenho: os mesmos números estão no cartão de voo, que
   o leitor de tela lê. */
function Gauge({ label, value, unit, fraction, scale }) {
  return (
    <div className="mission-hud__gauge">
      <svg className="mission-hud__gauge-dial" viewBox="-40 -40 80 80" aria-hidden="true">
        <circle
          className="mission-hud__gauge-track"
          r={GAUGE_RADIUS}
          strokeDasharray={`${GAUGE_LENGTH} 1000`}
          transform="rotate(135)"
        />
        <circle
          className="mission-hud__gauge-fill"
          r={GAUGE_RADIUS}
          strokeDasharray={`${GAUGE_LENGTH * (value === null ? 0 : fraction)} 1000`}
          transform="rotate(135)"
        />
      </svg>
      <span className="mission-hud__gauge-label">{label}</span>
      <span className="mission-hud__gauge-value">{value ?? missionView.gaugeNone}</span>
      <span className="mission-hud__gauge-unit">{unit}</span>
      {value !== null && <span className="mission-hud__gauge-scale">{missionView.gaugeScaleText(scale)}</span>}
    </div>
  )
}

/* O painel de voo em estilo de transmissão (pedido pelo Marco em 19/11/2026, inspirado nas
   transmissões de lançamento), numa faixa embaixo da cena. Substitui o cartão de voo e o trilho reto:
   - à esquerda, dois mostradores redondos, a velocidade e a altura;
   - no meio, o arco da missão, um ponto por fase, com a parte voada acesa, e embaixo dele o tempo de
     missão grande e o nome da missão. Por cima do arco fica um controle deslizante comum, invisível,
     que é quem anda com o mouse, as setas e o leitor de tela: o x do arco anda por igual com o lugar
     no trilho (arcPoint), então os dois apontam o mesmo lugar;
   - à direita, a fase de agora e uma frase sobre ela, e os botões de tocar, da velocidade e da câmera.
   layout, position, phase, elapsedHours: os pedaços do trilho, o lugar nele (de 0 a 1), a fase e o
   tempo de missão. telemetry: a nave em números (telemetryAt). missionName: o local de pouso e a base, já em texto. playing, fast e freeCamera,
   com os on*: os três botões. onSeek: chamada com o lugar do trilho, de 0 a 1. focusTarget: a ref do
   botão de tocar, para onde o foco vai quando o Launch sai da página (useKeepFocus). */
export function MissionHud({
  layout, position, phase, elapsedHours, telemetry, missionName,
  playing, onTogglePlay, fast, onToggleFast, onSeek, freeCamera, onToggleFreeCamera, focusTarget,
}) {
  const drawn = telemetry.kind === 'schematic'
  const flownTo = Math.max(0, Math.min(1, position))
  const [craftX, craftY] = arcPoint(flownTo, ARC)
  const speedScale = gaugeScale(telemetry.speedKmS)
  const altitudeScale = gaugeScale(telemetry.altitudeKm)
  return (
    <div className="mission-hud">
      <div className="mission-hud__gauges" aria-hidden="true">
        <Gauge
          label={missionView.gaugeSpeed}
          value={drawn ? null : telemetry.speedKmS.toFixed(2)}
          unit={missionView.gaugeSpeedUnit}
          fraction={gaugeArc(telemetry.speedKmS, speedScale)}
          scale={speedScale.toLocaleString('en-US')}
        />
        <Gauge
          label={missionView.gaugeAltitude}
          value={drawn ? null : Math.round(telemetry.altitudeKm).toLocaleString('en-US')}
          unit={missionView.gaugeAltitudeUnit(telemetry.body)}
          fraction={gaugeArc(telemetry.altitudeKm, altitudeScale)}
          scale={altitudeScale.toLocaleString('en-US')}
        />
        <span className="mission-hud__caption">{missionView.hudTelemetry}</span>
      </div>

      <div className="mission-hud__center">
        <div className="mission-hud__arc">
          <svg className="mission-hud__arc-svg" viewBox={`-20 ${-ARC_TOP} ${ARC.width + 40} ${ARC_HEIGHT}`} aria-hidden="true">
            <path className="mission-hud__arc-line" d={ARC_PATH} />
            {/* A parte voada é o mesmo arco, aceso até o lugar de agora pelo tracejado: o caminho
                não é refeito a cada quadro, e a ponta anda lisa, sem os degraus dos pedaços retos
                que o caminho refeito ganhava (o Marco viu a linha travando em 19/11/2026). */}
            <path className="mission-hud__arc-flown" d={ARC_PATH} pathLength="1" strokeDasharray={`${flownTo} 1`} />
            {layout.map((piece, i) => {
              const [x, y] = arcPoint(piece.from, ARC)
              /* Os nomes alternam em cima e embaixo do arco: as fases curtas do começo ficam a poucos
                 pixels uma da outra, e "Climb" encostava em "Parking orbit" (visto no navegador). */
              const below = i % 2 === 1
              return (
                <g key={piece.phase} className="mission-hud__event" data-done={position >= piece.from} data-current={piece.phase === phase}>
                  <circle cx={x} cy={y} r="5" />
                  <text x={x} y={below ? y + 20 : y - 11} textAnchor="middle">
                    {missionView.phaseNames[piece.phase]}
                  </text>
                </g>
              )
            })}
            <circle className="mission-hud__arc-craft" cx={craftX} cy={craftY} r="4" />
          </svg>
          {/* Um <input type="range"> comum, sem aparência própria: anda com as setas e é lido como
              um controle deslizante. O leitor de tela ouve a fase e o tempo de missão. */}
          <input
            className="mission-hud__range"
            type="range"
            min="0"
            max={TRACK_STEPS}
            step="1"
            value={Math.round(position * TRACK_STEPS)}
            onChange={(event) => onSeek(Number(event.target.value) / TRACK_STEPS)}
            aria-label={missionView.progressLabel}
            aria-valuetext={missionView.progressValue(missionView.phaseNames[phase], formatElapsed(elapsedHours))}
          />
        </div>
        {/* A legenda das fases, para o leitor de tela: na tela, os nomes já estão no arco. */}
        <ol className="mission-hud__phases" aria-label={missionView.timelineLabel}>
          {layout.map((piece) => (
            <li key={piece.phase} aria-current={piece.phase === phase ? 'step' : undefined} data-done={position >= piece.to}>
              {missionView.phaseNames[piece.phase]}
            </li>
          ))}
        </ol>
        {/* O cartão de voo: um grupo com nome, e não um aviso, porque os números mudam a cada quadro.
            Na tela fica só o tempo, grande; a fase está à direita e os números, nos mostradores. */}
        <div className="mission-hud__clock" role="group" aria-label={missionView.flightStatus}>
          <span className="mission-hud__hidden">{missionView.phaseNames[telemetry.phase]}</span>
          <span className="mission-hud__time">{missionView.elapsedValue(formatElapsed(elapsedHours))}</span>
          <span className="mission-hud__hidden">
            {drawn ? missionView.drawnValue : missionView.telemetryValue(telemetry.altitudeKm, telemetry.body, telemetry.speedKmS)}
          </span>
        </div>
        <span className="mission-hud__mission">{missionName}</span>
      </div>

      <div className="mission-hud__side">
        <span className="mission-hud__event-title">{missionView.phaseNames[phase]}</span>
        <p className="mission-hud__event-note">{missionView.phaseNotes[phase]}</p>
        <div className="mission-hud__buttons">
          <button ref={focusTarget} className="mission-hud__button" type="button" aria-pressed={playing} onClick={onTogglePlay}>
            {playing ? missionView.pause : missionView.play}
          </button>
          <button className="mission-hud__button" type="button" aria-pressed={fast} onClick={onToggleFast}>
            {missionView.fastLabel}
          </button>
          <button className="mission-hud__button" type="button" aria-pressed={freeCamera} onClick={onToggleFreeCamera}>
            {missionView.freeCamera}
          </button>
        </div>
      </div>
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
