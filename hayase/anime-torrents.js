const REQUEST_TIMEOUT = 10000
const SEADEX_BASE_URL = 'https://releases.moe'
const NYAA_BASE_URL = 'https://nyaa.si'
const SUKEBEI_BASE_URL = 'https://sukebei.nyaa.si'
const APIBAY_BASE_URL = 'https://apibay.org'
const SUBSPLEASE_BASE_URL = 'https://subsplease.org/api/'
const NYAA_CATEGORY = '1_2'
const SUKEBEI_CATEGORY = '1_1'
const MAX_TITLE_QUERIES = 3
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

const PUBLIC_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://tracker.openbittorrent.com:6969/announce'
]

function magnetLink(hash, title = '', trackers = PUBLIC_TRACKERS) {
  const exactTopic = hash.length === 64 ? 'urn:btmh:1220' + hash : 'urn:btih:' + hash
  const name = title ? '&dn=' + encodeURIComponent(title) : ''
  const trackerParams = trackers.map((tracker) => '&tr=' + encodeURIComponent(tracker)).join('')
  return 'magnet:?xt=' + exactTopic + name + trackerParams
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

function normaliseMatchText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function seriesTitleMatches(releaseTitle, query) {
  const release = ' ' + normaliseMatchText(releaseTitle) + ' '
  const aliases = normaliseTitles(query?.titles)
  if (!aliases.length) return true
  return aliases.some((alias) => {
    const candidate = normaliseMatchText(alias)
    return candidate.length > 0 && release.includes(' ' + candidate + ' ')
  })
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

function nyaaSearchUrl(base, search, category, filter, page, sort = 'seeders') {
  const url = new URL('/', base)
  url.searchParams.set('q', search)
  url.searchParams.set('p', String(page))
  url.searchParams.set('c', category)
  url.searchParams.set('f', filter)
  url.searchParams.set('s', sort === 'date' ? 'id' : 'seeders')
  url.searchParams.set('o', 'desc')
  return url.href
}

function nyaaFeedUrl(search, base = NYAA_BASE_URL, category = NYAA_CATEGORY) {
  const url = new URL('/?page=rss', base)
  url.searchParams.set('q', search)
  url.searchParams.set('c', category)
  url.searchParams.set('f', '0')
  return url.href
}

function stripHtml(value) {
  return decodeXml(String(value).replace(/<br\s*\/?\s*>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' '))
}

function attribute(tag, name) {
  const match = tag.match(new RegExp("\\b" + name + "=(?:\"([^\"]*)\"|'([^']*)')", "i"))
  return match ? decodeXml(match[1] ?? match[2]) : ''
}

function parseNyaaHtml(html, mode, query = {}) {
  const results = []
  const rows = String(html).match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) ?? []
  for (const row of rows) {
    const cells = row.match(/<td\b[^>]*>[\s\S]*?<\/td>/gi) ?? []
    if (cells.length < 8) continue

    const titleLinks = [...cells[1].matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)]
    const titleLink = titleLinks.find(([_, attrs]) => /href=["']\/?view\//i.test(attrs))
    if (!titleLink) continue
    const title = stripHtml(titleLink[2])
    const viewId = attribute(titleLink[0], 'href').match(/\/view\/(\d+)/i)?.[1]
    const torrentLinks = [...cells[2].matchAll(/<a\b([^>]*)>/gi)].map((match) => attribute(match[0], 'href'))
    const magnet = torrentLinks.find((link) => link.startsWith('magnet:?')) || ''
    let hash = ''
    try {
      const xt = new URL(magnet).searchParams.get('xt') || ''
      hash = validHash(xt.split(':').pop())
    } catch {}
    if (!title || !hash || excluded(title, query.exclusions) || !seriesTitleMatches(title, query)) continue
    if (mode === 'single' && (isBatchTitle(title) || !episodeMatches(title, query))) continue
    if (mode === 'batch' && !isBatchTitle(title)) continue
    if (mode === 'movie' && (isBatchTitle(title) || isEpisodeTitle(title))) continue
    if (!resolutionMatches(title, query.resolution)) continue

    const dateCell = cells[4]
    const timestamp = Number(attribute(dateCell, 'data-timestamp'))
    const dateTitle = attribute(dateCell, 'title')
    const date = timestamp > 0 ? new Date(timestamp * 1000) : validDate(dateTitle || stripHtml(dateCell))
    const rowMarkup = row.toLowerCase()
    const trusted = /trusted|fa-check-circle|fa-check text-success|text-success.*fa-check/.test(rowMarkup)
    const remake = /remake|fa-star/.test(rowMarkup)
    const result = {
      title,
      link: magnet,
      hash,
      seeders: integer(stripHtml(cells[5])),
      leechers: integer(stripHtml(cells[6])),
      downloads: integer(stripHtml(cells[7])),
      size: bytes(stripHtml(cells[3])),
      date,
      accuracy: trusted ? 'medium' : 'low',
      _trusted: trusted,
      _remake: remake
    }
    if (viewId) result.id = Number(viewId)
    if (mode === 'batch') result.type = 'batch'
    results.push(result)
  }
  return results
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
    if (!title || !hash || excluded(title, query.exclusions) || !seriesTitleMatches(title, query)) continue
    if (mode === 'single' && (isBatchTitle(title) || !episodeMatches(title, query))) continue
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

async function searchNyaaSite(query = {}, mode, options = {}, config = {}) {
  const titles = normaliseTitles(query.titles).slice(0, MAX_TITLE_QUERIES)
  if (!titles.length) return []
  const fetcher = getFetcher(query)
  const base = config.base || NYAA_BASE_URL
  const category = config.category || NYAA_CATEGORY
  const filter = ['0', '1', '2'].includes(String(options.filter)) ? String(options.filter) : '1'
  const sort = options.sort === 'date' ? 'date' : 'seeders'
  const pages = Math.max(1, Math.min(20, integer(options.pages) || 10))
  const results = new Map()

  for (const title of titles) {
    const searchTerm = nyaaQuery(title, query, mode)
    for (let page = 1; page <= pages; page++) {
      const response = await request(fetcher, nyaaSearchUrl(base, searchTerm, category, filter, page, sort))
      if (!response?.ok || typeof response.text !== 'function') break
      try {
        const html = await response.text()
        if (!/<tr\b/i.test(html)) break
        const pageResults = parseNyaaHtml(html, mode, query)
        for (const result of pageResults) {
          if (!results.has(result.hash)) results.set(result.hash, result)
        }
      } catch {
        break
      }
    }
  }
  return [...results.values()]
}

async function searchNyaa(query = {}, mode, options = {}) {
  return searchNyaaSite(query, mode, options, { base: NYAA_BASE_URL, category: NYAA_CATEGORY })
}

async function searchSukebei(query = {}, mode, options = {}) {
  return searchNyaaSite(query, mode, options, { base: SUKEBEI_BASE_URL, category: SUKEBEI_CATEGORY })
}

function apiBayUrl(search, category) {
  const url = new URL('/q.php', APIBAY_BASE_URL)
  url.searchParams.set('q', search)
  url.searchParams.set('cat', String(category))
  return url.href
}

function parseApiBayResponse(payload, mode, query = {}) {
  if (!Array.isArray(payload)) return []
  const results = []
  for (const torrent of payload) {
    const title = typeof torrent?.name === 'string' ? torrent.name.trim() : ''
    const hash = validHash(torrent?.info_hash)
    if (!title || !hash || String(torrent.id) === '0' || excluded(title, query.exclusions) || !seriesTitleMatches(title, query)) continue
    if (mode === 'single' && (isBatchTitle(title) || !episodeMatches(title, query))) continue
    if (mode === 'batch' && !isBatchTitle(title)) continue
    if (mode === 'movie' && (isBatchTitle(title) || isEpisodeTitle(title))) continue
    if (!resolutionMatches(title, query.resolution)) continue
    const added = Number(torrent.added)
    results.push({
      title: '[The Pirate Bay] ' + title,
      link: magnetLink(hash, title),
      hash,
      seeders: integer(torrent.seeders),
      leechers: integer(torrent.leechers),
      downloads: 0,
      size: integer(torrent.size),
      date: added > 0 ? new Date(added * 1000) : new Date(0),
      accuracy: 'low'
    })
  }
  return results
}

async function searchPirateBay(query = {}, mode) {
  const titles = normaliseTitles(query.titles).slice(0, 2)
  if (!titles.length) return []
  const fetcher = getFetcher(query)
  const categories = mode === 'movie' ? [201, 207] : [205, 208]
  const results = new Map()
  for (const title of titles) {
    const searchTerm = nyaaQuery(title, query, mode)
    for (const category of categories) {
      const response = await request(fetcher, apiBayUrl(searchTerm, category))
      if (!response?.ok || typeof response.json !== 'function') continue
      try {
        for (const result of parseApiBayResponse(await response.json(), mode, query)) {
          if (!results.has(result.hash)) results.set(result.hash, result)
        }
      } catch {}
    }
  }
  return [...results.values()]
}


function base32ToHex(value) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = 0
  let buffer = 0
  const bytes = []
  for (const character of String(value).toUpperCase()) {
    const digit = alphabet.indexOf(character)
    if (digit < 0) continue
    buffer = (buffer << 5) | digit
    bits += 5
    if (bits >= 8) {
      bits -= 8
      bytes.push((buffer >>> bits) & 255)
    }
  }
  return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function extractMagnetHash(magnet) {
  const match = String(magnet).match(/[?&]xt=urn:btih:([a-z0-9]+)/i)
  if (!match) return ''
  const raw = match[1]
  if (/^[a-f0-9]{40}$/i.test(raw)) return raw.toLowerCase()
  if (/^[a-z2-7]{32}$/i.test(raw)) return base32ToHex(raw)
  return ''
}

function subsPleaseSearchUrl(title) {
  const url = new URL(SUBSPLEASE_BASE_URL)
  url.searchParams.set('f', 'search')
  url.searchParams.set('tz', 'UTC')
  url.searchParams.set('s', title)
  return url.href
}

function parseSubsPleaseResponse(payload, query, mode) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return []
  if (mode === 'movie') return []
  const titles = normaliseTitles(query.titles).map((title) => title.toLowerCase())
  const output = new Map()
  const preferred = String(query.resolution || '1080').replace(/p$/i, '')
  const resolutionOrder = preferred === '480' ? ['480', '720', '1080'] :
    preferred === '720' || preferred === '540' ? ['720', '1080', '480'] : ['1080', '720', '480']

  for (const item of Object.values(payload)) {
    if (!item || typeof item !== 'object' || typeof item.show !== 'string') continue
    const show = item.show.trim()
    const lowerShow = show.toLowerCase()
    if (!seriesTitleMatches(show, query)) continue

    const isBatch = String(item.episode).toLowerCase() === 'batch'
    if (mode === 'batch' && !isBatch) continue
    if (mode === 'single') {
      if (isBatch) continue
      const episode = Number(item.episode)
      if (Number.isFinite(Number(query.episode)) && episode !== Number(query.episode)) continue
    }
    if (!Array.isArray(item.downloads)) continue

    let download = item.downloads.find((entry) => String(entry?.res) === preferred)
    if (!download) {
      for (const resolution of resolutionOrder) {
        download = item.downloads.find((entry) => String(entry?.res) === resolution)
        if (download) break
      }
    }
    if (!download || typeof download.magnet !== 'string') continue
    const hash = extractMagnetHash(download.magnet)
    if (!hash || output.has(hash)) continue

    const episode = isBatch ? 'Batch' : String(item.episode || '').padStart(2, '0')
    const date = validDate(item.release_date || 0)
    const title = '[SubsPlease] ' + show + (episode ? ' - ' + episode : '') + ' (' + download.res + 'p)'
    output.set(hash, {
      title,
      link: download.magnet,
      hash,
      seeders: 0,
      leechers: 0,
      downloads: 0,
      size: 0,
      date,
      accuracy: 'medium',
      _trusted: true,
      ...(isBatch ? { type: 'batch' } : {})
    })
  }
  return [...output.values()]
}

async function searchSubsPlease(query = {}, mode) {
  if (mode === 'movie') return []
  const titles = normaliseTitles(query.titles).slice(0, MAX_TITLE_QUERIES)
  if (!titles.length) return []
  const fetcher = getFetcher(query)
  const results = new Map()
  for (const title of titles) {
    const response = await request(fetcher, subsPleaseSearchUrl(title))
    if (!response?.ok || typeof response.text !== 'function') continue
    try {
      const payload = JSON.parse(await response.text())
      for (const result of parseSubsPleaseResponse(payload, query, mode)) {
        if (!results.has(result.hash)) results.set(result.hash, result)
      }
    } catch {}
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

  if (mode === 'single' && requestedEpisodes(query).length) {
    if (!files.length || !files.some((file) => episodeMatches(file.name, query))) return null
  }
  if (mode === 'movie' && (isBatchTitle(searchableText) || fileNames.some(isEpisodeTitle))) return null
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
  nyaa: { search: searchNyaa },
  sukebei: { search: searchSukebei },
  piratebay: { search: searchPirateBay },
  subsplease: { search: searchSubsPlease }
}

function resultResolutionRank(title, preferred) {
  const text = String(title).toLowerCase()
  const match = text.match(/\b(2160|1080|720|540|480)p?\b|\b\d{3,4}x(2160|1080|720|540|480)\b/)
  const resolution = match ? (match[1] || match[2]) : ''
  if (preferred) return resolution === String(preferred).replace(/p$/i, '') ? 2 : resolution ? 0 : 1
  return ({ '2160': 5, '1080': 4, '720': 3, '540': 2, '480': 1 })[resolution] || 0
}

function releaseQualityRank(title) {
  const text = String(title).toLowerCase()
  if (/\b(remux|bdremux)\b/.test(text)) return 6
  if (/\b(blu.?ray|bdrip|bd rip)\b/.test(text)) return 5
  if (/\b(web.?dl|webdl)\b/.test(text)) return 4
  if (/\b(web.?rip|webrip)\b/.test(text)) return 3
  if (/\b(hdtv)\b/.test(text)) return 2
  return 1
}

function compareResults(a, b, preferredResolution = '') {
  const typeRank = (result) => result.type === 'best' ? 2 : result.type === 'alt' ? 1 : 0
  const typeDifference = typeRank(b) - typeRank(a)
  if (typeDifference) return typeDifference

  const accuracyRank = (result) => ({ high: 3, medium: 2, low: 1 })[result.accuracy] || 0
  const accuracyDifference = accuracyRank(b) - accuracyRank(a)
  if (accuracyDifference) return accuracyDifference

  const aTrusted = a._trusted ? 1 : 0
  const bTrusted = b._trusted ? 1 : 0
  if (aTrusted !== bTrusted) return bTrusted - aTrusted

  const aRemake = a._remake ? 1 : 0
  const bRemake = b._remake ? 1 : 0
  if (aRemake !== bRemake) return aRemake - bRemake

  const resolution = resultResolutionRank(b.title, preferredResolution) - resultResolutionRank(a.title, preferredResolution)
  if (resolution) return resolution

  const quality = releaseQualityRank(b.title) - releaseQualityRank(a.title)
  if (quality) return quality

  const seeders = (Number(b.seeders) || 0) - (Number(a.seeders) || 0)
  if (seeders) return seeders

  return (new Date(b.date).getTime() || 0) - (new Date(a.date).getTime() || 0)
}

function mergeResults(results, preferredResolution = '') {
  const merged = new Map()
  for (const result of results) {
    if (!result?.hash) continue
    const existing = merged.get(result.hash)
    if (!existing) {
      merged.set(result.hash, { ...result })
      continue
    }
    const preferred = compareResults(result, existing, preferredResolution) < 0 ? result : existing
    const other = preferred === result ? existing : result
    const combined = { ...other, ...preferred }
    for (const field of ['seeders', 'leechers', 'downloads', 'size']) {
      combined[field] = Math.max(Number(existing[field]) || 0, Number(result[field]) || 0)
    }
    combined._trusted = Boolean(existing._trusted || result._trusted)
    combined._remake = Boolean(existing._remake || result._remake)
    if (!combined.date || +combined.date === 0) combined.date = other.date
    merged.set(result.hash, combined)
  }

  return [...merged.values()]
    .sort((a, b) => compareResults(a, b, preferredResolution))
    .map((result) => {
      const clean = { ...result }
      delete clean._trusted
      delete clean._remake
      return clean
    })
}

async function search(query = {}, mode, options = {}) {
  const selected = options?.provider
  const selectedProviders = selected && providers[selected] ? [providers[selected]] : Object.values(providers)
  const settled = await Promise.allSettled(selectedProviders.map((provider) => provider.search(query, mode, options)))
  const results = []
  for (const result of settled) {
    if (result.status === 'fulfilled') results.push(...result.value)
  }
  return mergeResults(results, query.resolution || '')
}

async function providerAvailable(fetcher, url, parse) {
  const response = await request(fetcher, url)
  if (!response?.ok) return false
  if (parse === 'json' || parse === 'json-object') {
    try {
      const payload = await response.json()
      return parse === 'json-object'
        ? Boolean(payload && typeof payload === 'object' && !Array.isArray(payload))
        : Boolean(payload && Array.isArray(payload.items))
    } catch {
      return false
    }
  }
  if (parse === 'html') {
    try {
      const text = await response.text()
      return /torrent-list/i.test(text) && /<tbody/i.test(text)
    } catch { return false }
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
      providerAvailable(fetcher, nyaaSearchUrl(NYAA_BASE_URL, 'anime', NYAA_CATEGORY, '0', 1), 'html'),
      providerAvailable(fetcher, nyaaSearchUrl(SUKEBEI_BASE_URL, 'anime', SUKEBEI_CATEGORY, '0', 1), 'html'),
      providerAvailable(fetcher, apiBayUrl('anime', 205), 'json'),
      providerAvailable(fetcher, subsPleaseSearchUrl('anime'), 'json-object')
    ])
    if (!checks.some(Boolean)) throw new Error('SeaDex and Nyaa are currently unreachable.')
    return true
  }
}

export const __testing = {
  providers, parseNyaaFeed, parseNyaaHtml, parseApiBayResponse, parseSeaDexResponse, parseSubsPleaseResponse, seaDexUrl, nyaaFeedUrl, nyaaSearchUrl, apiBayUrl, subsPleaseSearchUrl, magnetLink,
  episodeMatches, seriesTitleMatches, isEpisodeTitle, isBatchTitle, resolutionMatches, mergeResults
}

export default source
