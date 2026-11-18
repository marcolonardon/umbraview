/* O relevo da Lua inteira na cena (experimento da branch exp/lua-inteira-com-relevo): os pedaços de
 * globalTiles.js em volta do ponto embaixo da câmera, com a cor da esfera e a sombra das montanhas.
 *
 * Quem decide quais pedaços, e com quanto detalhe, é o globalChunks, pela posição da câmera. Este
 * componente baixa os ladrilhos que eles leem (useGlobalTiles), monta as malhas aos poucos, para a
 * página não travar, e só troca o que está na tela quando todos os pedaços pedidos estão montados:
 * trocando antes, os pedaços que saem sumiriam antes de os novos chegarem, e a esfera lisa piscaria
 * no lugar. O pedaço que depende de um ladrilho que falhou fica de fora, e ali a esfera lisa cobre.
 *
 * Perto do limite de altura, o relevo se achata aos poucos até ficar igual à esfera (flattenAmount,
 * em globalTiles.js): sem isso, a imagem perdia nitidez num salto quando a câmera passava do limite
 * e a esfera entrava no lugar dele.
 */
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BufferAttribute, BufferGeometry, RepeatWrapping, SRGBColorSpace, Texture } from 'three'

import { useGlobalManifest, useGlobalTiles } from '../hooks/useGlobalTiles.js'
import { buildGlobalChunk, chunkTileNames, flattenAmount, globalChunks, globalHeightReader } from './globalTiles.js'
import { moonImagesOfPage } from './moonImages.js'
import { GLOBAL_LAYER, createGlobalDepthMaterial, createGlobalMaterial, setGlobalFlatten } from './reliefLayers.js'

/* Quanto tempo de cada quadro a montagem das malhas pode usar, em milissegundos. Um pedaço com um
   vértice por pixel leva uns 2 ms no Node; com o resto do quadro, 6 ms ainda deixa a página a uns
   60 quadros por segundo enquanto a câmera desce. */
const BUILD_BUDGET_MS = 6

// o mesmo filtro da esfera (MoonGlobe.jsx): a textura continua nítida vista de lado
const ANISOTROPY = 4

const DEG = Math.PI / 180

const sameKeys = (a, b) => a.length === b.length && a.every((key, i) => key === b[i])

function buildGeometry(manifest, chunk, tiles) {
  const { positions, normals, uvs, indices } = buildGlobalChunk(manifest, chunk, globalHeightReader(manifest, tiles))
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new BufferAttribute(normals, 3))
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2))
  geometry.setIndex(new BufferAttribute(indices, 1))
  // a esfera em volta do pedaço: é com ela que o three deixa de fora o que não está na tela
  geometry.computeBoundingSphere()
  return geometry
}

/* color: a cor da Lua, do token, para enquanto a imagem de cor não chegou. skipSouthOfDeg: a
   latitude ao sul da qual o relevo do polo desenha (globalChunks). */
