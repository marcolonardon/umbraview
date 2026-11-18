/* Quem aparece por cima de quem entre as malhas do relevo (card C6): o centro do relevo fino
 * (400 m), o anel do relevo fino (800 m) e o relevo grosso (1,9 km).
 *
 * As três desenham a mesma Lua, em detalhes diferentes. Onde uma fica em cima da outra, a de mais
 * detalhe tem que aparecer, mesmo que a outra esteja um pouco mais alta: numa cratera, o grosso
 * fica acima do fundo que o fino vê. Só a profundidade não resolve: na emenda, o grosso mais alto
 * furava o fino em degraus (visto pelo Marco no npm run dev, em 12/11/2026). O estêncil resolve:
 * cada malha do fino marca os pixels que desenhou, e quem vem depois não pinta pixel marcado. A
 * ordem de desenho é a do renderOrder: o centro, o anel, o grosso e, fora do polo, o relevo da Lua
 * inteira e a esfera lisa. O clique segue a mesma regra (visibleHit).
 *
 * Isso só é certo porque a câmera olha sempre para o ponto embaixo dela, e o fino fica em volta
 * desse ponto: o terreno de fora não fica de fato na frente do de dentro. Conferido nos dados
 * numa revisão do desenho, em 12/11/2026: com bloco incompleto (na borda da grade ou com um
 * ladrilho que falhou), o grosso de fora só fica na frente do fino em 0,05% a 0,3% dos pontos,
 * nas quinas da tela. O estêncil precisa existir na tela do WebGL: o <Canvas> pede com
 * gl={{ stencil: true }} (LunarScene.jsx).
 */
import {
  DataTexture,
  DataUtils,
  GreaterEqualStencilFunc,
  HalfFloatType,
  LinearFilter,
  MeshDepthMaterial,
  MeshStandardMaterial,
  ObjectSpaceNormalMap,
  ReplaceStencilOp,
  RGBADepthPacking,
  RGBAFormat,
} from 'three'

import { applySouthColor, globalLandingShader } from './moonGlobe.js'

/* O que vai em cada malha: o renderOrder e o userData na <mesh>, e o material com o resto. Num
   material do three, stencilWrite liga o teste do estêncil, e as operações dizem o que gravar. O
   userData diz ao clique de que camada é a malha.
   Cada camada grava o seu próprio valor, maior quanto mais detalhe, e só desenha onde o valor do
   pixel é menor ou igual ao dela (GL_GEQUAL): por cima do vazio (0), de si mesma, mas não de quem
   tem mais detalhe. Com um valor só para todas e o "diferente de" de antes, a malha que grava
   tapava a si mesma: a encosta de trás, desenhada antes da da frente no mesmo pixel, marcava o
   estêncil, e a da frente não passava mais. */
const layer = (renderOrder, name, value, { writes = true } = {}) => ({
  renderOrder,
  userData: { reliefLayer: name },
  material: {
    stencilWrite: true,
    stencilRef: value,
    stencilFunc: GreaterEqualStencilFunc,
    ...(writes ? { stencilZPass: ReplaceStencilOp } : {}),
  },
})

export const CENTER_LAYER = layer(0, 'center', 5)
export const RING_LAYER = layer(1, 'ring', 4)

/* O grosso grava também: depois dele vem o relevo da Lua inteira (globalTiles.js), que passa por
   baixo do polo até 80°S e, na emenda em volta de 77°S, não fica na mesma altura que ele. */
export const COARSE_LAYER = layer(2, 'coarse', 3)

/* O relevo da Lua inteira (globalTiles.js) aparece onde o do polo não desenhou, e grava para a
   esfera lisa não aparecer por cima dele: no fundo de uma bacia, o chão fica quilômetros abaixo do
   raio 1. O mesmo cuidado com a câmera do comentário de cima vale aqui: ela olha para o ponto
   embaixo dela, e o relevo da Lua inteira só cobre o chão que ela vê. */
export const GLOBAL_LAYER = layer(3, 'global', 2)

// a esfera lisa (MoonGlobe.jsx) só confere, sem gravar nada: ninguém vem depois dela
export const GLOBE_LAYER = layer(4, 'globe', 1, { writes: false })

const LAYERS_IN_ORDER = [CENTER_LAYER, RING_LAYER, COARSE_LAYER, GLOBAL_LAYER, GLOBE_LAYER].sort(
  (a, b) => a.renderOrder - b.renderOrder,
)

/* O material de uma malha da camada, com a cor da Lua: todas as malhas do relevo passam por aqui,
   para nenhuma ficar sem o estêncil. normalMap: o mapa de normais do ladrilho (createNormalTexture),
   para os ladrilhos do relevo fino. As normais dele estão no espaço do objeto, que é o da cena: a
   malha do ladrilho não tem posição nem giro próprios. */
export function createLayerMaterial(layer, color, { normalMap = null } = {}) {
  // a cor da imagem polar entra por cima da cor lisa quando a imagem chega (moonGlobe.js)
  const material = applySouthColor(new MeshStandardMaterial({ color, ...layer.material }))
  if (normalMap) {
    material.normalMap = normalMap
    material.normalMapType = ObjectSpaceNormalMap
  }
  return material
}

/* Quanto o relevo da Lua inteira está achatado agora, de 0 (a altura real) a 1 (igual à esfera
   lisa): o flattenAmount da altura da câmera (globalTiles.js). Um objeto só, que todos os pedaços e
   o material da sombra leem: mudar o valor muda todos de uma vez, sem montar o shader de novo. */
