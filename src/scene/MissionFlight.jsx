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
import { formatDuration, formatElapsed } from '../panel/format.js'
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
/* O instrumento da telemetria: três anéis, um dentro do outro, cada um aceso pela fração do valor na
   escala dele (gaugeArc e gaugeScale). Os anéis ocupam três quartos da volta, começando em cima. Um
   instrumento só, e não um mostrador por número: a primeira versão tinha dois mostradores redondos
   lado a lado, e o Marco achou parecido demais com a referência (19/11/2026). Os raios, de fora para
   dentro, e a espessura, em unidades do desenho: */
const RING_RADII = [42, 32, 22]
const RING_WIDTH = 6
const RING_SWEEP = 0.75

/* Os três anéis. readings: [{ key, fraction }], de fora para dentro. É desenho: os números estão na
   legenda ao lado e no cartão de voo, que o leitor de tela lê. */
function TelemetryRings({ readings }) {
  return (
    <svg className="mission-hud__rings" viewBox="-50 -50 100 100" aria-hidden="true">
      {readings.map(({ key, fraction }, i) => {
        const length = 2 * Math.PI * RING_RADII[i] * RING_SWEEP
        return (
          <g key={key} className={`mission-hud__ring mission-hud__ring--${key}`} transform="rotate(-90)">
            <circle className="mission-hud__ring-track" r={RING_RADII[i]} strokeWidth={RING_WIDTH} strokeDasharray={`${length} 1000`} />
            <circle className="mission-hud__ring-fill" r={RING_RADII[i]} strokeWidth={RING_WIDTH} strokeDasharray={`${length * fraction} 1000`} />
          </g>
        )
      })}
    </svg>
  )
}

/* Uma linha da legenda: a cor do anel, o rótulo, o número, a unidade e a escala em que o anel está.
   value: o número já em texto, ou null nos trechos desenhados, que mostram "—" e nenhuma escala. */
function Readout({ ring, label, value, unit, scale }) {
  return (
    <div className={`mission-hud__readout mission-hud__readout--${ring}`}>
      <span className="mission-hud__readout-label">{label}</span>
      <span className="mission-hud__readout-value">
        {value ?? missionView.gaugeNone} <span className="mission-hud__readout-unit">{unit}</span>
      </span>
      {value !== null && <span className="mission-hud__readout-scale">{missionView.gaugeScaleText(scale)}</span>}
    </div>
  )
}

/* O painel de voo em estilo de transmissão (pedido pelo Marco em 19/11/2026, inspirado nas
   transmissões de lançamento), numa faixa embaixo da cena. Substitui o cartão de voo e o trilho reto:
   - à esquerda, a telemetria: três anéis, um dentro do outro, e a legenda com os números (a
     distância até a Lua, a altura e a velocidade), só quando há número de verdade;
   - no meio, o arco da missão, um ponto por fase, com a parte voada acesa, e embaixo dele o tempo de
     missão grande e o nome da missão. Por cima do arco fica um controle deslizante comum, invisível,
     que é quem anda com o mouse, as setas e o leitor de tela: o x do arco anda por igual com o lugar
     no trilho (arcPoint), então os dois apontam o mesmo lugar;
   - à direita, a fase de agora e uma frase sobre ela, e os botões de tocar, da velocidade e da câmera.
   layout, position, phase, elapsedHours: os pedaços do trilho, o lugar nele (de 0 a 1), a fase e o
   tempo de missão. telemetry: a nave em números (telemetryAt). moonDistanceKm: a distância da nave
   até o chão da Lua (moonDistanceKm, em missionHud.js), ou null nos trechos desenhados. next: o próximo evento,
   { name, remainingHours }, ou null depois do pouso. missionName: o local de pouso e a base, já em
   texto. playing e freeCamera, com os on*: os botões de tocar e da câmera. speeds, speed e
   onSpeedChange: o seletor da velocidade de tocar. warp: quantas vezes mais rápido que o tempo de
   verdade a missão anda na fase de agora (timeWarp). summary: o resumo do pouso (MissionComplete),
   ou null antes dele; no pouso ele fica embaixo do relógio, e a frase da fase e a contagem saem. onSeek: chamada com o lugar do trilho, de 0 a 1. focusTarget: a ref do
   botão de tocar, para onde o foco vai quando o Launch sai da página (useKeepFocus). */