export function GlobalRelief({ color, skipSouthOfDeg = -90 }) {
  const invalidate = useThree((state) => state.invalidate)
  const manifest = useGlobalManifest()
  // os pedaços que a câmera pede agora, e os que estão na tela: [key, geometria]
  const [selection, setSelection] = useState([])
  const [shown, setShown] = useState([])
  // as malhas montadas, por key; só o useFrame e os efeitos leem
  const built = useRef(new Map())
  const names = useMemo(
    () => (manifest ? [...new Set(selection.flatMap((chunk) => chunkTileNames(manifest, chunk)))].sort() : []),
    [manifest, selection],
  )
  const tiles = useGlobalTiles(manifest, names)

  /* As mesmas imagens da esfera, lidas uma vez por página (a esfera avisa no console se falharem):
     a de cor e o mapa de normais, que entra quando o relevo se achata (setGlobalFlatten). */
  const [images, setImages] = useState(null)
  useEffect(() => {
    let current = true
    moonImagesOfPage().then(
      (result) => {
        if (current) setImages(result)
      },
      () => {},
    )
    return () => {
      current = false
    }
  }, [])
  const textures = useMemo(() => {
    if (!images) return null
    const made = { map: new Texture(images.color), normalMap: new Texture(images.normal) }
    made.map.colorSpace = SRGBColorSpace
    for (const texture of Object.values(made)) {
      // o u do pedaço que atravessa a longitude 180° passa de 1 (buildGlobalChunk)
      texture.wrapS = RepeatWrapping
      texture.anisotropy = ANISOTROPY
      texture.needsUpdate = true
    }
    return made
  }, [images])
  useEffect(
    () => () => {
      textures?.map.dispose()
      textures?.normalMap.dispose()
    },
    [textures],
  )
  const material = useMemo(() => createGlobalMaterial(color, textures?.map, textures?.normalMap), [color, textures])
  useEffect(() => () => material.dispose(), [material])
  // a sombra se achata junto com o relevo; um material só para todos os pedaços
  const [depthMaterial] = useState(createGlobalDepthMaterial)
  useEffect(() => () => depthMaterial.dispose(), [depthMaterial])

  // um ladrilho que chega, ou um material novo, não muda nada que o React Three Fiber veja: com a
  // cena parada (card C9), ninguém desenharia o quadro que monta a malha ou troca a imagem
  useEffect(() => {
    invalidate()
  }, [tiles, material, manifest, invalidate])

  useFrame(({ camera, size }) => {
    /* O achatamento pela altura da câmera, a cada quadro, antes de desenhar: perto do limite, o
       relevo fica igual à esfera, e os pedaços entram e saem sem a imagem mudar. Os quadros vêm
       justamente quando a câmera anda (card C9). */
    setGlobalFlatten(material, flattenAmount(camera.position.length() - 1))
    if (!manifest) return
    const halfFov = (camera.fov * DEG) / 2
    const next = globalChunks(manifest, camera.position.toArray(), {
      pixelsPerRadian: size.height / (2 * Math.tan(halfFov)),
      viewHalfAngleRad: Math.atan(Math.tan(halfFov) * Math.hypot(1, size.width / size.height)),
      skipSouthOfDeg,
    })
    if (!sameKeys(next.map((chunk) => chunk.key), selection.map((chunk) => chunk.key))) {
      setSelection(next)
      invalidate()
      return
    }

    const start = performance.now()
    let waiting = false
    for (const chunk of selection) {
      if (built.current.has(chunk.key)) continue
      const needed = chunkTileNames(manifest, chunk)
      if (needed.some((name) => tiles.get(name) === null)) continue
      if (!needed.every((name) => tiles.has(name))) {
        // o ladrilho que chega pede o quadro (o efeito de cima)
        waiting = true
        continue
      }
      if (performance.now() - start > BUILD_BUDGET_MS) {
        waiting = true
        invalidate()
        break
      }
      built.current.set(chunk.key, buildGeometry(manifest, chunk, tiles))
    }
    if (waiting) return

    const ready = selection.filter((chunk) => built.current.has(chunk.key)).map((chunk) => chunk.key)
    if (!sameKeys(ready, shown.map(([key]) => key))) {
      setShown(ready.map((key) => [key, built.current.get(key)]))
      invalidate()
    }
  })

  // as malhas que não estão na tela nem pedidas saem da placa de vídeo; sem isto, cada pedaço por
  // onde a câmera passou ficaria lá
  useEffect(() => {
    const keep = new Set([...shown.map(([key]) => key), ...selection.map((chunk) => chunk.key)])
    for (const [key, geometry] of built.current) {
      if (!keep.has(key)) {
        geometry.dispose()
        built.current.delete(key)
      }
    }
  }, [shown, selection])

  // ao sair da cena, tudo sai da placa de vídeo
  useEffect(() => {
    const pieces = built.current
    return () => {
      setShown([])
      for (const geometry of pieces.values()) geometry.dispose()
      pieces.clear()
    }
  }, [])

  return (
    <>
      {shown.map(([key, geometry]) => (
        <mesh
          key={key}
          geometry={geometry}
          material={material}
          customDepthMaterial={depthMaterial}
          renderOrder={GLOBAL_LAYER.renderOrder}
          userData={GLOBAL_LAYER.userData}
          castShadow
          receiveShadow
        />
      ))}
    </>
  )
}
