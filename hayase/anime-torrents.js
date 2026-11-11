const REQUEST_TIMEOUT = 10_000
const SEADEX_BASE_URL = 'https://seadex.moe'
const NYAA_BASE_URL = 'https://nyaa.si'
const NYAA_CATEGORY = '1_0'
const HASH_PATTERN = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i

function getFetcher (query) {
  return typeof query?.fetch === 'function' ? query.fetch : globalThis.fetch
}

async function request (fetcher, url) {
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

function validHash (value) {
  const hash = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return HASH_PATTERN.test(hash) ? hash : ''
}

function validDate (value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? new Date(0) : date
}

function nonNegativeNumber (value) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : 0
}

function integer (value) {
  const number = Number.parseInt(String(value).replace(/[^\d-]/g, ''), 10)
  return Number.isFinite(number) && number >= 0 ? number : 0
}

function bytes (value) {
  const match = String(value).match(/([\d.,]+)\s*(B|KiB|MiB|GiB|TiB)\b/i)
  if (!match) return 0
  const amount = Number(match[1].replace(/,/g, ''))
  const units = { b: 1, kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3, tib: 1024 ** 4 }
  const multiplier = units[match[2].toLowerCase()]
  return Number.isFinite(amount) && multiplier ? Math.round(amount * multiplier) : 0
}

function decodeXml (value) {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim()
}

function xmlField (item, name) {
  const escapedName = name.replace(':', '\\:')
  const match = item.match(new RegExp(`<${escapedName}\\b[^>]*>([\\s\\S]*?)<\\/${escapedName}>`, 'i'))
  return match ? decodeXml(match[1]) : ''
}

