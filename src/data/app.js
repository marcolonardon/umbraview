/* Textos da tela principal. O app vai ser julgado em inglês, então todo texto que a pessoa vê
 * é escrito em inglês aqui, e só aqui (README, "Três regras que valem para qualquer tela").
 * Os textos da cena ficam em scene.js, e os do painel do ponto em panel.js. */
export const app = {
  name: 'UmbraView',
  tagline: 'Sun and Earth over the real lunar horizon',
  scene: {
    title: 'Lunar scene',
  },
  panel: {
    title: 'Landing site',
    // Leva o ponto escolhido para a vista da missão, já no passo da janela de pouso (card C18).
    planMission: 'Plan a mission here',
  },
  footer: 'Umbra Team · NASA Space Apps Challenge 2026',
  // O guia de submissão de 2026 pede marca visível em toda imagem feita com IA, e o logo está na
  // aba do navegador, onde não cabe marca legível: a marca fica aqui, na mesma página (card E19).
  credits: {
    // Os dados de fora, com o crédito que cada fonte pede (CREDITS.md): o relevo e a cor da Lua são
    // da NASA; as estrelas, do catálogo HYG, que exige a atribuição e a licença junto.
    data: "Terrain and Moon imagery: NASA (LOLA, LROC, NASA's Scientific Visualization Studio) · Stars: HYG database (CC BY-SA 4.0)",
    source: 'Source code',
    sourceUrl: 'https://github.com/EnzoDaun/umbraview',
    ai: 'Logo AI-generated and code AI-assisted (Claude, Anthropic)',
    separator: ' · ',
  },
}
