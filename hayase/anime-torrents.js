const REQUEST_TIMEOUT = 10000
const SEADEX_BASE_URL = 'https://releases.moe'
const NYAA_BASE_URL = 'https://nyaa.si'
const NYAA_CATEGORY = '1_0'
const HASH_PATTERN = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i

function getFetcher(query) {
  return typeof query?.fetch === 'function' ? query.fetch : globalThis.fetch
}

async function request(fetcher, url) {
  if (typeof fetcher !== 'function') return null
  const controller = typeof AbortController === 'function' ? new AbortController() : null
  let timer
  try {
    return await Promise.race([
      fetcher(url, controller ? { signal: controller.signal } : undefined),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller?.abort()
          reject(new Error('Request timed out'))
        }, REQUEST_TIMEOUT)
      })
    ])
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function validHash(value) {
  const hash = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return HASH_PATTERN.test(hash) ? hash : ''
}

function magnetLink(hash, title = '') {
  const exactTopic = hash.length === 64 ? 'urn:btmh:1220' + hash : 'urn:btih:' + hash
  const name = title ? '&dn=' + encodeURIComponent(title) : ''
  return 'magnet:?xt=' + exactTopic + name
}

function validDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? new Date(0) : date
}

function integer(value) {
  const number = Number.parseInt(String(value).replace(/[^\d-]/g, ''), 10)
  return Number.isFinite(number) && number >= 0 ? number : 0
}

function bytes(value) {
  const match = String(value).match(/([\d.,]+)\s*(B|KiB|MiB|GiB|TiB|KB|MB|GB|TB)\b/i)
  if (!match) return 0
  const amount = Number(match[1].replace(/,/g, ''))
  const units = { b: 1, kib: 1024, kb: 1024, mib: 1024 ** 2, mb: 1024 ** 2, gib: 1024 ** 3, gb: 1024 ** 3, tib: 1024 ** 4, tb: 1024 ** 4 }
  const multiplier = units[match[2].toLowerCase()]
  return Number.isFinite(amount) && multiplier ? Math.round(amount * multiplier) : 0
}

function decodeXml(value) {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'").replace(/&amp;/g, '&').trim()
}

function xmlField(item, name) {
  const escapedName = name.replace(':', '\\:')
  const match = item.match(new RegExp('<' + escapedName + '\\b[^>]*>([\\s\\S]*?)<\\/' + escapedName + '>', 'i'))
  return match ? decodeXml(match[1]) : ''
}

function normaliseTitles(titles) {
  if (!Array.isArray(titles)) return []
  const seen = new Set()
  return titles.filter((title) => typeof title === 'string')
    .map((title) => title.replace(/[^\p{L}\p{N}\s._-]/gu, ' ').replace(/\s+/g, ' ').trim())
    .filter((title) => title.length > 0)
    .filter((title) => {
      const key = title.toLocaleLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }).slice(0, 6)
}

function excluded(text, exclusions) {
  const haystack = String(text).toLocaleLowerCase()
  return (Array.isArray(exclusions) ? exclusions : []).some((value) =>
    typeof value === 'string' && value.trim() && haystack.includes(value.trim().toLocaleLowerCase()))
}

function requestedEpisodes(query) {
  return [...new Set([query?.episode, query?.absoluteEpisodeNumber]
    .filter((value) => Number.isInteger(value) && value > 0))]
}

function episodeMatches(title, query) {
  const episodes = requestedEpisodes(query)
  if (!episodes.length) return true
  return episodes.some((episode) => {
    const number = String(episode).padStart(2, '0')
    const pattern = new RegExp('(?:^|[^0-9])(?:s\\d{1,2}[ ._-]*)?e?0?' + number + '(?:v\\d)?(?=$|[^0-9])', 'i')
    return pattern.test(title) || new RegExp('\\bepisode[ ._-]*0?' + number + '\\b', 'i').test(title)
  })
}

function resolutionMatches(text, resolution) {
  if (typeof resolution !== 'string' || !resolution.trim()) return true
  const wanted = resolution.replace(/p$/i, '')
  const known = [...String(text).matchAll(/\b(2160|1080|720|540|480)p?\b|\b\d{3,4}x\d{3,4}\b/gi)]
    .map((match) => match[1] ?? match[0].split('x')[1])
  return known.length === 0 || known.some((value) => value === wanted)
}

