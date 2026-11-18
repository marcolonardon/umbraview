/* Quem aparece por cima de quem entre as malhas do relevo (card C6). O teste refaz, para um pixel,
 * o que o WebGL faz com o estêncil e a profundidade, na ordem do renderOrder, com as propriedades
 * de reliefLayers.js. A regra do WebGL usada aqui: o fragmento só é desenhado se passar no teste do
 * estêncil e no da profundidade; passando nos dois, a operação stencilZPass grava no estêncil. */
import { describe, expect, it } from 'vitest'
import {
  AlwaysStencilFunc,
  DataUtils,
  GreaterEqualStencilFunc,
  HalfFloatType,
  KeepStencilOp,
  LinearFilter,
  MeshStandardMaterial,
  NotEqualStencilFunc,
  ObjectSpaceNormalMap,
  ReplaceStencilOp,
  RGBADepthPacking,
  RGBAFormat,
  ShaderLib,
} from 'three'

import {
  CENTER_LAYER,
  COARSE_LAYER,
  GLOBAL_LAYER,
  GLOBE_LAYER,
  RING_LAYER,
  createGlobalDepthMaterial,
  createGlobalMaterial,
  createLayerMaterial,
  createNormalTexture,
  globalFlatten,
  setGlobalFlatten,
  visibleHit,
} from './reliefLayers.js'

/* Desenha num pixel as malhas que caem nele e devolve qual aparece. Cada malha é [nome, camada,
   profundidade], com a profundidade menor mais perto da câmera. */
function drawPixel(meshes) {
  let stencil = 0
  let depth = Infinity
  let shown = null
  const ordered = [...meshes].sort((a, b) => a[1].renderOrder - b[1].renderOrder)
  for (const [name, layer, meshDepth] of ordered) {
    const { stencilWrite, stencilFunc, stencilRef, stencilZPass = KeepStencilOp } = layer.material
    const passesStencil =
      !stencilWrite ||
      stencilFunc === AlwaysStencilFunc ||
      (stencilFunc === NotEqualStencilFunc && stencil !== stencilRef) ||
      // GL_GEQUAL: passa se o valor da malha for maior ou igual ao que está no pixel
      (stencilFunc === GreaterEqualStencilFunc && stencilRef >= stencil)
    if (!passesStencil || meshDepth >= depth) continue
    depth = meshDepth
    shown = name
    if (stencilWrite && stencilZPass === ReplaceStencilOp) stencil = stencilRef
  }
  return shown
}

