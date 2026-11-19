/* O esqueleto da tela: as regiões em que cada frente trabalha existem e têm nome para o leitor de
 * tela, com o título que vem de src/data/app.js. A cena 3D (card C1) e o painel (card I1) ocupam
 * cada um a sua região, e o ponto escolhido na cena chega ao painel pelo useSiteSky (card E11).
 *
 * O jsdom não tem WebGL: as bibliotecas 3D viram substitutos, como em LunarScene.test.jsx. */
import { readFile as readFromDisk } from 'node:fs/promises'
import { join } from 'node:path'

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from './App.jsx'
import { about } from './data/about.js'
import { app } from './data/app.js'
import { siteSky } from './data/siteSky.js'
import { launchSites } from './data/launchSites.js'
import { missionView } from './data/missionView.js'
import { panel } from './data/panel.js'
import { scene } from './data/scene.js'
import { sites } from './data/sites.js'
import { systemView } from './data/systemView.js'
import { MIN_LANDING_WINDOW_HOURS } from './engine/config.js'
import { createSiteSky } from './engine/siteSky.js'
import { SitePanel } from './panel/SitePanel.jsx'

vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children }) => <div data-testid="canvas">{children}</div>,
  useFrame: () => {},
  // a luz do Sol pede o quadro novo quando a data muda (SunLight, em LunarScene.jsx)
  useThree: (selector) => selector({ invalidate: () => {} }),
}))
// o Html é o marcador do ponto escolhido (card C3), que aparece quando o teste escolhe um ponto
vi.mock('@react-three/drei', () => ({ OrbitControls: () => null, Html: ({ children }) => <div>{children}</div> }))
vi.mock('./hooks/useFarRelief.js', () => ({ useFarRelief: () => null }))
// o céu de estrelas desenha com WebGL, que o jsdom não tem; as contas dele têm teste próprio
vi.mock('./scene/StarField.jsx', () => ({ StarField: () => null }))
vi.mock('./scene/MoonGlobe.jsx', () => ({ MoonGlobe: () => null }))
// o relevo da Lua inteira baixa ladrilhos e monta malhas do three; tem teste próprio (globalTiles.test.js)
vi.mock('./scene/GlobalRelief.jsx', () => ({ GlobalRelief: () => null }))
vi.mock('./scene/CameraRig.jsx', () => ({ CameraRig: () => null }))
vi.mock('./scene/LandingAreasLayer.jsx', () => ({ LandingAreasLayer: () => null }))
// a vista do sistema desenha com WebGL; o teste confere só que o App entrega a data e a troca de vista
const vistaDoSistema = vi.hoisted(() => ({ props: null }))
vi.mock('./scene/SystemView.jsx', () => ({
  SystemView: (props) => { vistaDoSistema.props = props; return <div data-testid="vista-do-sistema" /> },
}))
// a vista da missão também: o teste confere o que o App entrega a ela e que a base escolhida fica guardada
const vistaDaMissao = vi.hoisted(() => ({ props: null }))
vi.mock('./scene/MissionView.jsx', () => ({
  MissionView: (props) => { vistaDaMissao.props = props; return <div data-testid="vista-da-missao" /> },
}))

/* A cena de verdade, com o onSelect e a data que o App entrega a ela guardados aqui: o teste
   escolhe o ponto pelo onSelect, como faz o clique na Lua (card C3), e confere a data da luz. O
   clique em si não dá para simular sem WebGL, porque o ponto atingido vem do raio que o three
   lança na malha. */
const sceneProps = vi.hoisted(() => ({ onSelect: null, dateUtc: null }))
vi.mock('./scene/LunarScene.jsx', async (importOriginal) => {
  const { LunarScene } = await importOriginal()
  return {
    LunarScene: (props) => {
      sceneProps.onSelect = props.onSelect
      sceneProps.dateUtc = props.dateUtc
      return <LunarScene {...props} />
    },
  }
})

const RELIEF_DIR = join(process.cwd(), 'public', 'data', 'relief')
// o ponto 1 da comparação com a NASA (card E1), dentro da área com relevo
const TOP_1 = { lat: -89.475, lon: -137.44 }
// a hora em que a página abre: o App usa ela para a luz da cena e para o céu do ponto
const PAGE_OPENED_AT = new Date('2026-11-14T00:00:00Z')
/* A primeira conta lê o relevo do disco e leva bem menos de 1 s; a folga é para o CI (a mesma do
   useSiteSky.test.js). */
