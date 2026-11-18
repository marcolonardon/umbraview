/* Os ladrilhos do relevo da Lua inteira para a cena (experimento da branch
 * exp/lua-inteira-com-relevo): a leitura do manifesto e de cada ladrilho. Os ladrilhos aqui são
 * inventados, de 2 × 2 alturas. O que a cena recebe enquanto eles chegam é o mesmo hook do relevo
 * fino, testado em useNearTiles.test.js. */
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { loadGlobalManifest, loadGlobalTile, useGlobalManifest } from './useGlobalTiles.js'

const MANIFEST = { tilePx: 2, heightScale: 1 }

function reader(files) {
  const reads = []
  const readFile = async (path) => {
    reads.push(path)
    if (!(path in files)) throw new Error(`não existe: ${path}`)
    return files[path]
  }
  return { readFile, reads }
}

describe('loadGlobalTile', () => {
  it('lê as alturas do ladrilho na pasta global', async () => {
    const { readFile, reads } = reader({ 'global/r09c03.bin': new Int16Array([1, -2, 3, -4]).buffer })
    const heights = await loadGlobalTile(readFile, MANIFEST, 'r09c03')
    expect(reads).toEqual(['global/r09c03.bin'])
    expect(Array.from(heights)).toEqual([1, -2, 3, -4])
  })

  it('recusa um ladrilho com o tamanho errado, como uma página de erro no lugar dele', async () => {
    const wrong = new TextEncoder().encode('<html>404</html>').buffer
    const { readFile } = reader({ 'global/r09c03.bin': wrong })
    await expect(loadGlobalTile(readFile, MANIFEST, 'r09c03')).rejects.toThrow(/16 bytes, e não 8/)
  })
})

describe('loadGlobalManifest', () => {
  it('lê o manifest.json da pasta global', async () => {
    const json = JSON.stringify({ pixelsPerDegree: 16, tilePx: 160 })
    const { readFile, reads } = reader({ 'global/manifest.json': new TextEncoder().encode(json).buffer })
    expect(await loadGlobalManifest(readFile)).toEqual({ pixelsPerDegree: 16, tilePx: 160 })
    expect(reads).toEqual(['global/manifest.json'])
  })
})

describe('useGlobalManifest', () => {
  it('começa sem manifesto e devolve ele quando chega', async () => {
    const manifest = { pixelsPerDegree: 16 }
    const load = () => Promise.resolve(manifest)
    const { result } = renderHook(() => useGlobalManifest(load))
    expect(result.current).toBeNull()
    await waitFor(() => expect(result.current).toBe(manifest))
  })

  it('se não chegar, fica sem manifesto, e a cena continua com a esfera lisa', async () => {
    const errors = []
    const original = console.error
    console.error = (...args) => errors.push(args)
    try {
      const load = () => Promise.reject(new Error('sem rede'))
      const { result } = renderHook(() => useGlobalManifest(load))
      await waitFor(() => expect(errors).toHaveLength(1))
      expect(result.current).toBeNull()
    } finally {
      console.error = original
    }
  })
})