function isEpisodeTitle(title) {
  return /\bS\d{1,2}E\d{1,3}\b|\bepisode[ ._-]*\d{1,3}\b|\s-\s\d{1,3}(?:v\d)?(?=\s|$|\.|\[)/i.test(title)
}

function isBatchTitle(title) {
  if (/\bS\d{1,2}E\d{1,3}\b/i.test(title)) return false
  return /\b(?:batch|complete|season|cour|collection|bd[ ._-]?box)\b|\b\d{1,3}\s*[-–~]\s*\d{1,3}\b|\bS\d{1,2}\b/i.test(title)
}

function nyaaQuery(title, query, mode) {
  const parts = [title]
  if (mode === 'single') {
    const episode = requestedEpisodes(query)[0]
    if (episode !== undefined) parts.push(String(episode).padStart(2, '0'))
  } else if (mode === 'batch') {
    parts.push('batch')
  } else if (mode === 'movie') {
    parts.push('movie')
  }
  if (typeof query?.resolution === 'string' && query.resolution.trim()) {
    parts.push(query.resolution.trim().replace(/p$/i, '') + 'p')
  }
  return parts.join(' ')
}

function nyaaFeedUrl(search) {
  const url = new URL('/?page=rss', NYAA_BASE_URL)
  url.searchParams.set('q', search)
  url.searchParams.set('c', NYAA_CATEGORY)
  url.searchParams.set('f', '0')
  return url.href
}

function directTorrentLink(candidate) {
  if (typeof candidate !== 'string' || !candidate.trim()) return ''
  const value = candidate.trim()
  if (value.startsWith('magnet:?')) return value
  try {
    const url = new URL(value)
    if (!/^https?:$/.test(url.protocol)) return ''
    return /\.torrent(?:$|[?#])/i.test(url.pathname + url.search) ? url.href : ''
  } catch {
    return ''
  }
}

function parseNyaaFeed(xml, mode, query = {}) {
  const results = []
  const items = String(xml).match(/<item\b[^>]*>[\s\S]*?<\/item>/gi) ?? []
  for (const item of items) {
    const title = xmlField(item, 'title')
    const hash = validHash(xmlField(item, 'nyaa:infoHash'))
    const guid = xmlField(item, 'guid')
    const id = Number.parseInt(guid.match(/\/view\/(\d+)/i)?.[1] ?? '', 10)
    const link = directTorrentLink(xmlField(item, 'link'))
    if (!title || !hash || excluded(title, query.exclusions)) continue
    if (mode === 'single' && !episodeMatches(title, query)) continue
    if (mode === 'batch' && !isBatchTitle(title)) continue
    if (mode === 'movie' && (isBatchTitle(title) || isEpisodeTitle(title))) continue
    if (!resolutionMatches(title, query.resolution)) continue

    const result = {
      title,
      link: link || magnetLink(hash, title),
      hash,
      seeders: integer(xmlField(item, 'nyaa:seeders')),
      leechers: integer(xmlField(item, 'nyaa:leechers')),
      downloads: integer(xmlField(item, 'nyaa:downloads')),
      size: bytes(xmlField(item, 'nyaa:size')),
      date: validDate(xmlField(item, 'pubDate')),
      accuracy: 'low'
    }
    if (Number.isInteger(id)) result.id = id
    if (mode === 'batch') result.type = 'batch'
    results.push(result)
  }
  return results
}

async function searchNyaa(query = {}, mode) {
  const titles = normaliseTitles(query.titles)
  if (!titles.length) return []
  const fetcher = getFetcher(query)
  const results = new Map()
  for (const title of titles) {
    const response = await request(fetcher, nyaaFeedUrl(nyaaQuery(title, query, mode)))
    if (!response?.ok || typeof response.text !== 'function') continue
    try {
      for (const result of parseNyaaFeed(await response.text(), mode, query)) {
        if (!results.has(result.hash)) results.set(result.hash, result)
      }
    } catch {
      // A malformed response for one title should not discard other title results.
    }
  }
  return [...results.values()]
}

function seaDexUrl(anilistId) {
  const url = new URL('/api/collections/entries/records', SEADEX_BASE_URL)
  url.searchParams.set('page', '1')
  url.searchParams.set('perPage', '1')
  url.searchParams.set('filter', 'alID="' + anilistId + '"')
  url.searchParams.set('skipTotal', 'true')
  url.searchParams.set('expand', 'trs')
  return url.href
}

function seaDexFiles(torrent) {
  if (!Array.isArray(torrent?.files)) return []
  return torrent.files.filter((file) => file && typeof file.name === 'string' && file.name.trim())
    .map((file) => ({ name: file.name.trim(), length: Math.max(0, Number(file.length) || 0) }))
}

function seaDexTitle(torrent, files, fallbackTitle) {
  if (files.length === 1) return '[SeaDex] ' + files[0].name
  const group = typeof torrent.releaseGroup === 'string' && torrent.releaseGroup.trim()
    ? '[' + torrent.releaseGroup.trim() + '] ' : ''
  const dualAudio = torrent.dualAudio === true ? ' (Dual Audio)' : ''
  return ('[SeaDex] ' + group + fallbackTitle + dualAudio).trim()
}

function parseSeaDexTorrent(torrent, query, mode) {
  const hash = validHash(torrent?.infoHash)
  if (!hash) return null // Also excludes SeaDex's redacted/private-tracker placeholder.
  const files = seaDexFiles(torrent)
  const fileNames = files.map((file) => file.name)
  const searchableText = [torrent.releaseGroup, torrent.tracker, ...fileNames].filter(Boolean).join(' ')
  if (excluded(searchableText, query.exclusions) || !resolutionMatches(searchableText, query.resolution)) return null

  if (mode === 'single' && requestedEpisodes(query).length && files.length) {
    if (!files.some((file) => episodeMatches(file.name, query))) return null
  }
  if (mode === 'batch') {
    const expectedCount = Number(query.episodeCount)
    if (Number.isInteger(expectedCount) && expectedCount > 1 && files.length > 0) {
      if (files.length < expectedCount) return null
    } else if (files.length <= 1 && !isBatchTitle(searchableText)) {
      return null
    }
  }

  const size = files.reduce((total, file) => total + file.length, 0)
  const title = seaDexTitle(torrent, files, query.titles?.[0] || 'AniList ' + query.anilistId)
  const result = {
    title,
    link: magnetLink(hash, title),
    hash,
    seeders: 0,
    leechers: 0,
    downloads: 0,
    size,
    date: validDate(torrent.created || torrent.updated),
    accuracy: 'high'
  }
  if (mode === 'batch') result.type = 'batch'
  else if (torrent.isBest === true) result.type = 'best'
  else if (torrent.isBest === false) result.type = 'alt'
  return result
}

function parseSeaDexResponse(payload, query, mode) {
  if (!payload || !Array.isArray(payload.items)) return []
  const results = []
  for (const entry of payload.items) {
    if (Number(entry?.alID) !== Number(query.anilistId)) continue
    const torrents = entry?.expand?.trs
    if (!Array.isArray(torrents)) continue
    for (const torrent of torrents) {
      const result = parseSeaDexTorrent(torrent, query, mode)
      if (result) results.push(result)
    }
  }
  return results
}

async function searchSeaDex(query = {}, mode) {
  if (!Number.isInteger(query.anilistId) || query.anilistId <= 0) return []
  const response = await request(getFetcher(query), seaDexUrl(query.anilistId))
  if (!response?.ok || typeof response.json !== 'function') return []
  try {
    return parseSeaDexResponse(await response.json(), query, mode)
  } catch {
    return []
  }
}

const providers = {
  seadex: { search: searchSeaDex },
  nyaa: { search: searchNyaa }
}

function mergeResults(results) {
  const merged = new Map()
  for (const result of results) {
    const existing = merged.get(result.hash)
    if (!existing) {
      merged.set(result.hash, { ...result })
      continue
    }
    if (!existing.title.startsWith('[SeaDex]') && result.title.startsWith('[SeaDex]')) {
      existing.title = result.title
    } else if (existing.title.startsWith('[SeaDex]') && !existing.title.includes('+ Nyaa')) {
      existing.title = existing.title.replace('[SeaDex]', '[SeaDex + Nyaa]')
    }
    if (existing.link === existing.hash && result.link !== existing.hash) existing.link = result.link
    for (const field of ['seeders', 'leechers', 'downloads', 'size']) {
      if (!existing[field] && result[field]) existing[field] = result[field]
    }
    if (+existing.date === 0 && +result.date !== 0) existing.date = result.date
    if (existing.id === undefined && result.id !== undefined) existing.id = result.id
    if (existing.type === undefined) existing.type = result.type
  }
  return [...merged.values()]
}

async function search(query = {}, mode, options = {}) {
  const selected = options?.provider
  const selectedProviders = selected === 'seadex'
    ? [providers.seadex]
    : selected === 'nyaa'
      ? [providers.nyaa]
      : [providers.seadex, providers.nyaa]
  const settled = await Promise.allSettled(selectedProviders.map((provider) => provider.search(query, mode)))
  const results = []
  for (const result of settled) {
    if (result.status === 'fulfilled') results.push(...result.value)
  }
  return mergeResults(results)
}

async function providerAvailable(fetcher, url, parse) {
  const response = await request(fetcher, url)
  if (!response?.ok) return false
  if (parse === 'json') {
    try {
      const payload = await response.json()
      return Boolean(payload && Array.isArray(payload.items))
    } catch {
      return false
    }
  }
  if (parse === 'rss') {
    try {
      const text = await response.text()
      return /<rss\b/i.test(text) && /<channel\b/i.test(text)
    } catch {
      return false
    }
  }
  return true
}

const source = {
  async single(query = {}, options = {}) {
    return search(query, 'single', options)
  },
  async batch(query = {}, options = {}) {
    return search(query, 'batch', options)
  },
  async movie(query = {}, options = {}) {
    return search(query, 'movie', options)
  },
  async test() {
    const fetcher = globalThis.fetch
    const checks = await Promise.all([
      providerAvailable(fetcher, seaDexUrl(1), 'json'),
      providerAvailable(fetcher, nyaaFeedUrl('anime'), 'rss')
    ])
    if (!checks.some(Boolean)) throw new Error('SeaDex and Nyaa are currently unreachable.')
    return true
  }
}

export const __testing = {
  providers, parseNyaaFeed, parseSeaDexResponse, seaDexUrl, nyaaFeedUrl, magnetLink,
  episodeMatches, isEpisodeTitle, isBatchTitle, resolutionMatches, mergeResults
}

export default source