describe('reliefLayers', () => {
  it('o centro aparece por cima do anel e do grosso, mesmo com eles mais perto da câmera', () => {
    // no fundo de uma cratera, o anel (800 m) e o grosso (1,9 km) ficam acima do centro (400 m)
    expect(drawPixel([['grosso', COARSE_LAYER, 1], ['anel', RING_LAYER, 2], ['centro', CENTER_LAYER, 3]])).toBe('centro')
  })

  it('fora do centro, o anel aparece por cima do grosso: são os dentes que o Marco viu na borda', () => {
    expect(drawPixel([['grosso', COARSE_LAYER, 1], ['anel', RING_LAYER, 2]])).toBe('anel')
  })

  it('onde o fino não desenha, o grosso aparece: ele fecha a fresta em volta do fino', () => {
    expect(drawPixel([['grosso', COARSE_LAYER, 5]])).toBe('grosso')
  })

  it('entre duas malhas da mesma camada, ganha a mais perto: o relevo esconde o próprio relevo', () => {
    expect(drawPixel([['centro longe', CENTER_LAYER, 3], ['centro perto', CENTER_LAYER, 2]])).toBe('centro perto')
    expect(drawPixel([['grosso longe', COARSE_LAYER, 3], ['grosso perto', COARSE_LAYER, 2]])).toBe('grosso perto')
    // quem grava no estêncil também: a encosta de trás, desenhada antes, não pode tapar a da frente
    expect(drawPixel([['anel longe', RING_LAYER, 3], ['anel perto', RING_LAYER, 2]])).toBe('anel perto')
    expect(drawPixel([['global longe', GLOBAL_LAYER, 3], ['global perto', GLOBAL_LAYER, 2]])).toBe('global perto')
  })

  it('a ordem é o centro, o anel, o grosso, o relevo da Lua inteira e a esfera lisa', () => {
    expect(CENTER_LAYER.renderOrder).toBeLessThan(RING_LAYER.renderOrder)
    expect(RING_LAYER.renderOrder).toBeLessThan(COARSE_LAYER.renderOrder)
    expect(COARSE_LAYER.renderOrder).toBeLessThan(GLOBAL_LAYER.renderOrder)
    expect(GLOBAL_LAYER.renderOrder).toBeLessThan(GLOBE_LAYER.renderOrder)
  })

  it('o relevo da Lua inteira aparece onde o do polo não desenha, e não por cima dele', () => {
    // na emenda em volta de 77°S, as duas fontes do LOLA não ficam na mesma altura
    expect(drawPixel([['global', GLOBAL_LAYER, 1], ['grosso', COARSE_LAYER, 2]])).toBe('grosso')
    expect(drawPixel([['global', GLOBAL_LAYER, 1], ['centro', CENTER_LAYER, 3]])).toBe('centro')
    expect(drawPixel([['global', GLOBAL_LAYER, 4]])).toBe('global')
  })

  it('a esfera lisa só aparece onde nenhum relevo desenhou, mesmo mais perto da câmera', () => {
    // no fundo de uma bacia, o chão fica quilômetros abaixo do raio 1, e a esfera ficaria por cima
    expect(drawPixel([['esfera', GLOBE_LAYER, 1], ['global', GLOBAL_LAYER, 2]])).toBe('global')
    expect(drawPixel([['esfera', GLOBE_LAYER, 1], ['grosso', COARSE_LAYER, 2]])).toBe('grosso')
    expect(drawPixel([['esfera', GLOBE_LAYER, 1]])).toBe('esfera')
  })
})

describe('createGlobalMaterial', () => {
  it('leva o estêncil da camada, a imagem de cor da esfera e o mapa das áreas de pouso', () => {
    const map = { isTexture: true }
    const material = createGlobalMaterial('#808080', map)
    expect(material.stencilWrite).toBe(true)
    expect(material.stencilFunc).toBe(GLOBAL_LAYER.material.stencilFunc)
    expect(material.stencilZPass).toBe(GLOBAL_LAYER.material.stencilZPass)
    expect(material.map).toBe(map)
    // com a imagem, a cor do material é branca, para a imagem aparecer com a cor dela
    expect(material.color.getHexString()).toBe('ffffff')
    // o mapa das áreas de pouso, o mesmo da esfera (globalLandingShader, em moonGlobe.js)
    const shader = shaderOf('standard')
    material.onBeforeCompile(shader)
    expect(shader.fragmentShader).toContain('globalLandingAt(normalize(vGlobePosition))')
  })

  it('sem a imagem, fica com a cor lisa, como a esfera enquanto a imagem baixa', () => {
    const material = createGlobalMaterial('#808080', null)
    expect(material.map).toBeNull()
    expect(material.color.getHexString()).toBe('808080')
  })
})

/* O começo de um shader do three, como o onBeforeCompile recebe: o do material de verdade, para o
   teste falhar se uma versão nova do three mudar os pontos em que o achatamento entra. */
const shaderOf = (name) => ({ uniforms: {}, vertexShader: ShaderLib[name].vertexShader, fragmentShader: ShaderLib[name].fragmentShader })

