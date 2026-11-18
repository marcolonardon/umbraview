/* O relevo do polo sul na cena (card C2): a malha de reliefMesh.js virando geometria do three.
 *
 * A malha faz sombra nela mesma (castShadow e receiveShadow): é assim que uma montanha escurece a
 * cratera do lado. A cor é a mesma da esfera lisa, para a borda entre as duas não aparecer.
 *
 * Com o relevo fino por cima (card C6), duas coisas mudam. A malha abre um buraco embaixo dos
 * ladrilhos dele: numa cratera, o grosso (a média de 1,9 km) fica acima do fundo e faria sombra no
 * fino. O buraco muda só os triângulos; os vértices e as normais são montados uma vez por relevo.
 * E, na emenda, onde o buraco não chega, o estêncil não deixa o grosso aparecer por cima do fino;
 * o clique segue a mesma regra (reliefLayers.js).
 */
import { useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo } from 'react'
import { BufferAttribute, BufferGeometry } from 'three'

import { nearCoverMask, nearTileIndexAt } from './nearTiles.js'
import { COARSE_LAYER, createLayerMaterial } from './reliefLayers.js'
import { buildReliefCap, coverTriangles, reliefVertexLabels } from './reliefMesh.js'

const NO_COVER = []

/* A borda do relevo do polo fica na altura real, sem descer até o raio 1: em volta dela vem o
   relevo da Lua inteira (GlobalRelief.jsx), e descendo, ela abria um degrau de alguns quilômetros
   em volta de 77°S. De longe, onde a esfera lisa volta no lugar do relevo da Lua inteira, o degrau
   entre a borda e a esfera fica menor que um pixel. */
const CAP_MESH = { overlapM: 0, fadeM: 0 }

/* Troca os triângulos desenhados pelos de `indices`, no mesmo buffer da placa de vídeo. O buffer
   tem o tamanho da malha sem buraco, que é o maior possível; o drawRange diz até onde desenhar, e
   o clique e a sombra respeitam ele. Um buffer novo a cada bloco do relevo fino (uns 3 MB) ficaria
   na placa de vídeo até o coletor de lixo do navegador passar. */
function showTriangles(geometry, indices) {
  geometry.index.array.set(indices)
  geometry.index.needsUpdate = true
  geometry.setDrawRange(0, indices.length)
}

/* relief: o { manifest, heights } do useFarRelief. color: a cor do token, lida pela cena. cover: os
   nomes dos ladrilhos do relevo fino desenhados por cima (NearRelief). */
export function ReliefCap({ relief, color, cover = NO_COVER }) {
  const invalidate = useThree((state) => state.invalidate)
  const { manifest } = relief
  const grid = useMemo(
    () => ({ ...relief.manifest.far, heights: relief.heights, heightScale: relief.manifest.heightScale }),
    [relief],
  )

  const { geometry, fullIndices, vertexTiles } = useMemo(() => {
    const { positions, indices } = buildReliefCap(grid, CAP_MESH)
    const built = new BufferGeometry()
    built.setAttribute('position', new BufferAttribute(positions, 3))
    built.setIndex(new BufferAttribute(indices, 1))
    // a normal de cada vértice sai dos triângulos em volta: é ela que faz a encosta virada para o
    // Sol clarear e a de costas escurecer, antes mesmo da sombra. Calculada sem buraco, ela não
    // muda na borda dele quando o relevo fino entra.
    built.computeVertexNormals()
    return {
      geometry: built,
      // uma cópia: o array da geometria é sobrescrito a cada buraco, e sem ele não há como fechar
      fullIndices: indices.slice(),
      // o ladrilho do fino em cima de cada vértice, uma vez por relevo: com ele, o buraco de cada
      // troca é uma passada nos índices, e não na grade inteira de novo
      vertexTiles: reliefVertexLabels(grid, (px, py) => nearTileIndexAt(manifest, px, py)),
    }
  }, [grid, manifest])

  // a lista de nomes vira texto para o buraco só ser refeito quando ele muda de fato
  const coverKey = cover.join(',')
  const coverMask = useMemo(() => nearCoverMask(manifest, coverKey ? coverKey.split(',') : []), [manifest, coverKey])
  const triangles = useMemo(
    () => (coverKey ? coverTriangles(fullIndices, vertexTiles, coverMask) : fullIndices),
    [coverKey, fullIndices, vertexTiles, coverMask],
  )

  const material = useMemo(() => createLayerMaterial(COARSE_LAYER, color), [color])
  useEffect(() => () => material.dispose(), [material])

  /* No useLayoutEffect, e não no useEffect: ele roda no mesmo commit em que os ladrilhos do fino
     entram na cena (os dois ficam na mesma raiz do React, LunarScene.jsx), antes do quadro seguinte.
     Depois, o quadro poderia sair com o fino e sem o buraco, e o grosso por cima dele. */
  useLayoutEffect(() => {
    showTriangles(geometry, triangles)
    // a troca é por fora do React: a cena parada (card C9) não desenharia o quadro com o buraco
    invalidate()
  }, [geometry, triangles, invalidate])

  // a geometria fica na placa de vídeo até alguém liberar; sem isto, cada relevo novo ficaria lá
  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <mesh
      geometry={geometry}
      material={material}
      renderOrder={COARSE_LAYER.renderOrder}
      userData={COARSE_LAYER.userData}
      castShadow
      receiveShadow
    />
  )
}
