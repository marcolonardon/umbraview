/* A vista da missão (cards C13, C16 e C17): a cena em tela cheia, o painel da missão por cima dela
 * (três etiquetas e o cartão do passo aberto), e, depois do lançamento, a linha do tempo, o relógio
 * e o resumo. O desenho 3D é do WebGL, que o jsdom não tem: o Canvas vira um substituto vazio, e
 * as contas do desenho têm teste próprio (src/scene/missionScale.test.js,
 * src/scene/missionPath.test.js, src/scene/missionPicking.test.js e src/engine/earthSite.test.js).
 * A ponte da missão (useMission) é trocada: quem diz o que ela entrega é cada teste, e a conta de
 * verdade tem os testes dela (src/engine/mission.test.js e src/hooks/useMission.test.js). */
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { launchSites } from '../data/launchSites.js'
import { missionView } from '../data/missionView.js'
import { panel } from '../data/panel.js'
import { sites } from '../data/sites.js'
import { MISSION } from '../engine/config.js'
import { EARTH_EQUATORIAL_RADIUS_KM } from '../engine/earthSite.js'
import { systemStateAt } from '../engine/system.js'
import { useLandingAreas } from '../hooks/useLandingAreas.js'
import { useLaunchReach } from '../hooks/useLaunchReach.js'
import { useMission } from '../hooks/useMission.js'
import { MissionView } from './MissionView.jsx'

vi.mock('@react-three/fiber', () => ({ Canvas: () => <div data-testid="canvas" />, useFrame: () => {} }))
vi.mock('@react-three/drei', () => ({ Html: () => null, Line: () => null }))
vi.mock('../hooks/useMission.js', () => ({ useMission: vi.fn() }))
// o mapa das áreas de pouso roda num Worker, que o jsdom não tem; a conta tem os testes dela (useLandingAreas.test.js)
// quais bases servem para a janela (card C19): a conta tem os testes dela (mission.test.js, useLaunchReach.test.js)
vi.mock('../hooks/useLaunchReach.js', () => ({ useLaunchReach: vi.fn(() => null) }))
vi.mock('../hooks/useLandingAreas.js', () => ({ useLandingAreas: vi.fn(() => ({ status: 'idle', areas: null })) }))

const PARADA = { status: 'idle', mission: null }
beforeEach(() => {
  useMission.mockReset()
  useMission.mockReturnValue(PARADA)
})

const DATA = new Date('2026-11-14T00:00:00Z')
const KENNEDY = launchSites.find((site) => site.id === 'ksc-lc39a')
const ALCANTARA = launchSites.find((site) => site.id === 'alcantara-vls')

// o pouso da IM-2 (src/data/sites.js) e duas janelas de pouso, no formato do sky.landingWindows
const IM2 = { id: 'im-2', name: 'Athena (IM-2)', lat: -84.7906, lon: 29.1957 }
const JANELAS = [
  { startUtc: new Date('2026-12-05T00:00:00Z'), endUtc: new Date('2026-12-08T00:00:00Z'), durationHours: 72 },
  { startUtc: new Date('2026-12-11T06:00:00Z'), endUtc: new Date('2026-12-12T12:00:00Z'), durationHours: 30 },
]
const HORA = 3600e3

/* Uma missão no formato da ponte ("What the bridge delivers to the screen"), com números fáceis de
   reconhecer na tela e dois pontos por trecho. */
function missaoDaPonte() {
  const launch = Date.parse('2026-11-30T22:00:00Z')
  const instantes = { launch, parking: launch + 10 * 60e3, tli: launch + HORA, loi: launch + 97 * HORA, descent: launch + 109 * HORA }
  const low = instantes.descent + 57 * 60e3
  const landing = launch + 110 * HORA + 9 * 60e3
  const trecho = (phase, kind, center, from, to) => ({
    phase, kind, center, timesMs: Float64Array.of(from, to), positionsKm: Float32Array.of(7000, 0, 0, 0, 7000, 0),
  })
  return {
    launchUtc: new Date(launch),
    tliUtc: new Date(instantes.tli),
    loiUtc: new Date(instantes.loi),
    descentUtc: new Date(instantes.descent),
    landingUtc: new Date(landing),
    launchAzimuthDeg: 87.8,
    parkingInclinationDeg: 28.53,
    lunarInclinationDeg: 84.93,
    tliDeltaVKmS: 3.1408,
    loiDeltaVKmS: 0.8379,
    descentDeltaVKmS: 0.01946,
    crossingHours: 96,
    lunarOrbitHours: 12.36,
    elapsedMs: 80,
    segments: [
      trecho('ascent', 'schematic', 'earth', launch, instantes.parking),
      trecho('parking', 'integrated', 'earth', instantes.parking, instantes.tli),
      trecho('crossing', 'integrated', 'earth', instantes.tli, instantes.loi),
      trecho('lunarOrbit', 'integrated', 'moon', instantes.loi, instantes.descent),
      trecho('descent', 'integrated', 'moon', instantes.descent, low),
      trecho('landing', 'schematic', 'moon', low, landing),
    ],
  }
}

function renderView(props = {}) {
  const onLaunchSiteChange = vi.fn()
  const onLandingWindowChange = vi.fn()
  const onLandingSiteChange = vi.fn()
  const view = render(
    <MissionView
      dateUtc={DATA}
      launchSites={launchSites}
      launchSiteId={null}
      onLaunchSiteChange={onLaunchSiteChange}
      landingSite={null}
      skyStatus="idle"
      landingWindows={null}
      landingWindowStartMs={null}
      onLandingWindowChange={onLandingWindowChange}
      sites={sites}
      onLandingSiteChange={onLandingSiteChange}
      {...props}
    />,
  )
  return { onLaunchSiteChange, onLandingWindowChange, onLandingSiteChange, ...view }
}
// a vista com tudo escolhido: a base, o local de pouso e as janelas dele
const comTudo = (props = {}) =>
  renderView({ launchSiteId: KENNEDY.id, landingSite: IM2, skyStatus: 'ready', landingWindows: JANELAS, ...props })
const distanciaNoInstante = (date) => {
  const { distanceKm } = systemStateAt(date.getTime())
  return missionView.distanceValue(distanceKm, distanceKm / EARTH_EQUATORIAL_RADIUS_KM)
}

const IM2_DA_LISTA = sites.find((site) => site.id === 'im-2')
const painel = () => screen.getByRole('region', { name: missionView.controlTitle })
// a etiqueta de um passo: o nome dela começa pelo nome do passo, com ou sem o valor escolhido
const etiqueta = (nome) => within(painel()).getByRole('button', { name: new RegExp(`^${nome}`) })
const locais = () => within(painel()).getByLabelText(missionView.stepLanding)
const janelas = () => within(painel()).getByRole('radiogroup', { name: missionView.stepWindow })
const bases = () => within(painel()).getByLabelText(missionView.stepLaunch)
const lancar = () => within(painel()).getByRole('button', { name: missionView.launchButton })
/* Para onde a câmera está virada: 'pole' (o polo sul da Lua), 'earth' ou 'craft' (a nave). A câmera
   é do WebGL, que o teste não tem; a cena diz o alvo num atributo, e é ele que o teste lê. */
