/* O polo sul da Lua nas vistas do espaço em que se chega perto dele (a da missão, card C17): a malha
 * do relevo do polo (far.bin, a mesma da cena principal) com a cor da imagem polar
 * (color-south.jpg).
 *
 * A esfera da Lua usa imagens de latitude e longitude, e nelas o polo é um ponto esticado numa
 * linha inteira: bem em cima do polo, a cor e o relevo saíam em raios em volta dele (o Marco viu
 * em 19/11/2026, no passo do pouso, que olha justamente para lá). Aqui o chão do polo é uma malha
 * de verdade, com um vértice a cada 1,9 km: a luz vem das encostas dela, e a cor, de uma imagem
 * feita na projeção do próprio polo.
 *
 * As alturas entram só na luz. As normais são calculadas com as alturas de verdade, e depois os
 * vértices vão para o raio da esfera (onUnitSphere): com as alturas, a borda da malha tinha que
 * descer até a esfera, e essa rampa em volta do polo pegava luz, um anel a 77°S (visto no
 * navegador). A 1.700 km de raio, 8 km de altura não fazem falta no contorno da Lua.
 *
 * A malha fica por cima da esfera inteira, um nada acima dela (CAP_LIFT), e não num buraco aberto
 * na esfera, como na cena principal. O buraco pedia outro recorte das imagens da esfera quando o
 * relevo chegava, e elas eram enviadas à placa de vídeo duas vezes: a vista levava o dobro do
 * tempo para abrir (medido no navegador, 100 ms contra 50).
 *
 * A cena principal desenha a mesma malha com um shader que lê a posição do ponto no mundo
 * (moonGlobe.js), e lá a Lua fica parada no centro. Aqui a Lua anda e gira, e por isso cada
 * vértice leva pronto o ponto da imagem em que ele cai (southCapUvs).
 */
import { useMemo } from 'react'
import { BufferAttribute, BufferGeometry } from 'three'

import { token } from './cssToken.js'
import { bodyLandingShader, onUnitSphere, southCapUvs } from './moonGlobe.js'
import { moonImagesOfPage } from './moonImages.js'
import { buildReliefCap } from './reliefMesh.js'
import { useBodyTexture } from './useBodyTexture.js'

const moonSouthImage = () => moonImagesOfPage().then((images) => images.south)
// a malha não recebe o raio do clique: são 320 mil triângulos, e quem ouve o mouse é a esfera de clique (MoonBody.jsx)
const NO_RAYCAST = () => null
const WHITE = '#ffffff'
/* Quanto a malha fica acima da esfera, em vezes o raio: uns 900 m, mais que a flecha das faces da
   esfera (500 m), para a malha ficar sempre na frente. De cima não se vê; a luz não muda. */
const CAP_LIFT = 1.0005
// a malha com a altura de verdade até a borda (as opções do buildReliefCap)
const REAL_HEIGHTS = { overlapM: 0, fadeM: 0 }

/* Uma malha por relevo lido, e ele é lido uma vez por página (useFarRelief.js): montar os 160 mil
   vértices de novo a cada vez que a vista abre seria uma travada a cada troca de vista. */
const geometries = new WeakMap()

function capGeometry(relief) {
  let geometry = geometries.get(relief)
  if (!geometry) {
    const { far, heightScale } = relief.manifest
    // com a altura de verdade até a borda, sem descer: a rampa da descida é o anel que se quer evitar
    const { positions, indices } = buildReliefCap({ ...far, heights: relief.heights, heightScale }, REAL_HEIGHTS)
    geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(positions, 3))
    geometry.setAttribute('uv', new BufferAttribute(southCapUvs(positions, far), 2))
    geometry.setIndex(new BufferAttribute(indices, 1))
    // a normal de cada vértice sai dos triângulos em volta: é ela que faz a encosta virada para o Sol clarear
    geometry.computeVertexNormals()
    // e só depois os vértices vão para o raio da esfera: a luz continua a do relevo
    geometry.setAttribute('position', new BufferAttribute(onUnitSphere(positions), 3))
    geometries.set(relief, geometry)
  }
  return geometry
}

/* relief: o { manifest, heights } do useFarRelief. radius: o raio da Lua na cena; a malha é feita
   para a Lua de raio 1. Fica dentro do grupo da Lua, que a põe no lugar e a gira. */
export function MoonSouthCap({ relief, radius }) {
  const south = useBodyTexture(moonSouthImage)
  const geometry = useMemo(() => capGeometry(relief), [relief])
  return (
    <mesh geometry={geometry} scale={radius * CAP_LIFT} raycast={NO_RAYCAST}>
      {/* a key refaz o material quando a imagem chega: o three só decide ao montar o shader se ele tem imagem */}
      {/* o mapa de onde dá para pousar (card C18) entra no shader, como na esfera (MoonBody.jsx) */}
      <meshStandardMaterial
        key={south ? 'textured' : 'plain'}
        color={south ? WHITE : token('--color-moon')}
        map={south}
        onBeforeCompile={bodyLandingShader}
      />
    </mesh>
  )
}
