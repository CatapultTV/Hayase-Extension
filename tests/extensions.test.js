import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const hayaseNyaa = (await import(pathToFileURL(join(root, 'hayase', 'nyaa.js')))).default
const hayaseSukebei = (await import(pathToFileURL(join(root, 'hayase', 'sukebei.js')))).default
const shiruNyaa = (await import(pathToFileURL(join(root, 'shiru', 'sources', 'nyaasrc', 'index.js')))).default
const shiruSukebei = (await import(pathToFileURL(join(root, 'shiru', 'sources', 'sukebeisrc', 'index.js')))).default

const feed = `<?xml version="1.0"?>
<rss xmlns:nyaa="https://nyaa.si/xmlns/nyaa" version="2.0"><channel>
  <item>
    <title>[Group] One Piece - 04 [1080p] &amp; More</title>
    <link>https://nyaa.si/download/123.torrent</link>
    <guid>https://nyaa.si/view/123</guid>
    <pubDate>Tue, 10 Nov 2026 20:40:16 -0000</pubDate>
    <nyaa:seeders>12</nyaa:seeders><nyaa:leechers>3</nyaa:leechers><nyaa:downloads>45</nyaa:downloads>
    <nyaa:infoHash>ABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD</nyaa:infoHash>
    <nyaa:size>1.5 GiB</nyaa:size>
  </item>
  <item>
    <title>[Group] One Piece 01-12 [BATCH]</title>
    <link>https://nyaa.si/download/456.torrent</link>
    <guid>https://nyaa.si/view/456</guid>
    <pubDate>Tue, 10 Nov 2026 20:40:16 -0000</pubDate>
    <nyaa:seeders>0</nyaa:seeders><nyaa:leechers>0</nyaa:leechers><nyaa:downloads>0</nyaa:downloads>
    <nyaa:infoHash>1234567890123456789012345678901234567890</nyaa:infoHash>
    <nyaa:size>not available</nyaa:size>
  </item>
  <item><title>Missing hash</title><link>https://nyaa.si/download/missing.torrent</link></item>
</channel></rss>`

function mockedFetch (body = feed, ok = true) {
  const calls = []
  const fetcher = async (url) => {
    calls.push(String(url))
    return { ok, text: async () => body }
  }
  return { calls, fetcher }
}

function query (titles = ['One Piece']) {
  return { titles, episode: 4, resolution: '1080', exclusions: [] }
}

test('Hayase Nyaa uses alternative titles, episode terms, and preserves RSS metadata', async () => {
  const { calls, fetcher } = mockedFetch()
  const results = await hayaseNyaa.single({ ...query(['Missing title', 'One Piece']), fetch: fetcher })

  assert.equal(calls.length, 2)
  assert.match(calls[1], /q=One\+Piece\+04\+1080p/)
  assert.equal(results.length, 2)
  assert.equal(results[0].title, '[Group] One Piece - 04 [1080p] & More')
  assert.equal(results[0].hash, 'abcdefabcdefabcdefabcdefabcdefabcdefabcd')
  assert.equal(results[0].id, 123)
  assert.equal(results[0].size, Math.round(1.5 * 1024 ** 3))
  assert.deepEqual([results[0].seeders, results[0].leechers, results[0].downloads], [12, 3, 45])
  assert.ok(results[0].date instanceof Date)
  assert.equal(results[0].accuracy, 'low')
})

test('Hayase sources return empty results for empty, failed, or malformed searches', async () => {
  const failed = mockedFetch('', false)
  assert.deepEqual(await hayaseNyaa.single({ titles: [], fetch: failed.fetcher }), [])
  assert.deepEqual(await hayaseNyaa.single({ ...query(), fetch: failed.fetcher }), [])

  const malformed = mockedFetch('<rss><channel><item><title>broken</title></item></channel></rss>')
  assert.deepEqual(await hayaseSukebei.single({ ...query(), fetch: malformed.fetcher }), [])
  assert.equal(malformed.calls.length, 1)
})

test('Shiru sources implement single, batch, movie, and validate with the current interface', async () => {
  const { fetcher } = mockedFetch()
  const sources = [shiruNyaa, shiruSukebei]
  for (const source of sources) {
    const results = await source.single({ ...query(), fetch: fetcher })
    assert.equal(results.length, 2)
    assert.equal(results[0].hash.length, 40)
    assert.equal(results[0].link.endsWith('.torrent'), true)

    const batch = await source.batch({ titles: ['One Piece'], resolution: '', exclusions: [], fetch: fetcher })
    assert.equal(batch[1].type, 'batch')
    assert.equal((await source.movie({ titles: ['One Piece'], resolution: '', exclusions: [], fetch: fetcher }))[0].type, undefined)
  }
})

test('Shiru and Hayase health checks report request failures without throwing', async () => {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = async () => ({ ok: false })
    assert.equal(await shiruNyaa.validate(), false)
    assert.equal(await shiruSukebei.validate(), false)
    assert.equal(await hayaseNyaa.test(), false)
    assert.equal(await hayaseSukebei.test(), false)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('generated indexes are valid JSON', async () => {
  for (const file of ['index.json', 'hayase/index.json', 'shiru/index.json']) {
    const value = JSON.parse(await readFile(join(root, file), 'utf8'))
    assert.ok(Array.isArray(value))
  }
})