const camera = () => screen.getByRole('img', { name: /^3D view/ }).dataset.camera
const detalhes = () => screen.getByText(missionView.detailsSummary).closest('details')
const valor = (rotulo) => within(detalhes()).getByText(rotulo, { selector: 'dt' }).nextElementSibling.textContent
const SEGUNDA_JANELA = '1 d 6 h 11 Dec 2026, 06:00 UTC to 12 Dec 2026, 12:00 UTC'

describe('MissionView: a cena', () => {
  it('tem nome acessível, e os controles ficam fora dela: o que está dentro de uma imagem não é lido', () => {
    renderView()
    const cena = screen.getByRole('img', { name: missionView.label })
    expect(cena).not.toContainElement(painel())
  })

  it('diz que está em escala, com a distância da Lua em raios da Terra, nos detalhes recolhidos', () => {
    renderView()
    expect(detalhes()).not.toHaveAttribute('open')
    expect(within(detalhes()).getByText(/are to scale/, { selector: 'p' })).toHaveTextContent(/Moon is \d\d\.\d Earth radii away/)
    expect(valor(missionView.distance)).toBe(distanciaNoInstante(DATA))
  })
})

/* O painel da missão (card C17). Uma decisão por vez: só o passo aberto tem cartão, e o que já foi
   escolhido vira uma etiqueta. Na primeira versão os três passos ficavam abertos ao lado da cena,
   com 29 controles e 631 palavras na tela (medido em 18/11/2026). */