describe('o achatamento do relevo da Lua inteira até a esfera lisa (flattenAmount, em globalTiles.js)', () => {
  const MORPH = 'transformed = mix(transformed, normalize(position), uFlatten)'
  const NORMAL = 'objectNormal = normalize(mix(objectNormal, normalize(position), uFlatten))'

  it('leva o vértice para o raio 1 e a normal para a da esfera, depois das contas do three', () => {
    const shader = shaderOf('standard')
    createGlobalMaterial('#808080', null).onBeforeCompile(shader)
    expect(shader.uniforms.uFlatten).toBe(globalFlatten)
    expect(shader.vertexShader).toContain('uniform float uFlatten;')
    // logo depois de o three montar a posição e a normal do vértice: antes, ele escreveria por cima
    expect(shader.vertexShader).toContain(`#include <begin_vertex>\n${MORPH}`)
    expect(shader.vertexShader).toContain(`#include <beginnormal_vertex>\n${NORMAL}`)
  })

  it('a sombra se achata junto: sem isto, a montanha achatada ainda faria a sombra da altura real', () => {
    const depth = createGlobalDepthMaterial()
    expect(depth.depthPacking).toBe(RGBADepthPacking)
    const shader = shaderOf('depth')
    depth.onBeforeCompile(shader)
    expect(shader.uniforms.uFlatten).toBe(globalFlatten)
    expect(shader.vertexShader).toContain(`#include <begin_vertex>\n${MORPH}`)
  })

  it('o mapa de normais da esfera entra no relevo junto com o achatamento, e achatado de todo fica igual ao dela', () => {
    const normalMap = { isTexture: true }
    const material = createGlobalMaterial('#808080', { isTexture: true }, normalMap)
    expect(material.normalMap).toBe(normalMap)
    setGlobalFlatten(material, 0)
    expect(globalFlatten.value).toBe(0)
    expect(material.normalScale.toArray()).toEqual([0, 0])
    setGlobalFlatten(material, 0.4)
    expect(globalFlatten.value).toBe(0.4)
    expect(material.normalScale.toArray()).toEqual([0.4, 0.4])
    // achatado de todo, a força do mapa é a da esfera (o padrão do three, 1)
    setGlobalFlatten(material, 1)
    expect(material.normalScale.toArray()).toEqual(new MeshStandardMaterial().normalScale.toArray())
  })
})

describe('createLayerMaterial', () => {
  it.each([
    ['o centro', CENTER_LAYER],
    ['o anel', RING_LAYER],
    ['o grosso', COARSE_LAYER],
  ])('o material d%s leva o estêncil da camada e a cor dada', (_, layer) => {
    // sem o estêncil no material, a regra acima não vale na tela: o anel cobriria o centro no
    // fundo das crateras, e os dentes do grosso voltariam
    const material = createLayerMaterial(layer, '#808080')
    expect(material.stencilWrite).toBe(true)
    expect(material.stencilFunc).toBe(layer.material.stencilFunc)
    expect(material.stencilRef).toBe(layer.material.stencilRef)
    expect(material.stencilZPass).toBe(layer.material.stencilZPass ?? KeepStencilOp)
    expect(material.color.getHexString()).toBe('808080')
  })
})

