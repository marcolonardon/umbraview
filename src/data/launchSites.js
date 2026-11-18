/* As bases de lançamento da vista da missão (card C13): de onde uma missão à Lua pode sair.
 *
 * Entram as bases em que achamos um lançamento à Lua no registro do GCAT, uma linha por
 * plataforma, e Alcântara, que ainda não lançou nada à Lua: é a base do país da equipe, e por
 * ficar a 2° do equador mostra melhor que qualquer outra por que o plano do lançamento precisa
 * inclinar. Não é a lista de todas as bases que já lançaram à Lua: é a das que conferimos.
 *
 * A coordenada é a da plataforma, copiada da tabela de pontos de lançamento do GCAT (J. McDowell,
 * General Catalog of Artificial Space Objects, CC-BY; CREDITS.md), com as 4 casas que ele dá: uns
 * 11 m no chão. O lançamento à Lua de cada base (lunarLaunch) é um que saiu daquela plataforma,
 * com a hora do registro de lançamentos do GCAT; não é necessariamente o mais recente. As linhas
 * copiadas estão em scripts/references/gcat-launch-points.tsv e gcat-lunar-launches.tsv, e o
 * src/data/launchSites.test.js reprova a linha daqui que não bater com elas.
 *
 * gcat: o código da base e o da plataforma no GCAT; é por eles que o teste acha a linha.
 * lunarLaunch é null em Alcântara: é isso que separa os dois grupos da lista
 * (src/scene/MissionView.jsx). Conferido no registro do GCAT em 18/11/2026: os 104 lançamentos de
 * lá são testes, foguetes de sondagem e 4 tentativas de órbita baixa. */
const GCAT_URL = 'https://planet4589.org/space/gcat/index.html'

