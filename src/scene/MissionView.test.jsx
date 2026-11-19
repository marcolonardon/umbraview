/* A vista da missão (cards C13 e C16): a lista de bases, os números da base escolhida, os botões de
 * câmera, o relógio e a missão simulada. O desenho 3D é do WebGL, que o jsdom não tem: o Canvas
 * vira um substituto vazio, e as contas do desenho têm teste próprio (src/scene/missionScale.test.js,
 * src/scene/missionPath.test.js e src/engine/earthSite.test.js). A ponte da missão (useMission) é
 * trocada: quem diz o que ela entrega é cada teste, e a conta de verdade tem os testes dela
 * (src/engine/mission.test.js e src/hooks/useMission.test.js). */
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { launchSites } from '../data/launchSites.js'
import { missionView } from '../data/missionView.js'
import { MISSION } from '../engine/config.js'
import { EARTH_EQUATORIAL_RADIUS_KM } from '../engine/earthSite.js'
import { systemStateAt } from '../engine/system.js'
import { useMission } from '../hooks/useMission.js'
import { formatUtc } from '../panel/format.js'
import { MissionView } from './MissionView.jsx'

vi.mock('@react-three/fiber', () => ({ Canvas: () => <div data-testid="canvas" />, useFrame: () => {} }))
vi.mock('@react-three/drei', () => ({ Html: () => null, Line: () => null }))
vi.mock('../hooks/useMission.js', () => ({ useMission: vi.fn() }))

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
      {...props}
    />,
  )
  return { onLaunchSiteChange, onLandingWindowChange, ...view }
}
// a vista com tudo escolhido: a base, o local de pouso e as janelas dele
const comTudo = (props = {}) =>
  renderView({ launchSiteId: KENNEDY.id, landingSite: IM2, skyStatus: 'ready', landingWindows: JANELAS, ...props })
const janelas = () => screen.getByLabelText(missionView.landingWindowLabel)

const lista = () => screen.getByLabelText(missionView.launchSiteLabel)
const distanciaNoInstante = (date) => {
  const { distanceKm } = systemStateAt(date.getTime())
  return missionView.distanceValue(distanceKm, distanceKm / EARTH_EQUATORIAL_RADIUS_KM)
}

