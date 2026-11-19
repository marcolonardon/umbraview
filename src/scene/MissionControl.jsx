/* O painel da missão (card C17), por cima da cena: três etiquetas, uma por passo, e um cartão só
 * com o passo aberto.
 *
 *   1. Onde pousar: um local conhecido, na lista, ou qualquer ponto da Lua, com um clique nela.
 *   2. Quando pousar: uma das janelas de pouso daquele local, e a data de onde elas são procuradas.
 *   3. De onde lançar: uma base, na lista ou com um clique na marca dela na Terra.
 *
 * Uma decisão por vez: a primeira versão mostrava os três passos abertos ao lado da cena, e a cena
 * ficava com 18% da tela (medido em 18/11/2026). Aqui o passo feito vira uma etiqueta com o que
 * foi escolhido, e clicar nela reabre o passo. Com os três feitos, o cartão é o do lançamento.
 * Quem guarda as escolhas, decide qual passo está aberto e faz a conta é quem usa o painel
 * (MissionView.jsx): ele só mostra e avisa.
 *
 * O jeito principal de escolher o local e a base é na cena: um pino na Lua, uma marca na Terra. As
 * listas continuam no cartão, recolhidas: são <select> comuns, como a de locais de pouso do painel
 * do ponto (SiteList.jsx), e é por elas que quem usa teclado ou leitor de tela escolhe, porque a
 * cena não recebe foco. As janelas são cartões, cada um um botão de rádio de verdade.
 */
import { useId } from 'react'

import { missionView } from '../data/missionView.js'
import { panel } from '../data/panel.js'
import { PERIOD_DAYS } from '../engine/config.js'
import { DateTimeControl } from '../panel/DateTimeControl.jsx'
import { formatDuration, formatUtc, formatUtcDate } from '../panel/format.js'
import './MissionControl.css'

// o valor da opção do ponto que veio do clique na Lua, que não tem id
const CUSTOM = 'custom'
// o passo que vem depois dos três: o cartão do lançamento
export const LAUNCH_STEP = 3

// o "≥" na janela cortada pelo período, como no painel do ponto: ela dura mais que a parte dentro dele
const windowDuration = (item) => `${item.startsBeforePeriod || item.endsAfterPeriod ? '≥ ' : ''}${formatDuration(item.durationHours)}`

/* sites: os locais de pouso conhecidos (src/data/sites.js). landingSite: o escolhido, { lat, lon }
   e, quando veio da lista, id e name; ou null. onLandingSiteChange: chamada com o local da lista.
   windows e landingWindow: as janelas de pouso do local e a escolhida, ou null.
   onLandingWindowChange: chamada com o começo da janela, em milissegundos UTC.
   dateUtc: a data de onde as janelas são procuradas (um Date). onDateChange: chamada com a data
   que a pessoa escolhe no passo da janela.
   launchSites e launchSite: as bases e a escolhida, ou null. onLaunchSiteChange: chamada com o id.
   openStep: o passo aberto no cartão, de 0 a 2, ou LAUNCH_STEP. onOpenStep: chamada com o passo
   da etiqueta que a pessoa clicou.
   notice: o que impede o passo aberto de andar, ou em que pé a conta está; fica num lugar que o
   leitor de tela anuncia. canLaunch: a missão está pronta. onLaunch: lança.
   focusTarget: a ref do elemento do cartão que recebe o foco quando ele se perde (useKeepFocus): a
   pergunta do passo aberto, ou, no passo do lançamento, que não tem pergunta, o aviso.
   onUseNextWindow: sem janela no período e com uma achada adiante (sky.nextWindow, card C18), a
   função que leva a busca para o período dela; sem isso, null, e o botão não aparece.
   showLandingAreas, onToggleLandingAreas e landingAreasText: o mapa de onde dá para pousar (card
   C18): se está ligado, quem liga e desliga, e a linha que diz o que a cor quer dizer. */
