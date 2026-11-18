/* Os ladrilhos do relevo da Lua inteira para a cena (experimento da branch
 * exp/lua-inteira-com-relevo, globalTiles.js).
 *
 * São os mesmos arquivos que o motor usa para o horizonte fora do polo (public/data/relief/global/),
 * lidos pelo mesmo leitor do site (createReliefReader). O que a cena recebe enquanto eles chegam é o
 * mesmo do relevo fino (useNearTiles): o pedaço que espera um ladrilho fica de fora, e ali a esfera
 * lisa cobre.
 */
import { useEffect, useState } from 'react'

import { createNearTileCache, useNearTiles } from './useNearTiles.js'
import { createReliefReader } from './useSiteSky.js'

/* O manifest.json da pasta global, com readFile relativo a public/data/relief/ (como em
   reliefFiles.js). */
export async function loadGlobalManifest(readFile) {
  return JSON.parse(new TextDecoder().decode(await readFile('global/manifest.json')))
}

/* As alturas de um ladrilho (tilePx × tilePx, em int16). O tamanho é conferido porque uma página
   de erro servida no lugar do arquivo chegaria como alturas (o mesmo cuidado do useFarRelief). */
export async function loadGlobalTile(readFile, manifest, name) {
  const path = `global/${name}.bin`
  const buffer = await readFile(path)
  const expected = manifest.tilePx * manifest.tilePx * 2
  if (buffer.byteLength !== expected) {
    throw new Error(`o arquivo de relevo ${path} veio com ${buffer.byteLength} bytes, e não ${expected}`)
  }
  return new Int16Array(buffer)
}

/* Quantos ladrilhos a página guarda. A 600 km de altura (GLOBAL_MAX_ALTITUDE, em globalTiles.js), a
   câmera vê uns cem ladrilhos, e cada pedaço lê também a borda dos vizinhos: com 200, descer e subir
   de novo não baixa nada outra vez. Cada um tem 51 kB: são 10 MB. */
const PAGE_CACHE_TILES = 200

// o leitor só é criado no primeiro pedido: o document.baseURI é da página, e não do teste
let pageReader = null
const readerOfPage = () => (pageReader ??= createReliefReader(new URL('data/relief/', document.baseURI).href))

const globalTileOfPage = createNearTileCache((name, manifest) => loadGlobalTile(readerOfPage(), manifest, name), PAGE_CACHE_TILES)

/* Uma leitura do manifesto por página; uma que falhou é esquecida, para a próxima montagem tentar
   de novo (o mesmo jeito do useFarRelief). */
let pageManifest = null
function globalManifestOfPage() {
  if (!pageManifest) {
    pageManifest = loadGlobalManifest(readerOfPage())
    pageManifest.catch(() => {
      pageManifest = null
    })
  }
  return pageManifest
}

/* Devolve o manifesto, ou null enquanto não chegou (ou se não deu para ler: aí a Lua fica com a
   esfera lisa fora do polo, como era antes). load: a leitura; só os testes trocam, e ela precisa
   ser sempre a mesma função, porque está nas dependências do efeito. */
export function useGlobalManifest(load = globalManifestOfPage) {
  const [manifest, setManifest] = useState(null)
  useEffect(() => {
    let current = true
    load().then(
      (result) => {
        if (current) setManifest(result)
      },
      (error) => {
        if (current) console.error('useGlobalManifest: o relevo da Lua inteira não chegou; fora do polo a Lua fica lisa', error)
      },
    )
    return () => {
      current = false
    }
  }, [load])
  return manifest
}

/* manifest: o da pasta global, ou null. names: os ladrilhos que os pedaços pedidos leem
   (chunkTileNames). Devolve um Map do nome para as alturas, como o useNearTiles. */
export function useGlobalTiles(manifest, names) {
  return useNearTiles(manifest, names, globalTileOfPage)
}
