/* A vista da missão (card C13): a lista de bases, os números da base escolhida, os botões de câmera
 * e o relógio. O desenho 3D é do WebGL, que o jsdom não tem: o Canvas vira um substituto vazio, e
 * as contas do desenho têm teste próprio (src/scene/missionScale.test.js e
 * src/engine/earthSite.test.js). */
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { launchSites } from '../data/launchSites.js'
import { missionView } from '../data/missionView.js'
import { EARTH_EQUATORIAL_RADIUS_KM } from '../engine/earthSite.js'
import { systemStateAt } from '../engine/system.js'
import { formatUtc } from '../panel/format.js'
import { MissionView } from './MissionView.jsx'

vi.mock('@react-three/fiber', () => ({ Canvas: () => <div data-testid="canvas" />, useFrame: () => {} }))
vi.mock('@react-three/drei', () => ({ Html: () => null, Line: () => null }))

const DATA = new Date('2026-11-14T00:00:00Z')
const KENNEDY = launchSites.find((site) => site.id === 'ksc-lc39a')
const ALCANTARA = launchSites.find((site) => site.id === 'alcantara-vls')

function renderView(props = {}) {
  const onLaunchSiteChange = vi.fn()
  render(
    <MissionView dateUtc={DATA} launchSites={launchSites} launchSiteId={null} onLaunchSiteChange={onLaunchSiteChange} {...props} />,
  )
  return { onLaunchSiteChange }
}

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
    const { rerender } = render(
      <MissionView dateUtc={DATA} launchSites={launchSites} launchSiteId={null} onLaunchSiteChange={() => {}} />,
    )
    expect(screen.getByText(missionView.noLaunchSite)).toBeInTheDocument()
    expect(screen.queryByText(missionView.coordinates)).not.toBeInTheDocument()

    rerender(<MissionView dateUtc={DATA} launchSites={launchSites} launchSiteId={KENNEDY.id} onLaunchSiteChange={() => {}} />)
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
