const BASE_URL = 'https://sukebei.nyaa.si'
const CATEGORY = '0_0'
const REQUEST_TIMEOUT = 10_000
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

function field (item, name) {
  const escapedName = name.replace(':', '\\:')
  const match = item.match(new RegExp(`<${escapedName}\\b[^>]*>([\\s\\S]*?)<\\/${escapedName}>`, 'i'))
  return match ? decodeXml(match[1]) : ''
}

function count (value) {
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

function queryFor (title, query, includeEpisode) {
  const parts = [title]
  if (includeEpisode && Number.isInteger(query?.episode) && query.episode >= 0) {
    parts.push(String(query.episode).padStart(2, '0'))
  }
  if (typeof query?.resolution === 'string' && query.resolution.trim()) {
    parts.push(`${query.resolution.trim().replace(/p$/i, '')}p`)
  }
  return parts.join(' ')
}

function feedUrl (query) {
  const url = new URL('/?page=rss', BASE_URL)
  url.searchParams.set('q', query)
  url.searchParams.set('c', CATEGORY)
  url.searchParams.set('f', '0')
  return url.href
}

function isBatchTitle (title) {
  return /\b(?:batch|complete)\b|\b\d{1,4}\s*[-–]\s*\d{1,4}\b/i.test(title)
}

function parseFeed (xml, mode) {
  const results = []
  const items = String(xml).match(/<item\b[^>]*>[\s\S]*?<\/item>/gi) ?? []
  for (const item of items) {
    const title = field(item, 'title')
    const hash = field(item, 'nyaa:infoHash').toLowerCase()
    const link = field(item, 'link')
    const date = new Date(field(item, 'pubDate'))
    if (!title || !HASH_PATTERN.test(hash) || !link || Number.isNaN(date.getTime())) continue

    const resolvedLink = (() => {
      try {
        const value = new URL(link, BASE_URL)
        return /^https?:$/.test(value.protocol) || value.protocol === 'magnet:' ? value.href : ''
      } catch {
        return ''
      }
    })()
    if (!resolvedLink) continue

    const result = {
      title,
      link: resolvedLink,
      id: count(field(item, 'guid').match(/\/view\/(\d+)/i)?.[1] ?? 0) || undefined,
      hash,
      seeders: count(field(item, 'nyaa:seeders')),
      leechers: count(field(item, 'nyaa:leechers')),
      downloads: count(field(item, 'nyaa:downloads')),
      size: bytes(field(item, 'nyaa:size')),
      date,
      accuracy: 'low'
    }
    if (mode === 'batch' && isBatchTitle(title)) result.type = 'batch'
    results.push(result)
  }
  return results
}

function excluded (title, exclusions) {
  return (Array.isArray(exclusions) ? exclusions : []).some((value) => {
    return typeof value === 'string' && value.trim() && title.toLocaleLowerCase().includes(value.trim().toLocaleLowerCase())
  })
}

export default new class SukebeiSource {
  async single (query = {}) {
    return this.search(query, 'single')
  }

  async batch (query = {}) {
    return this.search(query, 'batch')
  }

  async movie (query = {}) {
    return this.search(query, 'movie')
  }

  async search (query, mode) {
    const titles = normaliseTitles(query?.titles)
    if (!titles.length) return []

    const fetcher = getFetcher(query)
    const results = new Map()
    for (const title of titles) {
      const response = await request(fetcher, feedUrl(queryFor(title, query, mode === 'single')))
      if (!response?.ok || typeof response.text !== 'function') continue
      let parsed
      try {
        parsed = parseFeed(await response.text(), mode)
      } catch {
        parsed = []
      }
      for (const result of parsed) {
        if (!excluded(result.title, query?.exclusions) && !results.has(result.hash)) results.set(result.hash, result)
      }
    }
    return [...results.values()]
  }

  async test () {
    const response = await request(globalThis.fetch, feedUrl('one piece'))
    return response?.ok === true
  }
}()