export function MissionControl({
  sites, landingSite, onLandingSiteChange,
  windows, landingWindow, onLandingWindowChange, dateUtc, onDateChange, onUseNextWindow = null,
  launchSites, launchSite, onLaunchSiteChange,
  openStep, onOpenStep, notice, canLaunch, onLaunch, focusTarget,
  showLandingAreas = false, onToggleLandingAreas = () => {}, landingAreasText = '',
}) {
  const titleId = useId()
  const windowTitleId = useId()
  const isCustom = Boolean(landingSite) && !landingSite.id
  /* O que cada etiqueta mostra: o nome curto do passo, e o que foi escolhido nele, quando foi. */
  const chips = [
    { label: missionView.chipLanding, value: landingSite && (isCustom ? missionView.customLandingSite : landingSite.name) },
    { label: missionView.chipWindow, value: landingWindow && missionView.windowChip(formatUtcDate(landingWindow.startUtc), windowDuration(landingWindow)) },
    { label: missionView.chipLaunch, value: launchSite && launchSite.name },
  ]

  /* Os mesmos grupos das outras listas. O Object.groupBy guarda a ordem em que cada grupo aparece:
     quem decide a ordem são o sites.js e o launchSites.js. */
  const siteGroups = Object.entries(
    Object.groupBy(sites, (site) => (site.landedAtUtc ? panel.siteGroupLanded : panel.siteGroupCandidates)),
  )
  const launchGroups = Object.entries(
    Object.groupBy(launchSites, (site) => (site.lunarLaunch ? missionView.groupLaunched : missionView.groupNotYet)),
  )

  return (
    <section className="mission-control" aria-labelledby={titleId}>
      <h3 id={titleId} className="mission-control__title">
        {missionView.controlTitle}
      </h3>
      <ol className="mission-control__chips">
        {chips.map((chip, step) => (
          <li key={chip.label}>
            <button
              className="mission-control__chip"
              type="button"
              aria-current={openStep === step ? 'step' : undefined}
              data-done={Boolean(chip.value)}
              onClick={() => onOpenStep(step)}
            >
              <span className="mission-control__mark" aria-hidden="true">
                {chip.value ? '✓' : step + 1}
              </span>
              {/* o nome do passo fica para o leitor de tela mesmo quando a etiqueta mostra o valor */}
              <span className={chip.value ? 'mission-control__chip-name mission-control__chip-name--hidden' : 'mission-control__chip-name'}>
                {chip.label}
                {chip.value ? ': ' : ''}
              </span>
              {chip.value && <span className="mission-control__chip-value">{chip.value}</span>}
            </button>
          </li>
        ))}
      </ol>

      <div className="mission-control__card">
        {/* A pergunta do passo recebe o foco quando ele se perde (focusTarget): por isso o tabIndex. */}
        {openStep === 0 && (
          <p ref={focusTarget} tabIndex={-1} className="mission-control__question">
            {missionView.stepLanding}
          </p>
        )}
        {openStep === 0 && <p className="mission-control__hint">{missionView.landingHint}</p>}
        {openStep === 0 && (
          <details className="mission-control__list">
            <summary className="mission-control__list-summary">{missionView.chooseFromList}</summary>
            {/* A primeira opção é um aviso, e não um local. O ponto que veio do clique na Lua não
                está na lista: ganha uma opção própria, só enquanto é ele o escolhido. */}
            <select
              className="mission-control__select"
              aria-label={missionView.stepLanding}
              value={isCustom ? CUSTOM : (landingSite?.id ?? '')}
              onChange={(event) => onLandingSiteChange(sites.find((site) => site.id === event.target.value))}
            >
              <option value="" disabled>
                {missionView.landingSitePlaceholder}
              </option>
              {isCustom && (
                <option value={CUSTOM} disabled>
                  {missionView.customLandingSite}
                </option>
              )}
              {siteGroups.map(([groupLabel, groupSites]) => (
                <optgroup key={groupLabel} label={groupLabel}>
                  {groupSites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </details>
        )}

        {openStep === 1 && (
          <p ref={focusTarget} tabIndex={-1} id={windowTitleId} className="mission-control__question">
            {missionView.stepWindow}
          </p>
        )}
        {/* Uma janela por cartão, com a duração em destaque: é ela que a pessoa compara. O rádio de
            verdade fica dentro do cartão, fora da vista: as setas do teclado trocam de janela. */}
        {openStep === 1 && landingWindow && (
          <div className="mission-control__windows" role="radiogroup" aria-labelledby={windowTitleId}>
            {windows.map((item) => (
              <label key={item.startUtc.getTime()} className="mission-control__window">
                <input
                  className="mission-control__radio"
                  type="radio"
                  name={windowTitleId}
                  checked={item === landingWindow}
                  onChange={() => onLandingWindowChange(item.startUtc.getTime())}
                />
                <span className="mission-control__window-duration">{windowDuration(item)}</span>{' '}
                <span className="mission-control__window-dates">
                  {missionView.windowRange(formatUtc(item.startUtc), formatUtc(item.endUtc))}
                </span>
              </label>
            ))}
          </div>
        )}

        {/* O mapa de onde dá para pousar (card C18), nos dois passos em que a câmera olha a Lua: é o
            mesmo da vista da Lua, ligado pelo mesmo botão. A linha ao lado diz o que a cor quer
            dizer; o aria-live faz o leitor de tela ler quando a conta termina. */}
        {(openStep === 0 || openStep === 1) && (
          <div className="mission-control__landing-areas">
            <button
              className="mission-control__toggle"
              type="button"
              aria-pressed={showLandingAreas}
              onClick={onToggleLandingAreas}
            >
              {missionView.landingAreasToggle}
            </button>
            <p className="mission-control__hint" aria-live="polite">
              {landingAreasText}
            </p>
          </div>
        )}

        {/* A data de onde as janelas são procuradas, com o mesmo controle do painel do ponto
            (DateTimeControl.jsx). Recolhida: quase sempre a pessoa só escolhe uma janela. Sem ela,
            quem não achava janela tinha que ir à vista da Lua trocar a data e voltar. */}
        {openStep === 1 && (
          <details className="mission-control__list">
            <summary className="mission-control__list-summary">{missionView.changeDate}</summary>
            <DateTimeControl dateUtc={dateUtc} onChange={onDateChange} />
            <p className="mission-control__hint">{missionView.dateHint(PERIOD_DAYS)}</p>
          </details>
        )}

        {openStep === 2 && (
          <p ref={focusTarget} tabIndex={-1} className="mission-control__question">
            {missionView.stepLaunch}
          </p>
        )}
        {openStep === 2 && <p className="mission-control__hint">{missionView.launchHint}</p>}
        {openStep === 2 && (
          <details className="mission-control__list">
            <summary className="mission-control__list-summary">{missionView.chooseFromList}</summary>
            <select
              className="mission-control__select"
              aria-label={missionView.stepLaunch}
              value={launchSite?.id ?? ''}
              onChange={(event) => onLaunchSiteChange(event.target.value)}
            >
              <option value="" disabled>
                {missionView.launchSitePlaceholder}
              </option>
              {launchGroups.map(([groupLabel, groupSites]) => (
                <optgroup key={groupLabel} label={groupLabel}>
                  {groupSites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </details>
        )}

        {/* Sempre na página, mesmo vazio: é o que faz o leitor de tela anunciar "calculando" e o
            resultado quando o texto muda. */}
        <p ref={openStep === LAUNCH_STEP ? focusTarget : undefined} tabIndex={-1} className="mission-control__notice" role="status">
          {notice}
        </p>

        {/* A próxima janela, quando o período não tem nenhuma (card C18): um clique leva a busca
            para o período dela, e as janelas de lá aparecem nos cartões. Fica logo depois do
            aviso, que diz quando ela abre e quanto dura: lê-se o aviso, e o botão vem em seguida. */}
        {openStep === 1 && onUseNextWindow && (
          <button className="mission-control__next-window" type="button" onClick={onUseNextWindow}>
            {missionView.useNextWindow}
          </button>
        )}

        {openStep === LAUNCH_STEP && (
          <button className="mission-control__launch" type="button" disabled={!canLaunch} onClick={onLaunch}>
            {missionView.launchButton}
          </button>
        )}
      </div>
    </section>
  )
}