const WAIT = { timeout: 10000 }

async function readRelief(path) {
  const bytes = await readFromDisk(join(RELIEF_DIR, path))
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}

/* O relógio na hora em que a página abre, e o relevo vindo do disco no lugar do servidor, como no
   useSiteSky.test.js. Só o relógio é falso: os temporizadores continuam de verdade, para o waitFor
   esperar a conta. */
function openPageWithReliefFromDisk() {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(PAGE_OPENED_AT)
  vi.stubGlobal('fetch', async (url) => {
    const buffer = await readRelief(new URL(url).pathname.split('/data/relief/')[1])
    return { ok: true, status: 200, arrayBuffer: async () => buffer }
  })
}

// o texto que o painel mostra com o céu que o motor dá para o ponto na data
async function expectedPanelText(site, dateUtc) {
  const expected = await createSiteSky(readRelief)(site, dateUtc.getTime())
  const { container } = render(<SitePanel status="ready" sky={expected} />)
  return container.textContent
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('App, esqueleto da tela', () => {
  it('tem cabeçalho com o nome do projeto como título principal', () => {
    render(<App />)
    const cabecalho = screen.getByRole('banner')
    expect(within(cabecalho).getByRole('heading', { level: 1, name: app.name })).toBeInTheDocument()
  })

  /* O título principal é o logo do projeto (card V2), e não o nome escrito: quem não vê a imagem
     ouve o nome pelo alt, e o título continua sendo um h1 só. O símbolo da equipe no rodapé é
     decorativo, porque o nome dela já está escrito ao lado. */
  it('o logo do projeto é o título principal, e o símbolo da equipe no rodapé é decorativo', () => {
    render(<App />)
    const titulo = within(screen.getByRole('banner')).getByRole('heading', { level: 1 })
    const logo = within(titulo).getByRole('img', { name: app.name })
    expect(logo).toHaveAttribute('src', expect.stringContaining('.svg'))
    const rodape = screen.getByRole('contentinfo')
    expect(within(rodape).queryByRole('img')).not.toBeInTheDocument()
    expect(rodape.querySelector('img')).toHaveAttribute('alt', '')
  })

  /* O bloco que explica o produto (o problema, o que o site faz e como começar) fica no fim do
     painel e nasce aberto: quem chega sem contexto precisa dele antes de clicar em qualquer coisa.
     A duração mínima da janela de pouso vem do motor, e não escrita à mão no texto. */
  it('o painel explica o que a pessoa está vendo, com a regra da janela vinda do motor', () => {
    render(<App />)
    const painel = screen.getByRole('region', { name: app.panel.title })
    expect(within(painel).getByText(about.title)).toBeInTheDocument()
    for (const bloco of about.blocks) {
      expect(within(painel).getByRole('heading', { level: 3, name: bloco.heading })).toBeInTheDocument()
    }
    const comecar = about.blocks.at(-1)
    expect(within(painel).getByText(comecar.body(MIN_LANDING_WINDOW_HOURS))).toBeInTheDocument()
    expect(painel.querySelector('details')).toHaveAttribute('open')
  })

  it('tem a região da cena e a do painel, cada uma com nome acessível', () => {
    render(<App />)
    const principal = screen.getByRole('main')
    expect(within(principal).getByRole('region', { name: app.scene.title })).toBeInTheDocument()
    expect(within(principal).getByRole('region', { name: app.panel.title })).toBeInTheDocument()
  })

  it('a região da cena mostra a Lua em 3D', () => {
    render(<App />)
    const regiao = screen.getByRole('region', { name: app.scene.title })
    expect(within(regiao).getByRole('img', { name: scene.label })).toBeInTheDocument()
  })

  it('tem rodapé com a equipe', () => {
    render(<App />)
    expect(within(screen.getByRole('contentinfo')).getByText(app.footer)).toBeInTheDocument()
  })

  it('o rodapé marca o logo feito com IA e linka o código (card E19)', () => {
    render(<App />)
    const rodape = within(screen.getByRole('contentinfo'))
    expect(rodape.getByText(app.credits.ai, { exact: false })).toBeInTheDocument()
    expect(rodape.getByText(app.credits.data, { exact: false })).toBeInTheDocument()
    expect(rodape.getByRole('link', { name: app.credits.source })).toHaveAttribute(
      'href',
      app.credits.sourceUrl,
    )
  })
})

describe('App, o ponto escolhido na cena vai para o painel (card E11)', () => {
  it(
    'o painel passa a calcular e mostra o céu que o motor dá para o ponto na hora em que a página abriu',
    async () => {
      openPageWithReliefFromDisk()
      render(<App />)
      const panelRegion = screen.getByRole('region', { name: app.panel.title })
      expect(within(panelRegion).getByText(panel.empty)).toBeInTheDocument()

      act(() => sceneProps.onSelect(TOP_1))
      // no mesmo render da escolha, e não depois: sem isso, a pessoa clica e nada muda até a conta acabar
      expect(within(panelRegion).getByText(panel.loading)).toBeInTheDocument()

      /* O painel inteiro, número por número, tem que ser o do céu que o motor dá para o ponto na hora
         em que a página abriu. Conferir um número só não bastava: neste ponto o Sol fica à vista o
         período inteiro, e a porcentagem dá 100% também com a data errada; com o céu calculado 6 h
         depois, a altura da Terra muda de -5.0° para -4.8° (revisão do PR #19). */
      const expected = await expectedPanelText(TOP_1, PAGE_OPENED_AT)
      await waitFor(() => expect(within(panelRegion).getByRole('status').textContent).toBe(expected), WAIT)
    },
  )
})

describe('App, a lista de locais e a data ligadas ao painel e à cena (card E14)', () => {
  const ATHENA = sites.find((site) => site.id === 'im-2')
  // seis dias depois: a luz e o céu do ponto mudam o bastante para o painel mostrar outros números
  const LATER = new Date('2026-11-20T06:00:00Z')

  it(
    'escolher um local na lista mostra no painel o céu dele, e a lista mostra o local escolhido',
    async () => {
      openPageWithReliefFromDisk()
      render(<App />)
      const panelRegion = screen.getByRole('region', { name: app.panel.title })
      const list = within(panelRegion).getByLabelText(panel.siteListLabel)

      // o "loading" no mesmo render da escolha é do useSiteSky e já está provado no teste do E11;
      // aqui a conta pode acabar antes de o userEvent devolver o controle
      await userEvent.selectOptions(list, ATHENA.name)
      expect(list).toHaveDisplayValue(ATHENA.name)

      const expected = await expectedPanelText(ATHENA, PAGE_OPENED_AT)
      await waitFor(() => expect(within(panelRegion).getByRole('status').textContent).toBe(expected), WAIT)
    },
  )

  it(
    'trocar a data refaz a conta do painel e muda a data da luz da cena',
    async () => {
      openPageWithReliefFromDisk()
      render(<App />)
      const panelRegion = screen.getByRole('region', { name: app.panel.title })
      act(() => sceneProps.onSelect(TOP_1))
      const before = await expectedPanelText(TOP_1, PAGE_OPENED_AT)
      await waitFor(() => expect(within(panelRegion).getByRole('status').textContent).toBe(before), WAIT)

      fireEvent.change(within(panelRegion).getByLabelText(panel.dateTimeLabel), {
        target: { value: '2026-11-20T06:00' },
      })
      // no mesmo render da troca: sem isso, o painel mostraria os números da data anterior
      expect(within(panelRegion).getByText(panel.loading)).toBeInTheDocument()
      // a cena e o painel falam do mesmo instante
      expect(sceneProps.dateUtc).toEqual(LATER)

      const after = await expectedPanelText(TOP_1, LATER)
      expect(after).not.toBe(before)
      await waitFor(() => expect(within(panelRegion).getByRole('status').textContent).toBe(after), WAIT)
    },
  )

  it('o clique na Lua depois de escolher na lista volta a lista ao aviso', async () => {
    render(<App />)
    const list = screen.getByLabelText(panel.siteListLabel)
    await userEvent.selectOptions(list, ATHENA.name)
    expect(list).toHaveDisplayValue(ATHENA.name)

    // o ponto clicado não é um local da lista: ela mostraria "Athena" com o painel em outro ponto
    act(() => sceneProps.onSelect(TOP_1))
    expect(list).toHaveDisplayValue(panel.siteListPlaceholder)
  })
})

describe('App, a troca entre a Lua e a vista do sistema', () => {
  it('começa na Lua; o seletor troca para a Terra, a Lua e o Sol, com a mesma data, e volta', () => {
    render(<App />)
    const lua = screen.getByRole('button', { name: systemView.viewMoon })
    const sistema = screen.getByRole('button', { name: systemView.viewSystem })
    expect(lua).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByTestId('vista-do-sistema')).not.toBeInTheDocument()

    fireEvent.click(sistema)
    expect(sistema).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('vista-do-sistema')).toBeInTheDocument()
    expect(screen.queryByTestId('canvas')).not.toBeInTheDocument()
    expect(vistaDoSistema.props.dateUtc).toBe(sceneProps.dateUtc)

    fireEvent.click(lua)
    expect(screen.getByTestId('canvas')).toBeInTheDocument()
  })

  it('o "Set as date" da vista do sistema muda a data do cálculo', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: systemView.viewSystem }))
    const nova = new Date('2026-12-01T00:00:00Z')
    act(() => vistaDoSistema.props.onDateChange(nova))
    expect(vistaDoSistema.props.dateUtc).toBe(nova)
  })
})