export const launchSites = [
  {
    id: 'ksc-lc39a',
    name: 'Kennedy Space Center, LC-39A',
    lat: 28.6083,
    lon: -80.6041,
    gcat: { site: 'KSC', pad: 'LC39A' },
    // o pouso do IM-2 é um dos locais da lista de pouso (src/data/sites.js)
    lunarLaunch: { mission: 'IM-2', launchedAtUtc: new Date('2025-02-27T00:16:30Z'), gcatTag: '2025-038', sourceUrl: GCAT_URL },
    sourceUrl: GCAT_URL,
  },
  {
    id: 'ksc-lc39b',
    name: 'Kennedy Space Center, LC-39B',
    lat: 28.6272,
    lon: -80.6208,
    gcat: { site: 'KSC', pad: 'LC39B' },
    lunarLaunch: { mission: 'Artemis II', launchedAtUtc: new Date('2026-04-01T22:35:12Z'), gcatTag: '2026-069', sourceUrl: GCAT_URL },
    sourceUrl: GCAT_URL,
  },
  {
    id: 'cape-canaveral-slc41',
    name: 'Cape Canaveral, SLC-41',
    lat: 28.5833,
    lon: -80.5831,
    gcat: { site: 'CC', pad: 'SLC41' },
    lunarLaunch: { mission: 'Peregrine', launchedAtUtc: new Date('2024-01-08T07:18:00Z'), gcatTag: '2024-006', sourceUrl: GCAT_URL },
    sourceUrl: GCAT_URL,
  },
  {
    id: 'wallops-pad0b',
    name: 'Wallops Island, Pad 0B',
    lat: 37.8311,
    lon: -75.4913,
    gcat: { site: 'MARS', pad: 'Pad 0B' },
    lunarLaunch: { mission: 'LADEE', launchedAtUtc: new Date('2013-09-07T03:27:00Z'), gcatTag: '2013-047', sourceUrl: GCAT_URL },
    sourceUrl: GCAT_URL,
  },
  {
    id: 'vandenberg-slc4w',
    name: 'Vandenberg, SLC-4W',
    lat: 34.6331,
    lon: -120.6158,
    gcat: { site: 'VS', pad: 'SLC4W' },
    /* O GCAT chama a missão pelo nome de projeto, DSPSE. Que o DSPSE é o Clementine, e que saiu
       desta plataforma nesta hora ("Jan. 25, 1994 / 16:34 UT"), está na página da NASA. */
    lunarLaunch: {
      mission: 'Clementine',
      launchedAtUtc: new Date('1994-01-25T16:34:00Z'),
      gcatTag: '1994-004',
      sourceUrl: 'https://science.nasa.gov/mission/clementine/',
    },
    sourceUrl: GCAT_URL,
  },
  {
    id: 'kourou-ela3',
    name: 'Guiana Space Centre (Kourou), ELA-3',
    lat: 5.2375,
    lon: -52.7687,
    gcat: { site: 'CSG', pad: 'ELA3' },
    /* O SMART-1 foi de carona: o GCAT nomeia este lançamento pelas cargas principais (Insat 3E e
       e-Bird). Que o SMART-1 saiu nele ("Sept. 27, 2003 / 23:14:46 UT", Ariane 5G, ELA-3) está na
       página da NASA; a hora, a base e a plataforma batem com a linha do GCAT. */
    lunarLaunch: {
      mission: 'SMART-1',
      launchedAtUtc: new Date('2003-09-27T23:14:46Z'),
      gcatTag: '2003-043',
      sourceUrl: 'https://science.nasa.gov/mission/smart-1/',
    },
    sourceUrl: GCAT_URL,
  },
  {
    id: 'baikonur-81-23',
    name: 'Baikonur, Site 81/23',
    lat: 46.059,
    lon: 62.983,
    gcat: { site: 'GIK-5', pad: 'LC81/23' },
    lunarLaunch: { mission: 'Luna-24', launchedAtUtc: new Date('1976-08-09T15:04:12Z'), gcatTag: '1976-081', sourceUrl: GCAT_URL },
    sourceUrl: GCAT_URL,
  },
  {
    id: 'vostochny-1s',
    name: 'Vostochny, Site 1S',
    lat: 51.884,
    lon: 128.3345,
    gcat: { site: 'VOST', pad: 'PU1S' },
    lunarLaunch: { mission: 'Luna-25', launchedAtUtc: new Date('2023-08-10T23:10:57Z'), gcatTag: '2023-118', sourceUrl: GCAT_URL },
    sourceUrl: GCAT_URL,
  },
  {
    id: 'xichang-lc2',
    name: 'Xichang, LC-2',
    lat: 28.2455,
    lon: 102.0271,
    gcat: { site: 'XSC', pad: 'LC2' },
    lunarLaunch: { mission: "Chang'e-4", launchedAtUtc: new Date('2018-12-07T18:23:00Z'), gcatTag: '2018-103', sourceUrl: GCAT_URL },
    sourceUrl: GCAT_URL,
  },
  {
    id: 'wenchang-lc101',
    name: 'Wenchang, LC-101',
    lat: 19.6143,
    lon: 110.9511,
    gcat: { site: 'WEN', pad: 'LC101' },
    lunarLaunch: { mission: "Chang'e-6", launchedAtUtc: new Date('2024-05-03T09:27:29Z'), gcatTag: '2024-083', sourceUrl: GCAT_URL },
    sourceUrl: GCAT_URL,
  },
  {
    id: 'sriharikota-slp',
    name: 'Satish Dhawan (Sriharikota), Second Launch Pad',
    lat: 13.72,
    lon: 80.2305,
    gcat: { site: 'SHAR', pad: 'SLP' },
    lunarLaunch: { mission: 'Chandrayaan-3', launchedAtUtc: new Date('2023-07-14T09:05:17Z'), gcatTag: '2023-098', sourceUrl: GCAT_URL },
    sourceUrl: GCAT_URL,
  },
  {
    id: 'tanegashima-yoshinobu',
    name: 'Tanegashima, Yoshinobu',
    lat: 30.4008,
    lon: 130.9776,
    gcat: { site: 'TNSC', pad: 'Y' },
    lunarLaunch: { mission: 'SLIM', launchedAtUtc: new Date('2023-09-06T23:42:11Z'), gcatTag: '2023-137', sourceUrl: GCAT_URL },
    sourceUrl: GCAT_URL,
  },
  {
    id: 'kagoshima-mu',
    // o GCAT: "Uchinoura Space Center, Kagoshima (formerly Kagoshima)"
    name: 'Kagoshima (now Uchinoura), Mu pad',
    lat: 31.2474,
    lon: 131.0848,
    gcat: { site: 'KASC', pad: 'M1' },
    lunarLaunch: { mission: 'Hiten', launchedAtUtc: new Date('1990-01-24T11:46:00Z'), gcatTag: '1990-007', sourceUrl: GCAT_URL },
    sourceUrl: GCAT_URL,
  },
  {
    id: 'mahia-lc1b',
    name: 'Mahia (Rocket Lab LC-1), Pad B',
    lat: -39.2604,
    lon: 177.8652,
    gcat: { site: 'MAHIA', pad: 'LC1B' },
    lunarLaunch: { mission: 'CAPSTONE', launchedAtUtc: new Date('2022-06-28T09:55:00Z'), gcatTag: '2022-070', sourceUrl: GCAT_URL },
    sourceUrl: GCAT_URL,
  },
  {
    id: 'alcantara-vls',
    // a plataforma que o GCAT chama de "VLS pad, Alcantara"; o erro que ele dá para ela é maior
    // que o das outras: 0,002°, uns 220 m
    name: 'Alcântara, VLS pad',
    lat: -2.3177,
    lon: -44.368,
    gcat: { site: 'ALCA', pad: 'VLS' },
    lunarLaunch: null,
    sourceUrl: GCAT_URL,
  },
]
