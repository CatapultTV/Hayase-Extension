import assert from 'node:assert/strict'
import test from 'node:test'
import source, { __testing } from '../hayase/anime-torrents.js'
import { buildIndex, validateIndex } from '../generate_indexes.js'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HASH_EPISODE = 'abcdefabcdefabcdefabcdefabcdefabcdefabcd'
const HASH_BATCH = '1234567890123456789012345678901234567890'
const HASH_MOVIE = 'fedcbafedcbafedcbafedcbafedcbafedcbafedc'

const rss = `<?xml version="1.0"?>
<rss xmlns:nyaa="https://nyaa.si/xmlns/nyaa" version="2.0"><channel>
  <item>
    <title>[Group] One Piece - 04 [1080p]</title>
    <link>https://nyaa.si/download/123.torrent</link>
    <guid>https://nyaa.si/view/123</guid>
    <pubDate>Tue, 10 Nov 2026 20:40:16 -0000</pubDate>
    <nyaa:seeders>12</nyaa:seeders><nyaa:leechers>3</nyaa:leechers><nyaa:downloads>45</nyaa:downloads>
    <nyaa:infoHash>${HASH_EPISODE.toUpperCase()}</nyaa:infoHash>
    <nyaa:size>1.5 GiB</nyaa:size>
  </item>
  <item>
    <title>[Group] One Piece 01-12 [BATCH] [1080p]</title>
    <link>https://nyaa.si/download/456.torrent</link>
    <guid>https://nyaa.si/view/456</guid>
    <pubDate>Tue, 10 Nov 2026 20:40:16 -0000</pubDate>
    <nyaa:seeders>0</nyaa:seeders><nyaa:leechers>0</nyaa:leechers><nyaa:downloads>0</nyaa:downloads>
    <nyaa:infoHash>${HASH_BATCH}</nyaa:infoHash>
    <nyaa:size>not available</nyaa:size>
  </item>
  <item>
    <title>[Group] One Piece Film Red [1080p]</title>
    <link>https://nyaa.si/download/789.torrent</link>
    <guid>https://nyaa.si/view/789</guid>
    <pubDate>Tue, 10 Nov 2026 20:40:16 -0000</pubDate>
    <nyaa:seeders>5</nyaa:seeders><nyaa:leechers>1</nyaa:leechers><nyaa:downloads>20</nyaa:downloads>
    <nyaa:infoHash>${HASH_MOVIE}</nyaa:infoHash>
    <nyaa:size>900 MiB</nyaa:size>
  </item>
</channel></rss>`

const seadexPayload = {
  items: [{
    alID: 12345,
    expand: {
      trs: [
        {
          infoHash: HASH_EPISODE,
          isBest: true,
          releaseGroup: 'CuratedGroup',
          created: '2026-11-10T12:00:00Z',
          files: [{ name: 'One Piece - 04 [1080p].mkv', length: 1000 }]
        },
        {
          infoHash: HASH_BATCH,
          isBest: false,
          releaseGroup: 'BatchGroup',
          created: '2026-11-09T12:00:00Z',
          files: [
            { name: 'One Piece - 01.mkv', length: 1000 },
            { name: 'One Piece - 02.mkv', length: 1000 }
          ]
        },
        {
          infoHash: '<redacted>',
          isBest: false,
          files: [{ name: 'Private release.mkv', length: 1000 }]
        }
      ]
    }
  }]
}

function mockedFetch({ failNyaa = false, failSeaDex = false } = {}) {
  const calls = []
  const fetch = async (input) => {
    const url = String(input)
    calls.push(url)
    if (url.startsWith('https://releases.moe')) {
      if (failSeaDex) throw new Error('SeaDex unavailable')
      return { ok: true, json: async () => seadexPayload, url }
    }
    if (failNyaa) throw new Error('Nyaa unavailable')
    return { ok: true, text: async () => rss, url }
  }
  return { calls, fetch }
}

const query = {
  titles: ['One Piece', 'ワンピース'],
  anilistId: 12345,
  episode: 4,
  episodeCount: 12,
  resolution: '1080',
  exclusions: []
}

test('SeaDex URL uses the releases.moe API and exact AniList filter', () => {
  const url = new URL(__testing.seaDexUrl(12345))
  assert.equal(url.origin, 'https://releases.moe')
  assert.equal(url.searchParams.get('filter'), 'alID="12345"')
  assert.equal(url.searchParams.get('expand'), 'trs')
  assert.equal(url.searchParams.get('perPage'), '1')
})

test('Nyaa single results match the requested episode and preserve RSS metadata', async () => {
  const { calls, fetch } = mockedFetch()
  const results = await __testing.providers.nyaa.search({ ...query, fetch }, 'single')
  assert.equal(calls.length, 2)
  assert.ok(calls[0].includes('q=One+Piece+04+1080p'))
  assert.equal(results.length, 1)
  assert.equal(results[0].hash, HASH_EPISODE)
  assert.equal(results[0].id, 123)
  assert.equal(results[0].link, 'https://nyaa.si/download/123.torrent')
  assert.equal(results[0].size, Math.round(1.5 * 1024 ** 3))
  assert.deepEqual([results[0].seeders, results[0].leechers, results[0].downloads], [12, 3, 45])
  assert.ok(results[0].date instanceof Date)
  assert.equal(results[0].accuracy, 'low')
})

