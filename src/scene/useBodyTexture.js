/* A imagem de um corpo virando textura do three, para a Terra e a Lua da vista do sistema e da
 * vista da missão (EarthBody.jsx e MoonBody.jsx). */
import { useEffect, useMemo, useState } from 'react'
import { SRGBColorSpace, Texture } from 'three'

/* load: a leitura da imagem, uma função de fora do componente (está nas dependências do efeito).
   srgb: se a imagem é de cor (true, o padrão) ou de números, como um mapa de normais (false).
   Enquanto a imagem não chega, ou se não chegar, devolve null, e o corpo fica liso, na cor do
   token. */
export function useBodyTexture(load, srgb = true) {
  const [image, setImage] = useState(null)
  useEffect(() => {
    let current = true
    load().then(
      (loaded) => current && setImage(loaded),
      () => {},
    )
    return () => {
      current = false
    }
  }, [load])
  const texture = useMemo(() => {
    if (!image) return null
    const built = new Texture(image)
    if (srgb) built.colorSpace = SRGBColorSpace
    built.needsUpdate = true
    return built
  }, [image, srgb])
  useEffect(() => () => texture?.dispose(), [texture])
  return texture
}