function normaliseTitles (titles) {
  if (!Array.isArray(titles)) return []
  const seen = new Set()
  return titles
    .filter((title) => typeof title === 'string')
    .map((title) => title.replace(/[^\p{L}\p{N}\s._-]/gu, ' ').replace(/\s+/g, ' ').trim())
    .filter((title) => title.length > 0)
    .filter((title) => {
      const key = title.toLocaleLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function excluded (text, exclusions) {
  const haystack = String(text).toLocaleLowerCase()
  return (Array.isArray(exclusions) ? exclusions : []).some((value) => {
    return typeof value === 'string' && value.trim() && haystack.includes(value.trim().toLocaleLowerCase())
  })
}

function requestedEpisode (query) {
  if (Number.isInteger(query?.absoluteEpisodeNumber) && query.absoluteEpisodeNumber >= 0) {
    return query.absoluteEpisodeNumber
  }
  return Number.isInteger(query?.episode) && query.episode >= 0 ? query.episode : undefined
}

function episodePattern (episode) {
  const number = String(episode).padStart(2, '0')
  return new RegExp(`(?:^|[^0-9])(?:s\\d{1,3})?e?${number}(?:[^0-9]|$)`, 'i')
}

function resolutionMatches (text, resolution) {
  if (typeof resolution !== 'string' || !resolution.trim()) return true
  const wanted = resolution.replace(/p$/i, '')
  const known = [...String(text).matchAll(/\b(2160|1080|720|540|480)p?\b|\b\d{3,4}x\d{3,4}\b/gi)]
    .map((match) => match[1] ?? match[0].split('x')[1])
  return known.length === 0 || known.some((value) => value === wanted)
}

function linkFor (candidate, hash) {
  if (typeof candidate !== 'string' || !candidate.trim()) return hash
  const value = candidate.trim()
  if (value.startsWith('magnet:?')) return value
  try {
    const url = new URL(value)
    return /^https?:$/.test(url.protocol) ? url.href : hash
  } catch {
    return hash
  }
}

function directLink (candidate) {
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

function isBatchTitle (title) {
  return /\b(?:batch|complete|season|cour)\b|\b\d{1,4}\s*[-–]\s*\d{1,4}\b/i.test(title)
}

function nyaaQuery (title, query, mode) {
  const parts = [title]
  const episode = requestedEpisode(query)
  if (mode === 'single' && episode !== undefined) parts.push(String(episode).padStart(2, '0'))
  if (typeof query?.resolution === 'string' && query.resolution.trim()) {
    parts.push(`${query.resolution.trim().replace(/p$/i, '')}p`)
  }
  return parts.join(' ')
}

function nyaaFeedUrl (search) {
  const url = new URL('/?page=rss', NYAA_BASE_URL)
  url.searchParams.set('q', search)
  url.searchParams.set('c', NYAA_CATEGORY)
  url.searchParams.set('f', '0')
  return url.href
}

function parseNyaaFeed (xml, mode, exclusions) {
  const results = []
  const items = String(xml).match(/<item\b[^>]*>[\s\S]*?<\/item>/gi) ?? []
  for (const item of items) {
    const title = xmlField(item, 'title')
    const hash = validHash(xmlField(item, 'nyaa:infoHash'))
    const magnet = xmlField(item, 'description').match(/magnet:\?[^\s<"']+/i)?.[0] ?? ''
    const link = directLink(magnet) || linkFor(xmlField(item, 'link'), hash)
    if (!title || !hash || !link || excluded(title, exclusions)) continue

    const id = Number.parseInt(xmlField(item, 'guid').match(/\/view\/(\d+)/i)?.[1] ?? '', 10)
    const result = {
      title: `[Nyaa] ${title}`,
      link,
      hash,
      seeders: integer(xmlField(item, 'nyaa:seeders')),
      leechers: integer(xmlField(item, 'nyaa:leechers')),
      downloads: integer(xmlField(item, 'nyaa:downloads')),
      size: bytes(xmlField(item, 'nyaa:size')),
      date: validDate(xmlField(item, 'pubDate')),
      accuracy: 'low'
    }
    if (Number.isInteger(id)) result.id = id
    if (mode === 'batch' || isBatchTitle(title)) result.type = 'batch'
    results.push(result)
  }
  return results
}

async function searchNyaa (query = {}, mode) {
  const titles = normaliseTitles(query.titles)
  if (!titles.length) return []
  const fetcher = getFetcher(query)
  const results = new Map()
  for (const title of titles) {
    const response = await request(fetcher, nyaaFeedUrl(nyaaQuery(title, query, mode)))
    if (!response?.ok || typeof response.text !== 'function') continue
    try {
      for (const result of parseNyaaFeed(await response.text(), mode, query.exclusions)) {
        if (!results.has(result.hash)) results.set(result.hash, result)
      }
    } catch {
      // A malformed feed only removes this provider's results for this query.
    }
  }
  return [...results.values()]
}

function seaDexUrl (anilistId) {
  const url = new URL('/api/collections/entries/records', SEADEX_BASE_URL)
  url.searchParams.set('page', '1')
  url.searchParams.set('perPage', '50')
  url.searchParams.set('filter', `alID=${anilistId}`)
  url.searchParams.set('sort', '')
  url.searchParams.set('skipTotal', 'true')
  url.searchParams.set('expand', 'trs')
  return url.href
}

function seaDexFiles (torrent) {
  if (!Array.isArray(torrent?.files)) return []
  return torrent.files
    .filter((file) => file && typeof file.name === 'string' && file.name.trim())
    .map((file) => ({
      name: file.name.trim(),
      length: nonNegativeNumber(file.length)
    }))
}

function seaDexTitle (torrent, files, mode) {
  const classification = torrent.isBest === true
    ? 'Best'
    : torrent.isBest === false
      ? 'Alternative'
      : ''
  const prefix = classification ? `[SeaDex · ${classification}]` : '[SeaDex]'
  const group = typeof torrent.releaseGroup === 'string' && torrent.releaseGroup.trim()
    ? `[${torrent.releaseGroup.trim()}] `
    : ''
  const episode = requestedEpisode({ episode: undefined })
  const name = files[0]?.name || `${torrent.tracker || 'Curated'} release`
  const suffix = files.length > 1 ? ` (${files.length} files)` : ''
  return `${prefix} ${group}${name}${suffix}${mode === 'batch' ? ' [Batch]' : ''}`
}

function parseSeaDexId (value) {
  return Number.parseInt(String(value).match(/\/view\/(\d+)/i)?.[1] ?? '', 10)
}

function parseSeaDexTorrent (torrent, query, mode) {
  const hash = validHash(torrent?.infoHash)
  if (!hash) return null
  const files = seaDexFiles(torrent)
  const fileText = files.map((file) => file.name).join(' ')
  const text = [torrent.releaseGroup, torrent.tracker, fileText].filter(Boolean).join(' ')
  if (excluded(text, query.exclusions) || !resolutionMatches(text, query.resolution)) return null

  const episode = requestedEpisode(query)
  if (mode === 'single' && episode !== undefined && files.length > 0) {
    const matcher = episodePattern(episode)
    if (!files.some((file) => matcher.test(file.name))) return null
  }
  if (mode === 'batch' && files.length <= 1 && !isBatchTitle(text)) return null

  const direct = directLink(torrent.url) || directLink(torrent.groupedUrl)
  const link = direct || linkFor(torrent.url, hash)
  const size = files.reduce((sum, file) => sum + file.length, 0)
  const id = parseSeaDexId(torrent.url || torrent.groupedUrl)
  const result = {
    title: seaDexTitle(torrent, files, mode),
    link,
    hash,
    seeders: 0,
    leechers: 0,
    downloads: 0,
    size,
    date: validDate(torrent.created || torrent.updated),
    accuracy: 'high'
  }
  if (Number.isInteger(id)) result.id = id
  if (mode === 'batch') result.type = 'batch'
  else if (torrent.isBest === true) result.type = 'best'
  else if (torrent.isBest === false) result.type = 'alt'
  return result
}

function parseSeaDexResponse (payload, query, mode) {
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

async function searchSeaDex (query = {}, mode) {
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

function mergeResults (results) {
  const merged = new Map()
  for (const result of results) {
    const existing = merged.get(result.hash)
    if (!existing) {
      merged.set(result.hash, { ...result })
      continue
    }

    if (existing.title.startsWith('[SeaDex]') && result.title.startsWith('[Nyaa]')) {
      existing.title = existing.title.replace('[SeaDex]', '[SeaDex + Nyaa]')
    } else if (existing.title.startsWith('[Nyaa]') && result.title.startsWith('[SeaDex]')) {
      existing.title = result.title.replace('[SeaDex]', '[SeaDex + Nyaa]')
    }
    if (existing.link === existing.hash && result.link !== result.hash) existing.link = result.link
    if (existing.seeders === 0 && result.seeders > 0) existing.seeders = result.seeders
    if (existing.leechers === 0 && result.leechers > 0) existing.leechers = result.leechers
    if (existing.downloads === 0 && result.downloads > 0) existing.downloads = result.downloads
    if (existing.size === 0 && result.size > 0) existing.size = result.size
    if (+existing.date === 0 && +result.date !== 0) existing.date = result.date
    if (existing.id === undefined) existing.id = result.id
    if (result.type === 'best' || result.type === 'alt') existing.type = result.type
    if (existing.type === undefined) existing.type = result.type
  }
  return [...merged.values()]
}

async function search (query = {}, mode) {
  const [seaDex, nyaa] = await Promise.allSettled([
    providers.seadex.search(query, mode),
    providers.nyaa.search(query, mode)
  ])
  const results = []
  if (seaDex.status === 'fulfilled') results.push(...seaDex.value)
  if (nyaa.status === 'fulfilled') results.push(...nyaa.value)
  return mergeResults(results)
}

async function providerTest (baseUrl, requestUrl) {
  const response = await request(globalThis.fetch, requestUrl)
  return response?.ok === true && response.url ? response.url.startsWith(baseUrl) : response?.ok === true
}

const source = {
  async single (query = {}) {
    return search(query, 'single')
  },

  async batch (query = {}) {
    return search(query, 'batch')
  },

  async movie (query = {}) {
    return search(query, 'movie')
  },

  async test () {
    const [seaDex, nyaa] = await Promise.all([
      providerTest(SEADEX_BASE_URL, seaDexUrl(147105)),
      providerTest(NYAA_BASE_URL, nyaaFeedUrl('one piece'))
    ])
    return seaDex && nyaa
  }
}

export const __testing = {
  providers,
  parseNyaaFeed,
  parseSeaDexResponse,
  seaDexUrl,
  nyaaFeedUrl,
  resolutionMatches
}

export default source