export const globalFlatten = { value: 0 }

/* O achatamento no shader do vértice: a posição vai para a direção dela no raio 1, e a normal para
   a direção do ponto, que é a normal da esfera. Entra logo depois de o three montar a posição e a
   normal (begin_vertex e beginnormal_vertex): antes, ele escreveria por cima; depois, a sombra e a
   luz já teriam usado as de antes. O material da sombra não tem normal, e ali só a posição muda. */
function flattenShader(shader) {
  shader.uniforms.uFlatten = globalFlatten
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nuniform float uFlatten;')
    .replace(
      '#include <beginnormal_vertex>',
      '#include <beginnormal_vertex>\nobjectNormal = normalize(mix(objectNormal, normalize(position), uFlatten));',
    )
    .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = mix(transformed, normalize(position), uFlatten);')
}

/* O material do relevo da Lua inteira: a mesma imagem de cor da esfera (color.jpg), lida pelo uv
   de cada vértice (buildGlobalChunk), e o mesmo mapa das áreas de pouso dela. Sem a imagem, a cor
   lisa do token, como a esfera enquanto a imagem baixa.
   normalMap: o mapa de normais da esfera (normal.jpg). Ele só entra com o achatamento
   (setGlobalFlatten): com o relevo na altura real, ele somaria a inclinação que a malha já tem, e
   tem 1/8 de grau, mais grosso que ela; achatado de todo, o relevo é a esfera, e precisa dele com
   a mesma força dela, para a troca entre os dois não aparecer. */
export function createGlobalMaterial(color, map, normalMap = null) {
  // com a imagem, o branco, para ela aparecer com a cor dela
  const material = new MeshStandardMaterial({ color: map ? '#ffffff' : color, map: map ?? null, ...GLOBAL_LAYER.material })
  if (normalMap) {
    material.normalMap = normalMap
    material.normalScale.set(globalFlatten.value, globalFlatten.value)
  }
  material.onBeforeCompile = (shader) => {
    globalLandingShader(shader)
    flattenShader(shader)
  }
  return material
}

/* O material com que o relevo da Lua inteira entra no mapa da sombra: o mesmo do three
   (MeshDepthMaterial, com a profundidade em RGBA, como o three faz para a luz do Sol), com o
   achatamento. Sem ele, o three usaria o dele, e a montanha achatada na tela continuaria fazendo a
   sombra da altura real. Vai no customDepthMaterial de cada pedaço (GlobalRelief.jsx). */
export function createGlobalDepthMaterial() {
  const material = new MeshDepthMaterial({ depthPacking: RGBADepthPacking })
  material.onBeforeCompile = flattenShader
  return material
}

/* Muda o achatamento de todos os pedaços: o do vértice e da sombra (globalFlatten) e a força do
   mapa de normais da esfera no material, que entra junto. Não monta o shader de novo: os dois são
   valores que o three manda para a placa a cada quadro. */
export function setGlobalFlatten(material, amount) {
  globalFlatten.value = amount
  material.normalScale.set(amount, amount)
}

// o 1 em meio-float, o quarto canal da textura, que não é usado
const HALF_ONE = DataUtils.toHalfFloat(1)

/* A textura do mapa de normais de um ladrilho (buildNormalMap, em reliefMesh.js), em meio-float.
   Com 8 bits por canal, a normal erraria uns 0,2°, e com o Sol a 1,5° do horizonte isso dá até 15%
   de brilho a mais ou a menos no chão plano, em manchas. O meio-float erra uns 0,03° (2% de brilho
   no mesmo caso), e o WebGL 2 garante o filtro suave para ele (o float de 32 bits depende de uma
   extensão).
   A normal vai como n × 0,5 + 0,5, de 0 a 1: o shader do three lê o mapa como cor × 2 − 1. */
export function createNormalTexture({ normals, width, height }) {
  const data = new Uint16Array(width * height * 4)
  for (let i = 0, j = 0; i < normals.length; i += 3, j += 4) {
    data[j] = DataUtils.toHalfFloat(normals[i] * 0.5 + 0.5)
    data[j + 1] = DataUtils.toHalfFloat(normals[i + 1] * 0.5 + 0.5)
    data[j + 2] = DataUtils.toHalfFloat(normals[i + 2] * 0.5 + 0.5)
    data[j + 3] = HALF_ONE
  }
  const texture = new DataTexture(data, width, height, RGBAFormat, HalfFloatType)
  texture.magFilter = LinearFilter
  texture.minFilter = LinearFilter
  texture.needsUpdate = true
  return texture
}

/* O acerto do clique que a pessoa vê. intersections: os acertos do raio, do mais perto para o mais
   longe (o React Three Fiber já ordena). A tela mostra o centro onde ele está no raio, senão o
   anel, senão o grosso, mesmo que outra malha esteja mais perto (o estêncil, acima): o clique fica
   com o mesmo. Escolher só o mais perto acertaria o grosso ou o anel escondidos embaixo do fino, a
   até uns 600 m de onde a pessoa clicou (medido nos dados numa revisão do desenho, em 12/11/2026).
   Sem relevo no raio (a esfera lisa), fica o mais perto. */
export function visibleHit(intersections) {
  for (const layer of LAYERS_IN_ORDER) {
    const hit = intersections.find((candidate) => candidate.object.userData.reliefLayer === layer.userData.reliefLayer)
    if (hit) return hit
  }
  return intersections[0] ?? null
}