describe('MissionView', () => {
  it('tem nome acessível e diz que está em escala, com a distância da Lua em raios da Terra', () => {
    renderView()
    expect(screen.getByRole('img', { name: missionView.label })).toBeInTheDocument()
    expect(screen.getByText(/are to scale/, { selector: 'p' })).toHaveTextContent(/Moon is \d\d\.\d Earth radii away/)
    expect(screen.getByText(distanciaNoInstante(DATA))).toBeInTheDocument()
  })

  it('a lista traz todas as bases, em dois grupos: as que já lançaram à Lua e a que ainda não', () => {
    renderView()
    expect(lista()).toHaveDisplayValue(missionView.launchSitePlaceholder)
    const jaLancaram = within(lista()).getByRole('group', { name: missionView.groupLaunched })
    const aindaNao = within(lista()).getByRole('group', { name: missionView.groupNotYet })
    expect(within(jaLancaram).getAllByRole('option')).toHaveLength(launchSites.length - 1)
    expect(within(aindaNao).getByRole('option', { name: ALCANTARA.name })).toBeInTheDocument()
  })

  it('escolher na lista avisa quem guarda a escolha, com o id da base', async () => {
    const { onLaunchSiteChange } = renderView()
    await userEvent.selectOptions(lista(), KENNEDY.name)
    expect(onLaunchSiteChange).toHaveBeenCalledWith(KENNEDY.id)
  })

  it('sem base escolhida, pede uma; com a base, mostra a coordenada dela e o lançamento à Lua', () => {
    const base = { dateUtc: DATA, launchSites, onLaunchSiteChange: () => {}, landingSite: null, skyStatus: 'idle', landingWindows: null }
    const { rerender } = render(<MissionView {...base} launchSiteId={null} />)
    expect(screen.getByText(missionView.noLaunchSite)).toBeInTheDocument()
    expect(screen.queryByText(missionView.coordinates)).not.toBeInTheDocument()

    rerender(<MissionView {...base} launchSiteId={KENNEDY.id} />)
    expect(lista()).toHaveDisplayValue(KENNEDY.name)
    expect(screen.queryByText(missionView.noLaunchSite)).not.toBeInTheDocument()
    // as 4 casas da fonte, com o hemisfério por extenso no lugar do sinal
    expect(screen.getByText('28.6083° N, 80.6041° W')).toBeInTheDocument()
    // em UTC: o IM-2 saiu no dia 26 pelo relógio da Flórida, e no dia 27 em UTC
    expect(screen.getByText('IM-2, 27 Feb 2025')).toBeInTheDocument()
  })

  it('a base que nunca lançou à Lua diz isso, em vez de ficar sem a linha', () => {
    renderView({ launchSiteId: ALCANTARA.id })
    expect(screen.getByText('2.3177° S, 44.3680° W')).toBeInTheDocument()
    expect(screen.getByText(missionView.noLunarLaunch)).toBeInTheDocument()
  })

  it('a câmera começa na Terra, e só um dos três botões de câmera fica ligado', () => {
    renderView()
    const grupo = screen.getByRole('group', { name: missionView.cameraLabel })
    const botao = (name) => within(grupo).getByRole('button', { name: missionView.camera[name] })
    expect(botao('earth')).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(botao('moon'))
    expect(botao('moon')).toHaveAttribute('aria-pressed', 'true')
    expect(botao('earth')).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(botao('orbit'))
    expect(botao('orbit')).toHaveAttribute('aria-pressed', 'true')
    expect(botao('moon')).toHaveAttribute('aria-pressed', 'false')
  })

  /* As bases estão na Terra: com a câmera na Lua, escolher uma não mostraria nada. Da vista da
     órbita inteira a câmera não sai: a pessoa pediu para ver de longe. */
  it('escolher uma base com a câmera na Lua leva a câmera de volta à Terra', async () => {
    renderView()
    const grupo = screen.getByRole('group', { name: missionView.cameraLabel })
    const botao = (name) => within(grupo).getByRole('button', { name: missionView.camera[name] })
    fireEvent.click(botao('moon'))
    await userEvent.selectOptions(lista(), KENNEDY.name)
    expect(botao('earth')).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(botao('orbit'))
    await userEvent.selectOptions(lista(), ALCANTARA.name)
    expect(botao('orbit')).toHaveAttribute('aria-pressed', 'true')
  })

  it('o relógio da vista anda pelo período, e a distância da Lua acompanha o instante dele', () => {
    renderView()
    fireEvent.change(screen.getByRole('slider', { name: missionView.timeLabel }), { target: { value: '240' } })
    const dezDiasDepois = new Date('2026-11-24T00:00:00Z')
    expect(screen.getByText(formatUtc(dezDiasDepois))).toBeInTheDocument()
    expect(screen.getByText(distanciaNoInstante(dezDiasDepois))).toBeInTheDocument()
    expect(distanciaNoInstante(dezDiasDepois)).not.toBe(distanciaNoInstante(DATA))
  })

  it('o botão de tocar começa desligado: a vista não se mexe sozinha', () => {
    renderView()
    expect(screen.getByRole('button', { name: missionView.play })).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('MissionView: a missão simulada (card C16)', () => {
  const texto = (conteudo) => screen.getByText(conteudo)

  it('sem local de pouso na Lua, pede um, e não mostra janela nem pede missão', () => {
    renderView({ launchSiteId: KENNEDY.id })
    expect(texto(missionView.noLandingSite)).toBeInTheDocument()
    expect(screen.queryByLabelText(missionView.landingWindowLabel)).not.toBeInTheDocument()
    // a ponte recebe a base e mais nada: sem os três, ela fica parada
    expect(useMission).toHaveBeenLastCalledWith(KENNEDY, null, null)
  })

  it('enquanto as janelas do local são calculadas, diz isso', () => {
    renderView({ launchSiteId: KENNEDY.id, landingSite: IM2, skyStatus: 'loading' })
    expect(texto(missionView.windowsLoading)).toBeInTheDocument()
    expect(screen.queryByText(missionView.noLandingSite)).not.toBeInTheDocument()
    expect(useMission).toHaveBeenLastCalledWith(KENNEDY, IM2, null)
  })

  /* Trocando de local de pouso, as janelas do local anterior não servem para o novo: enquanto o
     céu do novo é calculado, nenhuma janela vai para a ponte, mesmo que as antigas ainda cheguem. */
  it('com o céu ainda sendo calculado, janelas que sobraram de antes não entram na lista nem na ponte', () => {
    renderView({ launchSiteId: KENNEDY.id, landingSite: IM2, skyStatus: 'loading', landingWindows: JANELAS })
    expect(texto(missionView.windowsLoading)).toBeInTheDocument()
    expect(screen.queryByLabelText(missionView.landingWindowLabel)).not.toBeInTheDocument()
    expect(useMission).toHaveBeenLastCalledWith(KENNEDY, IM2, null)
  })

  it('se a conta das janelas falhou, diz que não há missão para simular', () => {
    renderView({ launchSiteId: KENNEDY.id, landingSite: IM2, skyStatus: 'error' })
    expect(texto(missionView.windowsError)).toBeInTheDocument()
  })

  it('se o local não tem janela de pouso no período, diz isso, e não mostra a lista vazia', () => {
    comTudo({ landingWindows: [] })
    expect(texto(missionView.noWindows)).toBeInTheDocument()
    expect(screen.queryByLabelText(missionView.landingWindowLabel)).not.toBeInTheDocument()
    expect(useMission).toHaveBeenLastCalledWith(KENNEDY, IM2, null)
  })

  it('com janelas, a lista traz todas, com o começo, o fim e a duração, e a primeira já vem escolhida', () => {
    comTudo()
    const opcoes = within(janelas()).getAllByRole('option')
    expect(opcoes.map((opcao) => opcao.textContent)).toEqual([
      '5 Dec 2026, 00:00 UTC to 8 Dec 2026, 00:00 UTC (3 d)',
      '11 Dec 2026, 06:00 UTC to 12 Dec 2026, 12:00 UTC (1 d 6 h)',
    ])
    expect(janelas()).toHaveDisplayValue(opcoes[0].textContent)
    expect(useMission).toHaveBeenLastCalledWith(KENNEDY, IM2, JANELAS[0])
  })

  it('escolher outra janela avisa quem guarda a escolha, e a janela guardada é a que vai para a ponte', async () => {
    const { onLandingWindowChange, unmount } = comTudo()
    await userEvent.selectOptions(janelas(), '11 Dec 2026, 06:00 UTC to 12 Dec 2026, 12:00 UTC (1 d 6 h)')
    expect(onLandingWindowChange).toHaveBeenCalledWith(JANELAS[1].startUtc.getTime())
    unmount()

    comTudo({ landingWindowStartMs: JANELAS[1].startUtc.getTime() })
    expect(useMission).toHaveBeenLastCalledWith(KENNEDY, IM2, JANELAS[1])
  })

  it('uma janela guardada que não existe mais (a data mudou) cai na primeira da lista', () => {
    comTudo({ landingWindowStartMs: Date.parse('2026-10-01T00:00:00Z') })
    expect(useMission).toHaveBeenLastCalledWith(KENNEDY, IM2, JANELAS[0])
  })

  it('com o local e a janela mas sem base, pede a base, e não diz que está calculando', () => {
    comTudo({ launchSiteId: null })
    expect(texto(missionView.noLaunchSite)).toBeInTheDocument()
    expect(screen.queryByText(missionView.missionLoading)).not.toBeInTheDocument()
    expect(useMission).toHaveBeenLastCalledWith(null, IM2, JANELAS[0])
  })

  it('enquanto a missão é calculada, diz isso, num lugar que o leitor de tela anuncia', () => {
    useMission.mockReturnValue({ status: 'loading', mission: null })
    comTudo()
    expect(screen.getByRole('status')).toHaveTextContent(missionView.missionLoading)
    expect(screen.queryByText(missionView.launch)).not.toBeInTheDocument()
  })

  it('se nenhum caminho foi achado, diz isso, e não mostra número nenhum da missão', () => {
    useMission.mockReturnValue({ status: 'error', mission: null })
    comTudo()
    expect(screen.getByRole('status')).toHaveTextContent(missionView.missionError)
    expect(screen.queryByText(missionView.launch)).not.toBeInTheDocument()
  })

  describe('com a missão pronta', () => {
    const missao = missaoDaPonte()
    beforeEach(() => {
      useMission.mockReturnValue({ status: 'ready', mission: missao })
    })

    it('diz de onde para onde é a missão, e o nome da cena passa a falar da linha', () => {
      comTudo()
      expect(screen.getByRole('status')).toHaveTextContent(missionView.missionReady(KENNEDY.name, IM2.name))
      expect(screen.getByRole('img', { name: missionView.labelWithMission })).toBeInTheDocument()
    })

    it('os números na tela são os que a ponte entregou, na ordem do voo', () => {
      comTudo()
      const valor = (rotulo) => screen.getByText(rotulo, { selector: 'dt' }).nextElementSibling.textContent
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

    it('diz o que é conta, o que é desenho, o que ficou de fora e quais são as escolhas do modelo', () => {
      comTudo()
      expect(texto(missionView.referenceNote)).toBeInTheDocument()
      expect(texto(missionView.pathNote)).toBeInTheDocument()
      expect(texto(missionView.leftOutNote)).toBeInTheDocument()
      expect(texto(missionView.choicesNote(MISSION))).toBeInTheDocument()
      expect(missionView.choicesNote(MISSION)).toMatch(/185 km up.*about 4 days.*100 km up for about 12 hours.*12 hours after/)
    })

    it('o relógio passa a cobrir a missão: começa no lançamento, parado, e vai até o pouso', () => {
      comTudo()
      const cursor = screen.getByRole('slider', { name: missionView.missionTimeLabel })
      expect(screen.queryByRole('slider', { name: missionView.timeLabel })).not.toBeInTheDocument()
      expect(texto(formatUtc(missao.launchUtc))).toBeInTheDocument()
      expect(screen.getByRole('button', { name: missionView.play })).toHaveAttribute('aria-pressed', 'false')
      // de 6 em 6 minutos; a missão dura 110 h 9 min, e o último passo cai no pouso ou logo depois
      expect(cursor).toHaveAttribute('max', '1102')
      fireEvent.change(cursor, { target: { value: '1102' } })
      expect(texto('5 Dec 2026, 12:12 UTC')).toBeInTheDocument()
    })

    /* A hora 240 do período não quer dizer nada na missão, que dura umas 110: quando a missão
       chega, o relógio recomeça do lançamento, parado. */
    it('se o relógio do período já tinha andado, a missão chegando o leva de volta ao começo dela', () => {
      useMission.mockReturnValue(PARADA)
      const tudo = {
        dateUtc: DATA, launchSites, launchSiteId: KENNEDY.id, onLaunchSiteChange: () => {},
        landingSite: IM2, skyStatus: 'ready', landingWindows: JANELAS, landingWindowStartMs: null, onLandingWindowChange: () => {},
      }
      const { rerender } = render(<MissionView {...tudo} />)
      fireEvent.change(screen.getByRole('slider', { name: missionView.timeLabel }), { target: { value: '240' } })
      expect(texto(formatUtc(new Date('2026-11-24T00:00:00Z')))).toBeInTheDocument()

      useMission.mockReturnValue({ status: 'ready', mission: missao })
      rerender(<MissionView {...tudo} />)
      expect(screen.getByRole('slider', { name: missionView.missionTimeLabel })).toHaveValue('0')
      expect(texto(formatUtc(missao.launchUtc))).toBeInTheDocument()
    })

    it('o relógio leva a nave pelas fases da missão, sem pedir outra conta', () => {
      comTudo()
      const cursor = screen.getByRole('slider', { name: missionView.missionTimeLabel })
      const agora = () => screen.getByText(missionView.craftNow, { selector: 'dt' }).nextElementSibling.textContent
      expect(agora()).toBe(missionView.phases.ascent)
      fireEvent.change(cursor, { target: { value: '5' } })
      expect(agora()).toBe(missionView.phases.parking)
      fireEvent.change(cursor, { target: { value: '200' } })
      expect(agora()).toBe(missionView.phases.crossing)
      expect(texto('1 Dec 2026, 18:00 UTC')).toBeInTheDocument()
      fireEvent.change(cursor, { target: { value: '1000' } })
      expect(agora()).toBe(missionView.phases.lunarOrbit)
      fireEvent.change(cursor, { target: { value: '1102' } })
      expect(agora()).toBe(missionView.phases.landing)
      // a cada redesenho a ponte recebe a mesma base, o mesmo local e a mesma janela: a conta não é refeita
      expect(useMission.mock.calls.length).toBeGreaterThan(4)
      for (const pedido of useMission.mock.calls) expect(pedido).toEqual([KENNEDY, IM2, JANELAS[0]])
    })

    it('ganha o botão de câmera da nave, que só existe com a missão', () => {
      const grupo = () => screen.getByRole('group', { name: missionView.cameraLabel })
      const { unmount } = comTudo()
      const nave = within(grupo()).getByRole('button', { name: missionView.camera.craft })
      fireEvent.click(nave)
      expect(nave).toHaveAttribute('aria-pressed', 'true')
      unmount()

      useMission.mockReturnValue(PARADA)
      comTudo()
      expect(within(grupo()).queryByRole('button', { name: missionView.camera.craft })).not.toBeInTheDocument()
    })

    it('se a missão some com a câmera na nave, a câmera volta para a Terra e o relógio, para o período', () => {
      const { rerender } = comTudo()
      const grupo = screen.getByRole('group', { name: missionView.cameraLabel })
      fireEvent.click(within(grupo).getByRole('button', { name: missionView.camera.craft }))
      useMission.mockReturnValue({ status: 'loading', mission: null })
      rerender(
        <MissionView
          dateUtc={DATA} launchSites={launchSites} launchSiteId={ALCANTARA.id} onLaunchSiteChange={() => {}}
          landingSite={IM2} skyStatus="ready" landingWindows={JANELAS} landingWindowStartMs={null} onLandingWindowChange={() => {}}
        />,
      )
      expect(within(grupo).getByRole('button', { name: missionView.camera.earth })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('slider', { name: missionView.timeLabel })).toBeInTheDocument()
      expect(texto(formatUtc(DATA))).toBeInTheDocument()
    })
  })
})