describe('MissionView: montar a missão, um passo por vez', () => {
  it('tem três etiquetas, em ordem, e a do passo aberto é a de agora', () => {
    renderView()
    const etiquetas = within(painel()).getAllByRole('listitem').map((item) => within(item).getByRole('button'))
    expect(etiquetas.map((botao) => botao.textContent)).toEqual(['1Landing', '2Window', '3Launch site'])
    expect(etiquetas.map((botao) => botao.getAttribute('aria-current'))).toEqual(['step', null, null])
  })

  it('sem nada escolhido, o cartão pergunta onde pousar, e só essa pergunta', () => {
    renderView()
    expect(within(painel()).getByText(missionView.stepLanding)).toBeInTheDocument()
    expect(locais()).toHaveDisplayValue(missionView.landingSitePlaceholder)
    expect(within(painel()).getAllByRole('combobox')).toHaveLength(1)
    expect(within(painel()).getByText(missionView.landingHint)).toBeInTheDocument()
    expect(within(painel()).queryByRole('button', { name: missionView.launchButton })).not.toBeInTheDocument()
  })

  /* O jeito principal de escolher é na cena: um pino, ou qualquer ponto da Lua. A lista continua
     ali, recolhida, porque é por ela que quem usa teclado escolhe: a cena não recebe foco. */
  it('as listas de locais e de bases ficam recolhidas atrás de "escolher numa lista"', () => {
    const { unmount } = renderView()
    const recolhida = (lista) => lista.closest('details')
    expect(recolhida(locais())).not.toHaveAttribute('open')
    expect(within(recolhida(locais())).getByText(missionView.chooseFromList)).toBeInTheDocument()
    unmount()
    comTudo({ launchSiteId: null })
    expect(recolhida(bases())).not.toHaveAttribute('open')
  })

  it('a lista de locais traz os conhecidos, e escolher avisa quem guarda a escolha', async () => {
    const { onLandingSiteChange } = renderView()
    expect(within(locais()).getAllByRole('option')).toHaveLength(sites.length + 1)
    await userEvent.selectOptions(locais(), IM2_DA_LISTA.name)
    expect(onLandingSiteChange).toHaveBeenCalledWith(IM2_DA_LISTA)
  })

  it('com o local escolhido, a etiqueta mostra o nome dele; o ponto clicado na Lua aparece como o seu ponto', () => {
    const { unmount } = renderView({ landingSite: IM2_DA_LISTA, skyStatus: 'loading' })
    expect(etiqueta(missionView.chipLanding)).toHaveTextContent(IM2_DA_LISTA.name)
    unmount()
    renderView({ landingSite: { lat: -88.5, lon: 120.25 }, skyStatus: 'loading' })
    expect(etiqueta(missionView.chipLanding)).toHaveTextContent(missionView.customLandingSite)
    fireEvent.click(etiqueta(missionView.chipLanding))
    expect(locais()).toHaveDisplayValue(missionView.customLandingSite)
    // a coordenada do ponto fica nos detalhes
    expect(valor(missionView.landingSiteLabel)).toBe('88.5000° S, 120.2500° E')
  })

  it('com o local, o passo aberto é o da janela, e ele diz que as janelas estão sendo calculadas', () => {
    renderView({ launchSiteId: KENNEDY.id, landingSite: IM2, skyStatus: 'loading' })
    expect(etiqueta(missionView.chipWindow)).toHaveAttribute('aria-current', 'step')
    expect(within(painel()).getByRole('status')).toHaveTextContent(missionView.windowsLoading)
    expect(within(painel()).queryByRole('combobox')).not.toBeInTheDocument()
    expect(useMission).toHaveBeenLastCalledWith(KENNEDY, IM2, null)
  })

  /* Trocando de local de pouso, as janelas do local anterior não servem para o novo: enquanto o
     céu do novo é calculado, nenhuma janela vai para a ponte, mesmo que as antigas ainda cheguem. */
  it('com o céu ainda sendo calculado, janelas que sobraram de antes não entram na lista nem na ponte', () => {
    renderView({ launchSiteId: KENNEDY.id, landingSite: IM2, skyStatus: 'loading', landingWindows: JANELAS })
    expect(within(painel()).getByRole('status')).toHaveTextContent(missionView.windowsLoading)
    expect(within(painel()).queryByRole('combobox')).not.toBeInTheDocument()
    expect(useMission).toHaveBeenLastCalledWith(KENNEDY, IM2, null)
  })

  it('se a conta das janelas falhou, ou se o local não tem janela no período, o passo da janela diz isso', () => {
    const { unmount } = renderView({ launchSiteId: KENNEDY.id, landingSite: IM2, skyStatus: 'error' })
    expect(within(painel()).getByRole('status')).toHaveTextContent(missionView.windowsError)
    unmount()
    comTudo({ landingWindows: [] })
    expect(etiqueta(missionView.chipWindow)).toHaveAttribute('aria-current', 'step')
    expect(within(painel()).getByRole('status')).toHaveTextContent('No landing window here in the next 30 days. Choose another date or another landing site.')
    expect(useMission).toHaveBeenLastCalledWith(KENNEDY, IM2, null)
  })

  /* A data de onde as janelas são procuradas só se trocava no painel do ponto, que na vista da
     missão sai da tela: quem não achava janela tinha que ir à vista da Lua, trocar a data e voltar
     (sobra do card C17). O controle é o mesmo do painel, recolhido no passo da janela. */
  const data = () => within(painel()).getByLabelText(panel.dateTimeLabel)

  it('no passo da janela dá para procurar a partir de outra data, com o mesmo controle do painel', () => {
    const onDateChange = vi.fn()
    comTudo({ onDateChange })
    fireEvent.click(etiqueta(missionView.chipWindow))
    expect(data()).toHaveValue('2026-11-14T00:00')
    expect(data().closest('details')).not.toHaveAttribute('open')
    expect(within(data().closest('details')).getByText(missionView.changeDate)).toBeInTheDocument()
    fireEvent.change(data(), { target: { value: '2026-12-01T00:00' } })
    expect(onDateChange).toHaveBeenCalledWith(new Date('2026-12-01T00:00:00Z'))
  })

  it('a data só aparece no passo da janela: uma decisão por vez', () => {
    comTudo({ launchSiteId: null })
    expect(within(painel()).queryByLabelText(panel.dateTimeLabel)).not.toBeInTheDocument()
  })

  it('sem janela no período, o aviso manda trocar a data ou o local, e a data está ali', () => {
    renderView({ landingSite: IM2, skyStatus: 'ready', landingWindows: [] })
    expect(within(painel()).getByRole('status')).toHaveTextContent(/another date or another landing site/)
    expect(data()).toBeInTheDocument()
  })

  /* Com janela na data nova, a primeira já vem escolhida, e o painel pularia para a base antes de
     a pessoa ver o que a data nova trouxe. Quem trocou a data fica no passo da janela. */
  it('depois de trocar a data o passo da janela continua aberto, com as janelas da data nova', () => {
    const { rerender } = renderView({ landingSite: IM2, skyStatus: 'ready', landingWindows: [], onDateChange: () => {} })
    fireEvent.change(data(), { target: { value: '2026-12-01T00:00' } })
    rerender(
      <MissionView
        dateUtc={new Date('2026-12-01T00:00:00Z')} launchSites={launchSites} launchSiteId={null} onLaunchSiteChange={() => {}}
        landingSite={IM2} skyStatus="ready" landingWindows={JANELAS} landingWindowStartMs={null} onLandingWindowChange={() => {}}
        sites={sites} onLandingSiteChange={() => {}} onDateChange={() => {}}
      />,
    )
    expect(etiqueta(missionView.chipWindow)).toHaveAttribute('aria-current', 'step')
    expect(within(janelas()).getAllByRole('radio')).toHaveLength(2)
    expect(data()).toHaveValue('2026-12-01T00:00')
  })

  it('a etiqueta da janela, aberta sem local de pouso, pede o local primeiro', () => {
    renderView()
    fireEvent.click(etiqueta(missionView.chipWindow))
    expect(within(painel()).getByRole('status')).toHaveTextContent(missionView.windowWaiting)
  })

  it('com janelas, a primeira já vem escolhida, a etiqueta mostra o dia e a duração, e o painel segue para a base', () => {
    comTudo({ launchSiteId: null })
    expect(etiqueta(missionView.chipWindow)).toHaveTextContent('5 Dec 2026 · 3 d')
    expect(etiqueta(missionView.chipLaunch)).toHaveAttribute('aria-current', 'step')
    expect(bases()).toHaveDisplayValue(missionView.launchSitePlaceholder)
    expect(within(painel()).getByText(missionView.launchHint)).toBeInTheDocument()
    expect(useMission).toHaveBeenLastCalledWith(null, IM2, JANELAS[0])
  })

  /* As janelas são cartões, e não uma lista: são duas ou três, e na lista o texto de cada uma
     (duas datas e a duração) ficava cortado. Cada cartão é um botão de rádio de verdade, para as
     setas do teclado funcionarem. */
  it('reabrindo o passo da janela, cada janela é um cartão, com a duração em destaque e as duas datas', () => {
    comTudo()
    fireEvent.click(etiqueta(missionView.chipWindow))
    const cartoes = within(janelas()).getAllByRole('radio')
    expect(cartoes).toHaveLength(2)
    expect(cartoes[0]).toHaveAccessibleName('3 d 5 Dec 2026, 00:00 UTC to 8 Dec 2026, 00:00 UTC')
    expect(cartoes[1]).toHaveAccessibleName(SEGUNDA_JANELA)
    expect(cartoes[0]).toBeChecked()
    expect(cartoes[1]).not.toBeChecked()
  })

  it('a janela cortada pelo período leva o "≥": ela dura mais do que a parte dentro dele', () => {
    const cortada = [{ ...JANELAS[0], startsBeforePeriod: true }, JANELAS[1]]
    comTudo({ landingWindows: cortada })
    fireEvent.click(etiqueta(missionView.chipWindow))
    expect(within(janelas()).getAllByRole('radio')[0]).toHaveAccessibleName('≥ 3 d 5 Dec 2026, 00:00 UTC to 8 Dec 2026, 00:00 UTC')
  })

  it('escolher outra janela avisa quem guarda a escolha, e a janela guardada é a que vai para a ponte', async () => {
    const { onLandingWindowChange, unmount } = comTudo()
    fireEvent.click(etiqueta(missionView.chipWindow))
    await userEvent.click(within(janelas()).getByRole('radio', { name: SEGUNDA_JANELA }))
    expect(onLandingWindowChange).toHaveBeenCalledWith(JANELAS[1].startUtc.getTime())
    unmount()

    comTudo({ landingWindowStartMs: JANELAS[1].startUtc.getTime() })
    expect(useMission).toHaveBeenLastCalledWith(KENNEDY, IM2, JANELAS[1])
  })

  it('uma janela guardada que não existe mais (a data mudou) cai na primeira da lista', () => {
    comTudo({ landingWindowStartMs: Date.parse('2026-10-01T00:00:00Z') })
    expect(useMission).toHaveBeenLastCalledWith(KENNEDY, IM2, JANELAS[0])
  })

  it('a lista de bases traz todas, em dois grupos, e escolher avisa quem guarda a escolha, com o id', async () => {
    const { onLaunchSiteChange } = comTudo({ launchSiteId: null })
    const jaLancaram = within(bases()).getByRole('group', { name: missionView.groupLaunched })
    const aindaNao = within(bases()).getByRole('group', { name: missionView.groupNotYet })
    expect(within(jaLancaram).getAllByRole('option')).toHaveLength(launchSites.length - 1)
    expect(within(aindaNao).getByRole('option', { name: ALCANTARA.name })).toBeInTheDocument()
    await userEvent.selectOptions(bases(), KENNEDY.name)
    expect(onLaunchSiteChange).toHaveBeenCalledWith(KENNEDY.id)
  })

  it('depois de reabrir um passo e escolher, o painel volta ao primeiro passo que falta', async () => {
    comTudo({ launchSiteId: null })
    fireEvent.click(etiqueta(missionView.chipLanding))
    expect(etiqueta(missionView.chipLanding)).toHaveAttribute('aria-current', 'step')
    await userEvent.selectOptions(locais(), IM2_DA_LISTA.name)
    expect(etiqueta(missionView.chipLaunch)).toHaveAttribute('aria-current', 'step')
  })

  /* A câmera vai aonde se escolhe. Antes havia um link "Show the Moon" e outro "Show the Earth", e
     depois quatro botões de câmera: era a pessoa que tinha que saber para onde olhar. */
  /* Fase 5: quem escolhe pela lista, com o teclado, está com o foco nela. A escolha fecha o passo,
     a lista sai da página, e o foco caía no corpo da página: o Tab seguinte recomeçava do topo, e
     o leitor de tela não dizia que a pergunta tinha mudado. */
  it('escolher numa lista não perde o foco: ele vai para a pergunta do passo seguinte', () => {
    const { rerender } = renderView()
    locais().focus()
    rerender(
      <MissionView
        dateUtc={DATA} launchSites={launchSites} launchSiteId={null} onLaunchSiteChange={() => {}}
        landingSite={IM2} skyStatus="ready" landingWindows={JANELAS} landingWindowStartMs={null} onLandingWindowChange={() => {}}
        sites={sites} onLandingSiteChange={() => {}}
      />,
    )
    expect(within(painel()).getByText(missionView.stepLaunch)).toHaveFocus()
  })

  it('no passo do lançamento, que não tem pergunta, o foco perdido vai para o aviso do cartão', () => {
    useMission.mockReturnValue({ status: 'ready', mission: missaoDaPonte() })
    const { rerender } = comTudo({ launchSiteId: null })
    bases().focus()
    rerender(
      <MissionView
        dateUtc={DATA} launchSites={launchSites} launchSiteId={KENNEDY.id} onLaunchSiteChange={() => {}}
        landingSite={IM2} skyStatus="ready" landingWindows={JANELAS} landingWindowStartMs={null} onLandingWindowChange={() => {}}
        sites={sites} onLandingSiteChange={() => {}}
      />,
    )
    expect(within(painel()).getByRole('status')).toHaveFocus()
    expect(within(painel()).getByRole('status')).toHaveTextContent(missionView.missionReady)
  })

  it('quando o passo muda e o foco está em outro controle, ele fica onde está', () => {
    const { rerender } = renderView()
    etiqueta(missionView.chipWindow).focus()
    rerender(
      <MissionView
        dateUtc={DATA} launchSites={launchSites} launchSiteId={null} onLaunchSiteChange={() => {}}
        landingSite={IM2} skyStatus="ready" landingWindows={JANELAS} landingWindowStartMs={null} onLandingWindowChange={() => {}}
        sites={sites} onLandingSiteChange={() => {}}
      />,
    )
    expect(etiqueta(missionView.chipWindow)).toHaveFocus()
  })

  it('a câmera acompanha o passo: o polo sul da Lua para o pouso, a Terra para a base', () => {
    const { unmount } = renderView()
    expect(camera()).toBe('pole')
    unmount()
    comTudo({ launchSiteId: null })
    expect(camera()).toBe('earth')
    fireEvent.click(etiqueta(missionView.chipLanding))
    expect(camera()).toBe('pole')
    fireEvent.click(etiqueta(missionView.chipLaunch))
    expect(camera()).toBe('earth')
  })

  it('planejando não há botão de câmera nenhum: ela vai sozinha, e o mouse gira e aproxima', () => {
    comTudo()
    expect(screen.queryByRole('button', { name: /camera/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Earth' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Moon' })).not.toBeInTheDocument()
  })

  it('planejando não há mapa do trajeto: a linha da missão ainda é uma prévia', () => {
    useMission.mockReturnValue({ status: 'ready', mission: missaoDaPonte() })
    comTudo()
    expect(screen.queryByRole('img', { name: missionView.mapLabel })).not.toBeInTheDocument()
  })

  it('planejando não há relógio nem linha do tempo: a vista não se mexe sozinha', () => {
    comTudo()
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: missionView.play })).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: missionView.timelineLabel })).not.toBeInTheDocument()
  })
})