export function MissionHud({
  layout, position, phase, elapsedHours, telemetry, moonDistanceKm = null, next = null, missionName, summary = null,
  playing, onTogglePlay, speeds, speed, onSpeedChange, warp, onSeek, freeCamera, onToggleFreeCamera, focusTarget,
}) {
  const drawn = telemetry.kind === 'schematic'
  const flownTo = Math.max(0, Math.min(1, position))
  const [craftX, craftY] = arcPoint(flownTo, ARC)
  const speedScale = gaugeScale(telemetry.speedKmS)
  const altitudeScale = gaugeScale(telemetry.altitudeKm)
  const moonDistance = moonDistanceKm ?? 0
  const moonScale = gaugeScale(moonDistance)
  return (
    <div className="mission-hud">
      {/* A telemetria fica sempre à vista; nos trechos desenhados (a subida e o pouso final), sem
          número: os anéis apagam e a legenda diz "—" (o Marco preferiu assim, em 19/11/2026). */}
      <div className="mission-hud__telemetry" aria-hidden="true">
        <>
            <span className="mission-hud__caption">{missionView.hudTelemetry}</span>
            <div className="mission-hud__instrument">
              <TelemetryRings
                readings={[
                  { key: 'moon', fraction: drawn ? 0 : gaugeArc(moonDistance, moonScale) },
                  { key: 'altitude', fraction: drawn ? 0 : gaugeArc(telemetry.altitudeKm, altitudeScale) },
                  { key: 'speed', fraction: drawn ? 0 : gaugeArc(telemetry.speedKmS, speedScale) },
                ]}
              />
              <div className="mission-hud__readouts">
                <Readout
                  ring="moon"
                  label={missionView.gaugeMoon}
                  value={drawn ? null : Math.round(moonDistance).toLocaleString('en-US')}
                  unit={missionView.gaugeMoonUnit}
                  scale={moonScale.toLocaleString('en-US')}
                />
                <Readout
                  ring="altitude"
                  label={missionView.gaugeAltitude}
                  value={drawn ? null : Math.round(telemetry.altitudeKm).toLocaleString('en-US')}
                  unit={missionView.gaugeAltitudeUnit(telemetry.body)}
                  scale={altitudeScale.toLocaleString('en-US')}
                />
                <Readout
                  ring="speed"
                  label={missionView.gaugeSpeed}
                  value={drawn ? null : telemetry.speedKmS.toFixed(2)}
                  unit={missionView.gaugeSpeedUnit}
                  scale={speedScale.toLocaleString('en-US')}
                />
              </div>
            </div>
        </>
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
            {drawn
              ? missionView.drawnValue
              : `${missionView.telemetryValue(telemetry.altitudeKm, telemetry.body, telemetry.speedKmS)} · ${missionView.moonDistanceValue(moonDistance)}`}
          </span>
        </div>
        {/* Quanto o tempo está acelerado agora: muda de fase para fase, e com a velocidade de tocar. */}
        <p className="mission-hud__warp">
          <span className="mission-hud__warp-label">{missionView.hudWarpLabel}</span>{' '}
          <span className="mission-hud__warp-value">{missionView.hudWarpValue(Math.round(warp).toLocaleString('en-US'))}</span>{' '}
          <span className="mission-hud__warp-second">{missionView.hudWarpSecond(formatDuration(warp / 3600))}</span>
        </p>
        <span className="mission-hud__mission">{missionName}</span>
        {/* No pouso, o resumo fica aqui, numa linha, embaixo do relógio: solto por cima da cena ele
            cobria o mapa do caminho, e na coluna da direita, estreita, ficava alto demais numa tela de
            720 px (vistos pelo Marco e num Chrome sem janela, em 19/11/2026). */}
        {summary}
      </div>

      <div className="mission-hud__side">
        <span className="mission-hud__event-title">{missionView.phaseNames[phase]}</span>
        {/* no pouso a frase da fase dá lugar ao resumo, embaixo do relógio */}
        {!summary && <p className="mission-hud__event-note">{missionView.phaseNotes[phase]}</p>}
        {/* A contagem até o próximo evento: na órbita de espera e na lunar os mostradores ficam
            parados, porque a órbita é um círculo, e o painel parecia travado (visto pelo Marco). */}
        {!summary && next && (
          <p className="mission-hud__next">
            <span className="mission-hud__next-label">{missionView.hudNext}</span>{' '}
            <span className="mission-hud__next-name">{next.name}</span>{' '}
            <span className="mission-hud__next-time">{missionView.hudCountdown(formatElapsed(next.remainingHours))}</span>
          </p>
        )}
        {/* A velocidade de tocar: três botões, um ligado de cada vez, sobre o ritmo normal. */}
        <div className="mission-hud__speeds" role="group" aria-label={missionView.playbackLabel}>
          {speeds.map((value) => (
            <button
              key={value}
              className="mission-hud__speed"
              type="button"
              aria-pressed={speed === value}
              onClick={() => onSpeedChange(value)}
            >
              {missionView.playbackOption(value)}
            </button>
          ))}
        </div>
        <div className="mission-hud__buttons">
          <button ref={focusTarget} className="mission-hud__button" type="button" aria-pressed={playing} onClick={onTogglePlay}>
            {playing ? missionView.pause : missionView.play}
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