describe('o mapa de normais no material (card C6)', () => {
  // um mapa de 2 × 1 texels: para cima (y) e inclinado
  const map = { normals: Float32Array.from([0, 1, 0, 0.6, 0.8, 0]), width: 2, height: 1 }

  it('a textura guarda as normais em meio-float, com filtro suave, sem perder precisão', () => {
    // com 8 bits, a inclinação erraria uns 0,2°, e com o Sol a 1,5° o chão plano ficaria com
    // manchas de 15% de brilho
    const texture = createNormalTexture(map)
    expect(texture.type).toBe(HalfFloatType)
    expect(texture.format).toBe(RGBAFormat)
    expect([texture.image.width, texture.image.height]).toEqual([2, 1])
    expect([texture.magFilter, texture.minFilter]).toEqual([LinearFilter, LinearFilter])
  })

  it('a textura sobe para a placa de vídeo do jeito que o uv lê, com a linha 0 em v = 0', () => {
    // sem o needsUpdate, o three não sobe a textura (version 0), e o shader lê zero: a normal sai
    // torta em todo pixel e as crateras somem. Com o flipY, ele vira as linhas na subida, e a luz
    // de cada pixel sairia da linha espelhada do ladrilho (o reliefUvs põe a linha 0 em v perto de 0)
    const texture = createNormalTexture(map)
    expect(texture.version).toBeGreaterThan(0)
    expect(texture.flipY).toBe(false)
  })

  it('a normal vai na textura como o three lê: a cor × 2 − 1 é a normal', () => {
    // o shader do mapa no espaço do objeto (normal_fragment_maps do three) faz cor × 2 − 1; com a
    // normal guardada crua, a luz saía torta
    const texture = createNormalTexture(map)
    const read = Array.from(texture.image.data, (half) => DataUtils.fromHalfFloat(half) * 2 - 1)
    const expected = [0, 1, 0, 1, 0.6, 0.8, 0, 1]
    read.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 3))
  })

  it('com o mapa, o material lê a normal dele no espaço do objeto, que é o da cena', () => {
    const normalMap = createNormalTexture(map)
    const material = createLayerMaterial(RING_LAYER, '#808080', { normalMap })
    expect(material.normalMap).toBe(normalMap)
    expect(material.normalMapType).toBe(ObjectSpaceNormalMap)
    // e continua com o estêncil da camada
    expect(material.stencilFunc).toBe(RING_LAYER.material.stencilFunc)
  })
})

describe('visibleHit, o acerto do clique que a pessoa vê', () => {
  // um acerto do raio: a distância e a camada da malha (a esfera lisa não tem camada)
  const hit = (distance, reliefLayer) => ({ distance, object: { userData: reliefLayer ? { reliefLayer } : {} } })
  const layerOf = { center: CENTER_LAYER, ring: RING_LAYER, coarse: COARSE_LAYER, global: GLOBAL_LAYER, globe: GLOBE_LAYER }

  it.each([
    ['o centro, mesmo com o grosso e o anel mais perto', [hit(1, 'coarse'), hit(2, 'ring'), hit(3, 'center')], 2],
    ['o anel, mesmo com o grosso mais perto', [hit(1, 'coarse'), hit(2, 'ring')], 1],
    ['o grosso, onde o fino não está no raio (a linha da emenda)', [hit(1, 'coarse')], 0],
    ['o mais perto de cada camada', [hit(1, 'ring'), hit(2, 'center'), hit(3, 'center')], 1],
    ['o primeiro, sem relevo no raio (a esfera lisa)', [hit(1), hit(2)], 0],
    ['o relevo da Lua inteira, mesmo com a esfera lisa mais perto (o fundo de uma bacia)', [hit(1, 'globe'), hit(2, 'global')], 1],
    ['o grosso do polo, mesmo com o relevo da Lua inteira mais perto (a emenda)', [hit(1, 'global'), hit(2, 'coarse')], 1],
  ])('escolhe %s', (_, hits, expected) => {
    expect(visibleHit(hits)).toBe(hits[expected])
  })

  it('sem acerto, nenhum', () => {
    expect(visibleHit([])).toBeNull()
  })

  it('escolhe a mesma malha que o estêncil mostra no pixel', () => {
    // todas as combinações de até uma malha de cada camada, em todas as ordens de distância
    const kinds = ['center', 'ring', 'coarse', 'global', 'globe']
    for (let mask = 1; mask < 1 << kinds.length; mask++) {
      const present = kinds.filter((_, i) => mask & (1 << i))
      for (const order of permutations(present)) {
        const hits = order.map((kind, i) => hit(i + 1, kind))
        const pixel = drawPixel(order.map((kind, i) => [kind, layerOf[kind], i + 1]))
        expect(visibleHit(hits).object.userData.reliefLayer).toBe(pixel)
      }
    }
  })
})

function permutations(items) {
  if (items.length <= 1) return [items]
  return items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]))
}
