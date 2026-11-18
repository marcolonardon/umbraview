import { useState } from 'react'

import { app } from './data/app.js'
import { launchSites } from './data/launchSites.js'
import { missionView } from './data/missionView.js'
import { siteSky } from './data/siteSky.js'
import { sites } from './data/sites.js'
import { systemView } from './data/systemView.js'
import { useSiteSky } from './hooks/useSiteSky.js'
import { About } from './panel/About.jsx'
import { DateTimeControl } from './panel/DateTimeControl.jsx'
import { SiteList } from './panel/SiteList.jsx'
import { SitePanel } from './panel/SitePanel.jsx'
import { SiteSky } from './panel/SiteSky.jsx'
import { LunarScene } from './scene/LunarScene.jsx'
import { MissionView } from './scene/MissionView.jsx'
import { SystemView } from './scene/SystemView.jsx'
import './App.css'

/* O logo do projeto, no cabeçalho, e o símbolo da equipe, no rodapé (card V2). São os arquivos do
   kit (brand/), copiados para public/brand/ porque só o que está em public/ é servido. A versão do
   cabeçalho é a compacta: o símbolo nela já vem simplificado, para não sumir em 40 px
   (brand/LEIA-ME.txt). São SVG, de 3 e 2 KB: num tamanho só, nítidos em qualquer tela.
   O caminho sai do document.baseURI, como o das imagens e dos dados (earthImage.js): no GitHub
   Pages o site mora em /umbraview/, e um caminho começando com barra cairia na raiz do domínio. */
const LOGO_SRC = new URL('brand/umbraview-header.svg', document.baseURI).href
const SYMBOL_SRC = new URL('brand/umbra-symbol.svg', document.baseURI).href

/* Esqueleto da tela: cabeçalho; à esquerda, a região da cena e, embaixo dela, o céu do ponto em
   desenho (a vista do chão e a linha do tempo, que pedem largura); à direita, o painel do ponto,
   com os controles e os números. Cada região tem o seu componente, para duas pessoas não mexerem
   nas mesmas linhas deste arquivo ao mesmo tempo. */
export default function App() {
  /* A data da luz da cena e do céu do ponto: começa na hora em que a página abriu, e o controle de
     data muda (card E14). É a mesma para os dois, para a sombra da cena e os números do painel
     falarem do mesmo instante. O controle não manda data inválida (DateTimeControl.jsx). */
  const [dateUtc, setDateUtc] = useState(() => new Date())
  /* O ponto escolhido, ou null: pelo clique na cena (card C3) ou pela lista de locais (card E14).
     A cena põe o marcador nele, o painel mostra o céu dele (card E11), e a lista mostra o local
     quando ele veio dela. */
  const [site, setSite] = useState(null)
  /* Se o mapa das áreas com janela de pouso está ligado na cena. Fica aqui, com a data e o ponto,
     porque é a mesma data que decide o mapa e os números do painel. */
  const [showLandingAreas, setShowLandingAreas] = useState(false)
  /* Qual vista ocupa a região da cena: 'moon', a Lua de perto; 'system', a Terra, a Lua e o Sol; ou
     'mission', a Terra e a Lua em escala, com as bases de lançamento (card C13). */
  const [view, setView] = useState('moon')
  /* A base de lançamento escolhida na vista da missão (o id dela), ou null. Fica aqui, e não na
     vista: trocar de vista desmonta a da missão, e a escolha se perderia. */
  const [launchSiteId, setLaunchSiteId] = useState(null)
  const { status, sky } = useSiteSky(site, dateUtc)

  return (
    <div className="app">
      <header className="app__header">
        {/* O logo é o título principal: o alt leva o nome, para quem não vê a imagem ouvir a mesma
            coisa. width e height são os do desenho, para o cabeçalho não pular enquanto ele chega. */}
        <h1 className="app__name">
          <img className="app__logo" src={LOGO_SRC} alt={app.name} width="188" height="49" />
        </h1>
        <p className="app__tagline">{app.tagline}</p>
      </header>

      <main className="app__main">
        <div className="app__stage">
          <section className="app__scene" aria-labelledby="scene-title">
            <h2 id="scene-title" className="app__region-title app__region-title--over">{app.scene.title}</h2>
            <div className="app__views" role="group" aria-label={systemView.viewLabel}>
              <button className="app__view" type="button" aria-pressed={view === 'moon'} onClick={() => setView('moon')}>
                {systemView.viewMoon}
              </button>
              <button className="app__view" type="button" aria-pressed={view === 'system'} onClick={() => setView('system')}>
                {systemView.viewSystem}
              </button>
              <button className="app__view" type="button" aria-pressed={view === 'mission'} onClick={() => setView('mission')}>
                {missionView.viewMission}
              </button>
            </div>
            {view === 'moon' && (
              <LunarScene
                dateUtc={dateUtc}
                site={site}
                onSelect={setSite}
                showLandingAreas={showLandingAreas}
                onToggleLandingAreas={() => setShowLandingAreas((shown) => !shown)}
              />
            )}
            {/* a key recomeça o relógio da vista quando a data muda: a hora 300 de uma data não é a de outra */}
            {view === 'system' && <SystemView key={dateUtc.getTime()} dateUtc={dateUtc} onDateChange={setDateUtc} />}
            {view === 'mission' && (
              <MissionView
                key={dateUtc.getTime()}
                dateUtc={dateUtc}
                launchSites={launchSites}
                launchSiteId={launchSiteId}
                onLaunchSiteChange={setLaunchSiteId}
              />
            )}
          </section>

          <section className="app__sky" aria-labelledby="sky-title">
            <h2 id="sky-title" className="app__region-title">{siteSky.title}</h2>
            <SiteSky status={status} sky={sky} onDateChange={setDateUtc} />
          </section>
        </div>

        <section className="app__panel" aria-labelledby="panel-title">
          <h2 id="panel-title" className="app__region-title">{app.panel.title}</h2>
          <SiteList sites={sites} selectedId={site?.id} onSelect={setSite} />
          <DateTimeControl dateUtc={dateUtc} onChange={setDateUtc} />
          <SitePanel status={status} sky={sky} />
          {/* por último: quem já escolheu um ponto quer os números primeiro */}
          <About />
        </section>
      </main>

      <footer className="app__footer">
        {/* O símbolo da equipe é decorativo (alt vazio): o nome dela já está escrito ao lado, e
            repetir faria o leitor de tela ler "Umbra Team" duas vezes. */}
        <p className="app__sign">
          <img className="app__mark" src={SYMBOL_SRC} alt="" width="266" height="266" />
          {app.footer}
        </p>
        <p>
          {app.credits.data}
          {app.credits.separator}
          <a href={app.credits.sourceUrl}>{app.credits.source}</a>
          {app.credits.separator}
          {app.credits.ai}
        </p>
      </footer>
    </div>
  )
}