describe('MissionView: o lançamento', () => {
  it('com os três passos feitos, o cartão é o do lançamento; enquanto a missão é calculada, o botão espera', () => {
    useMission.mockReturnValue({ status: 'loading', mission: null })
    comTudo()
    expect(within(painel()).getByRole('status')).toHaveTextContent(missionView.missionLoading)
    expect(lancar()).toBeDisabled()
    expect(within(painel()).queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('se nenhum caminho foi achado, o cartão diz isso, e o botão continua desligado', () => {
    useMission.mockReturnValue({ status: 'error', mission: null })
    comTudo()
    expect(within(painel()).getByRole('status')).toHaveTextContent(missionView.missionError)
    expect(lancar()).toBeDisabled()
  })

  it('com a missão pronta, diz que está pronta para lançar, e o nome da cena passa a falar da linha', () => {
    useMission.mockReturnValue({ status: 'ready', mission: missaoDaPonte() })
    comTudo()
    expect(within(painel()).getByRole('status')).toHaveTextContent(missionView.missionReady)
    expect(lancar()).toBeEnabled()
    expect(screen.getByRole('img', { name: missionView.labelWithMission })).toBeInTheDocument()
  })

  it('com a missão na tela, um selo diz que é uma missão de referência, e o texto abre no clique', () => {
    const { unmount } = comTudo()
    expect(screen.queryByText(missionView.referenceBadge)).not.toBeInTheDocument()
    unmount()
    useMission.mockReturnValue({ status: 'ready', mission: missaoDaPonte() })
    comTudo()
    const selo = screen.getByText(missionView.referenceBadge).closest('details')
    expect(selo).not.toHaveAttribute('open')
    expect(within(selo).getByText(missionView.referenceNote)).toBeInTheDocument()
  })
})

/* O painel de voo (card C17, fase 3): um trilho só para o tempo, da Terra à Lua, no lugar das seis
   fases mais o cursor; um botão para tocar e pausar; a velocidade; e um cartão com a nave em
   números. Antes eram 15 controles à mostra durante o voo. */
describe('MissionView: voando', () => {
  const missao = missaoDaPonte()
  beforeEach(() => {
    useMission.mockReturnValue({ status: 'ready', mission: missao })
  })
  const trilho = () => screen.getByRole('slider', { name: missionView.progressLabel })
  const irPara = (lugar) => fireEvent.change(trilho(), { target: { value: String(lugar) } })
  // lança e para o relógio, para o teste olhar a tela parada
  const voar = (props) => {
    const view = comTudo(props)
    fireEvent.click(lancar())
    fireEvent.click(screen.getByRole('button', { name: missionView.pause }))
    irPara(0)
    return view
  }
  const fases = () => within(screen.getByRole('list', { name: missionView.timelineLabel })).getAllByRole('listitem')
  const faseDeAgora = () => fases().filter((fase) => fase.getAttribute('aria-current') === 'step').map((fase) => fase.textContent)
  const voo = () => screen.getByRole('group', { name: missionView.flightStatus })
  const agora = () => valor(missionView.craftNow)

  it('lançar tira o painel da frente, toca o relógio do lançamento e põe a câmera na nave', () => {
    comTudo()
    fireEvent.click(lancar())
    expect(screen.queryByRole('region', { name: missionView.controlTitle })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: missionView.pause })).toHaveAttribute('aria-pressed', 'true')
    expect(camera()).toBe('craft')
    // a missão inteira leva 45 s: logo depois do clique o trilho ainda está no começo
    expect(Number(trilho().value)).toBeLessThan(60)
    expect(screen.getByRole('button', { name: missionView.changeMission })).toBeInTheDocument()
  })

  /* Fase 5: o botão Launch sai da página quando é apertado, e o foco ia junto. Agora vai para o
     botão de tocar e pausar, que é o que a pessoa quer ter à mão; e "mudar a missão" e "lançar de
     novo", que também somem ao serem apertados, devolvem o foco do mesmo jeito. */
  it('lançar leva o foco ao botão de pausar, e "mudar a missão" o devolve ao cartão do painel', () => {
    comTudo()
    lancar().focus()
    fireEvent.click(lancar())
    expect(screen.getByRole('button', { name: missionView.pause })).toHaveFocus()
    const mudar = screen.getByRole('button', { name: missionView.changeMission })
    mudar.focus()
    fireEvent.click(mudar)
    expect(within(painel()).getByRole('status')).toHaveFocus()
  })

  it('lançar de novo, do resumo, leva o foco de volta ao botão de pausar', () => {
    voar()
    irPara(900)
    const deNovo = screen.getByRole('button', { name: missionView.launchAgain })
    deNovo.focus()
    fireEvent.click(deNovo)
    expect(screen.getByRole('button', { name: missionView.pause })).toHaveFocus()
  })

  /* O cartão de voo não é um aviso: tocando, os números mudam a cada quadro, e o leitor de tela
     falaria sem parar. O que ele ouve é a troca de fase, seis vezes numa missão, e o pouso. */
  it('o leitor de tela é avisado quando a fase muda e quando a nave pousa, e não a cada quadro', () => {
    voar()
    const aviso = () => screen.getByRole('status')
    expect(aviso()).toHaveTextContent(/^Climb$/)
    irPara(350)
    expect(aviso()).toHaveTextContent(/^Crossing$/)
    irPara(360)
    expect(aviso()).toHaveTextContent(/^Crossing$/)
    irPara(900)
    expect(aviso()).toHaveTextContent(missionView.completeTitle)
  })

  it('um botão só toca e pausa', () => {
    voar()
    const tocar = screen.getByRole('button', { name: missionView.play })
    expect(tocar).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(tocar)
    expect(screen.getByRole('button', { name: missionView.pause })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: missionView.play })).not.toBeInTheDocument()
  })

  /* Voando, a câmera se põe sozinha, de um jeito por fase. Um botão só a solta: com a câmera livre
     a pessoa gira e aproxima à vontade, e a câmera continua indo junto com a nave. Eram quatro
     botões de câmera. */
  it('um botão só solta a câmera, e cada lançamento a prende de novo', () => {
    voar()
    const livre = () => screen.getByRole('button', { name: missionView.freeCamera })
    expect(livre()).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(livre())
    expect(livre()).toHaveAttribute('aria-pressed', 'true')
    expect(camera()).toBe('craft')
    irPara(900)
    fireEvent.click(screen.getByRole('button', { name: missionView.launchAgain }))
    expect(livre()).toHaveAttribute('aria-pressed', 'false')
  })

  it('o mapa do trajeto fica à mostra durante o voo, com nome para o leitor de tela e legenda', () => {
    voar()
    expect(screen.getByRole('img', { name: missionView.mapLabel })).toBeInTheDocument()
    expect(screen.getByText(missionView.mapCaption)).toBeInTheDocument()
  })

  it('a velocidade tem dois valores, e o botão dela diz qual está ligado', () => {
    voar()
    const rapido = screen.getByRole('button', { name: missionView.fastLabel })
    expect(rapido).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(rapido)
    expect(rapido).toHaveAttribute('aria-pressed', 'true')
  })

  /* O trilho não é uma régua de tempo: cada fase tem o seu pedaço. Os pesos são 1, 1, 3, 2, 1 e 1,
     em 900 passos: a subida vai de 0 a 100, a órbita de espera até 200, a travessia até 500, a
     órbita lunar até 700, a descida até 800 e o pouso até 900. */
  it('o trilho leva a nave pelas fases, cada uma no seu pedaço, sem pedir outra conta', () => {
    voar()
    expect(trilho()).toHaveAttribute('max', '900')
    expect(agora()).toBe(missionView.phases.ascent)
    irPara(100)
    expect(agora()).toBe(missionView.phases.parking)
    irPara(200)
    expect(agora()).toBe(missionView.phases.crossing)
    irPara(500)
    expect(agora()).toBe(missionView.phases.lunarOrbit)
    irPara(700)
    expect(agora()).toBe(missionView.phases.descent)
    irPara(800)
    expect(agora()).toBe(missionView.phases.landing)
    // a cada redesenho a ponte recebe a mesma base, o mesmo local e a mesma janela: a conta não é refeita
    expect(useMission.mock.calls.length).toBeGreaterThan(4)
    for (const pedido of useMission.mock.calls) expect(pedido).toEqual([KENNEDY, IM2, JANELAS[0]])
  })

  it('embaixo do trilho ficam os nomes das seis fases, em ordem, com a de agora marcada; não são botões', () => {
    voar()
    expect(fases().map((fase) => fase.textContent)).toEqual(['Climb', 'Parking orbit', 'Crossing', 'Lunar orbit', 'Descent', 'Landing'])
    expect(faseDeAgora()).toEqual(['Climb'])
    irPara(350)
    expect(faseDeAgora()).toEqual(['Crossing'])
    expect(within(screen.getByRole('list', { name: missionView.timelineLabel })).queryByRole('button')).not.toBeInTheDocument()
  })

  it('o leitor de tela ouve no trilho a fase e o tempo de missão, e não um número de 0 a 900', () => {
    voar()
    irPara(200)
    expect(trilho()).toHaveAttribute('aria-valuetext', 'Crossing, T+ 1 h 00 min')
  })

  /* A missão da ponte destes testes tem dois pontos por trecho: de 7000 km num eixo a 7000 km no
     outro. A altura e a velocidade do cartão saem desses pontos. */
  it('o cartão de voo mostra a fase, o tempo de missão, a altura e a velocidade, tirados do caminho', () => {
    voar()
    irPara(200)
    // o começo da travessia: 1 hora depois do lançamento, a 7000 km do centro da Terra (622 km do chão)
    expect(voo()).toHaveTextContent('Crossing')
    expect(voo()).toHaveTextContent('T+ 1 h 00 min')
    expect(voo()).toHaveTextContent('622 km above the Earth')
    // 9899 km em 96 horas
    expect(voo()).toHaveTextContent('0.03 km/s')
    irPara(500)
    // a chegada à Lua: 97 horas depois do lançamento; a altura passa a ser sobre a Lua
    expect(voo()).toHaveTextContent('Lunar orbit')
    expect(voo()).toHaveTextContent('T+ 4 d 01 h')
    expect(voo()).toHaveTextContent('5,263 km above the Moon')
    expect(voo()).toHaveTextContent('0.23 km/s')
  })

  it('nos dois trechos desenhados o cartão diz que é desenho, e não mostra altura nem velocidade', () => {
    voar()
    irPara(50)
    expect(voo()).toHaveTextContent('Climb')
    expect(voo()).toHaveTextContent(missionView.drawnValue)
    expect(voo()).not.toHaveTextContent('km')
    irPara(850)
    expect(voo()).toHaveTextContent(missionView.drawnValue)
  })

  it('no pouso, e só nele, mostra o resumo, com o tempo total e a soma das três queimas', () => {
    voar()
    expect(screen.queryByText(missionView.completeTitle)).not.toBeInTheDocument()
    // na descida, a minutos do pouso, a missão ainda não terminou
    irPara(899)
    expect(screen.queryByText(missionView.completeTitle)).not.toBeInTheDocument()
    irPara(900)
    const resumo = screen.getByRole('region', { name: missionView.completeTitle })
    const total = (rotulo) => within(resumo).getByText(rotulo, { selector: 'dt' }).nextElementSibling.textContent
    // 110 h 9 min do lançamento ao pouso; 3,1408 + 0,8379 + 0,0195 km/s
    expect(total(missionView.totalTime)).toBe('4 d 14 h')
    expect(total(missionView.totalDeltaV)).toBe('4.00 km/s')
    expect(voo()).toHaveTextContent('T+ 4 d 14 h')
  })

  it('do resumo dá para lançar de novo: o trilho volta ao começo, tocando', () => {
    voar()
    irPara(900)
    fireEvent.click(screen.getByRole('button', { name: missionView.launchAgain }))
    expect(Number(trilho().value)).toBeLessThan(60)
    expect(screen.getByRole('button', { name: missionView.pause })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText(missionView.completeTitle)).not.toBeInTheDocument()
  })

  it('"mudar a missão" volta ao painel, com a missão ainda montada, e o trilho sai da tela', () => {
    voar()
    fireEvent.click(screen.getByRole('button', { name: missionView.changeMission }))
    expect(lancar()).toBeEnabled()
    expect(etiqueta(missionView.chipLaunch)).toHaveTextContent(KENNEDY.name)
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: missionView.flightStatus })).not.toBeInTheDocument()
    expect(camera()).toBe('earth')
  })

  it('se a missão muda no meio do voo, a vista volta a planejar, e a câmera sai da nave', () => {
    const { rerender } = voar()
    expect(camera()).toBe('craft')
    useMission.mockReturnValue({ status: 'loading', mission: null })
    rerender(
      <MissionView
        dateUtc={DATA} launchSites={launchSites} launchSiteId={ALCANTARA.id} onLaunchSiteChange={() => {}}
        landingSite={IM2} skyStatus="ready" landingWindows={JANELAS} landingWindowStartMs={null} onLandingWindowChange={() => {}}
        sites={sites} onLandingSiteChange={() => {}}
      />,
    )
    expect(lancar()).toBeDisabled()
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
    expect(camera()).toBe('earth')
  })
})