describe('App, a vista da missão (card C13)', () => {
  it('o seletor troca para a missão, com a mesma data e as bases da lista, e só um botão fica ligado', () => {
    render(<App />)
    const missao = screen.getByRole('button', { name: missionView.viewMission })
    expect(missao).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByTestId('vista-da-missao')).not.toBeInTheDocument()

    fireEvent.click(missao)
    expect(missao).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: systemView.viewMoon })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: systemView.viewSystem })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('vista-da-missao')).toBeInTheDocument()
    expect(screen.queryByTestId('canvas')).not.toBeInTheDocument()
    expect(vistaDaMissao.props.dateUtc).toBe(sceneProps.dateUtc)
    expect(vistaDaMissao.props.launchSites).toBe(launchSites)
    expect(vistaDaMissao.props.launchSiteId).toBeNull()
    // sem ponto escolhido na Lua, a vista da missão não tem local de pouso nem janelas (card C16)
    expect(vistaDaMissao.props.landingSite).toBeNull()
    expect(vistaDaMissao.props.skyStatus).toBe('idle')
    expect(vistaDaMissao.props.landingWindows).toBeNull()
    expect(vistaDaMissao.props.landingWindowStartMs).toBeNull()
    // os locais conhecidos, para a lista do painel da missão (card C17)
    expect(vistaDaMissao.props.sites).toBe(sites)
  })

  /* Na vista da missão a cena é a protagonista (card C17): o painel do ponto e o céu dele saem da
     tela, e voltam nas outras vistas. Com eles ao lado, a cena tinha 18% da tela, e o local de
     pouso aparecia em duas listas. */
  it('na vista da missão, o painel do ponto e o céu dele saem da tela; nas outras, voltam', () => {
    render(<App />)
    const painel = () => screen.queryByRole('region', { name: app.panel.title })
    const ceu = () => screen.queryByRole('region', { name: siteSky.title })
    expect(painel()).toBeInTheDocument()
    expect(ceu()).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: missionView.viewMission }))
    expect(painel()).not.toBeInTheDocument()
    expect(ceu()).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: systemView.viewSystem }))
    expect(painel()).toBeInTheDocument()
    expect(ceu()).toBeInTheDocument()
  })

  /* O local de pouso escolhido no painel da missão, pela lista ou pelo clique na Lua, é o mesmo
     ponto do resto da tela: o painel do ponto e o céu dele passam a falar desse local. */
  it('o local de pouso escolhido na vista da missão vira o ponto da tela inteira', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: missionView.viewMission }))
    act(() => vistaDaMissao.props.onLandingSiteChange(TOP_1))
    expect(vistaDaMissao.props.landingSite).toEqual(TOP_1)
    expect(vistaDaMissao.props.skyStatus).not.toBe('idle')
  })

  /* O local de pouso da missão é o ponto escolhido na Lua, o mesmo do painel, e as janelas são as
     do céu dele (useSiteSky): a vista da missão não faz essa conta de novo. */
  it('a vista da missão recebe o ponto escolhido na Lua e o céu dele', () => {
    render(<App />)
    act(() => sceneProps.onSelect(TOP_1))
    fireEvent.click(screen.getByRole('button', { name: missionView.viewMission }))
    expect(vistaDaMissao.props.landingSite).toEqual(TOP_1)
    // a conta do céu começou: o status já não é o de nada escolhido
    expect(vistaDaMissao.props.skyStatus).not.toBe('idle')
  })

  /* Sobra do card C17: a data só se trocava no painel do ponto, que na vista da missão sai da
     tela. A vista passa a poder trocá-la, e é a mesma data da tela inteira. */
  it('a data trocada de dentro da vista da missão é a data da tela inteira', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: missionView.viewMission }))
    const nova = new Date('2026-12-01T00:00:00Z')
    act(() => vistaDaMissao.props.onDateChange(nova))
    expect(vistaDaMissao.props.dateUtc).toEqual(nova)
    fireEvent.click(screen.getByRole('button', { name: systemView.viewMoon }))
    expect(sceneProps.dateUtc).toEqual(nova)
  })

  it('a janela de pouso escolhida continua escolhida depois de ir a outra vista e voltar', () => {
    render(<App />)
    const missao = screen.getByRole('button', { name: missionView.viewMission })
    fireEvent.click(missao)
    const comeco = Date.parse('2026-12-05T00:00:00Z')
    act(() => vistaDaMissao.props.onLandingWindowChange(comeco))
    expect(vistaDaMissao.props.landingWindowStartMs).toBe(comeco)

    fireEvent.click(screen.getByRole('button', { name: systemView.viewMoon }))
    vistaDaMissao.props = null
    fireEvent.click(missao)
    expect(vistaDaMissao.props.landingWindowStartMs).toBe(comeco)
  })

  /* Trocar de vista desmonta a da missão. Se a escolha morasse nela, a pessoa escolheria a base,
     iria olhar a Lua e, na volta, teria que escolher de novo. */
  it('a base escolhida continua escolhida depois de ir a outra vista e voltar', () => {
    render(<App />)
    const missao = screen.getByRole('button', { name: missionView.viewMission })
    fireEvent.click(missao)
    act(() => vistaDaMissao.props.onLaunchSiteChange('ksc-lc39a'))
    expect(vistaDaMissao.props.launchSiteId).toBe('ksc-lc39a')

    fireEvent.click(screen.getByRole('button', { name: systemView.viewMoon }))
    expect(screen.queryByTestId('vista-da-missao')).not.toBeInTheDocument()
    vistaDaMissao.props = null
    fireEvent.click(missao)
    expect(vistaDaMissao.props.launchSiteId).toBe('ksc-lc39a')
  })
})

