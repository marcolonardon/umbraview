/* A esfera da Lua inteira, com a cor e o relevo de verdade (NASA, CGI Moon Kit: CREDITS.md).
 *
 * Enquanto as imagens baixam, ou se não chegarem, a esfera fica lisa, com a cor do token: a cena
 * não espera por elas, como não espera pelo relevo do polo (useFarRelief.js). Quando chegam, a cor
 * polar também entra nas malhas do relevo (moonGlobe.js), para a emenda entre a esfera e o relevo
 * não aparecer.
 */
import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
import { SRGBColorSpace, Texture } from 'three'

import { globalLandingShader, globeTextureWindow, setSouthColor } from './moonGlobe.js'
import { moonImagesOfPage } from './moonImages.js'
import { GLOBE_LAYER } from './reliefLayers.js'

/* Triângulos da esfera: com o mapa de normais, a luz não depende deles, mas a borda da Lua contra
   o céu, sim. Com 128 × 64, de perto a borda mostrava as quinas. */
const WIDTH_SEGMENTS = 192
const HEIGHT_SEGMENTS = 96

/* A cor do material com a imagem por cima: branco, para a imagem aparecer com a cor dela. */
const WHITE = '#ffffff'

/* Quanto a textura continua nítida vista de lado, perto da borda da Lua. 4 é o que toda placa de
   vídeo com o filtro anisotrópico oferece. */
const ANISOTROPY = 4

function textureOf(image, { srgb }) {
  const texture = new Texture(image)
  if (srgb) texture.colorSpace = SRGBColorSpace
  texture.anisotropy = ANISOTROPY
  texture.needsUpdate = true
  return texture
}

/* color: a cor lisa, do token, para enquanto não há imagem. thetaLength: até onde a esfera vai, a
   partir do polo norte (π sem o relevo do polo; menos com ele, que entra no buraco). far: o campo
   far do manifesto do relevo, ou null sem ele. */
export function MoonGlobe({ color, thetaLength, far }) {
  const invalidate = useThree((state) => state.invalidate)
  const [images, setImages] = useState(null)

  useEffect(() => {
    let current = true
    moonImagesOfPage().then(
      (result) => {
        if (current) setImages(result)
      },
      (error) => {
        if (current) console.error('MoonGlobe: as imagens da Lua não chegaram; ela fica lisa', error)
      },
    )
    return () => {
      current = false
    }
  }, [])

  /* As texturas da esfera são refeitas quando o buraco do polo muda (uma vez, quando o relevo
     chega): cada uma leva o pedaço da imagem que a esfera aberta usa. */
  const textures = useMemo(() => {
    if (!images) return null
    const { repeatY, offsetY } = globeTextureWindow(thetaLength)
    const map = textureOf(images.color, { srgb: true })
    const normalMap = textureOf(images.normal, { srgb: false })
    for (const texture of [map, normalMap]) {
      texture.repeat.set(1, repeatY)
      texture.offset.set(0, offsetY)
    }
    return { map, normalMap }
  }, [images, thetaLength])
  useEffect(
    () => () => {
      textures?.map.dispose()
      textures?.normalMap.dispose()
    },
    [textures],
  )

  const south = useMemo(() => (images ? textureOf(images.south, { srgb: true }) : null), [images])
  useEffect(() => {
    // só com o relevo: sem ele não há malha para pintar, e a grade da imagem não é conhecida
    setSouthColor(far ? south : null, far)
    // os uniformes mudam por fora do React: a cena parada (card C9) não desenharia o quadro novo
    invalidate()
    return () => setSouthColor(null, null)
  }, [south, far, invalidate])
  useEffect(() => () => south?.dispose(), [south])

  /* A esfera vem por último no estêncil (reliefLayers.js): só aparece onde nenhum relevo desenhou.
     Sem isto, no fundo de uma bacia, onde o chão fica quilômetros abaixo do raio 1, ela cobriria o
     relevo da Lua inteira. */
  return (
    <mesh receiveShadow renderOrder={GLOBE_LAYER.renderOrder} userData={GLOBE_LAYER.userData}>
      <sphereGeometry args={[1, WIDTH_SEGMENTS, HEIGHT_SEGMENTS, 0, 2 * Math.PI, 0, thetaLength]} />
      {/* O polygonOffset empurra a esfera um pouco para trás na profundidade: na faixa em que ela
          passa por baixo da borda do relevo, as duas ficam no mesmo raio, e sem isto piscariam
          disputando o mesmo pixel. A key refaz o material quando as imagens chegam: o three só
          decide uma vez, ao montar o shader, se o material tem imagem. O onBeforeCompile põe no
          shader o mapa das áreas de pouso da Lua inteira (moonGlobe.js). */}
      <meshStandardMaterial
        key={textures ? 'textured' : 'plain'}
        color={textures ? WHITE : color}
        map={textures?.map ?? null}
        normalMap={textures?.normalMap ?? null}
        onBeforeCompile={globalLandingShader}
        polygonOffset
        polygonOffsetFactor={1}
        polygonOffsetUnits={1}
        {...GLOBE_LAYER.material}
      />
    </mesh>
  )
}