describe('MissionView: os detalhes, recolhidos', () => {
  it('a base escolhida mostra a coordenada dela e um lançamento à Lua que saiu dali', () => {
    const { unmount } = renderView({ launchSiteId: KENNEDY.id })
    // as 4 casas da fonte, com o hemisfério por extenso no lugar do sinal
    expect(valor(missionView.coordinates)).toBe('28.6083° N, 80.6041° W')
    // em UTC: o IM-2 saiu no dia 26 pelo relógio da Flórida, e no dia 27 em UTC
    expect(valor(missionView.lunarLaunch)).toBe('IM-2, 27 Feb 2025')
    unmount()
    // a base que nunca lançou à Lua diz isso, em vez de ficar sem a linha
    renderView({ launchSiteId: ALCANTARA.id })
    expect(valor(missionView.coordinates)).toBe('2.3177° S, 44.3680° W')
    expect(valor(missionView.lunarLaunch)).toBe(missionView.noLunarLaunch)
  })

  it('sem missão, não há número de missão; com ela, os números são os que a ponte entregou, na ordem do voo', () => {
    const { unmount } = comTudo()
    expect(within(detalhes()).queryByText(missionView.launch, { selector: 'dt' })).not.toBeInTheDocument()
    unmount()
    useMission.mockReturnValue({ status: 'ready', mission: missaoDaPonte() })
    comTudo()
    expect(valor(missionView.launch)).toBe('30 Nov 2026, 22:00 UTC, heading 88° from north')
    expect(valor(missionView.parkingOrbit)).toBe("185 km up, tilted 28.5° to the Earth's equator")
    expect(valor(missionView.tli)).toBe('30 Nov 2026, 23:00 UTC, a burn of 3.14 km/s')
    expect(valor(missionView.crossing)).toBe('4 d')
    expect(valor(missionView.loi)).toBe('4 Dec 2026, 23:00 UTC, a burn of 0.84 km/s')
    expect(valor(missionView.lunarOrbit)).toBe("100 km up, tilted 84.9° to the Moon's equator, for 12 h")
    expect(valor(missionView.descent)).toBe('5 Dec 2026, 11:00 UTC, a burn of 19 m/s')
    expect(valor(missionView.landing)).toBe('5 Dec 2026, 12:09 UTC')
    // as alturas das duas órbitas são as do modelo, e não números soltos na tela
    expect(MISSION.parkingAltitudeKm).toBe(185)
    expect(MISSION.lunarOrbitAltitudeKm).toBe(100)
  })

  it('dizem o que é conta, o que é desenho, o que ficou de fora e quais são as escolhas do modelo', () => {
    useMission.mockReturnValue({ status: 'ready', mission: missaoDaPonte() })
    comTudo()
    expect(within(detalhes()).getByText(missionView.pathNote)).toBeInTheDocument()
    expect(within(detalhes()).getByText(missionView.leftOutNote)).toBeInTheDocument()
    expect(within(detalhes()).getByText(missionView.choicesNote(MISSION))).toBeInTheDocument()
    expect(missionView.choicesNote(MISSION)).toMatch(/185 km up.*about 4 days.*100 km up for about 12 hours.*12 hours after/)
  })
})

