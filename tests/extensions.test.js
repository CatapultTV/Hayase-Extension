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
const HASH_OLD = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

function row({ title, hash, id, date = 1794343216, size = '1.5 GiB', seeders = 12, leechers = 3, downloads = 45 }) {
  return '<tr>' +
    '<td><a href="/?c=1_0">Anime</a></td>' +
    '<td><a href="/view/' + id + '">' + title + '</a></td>' +
    '<td><a href="/download/' + id + '.torrent">Torrent</a><a href="magnet:?xt=urn:btih:' + hash + '&dn=Release">Magnet</a></td>' +
    '<td>' + size + '</td><td data-timestamp="' + date + '" title="2026-11-10 20:40">' + date + '</td>' +
    '<td>' + seeders + '</td><td>' + leechers + '</td><td>' + downloads + '</td></tr>'
}

const pageOne = '<html><table id="torrent-list"><tbody>' +
  row({ title: '[Group] One Piece - 04 [1080p]', hash: HASH_EPISODE, id: 123 }) +
  row({ title: '[Group] One Piece 01-12 [BATCH] [1080p]', hash: HASH_BATCH, id: 456 }) +
  row({ title: '[Group] One Piece Film Red [1080p]', hash: HASH_MOVIE, id: 789 }) +
  '</tbody></table></html>'
const pageTwo = '<html><table id="torrent-list"><tbody>' +
  row({ title: '[OldGroup] One Piece - 04 [720p]', hash: HASH_OLD, id: 111, date: 1400000000, size: '700 MiB' }) +
  '</tbody></table></html>'
const emptyPage = '<html><table id="torrent-list"><tbody></tbody></table></html>'

const seadexPayload = {
  items: [{
    alID: 12345,
    expand: {
      trs: [
        { infoHash: HASH_EPISODE, isBest: true, releaseGroup: 'CuratedGroup', created: '2026-11-10T12:00:00Z', files: [{ name: 'One Piece - 04 [1080p].mkv', length: 1000 }] },
        { infoHash: HASH_BATCH, isBest: false, releaseGroup: 'BatchGroup', created: '2026-11-09T12:00:00Z', files: [{ name: 'One Piece - 01.mkv', length: 1000 }, { name: 'One Piece - 02.mkv', length: 1000 }] },
        { infoHash: '<redacted>', isBest: false, files: [{ name: 'Private release.mkv', length: 1000 }] }
      ]
    }
  }]
}

function mockedFetch({ failNyaa = false, failSukebei = false, failSeaDex = false, failPirateBay = false } = {}) {
  const calls = []
  const fetch = async (input) => {
    const url = String(input)
    calls.push(url)
    if (url.startsWith('https://releases.moe')) {
      if (failSeaDex) throw new Error('SeaDex unavailable')
      return { ok: true, json: async () => seadexPayload, url }
    }
    if (url.startsWith('https://apibay.org')) {
      if (failPirateBay) throw new Error('Pirate Bay API unavailable')
      return { ok: true, json: async () => [{ id: '1', name: 'One Piece - 04 [1080p]', info_hash: HASH_EPISODE, seeders: '8', leechers: '2', size: '1000', added: '1400000000' }], url }
    }
    if (url.startsWith('https://sukebei.nyaa.si')) {
      if (failSukebei) throw new Error('Sukebei unavailable')
    } else if (url.startsWith('https://nyaa.si') && failNyaa) {
      throw new Error('Nyaa unavailable')
    }
    const page = Number(new URL(url).searchParams.get('p') || 1)
    return { ok: true, text: async () => page === 1 ? pageOne : page === 2 ? pageTwo : emptyPage, url }
  }
  return { calls, fetch }
}

const query = { titles: ['One Piece', 'ワンピース'], anilistId: 12345, episode: 4, episodeCount: 12, resolution: '', exclusions: [] }

test('SeaDex URL uses releases.moe API and exact AniList filter', () => {
  const url = new URL(__testing.seaDexUrl(12345))
  assert.equal(url.origin, 'https://releases.moe')
  assert.equal(url.searchParams.get('filter'), 'alID="12345"')
  assert.equal(url.searchParams.get('expand'), 'trs')
  assert.equal(url.searchParams.get('perPage'), '1')
})

test('Nyaa HTML parser extracts torrent metadata and matches episode', () => {
  const results = __testing.parseNyaaHtml(pageOne, 'single', query)
  assert.equal(results.length, 1)
  assert.equal(results[0].hash, HASH_EPISODE)
  assert.equal(results[0].id, 123)
  assert.equal(results[0].seeders, 12)
  assert.equal(results[0].leechers, 3)
  assert.equal(results[0].downloads, 45)
  assert.equal(results[0].size, Math.round(1.5 * 1024 ** 3))
  assert.equal(results[0].date.getTime(), 1794343216 * 1000)
})