/* Card C18: quem escolheu o ponto na vista da Lua vai direto para a missão até ele. Antes era
   preciso achar o seletor "Mission" em cima da cena, e nada dizia que o ponto ia junto. */
describe('App, da vista da Lua para a missão (card C18)', () => {
  it('sem ponto escolhido, o botão de planejar a missão não aparece', () => {
    render(<App />)
    expect(screen.queryByRole('button', { name: app.panel.planMission })).not.toBeInTheDocument()
  })

  it('com um ponto escolhido, o botão abre a vista da missão com esse ponto como local de pouso', () => {
    render(<App />)
    act(() => sceneProps.onSelect(TOP_1))
    fireEvent.click(screen.getByRole('button', { name: app.panel.planMission }))
    expect(screen.getByRole('button', { name: missionView.viewMission })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('vista-da-missao')).toBeInTheDocument()
    expect(vistaDaMissao.props.landingSite).toEqual(TOP_1)
    // vindo do ponto, a missão abre no passo da janela: a pessoa quer ver as janelas dele
    expect(vistaDaMissao.props.startStep).toBe(1)
  })

  it('pelo seletor de vista, a missão abre no primeiro passo que falta, como antes', () => {
    render(<App />)
    act(() => sceneProps.onSelect(TOP_1))
    fireEvent.click(screen.getByRole('button', { name: missionView.viewMission }))
    expect(vistaDaMissao.props.startStep).toBeNull()
  })

  it('a vista da missão recebe a próxima janela do céu do ponto e o mesmo mapa de áreas da vista da Lua', async () => {
    openPageWithReliefFromDisk()
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: missionView.viewMission }))
    expect(vistaDaMissao.props.nextWindow).toBeNull()
    expect(vistaDaMissao.props.showLandingAreas).toBe(false)
    act(() => vistaDaMissao.props.onToggleLandingAreas())
    expect(vistaDaMissao.props.showLandingAreas).toBe(true)
    // o TOP_1 tem janela no período: a busca adiante não roda, e o céu entrega null
    act(() => vistaDaMissao.props.onLandingSiteChange(TOP_1))
    await waitFor(() => expect(vistaDaMissao.props.skyStatus).toBe('ready'), WAIT)
    expect(vistaDaMissao.props.nextWindow).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: systemView.viewMoon }))
    expect(screen.getByRole('button', { name: scene.landingToggle })).toHaveAttribute('aria-pressed', 'true')
  })
})