/* Card C18. Um ponto clicado ao acaso quase nunca tem janela nos 30 dias da data, e o cartão só
   dizia "troque a data ou o local": a pessoa ficava tentando no escuro. O motor procura adiante
   (sky.nextWindow, em src/engine/siteSky.js), e o cartão oferece a próxima janela ou diz por que
   não há nenhuma. */
describe('MissionView: a próxima janela, para um ponto sem janela no período (card C18)', () => {
  const PONTO = { lat: -87.5, lon: -150 }
  const PROXIMA = {
    landingWindow: { startUtc: new Date('2027-05-15T06:00:00Z'), endUtc: new Date('2027-05-17T10:00:00Z'), durationHours: 52 },
    periodStartUtc: new Date('2027-05-13T00:00:00Z'),
    searchedUntilUtc: new Date('2027-06-12T00:00:00Z'),
    earthEverAboveHorizon: true,
  }
  const semJanela = (nextWindow, props = {}) =>
    renderView({ landingSite: PONTO, skyStatus: 'ready', landingWindows: [], nextWindow, ...props })

  it('sem janela no período, o aviso diz quando abre a próxima e quanto ela dura', () => {
    semJanela(PROXIMA)
    expect(within(painel()).getByRole('status')).toHaveTextContent(
      'No landing window in the 30 days from 14 Nov 2026. The next one opens on 15 May 2027, 06:00 UTC and lasts 2 d 4 h.',
    )
  })

  it('um botão leva a busca para o período da próxima janela, e o passo da janela continua aberto', () => {
    const onDateChange = vi.fn()
    semJanela(PROXIMA, { onDateChange })
    fireEvent.click(within(painel()).getByRole('button', { name: missionView.useNextWindow }))
    expect(onDateChange).toHaveBeenCalledWith(PROXIMA.periodStartUtc)
    expect(etiqueta(missionView.chipWindow)).toHaveAttribute('aria-current', 'step')
  })

  it('no lado oculto diz que a Terra nunca aparece ali, e não oferece data nenhuma', () => {
    semJanela({ landingWindow: null, periodStartUtc: null, searchedUntilUtc: new Date('2027-12-09T00:00:00Z'), earthEverAboveHorizon: false })
    expect(within(painel()).getByRole('status')).toHaveTextContent(missionView.farSide)
    expect(within(painel()).queryByRole('button', { name: missionView.useNextWindow })).not.toBeInTheDocument()
  })

  it('sem janela em um ano, com a Terra à vista às vezes, diz até quando procurou', () => {
    semJanela({ landingWindow: null, periodStartUtc: null, searchedUntilUtc: new Date('2027-12-09T00:00:00Z'), earthEverAboveHorizon: true })
    expect(within(painel()).getByRole('status')).toHaveTextContent(
      'No landing window here until 9 Dec 2027: the Sun and the Earth are never in view together for 24 hours in a row. Choose another landing site.',
    )
  })

  it('com janela no período, nada muda: as janelas, sem aviso de próxima', () => {
    comTudo({ nextWindow: null })
    fireEvent.click(etiqueta(missionView.chipWindow))
    expect(within(janelas()).getAllByRole('radio')).toHaveLength(2)
    expect(within(painel()).queryByRole('button', { name: missionView.useNextWindow })).not.toBeInTheDocument()
  })
})

