/* O polo norte da Lua nas vistas do espaço em que se chega perto dela (a da missão), visto quebrado
 * pelo Marco em 20/11/2026: na esfera, a cor e o relevo vêm de imagens em latitude e longitude, e no
 * polo o ponto vira uma linha inteira da imagem, que sai em raios em volta dele.
 *
 * O polo sul tem o relevo e a imagem polar dos dados do site (MoonSouthCap.jsx). O norte não tem:
 * aqui as duas imagens da esfera (color.jpg e normal.jpg) são refeitas no navegador na projeção do
 * próprio polo (reprojectNorthCap, em moonGlobe.js), e uma malha própria as usa. As normais passam a
 * ser da própria Lua (object space), porque na projeção polar o leste e o norte de cada ponto giram.
 *
 * A conta lê só a faixa de cima das imagens, até NORTH_BAND_DEG do polo, e é feita uma vez por página.
 */
import { useEffect, useMemo, useState } from 'react'
import { BufferAttribute, BufferGeometry, DataTexture, LinearFilter, LinearMipmapLinearFilter, ObjectSpaceNormalMap, RGBAFormat, SRGBColorSpace } from 'three'

import { bodyLandingShader, buildNorthCap, reprojectNorthCap } from './moonGlobe.js'
import { moonImagesOfPage } from './moonImages.js'

// até onde a malha vai, em graus do polo: o mesmo alcance da malha do polo sul (12,7°), arredondado
const NORTH_CAP_REACH_DEG = 12
/* A faixa de cima das imagens que o navegador lê: os cantos da imagem polar ficam a uns 17° do polo,
   e a faixa vai um pouco além. Ler a imagem inteira seria pôr 32 MB na memória para nada. */
const NORTH_BAND_DEG = 20
// o lado das duas imagens polares: uns 21 pixels por grau, mais que os 11 da imagem de cor da esfera
const NORTH_IMAGE_SIZE = 512
// a malha: anéis em volta do polo e vértices em cada anel
const RINGS = 48
const SEGMENTS = 128
// quanto a malha fica acima da esfera, em vezes o raio: o mesmo da malha do polo sul (MoonSouthCap.jsx)
const CAP_LIFT = 1.0005
// a malha não recebe o raio do clique: quem ouve o mouse é a esfera de clique (MoonBody.jsx)
const NO_RAYCAST = () => null

// a faixa de cima de uma imagem, em pixels RGBA, lida por um canvas
function topBand(image) {
  const rows = Math.ceil((image.height * NORTH_BAND_DEG) / 180)
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = rows
  const context = canvas.getContext('2d', { willReadFrequently: true })
  context.drawImage(image, 0, 0, image.width, rows, 0, 0, image.width, rows)
  return { data: context.getImageData(0, 0, image.width, rows).data, width: image.width, height: image.height, rows }
}

function texture(data, srgb) {
  const built = new DataTexture(data, NORTH_IMAGE_SIZE, NORTH_IMAGE_SIZE, RGBAFormat)
  if (srgb) built.colorSpace = SRGBColorSpace
  built.generateMipmaps = true
  built.minFilter = LinearMipmapLinearFilter
  built.magFilter = LinearFilter
  built.needsUpdate = true
  return built
}

/* As imagens e a malha do polo norte, uma vez por página: refazer a conta a cada vez que a vista
   abre seria uma travada a cada troca de vista. */
let pageCap = null
function northCapOfPage() {
  pageCap ??= moonImagesOfPage().then(({ color, normal }) => {
    const images = reprojectNorthCap({ color: topBand(color), normal: topBand(normal) }, NORTH_IMAGE_SIZE, NORTH_CAP_REACH_DEG)
    const { positions, uvs, indices } = buildNorthCap(NORTH_CAP_REACH_DEG, RINGS, SEGMENTS)
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(positions, 3))
    // na esfera de raio 1, a normal de cada vértice é a própria posição
    geometry.setAttribute('normal', new BufferAttribute(positions.slice(), 3))
    geometry.setAttribute('uv', new BufferAttribute(uvs, 2))
    geometry.setIndex(new BufferAttribute(indices, 1))
    return { geometry, map: texture(images.color, true), normalMap: texture(images.normal, false) }
  })
  pageCap.catch(() => {
    pageCap = null
  })
  return pageCap
}

/* radius: o raio da Lua na cena; a malha é feita para a Lua de raio 1. Fica dentro do grupo da Lua,
   que a põe no lugar e a gira: as normais da imagem são as da Lua, e giram junto. Enquanto as imagens
   não chegam, não desenha nada, e a esfera aparece por baixo. */
export function MoonNorthCap({ radius }) {
  const [cap, setCap] = useState(null)
  useEffect(() => {
    let current = true
    northCapOfPage().then(
      (built) => current && setCap(built),
      () => {},
    )
    return () => {
      current = false
    }
  }, [])
  const material = useMemo(() => cap && { map: cap.map, normalMap: cap.normalMap }, [cap])
  if (!material) return null
  return (
    <mesh geometry={cap.geometry} scale={radius * CAP_LIFT} raycast={NO_RAYCAST}>
      {/* o mapa de onde dá para pousar (card C18) entra no shader, como na esfera e no polo sul */}
      <meshStandardMaterial
        map={material.map}
        normalMap={material.normalMap}
        normalMapType={ObjectSpaceNormalMap}
        onBeforeCompile={bodyLandingShader}
      />
    </mesh>
  )
}