test('Nyaa batch and movie modes filter unrelated release types', async () => {
  const { fetch } = mockedFetch()
  const batch = await __testing.providers.nyaa.search({ ...query, fetch }, 'batch')
  assert.equal(batch.length, 1)
  assert.equal(batch[0].hash, HASH_BATCH)
  assert.equal(batch[0].type, 'batch')

  const movies = await __testing.providers.nyaa.search({ ...query, fetch }, 'movie')
  assert.equal(movies.length, 1)
  assert.equal(movies[0].hash, HASH_MOVIE)
})

test('SeaDex maps curated releases to magnet links and skips redacted hashes', async () => {
  const { fetch } = mockedFetch()
  const results = await __testing.providers.seadex.search({ ...query, fetch }, 'single')
  assert.equal(results.length, 1)
  assert.equal(results[0].accuracy, 'high')
  assert.equal(results[0].type, 'best')
  assert.equal(results[0].hash, HASH_EPISODE)
  assert.ok(results[0].link.startsWith('magnet:?xt=urn:btih:' + HASH_EPISODE))
  assert.equal(results[0].size, 1000)
})

test('SeaDex batch mode requires the requested file count when available', async () => {
  const { fetch } = mockedFetch()
  const results = await __testing.providers.seadex.search({ ...query, fetch }, 'batch')
  assert.equal(results.length, 0)
  const batchQuery = { ...query, episode: undefined, episodeCount: 2, fetch }
  const batches = await __testing.providers.seadex.search(batchQuery, 'batch')
  assert.equal(batches.length, 1)
  assert.equal(batches[0].type, 'batch')
})

test('Provider-specific manifest options only query their configured upstream', async () => {
  const nyaaMock = mockedFetch()
  await source.single({ ...query, fetch: nyaaMock.fetch }, { provider: 'nyaa' })
  assert.equal(nyaaMock.calls.length, 2)
  assert.ok(nyaaMock.calls.every((url) => url.startsWith('https://nyaa.si/')))

  const seaDexMock = mockedFetch()
  await source.single({ ...query, fetch: seaDexMock.fetch }, { provider: 'seadex' })
  assert.equal(seaDexMock.calls.length, 1)
  assert.ok(seaDexMock.calls[0].startsWith('https://releases.moe/'))
})

test('Combined search keeps one provider working when the other fails', async () => {
  const nyaaDown = mockedFetch({ failNyaa: true })
  const seaDexOnly = await source.single({ ...query, fetch: nyaaDown.fetch })
  assert.equal(seaDexOnly.length, 1)
  assert.equal(seaDexOnly[0].accuracy, 'high')

  const seaDexDown = mockedFetch({ failSeaDex: true })
  const nyaaOnly = await source.single({ ...query, fetch: seaDexDown.fetch })
  assert.equal(nyaaOnly.length, 1)
  assert.equal(nyaaOnly[0].accuracy, 'low')
})

test('Duplicate info hashes are merged into a single curated result', () => {
  const merged = __testing.mergeResults([
    { title: '[SeaDex] Curated release', hash: HASH_EPISODE, link: 'magnet', seeders: 0, date: new Date(0) },
    { title: '[Group] Nyaa release', hash: HASH_EPISODE, link: 'https://nyaa.si/download/123.torrent', seeders: 10, date: new Date() }
  ])
  assert.equal(merged.length, 1)
  assert.match(merged[0].title, /SeaDex/)
  assert.equal(merged[0].seeders, 10)
  assert.equal(merged[0].link, 'magnet')
})

test('Empty queries and malformed or failed provider responses return no results', async () => {
  assert.deepEqual(await source.single({ titles: [] }), [])
  assert.deepEqual(await source.single({ titles: ['One Piece'], fetch: async () => ({ ok: false }) }), [])
})

test('64-character v2 hashes use a BitTorrent v2 magnet topic', () => {
  const hash = 'a'.repeat(64)
  assert.equal(__testing.magnetLink(hash), 'magnet:?xt=urn:btmh:1220' + hash)
})

test('Generated manifests contain separate CORS-scoped provider entries', async () => {
  const index = buildIndex()
  validateIndex(index)
  assert.equal(index.length, 2)
  assert.equal(index[0].id, 'catapulttv.hayase.seadex')
  assert.equal(index[0].url, 'aHR0cHM6Ly9yZWxlYXNlcy5tb2U=')
  assert.equal(index[1].id, 'catapulttv.hayase.nyaa')
  assert.equal(index[1].url, 'aHR0cHM6Ly9ueWFhLnNp')

  const root = dirname(dirname(fileURLToPath(import.meta.url)))
  const actual = JSON.parse(await readFile(join(root, 'index.json'), 'utf8'))
  assert.deepEqual(actual, index)
})