/* Card C18: quem vem da vista da Lua com o ponto já escolhido quer ver as janelas dele. Sem isto, a
   primeira janela vinha escolhida e o painel pulava direto para a base. */
describe('MissionView: aberta a partir da vista da Lua (card C18)', () => {
  it('com startStep 1, abre no passo da janela mesmo com a primeira já escolhida', () => {
    comTudo({ launchSiteId: null, startStep: 1 })
    expect(etiqueta(missionView.chipWindow)).toHaveAttribute('aria-current', 'step')
    expect(within(janelas()).getAllByRole('radio')).toHaveLength(2)
  })

  it('abrindo no passo da janela, a câmera olha a Lua, onde está o ponto e o mapa de onde pousar', () => {
    comTudo({ launchSiteId: null, startStep: 1 })
    expect(camera()).toBe('pole')
  })

  it('reabrindo a janela a partir do passo da base, a câmera volta da Terra para a Lua', () => {
    comTudo({ launchSiteId: null })
    expect(camera()).toBe('earth')
    fireEvent.click(etiqueta(missionView.chipWindow))
    expect(camera()).toBe('pole')
  })
})

/* Card C18: onde dá para pousar, na própria vista da missão. É o mesmo mapa da vista da Lua (os
   pontos com janela nos 30 dias da data, useLandingAreas), ligado pelo mesmo estado do App. */
describe('MissionView: o mapa de onde dá para pousar (card C18)', () => {
  const mapa = () => within(painel()).queryByRole('button', { name: missionView.landingAreasToggle })

  it('no passo do pouso e no da janela há o botão do mapa, que diz se está ligado e avisa quem guarda', () => {
    const onToggleLandingAreas = vi.fn()
    const { unmount } = renderView({ showLandingAreas: false, onToggleLandingAreas })
    expect(mapa()).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(mapa())
    expect(onToggleLandingAreas).toHaveBeenCalledTimes(1)
    unmount()
    renderView({ landingSite: IM2, skyStatus: 'loading', showLandingAreas: true })
    expect(mapa()).toHaveAttribute('aria-pressed', 'true')
  })

  it('no passo da base não há botão do mapa: a câmera está na Terra', () => {
    comTudo({ launchSiteId: null })
    expect(mapa()).not.toBeInTheDocument()
  })

  it('a conta do mapa só é pedida com ele ligado, na data da vista', () => {
    const { unmount } = renderView({ showLandingAreas: false })
    expect(useLandingAreas).toHaveBeenLastCalledWith(DATA, false)
    unmount()
    renderView({ showLandingAreas: true })
    expect(useLandingAreas).toHaveBeenLastCalledWith(DATA, true)
  })

  it('com o mapa ligado, a linha ao lado diz o que a cor quer dizer, ou que está calculando', () => {
    useLandingAreas.mockReturnValueOnce({ status: 'loading', areas: null })
    const { unmount } = renderView({ showLandingAreas: true })
    expect(within(painel()).getByText(missionView.landingAreasLoading)).toBeInTheDocument()
    unmount()
    useLandingAreas.mockReturnValue({ status: 'ready', areas: {} })
    renderView({ showLandingAreas: true })
    expect(within(painel()).getByText(missionView.landingAreasReady(30, 24))).toBeInTheDocument()
    useLandingAreas.mockReturnValue({ status: 'idle', areas: null })
  })
})

/* Card C19: cada base só lança para alguns lados. A tela diz quais bases alcançam a órbita da
   janela escolhida, e a missão só sai numa direção que a base permite. */