test('Nyaa pagination searches older pages instead of stopping at recent results', async () => {
  const { calls, fetch } = mockedFetch()
  const results = await __testing.providers.nyaa.search({ ...query, titles: ['One Piece'], fetch }, 'single', { pages: '3' })
  assert.equal(calls.length, 3)
  assert.deepEqual(results.map((result) => result.hash), [HASH_EPISODE, HASH_OLD])
  assert.equal(results.find((result) => result.hash === HASH_OLD).date.getTime(), 1400000000 * 1000)
})

test('Nyaa batch and movie modes filter unrelated release types', () => {
  const batch = __testing.parseNyaaHtml(pageOne, 'batch', query)
  assert.equal(batch.length, 1)
  assert.equal(batch[0].hash, HASH_BATCH)
  const movies = __testing.parseNyaaHtml(pageOne, 'movie', query)
  assert.equal(movies.length, 1)
  assert.equal(movies[0].hash, HASH_MOVIE)
})

test('Sukebei searches its own host and can paginate', async () => {
  const { calls, fetch } = mockedFetch()
  const results = await __testing.providers.sukebei.search({ ...query, titles: ['One Piece'], fetch }, 'single', { pages: 2 })
  assert.equal(results.length, 2)
  assert.ok(calls.every((url) => url.startsWith('https://sukebei.nyaa.si/')))
  assert.ok(calls[0].includes('c=0_0'))
})

test('Pirate Bay API results are normalised and filtered', () => {
  const results = __testing.parseApiBayResponse([
    { id: '1', name: 'One Piece - 04 [1080p]', info_hash: HASH_EPISODE, seeders: '8', leechers: '2', size: '1000', added: '1400000000' },
    { id: '2', name: 'Unrelated title', info_hash: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', seeders: '1', leechers: '1', size: '20', added: '1400000000' }
  ], 'single', query)
  assert.equal(results.length, 1)
  assert.equal(results[0].hash, HASH_EPISODE)
  assert.equal(results[0].seeders, 8)
  assert.ok(results[0].link.startsWith('magnet:?xt=urn:btih:'))
})

test('SeaDex maps curated releases and excludes redacted hashes', async () => {
  const { fetch } = mockedFetch()
  const results = await __testing.providers.seadex.search({ ...query, fetch }, 'single')
  assert.equal(results.length, 1)
  assert.equal(results[0].accuracy, 'high')
  assert.equal(results[0].type, 'best')
  assert.equal(results[0].hash, HASH_EPISODE)
})

test('Provider selection only queries the configured site', async () => {
  const nyaaMock = mockedFetch()
  await source.single({ ...query, titles: ['One Piece'], fetch: nyaaMock.fetch }, { provider: 'nyaa', pages: '1' })
  assert.ok(nyaaMock.calls.length > 0)
  assert.ok(nyaaMock.calls.every((url) => url.startsWith('https://nyaa.si/')))

  const sukebeiMock = mockedFetch()
  await source.single({ ...query, titles: ['One Piece'], fetch: sukebeiMock.fetch }, { provider: 'sukebei', pages: '1' })
  assert.ok(sukebeiMock.calls.every((url) => url.startsWith('https://sukebei.nyaa.si/')))

  const pirateBayMock = mockedFetch()
  await source.single({ ...query, titles: ['One Piece'], fetch: pirateBayMock.fetch }, { provider: 'piratebay' })
  assert.ok(pirateBayMock.calls.every((url) => url.startsWith('https://apibay.org/')))
})

test('64-character v2 hashes use a BitTorrent v2 magnet topic', () => {
  const hash = 'a'.repeat(64)
  assert.equal(__testing.magnetLink(hash), 'magnet:?xt=urn:btmh:1220' + hash)
})

test('Generated manifest includes all four providers and pagination settings', async () => {
  const index = buildIndex()
  validateIndex(index)
  assert.equal(index.length, 4)
  assert.deepEqual(index.map((entry) => entry.id), [
    'catapulttv.hayase.seadex',
    'catapulttv.hayase.nyaa',
    'catapulttv.hayase.sukebei',
    'catapulttv.hayase.piratebay'
  ])
  assert.equal(index[1].options.pages.default, '10')
  const root = dirname(dirname(fileURLToPath(import.meta.url)))
  const actual = JSON.parse(await readFile(join(root, 'index.json'), 'utf8'))
  assert.deepEqual(actual, index)
})