describe('MissionView: as bases que servem para a janela (card C19)', () => {
  const grupoBarrado = () => within(bases()).queryByRole('group', { name: missionView.groupCantReach })

  it('a conta de quais bases servem recebe as bases e a janela escolhida', () => {
    comTudo({ launchSiteId: null })
    expect(useLaunchReach).toHaveBeenLastCalledWith(launchSites, JANELAS[0])
  })

  it('as bases que não alcançam a órbita ficam num grupo próprio da lista, que continua escolhível', () => {
    useLaunchReach.mockReturnValue({ [KENNEDY.id]: 'blocked', [ALCANTARA.id]: 'ok' })
    comTudo({ launchSiteId: null })
    expect(within(grupoBarrado()).getByRole('option', { name: KENNEDY.name })).toBeInTheDocument()
    expect(within(grupoBarrado()).queryByRole('option', { name: ALCANTARA.name })).not.toBeInTheDocument()
    useLaunchReach.mockReturnValue(null)
  })

  it('sem nenhuma base barrada, o grupo não aparece', () => {
    comTudo({ launchSiteId: null })
    expect(grupoBarrado()).not.toBeInTheDocument()
  })

  it('quando a direção do lançamento barra a missão, o aviso diz isso, e o Launch fica desligado', () => {
    useMission.mockReturnValue({ status: 'error', mission: null, reason: 'azimuth' })
    comTudo()
    expect(within(painel()).getByRole('status')).toHaveTextContent(missionView.launchBlocked)
    expect(lancar()).toBeDisabled()
  })

  it('nos detalhes, a faixa de direções da base, ou que ela não foi conferida', () => {
    const comFaixa = launchSites.map((site) => (site.id === KENNEDY.id ? { ...site, azimuthLimits: [{ minDeg: 35, maxDeg: 120 }] } : site))
    const { unmount } = comTudo({ launchSites: comFaixa })
    expect(valor(missionView.allowedDirections)).toBe('35° to 120° from north')
    unmount()
    comTudo({ launchSites: launchSites.map((site) => ({ ...site, azimuthLimits: null })) })
    expect(valor(missionView.allowedDirections)).toBe(missionView.directionsNotChecked)
  })
})

/* Um passo reaberto que já tem escolha (visto pelo Marco em 19/11/2026): a base continuava escolhida
   na lista, mas o painel ficava parado no passo, sem o cartão do lançamento, e só andava escolhendo
   outra base e depois a mesma de novo. Uma lista não avisa quando se escolhe o que já estava
   escolhido, e uma janela já marcada também não. Em toda ordem de escolha, o painel tem que seguir. */
describe('MissionView: a ordem das escolhas não trava o painel', () => {
  const seguir = () => within(painel()).getByRole('button', { name: missionView.continueStep })
  const naCartaDoLancamento = () => expect(lancar()).toBeInTheDocument()

  it('reabrindo a base já escolhida, "Continue" mantém a base e volta ao lançamento', () => {
    useMission.mockReturnValue({ status: 'ready', mission: missaoDaPonte() })
    const { onLaunchSiteChange } = comTudo()
    fireEvent.click(etiqueta(missionView.chipLaunch))
    expect(bases()).toHaveDisplayValue(KENNEDY.name)
    fireEvent.click(seguir())
    naCartaDoLancamento()
    expect(lancar()).toBeEnabled()
    expect(onLaunchSiteChange).not.toHaveBeenCalled()
  })

  it('reabrindo a janela, clicar na janela que já estava marcada segue em frente', () => {
    comTudo()
    fireEvent.click(etiqueta(missionView.chipWindow))
    const marcada = within(janelas()).getAllByRole('radio')[0]
    expect(marcada).toBeChecked()
    fireEvent.click(marcada)
    naCartaDoLancamento()
  })

  it('reabrindo a janela, "Continue" também segue', () => {
    comTudo()
    fireEvent.click(etiqueta(missionView.chipWindow))
    fireEvent.click(seguir())
    naCartaDoLancamento()
  })

  it('reabrindo o local de pouso já escolhido, "Continue" segue para o primeiro passo que falta', () => {
    comTudo({ launchSiteId: null })
    fireEvent.click(etiqueta(missionView.chipLanding))
    fireEvent.click(seguir())
    expect(etiqueta(missionView.chipLaunch)).toHaveAttribute('aria-current', 'step')
  })

  it('depois de trocar a data, com a base escolhida, a primeira janela da data nova leva ao lançamento', () => {
    const props = { launchSiteId: KENNEDY.id, landingSite: IM2, skyStatus: 'ready', onDateChange: () => {} }
    const { rerender } = renderView({ ...props, landingWindows: JANELAS })
    fireEvent.click(etiqueta(missionView.chipWindow))
    fireEvent.change(within(painel()).getByLabelText(panel.dateTimeLabel), { target: { value: '2026-12-01T00:00' } })
    rerender(
      <MissionView
        dateUtc={new Date('2026-12-01T00:00:00Z')} launchSites={launchSites} onLaunchSiteChange={() => {}}
        landingWindows={[JANELAS[1]]} landingWindowStartMs={null} onLandingWindowChange={() => {}}
        sites={sites} onLandingSiteChange={() => {}} {...props}
      />,
    )
    expect(etiqueta(missionView.chipWindow)).toHaveAttribute('aria-current', 'step')
    fireEvent.click(within(janelas()).getAllByRole('radio')[0])
    naCartaDoLancamento()
    // a base continua a mesma, e a missão é pedida com a janela nova
    expect(useMission).toHaveBeenLastCalledWith(KENNEDY, IM2, JANELAS[1])
  })

  it('trocar o local de pouso com a base escolhida vai direto ao lançamento, com a mesma base', async () => {
    const { rerender } = comTudo()
    fireEvent.click(etiqueta(missionView.chipLanding))
    await userEvent.selectOptions(locais(), IM2_DA_LISTA.name)
    rerender(
      <MissionView
        dateUtc={DATA} launchSites={launchSites} launchSiteId={KENNEDY.id} onLaunchSiteChange={() => {}}
        landingSite={IM2_DA_LISTA} skyStatus="ready" landingWindows={JANELAS} landingWindowStartMs={null}
        onLandingWindowChange={() => {}} sites={sites} onLandingSiteChange={() => {}}
      />,
    )
    naCartaDoLancamento()
    expect(useMission).toHaveBeenLastCalledWith(KENNEDY, IM2_DA_LISTA, JANELAS[0])
  })

  it('um passo sem escolha não tem "Continue": não há o que manter', () => {
    renderView()
    expect(within(painel()).queryByRole('button', { name: missionView.continueStep })).not.toBeInTheDocument()
    fireEvent.click(etiqueta(missionView.chipWindow))
    expect(within(painel()).queryByRole('button', { name: missionView.continueStep })).not.toBeInTheDocument()
  })

  it('voando, "Change mission" e depois trocar o local de pouso mantém a base', async () => {
    useMission.mockReturnValue({ status: 'ready', mission: missaoDaPonte() })
    comTudo()
    fireEvent.click(lancar())
    fireEvent.click(screen.getByRole('button', { name: missionView.changeMission }))
    naCartaDoLancamento()
    fireEvent.click(etiqueta(missionView.chipLaunch))
    fireEvent.click(seguir())
    naCartaDoLancamento()
    expect(etiqueta(missionView.chipLaunch)).toHaveTextContent(KENNEDY.name)
  })
})

