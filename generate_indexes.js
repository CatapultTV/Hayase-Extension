import { mkdir, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

export const REPOSITORY_BASE = 'https://raw.githubusercontent.com/ReWelp/HayasexShiru-Extensions/main'
export const EXTENSION_VERSION = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'package.json'), 'utf8')).version

export const SOURCES = [
  {
    id: 'nyaa',
    shiruId: 'nyaasrc',
    name: 'Nyaa',
    description: 'Searches Nyaa anime torrents through its public RSS feed.',
    baseUrl: 'https://nyaa.si',
    icon: 'https://nyaa.si/static/favicon.png',
    nsfw: false
  },
  {
    id: 'sukebei',
    shiruId: 'sukebeisrc',
    name: 'Sukebei',
    description: 'Searches Sukebei torrents through its public RSS feed.',
    baseUrl: 'https://sukebei.nyaa.si',
    icon: 'https://sukebei.nyaa.si/static/favicon.png',
    nsfw: true
  }
]

const encodeUrl = (value) => Buffer.from(value, 'utf8').toString('base64')

export function buildHayaseIndex () {
  return SOURCES.map((source) => ({
    manifestVersion: 2,
    deprecated: false,
    name: source.name,
    description: source.description,
    id: `hayase.extension.${source.id}`,
    version: EXTENSION_VERSION,
    type: 'torrent',
    accuracy: 'low',
    ratio: 0,
    icon: source.icon,
    media: 'both',
    url: encodeUrl(source.baseUrl),
    languages: ['ALL'],
    update: `${REPOSITORY_BASE}/hayase/index.json`,
    code: `${REPOSITORY_BASE}/hayase/${source.id}.js`,
    updatePeers: false,
    rateLimit: 2
  }))
}

export function buildShiruIndex () {
  return SOURCES.map((source) => ({
    id: source.shiruId,
    name: `${source.name} SRC`,
    version: EXTENSION_VERSION,
    main: `sources/${source.shiruId}`,
    update: 'gh:ReWelp/HayasexShiru-Extensions/shiru',
    type: 'torrent',
    speed: 'moderate',
    accuracy: 'low',
    nsfw: source.nsfw,
    description: source.description,
    icon: source.icon
  }))
}

export function buildRootIndex () {
  return [{ main: 'gh:ReWelp/HayasexShiru-Extensions/shiru' }]
}

export function buildShiruPackage () {
  return {
    name: '@rewelp/shiru-extensions',
    version: EXTENSION_VERSION,
    description: 'Nyaa and Sukebei torrent extensions for Shiru.',
    type: 'module',
    license: 'GPL-3.0',
    main: 'index.json',
    types: 'index.d.ts'
  }
}

export function validateGeneratedIndexes ({ hayase, shiru, root }) {
  if (!Array.isArray(hayase) || !Array.isArray(shiru) || !Array.isArray(root)) {
    throw new Error('Generated indexes must be arrays')
  }

  const ids = [...hayase, ...shiru].map((entry) => entry.id)
  if (ids.some((id) => typeof id !== 'string' || id.length === 0) || new Set(ids).size !== ids.length) {
    throw new Error('Generated extension IDs must be unique non-empty strings')
  }

  for (const manifest of hayase) {
    const required = ['manifestVersion', 'name', 'description', 'id', 'version', 'type', 'accuracy', 'icon', 'media', 'languages', 'update', 'code']
    if (required.some((field) => !(field in manifest))) throw new Error(`Hayase manifest is missing ${manifest.id}`)
    if (manifest.manifestVersion !== 2 || manifest.type !== 'torrent' || manifest.accuracy !== 'low') {
      throw new Error(`Invalid Hayase manifest values for ${manifest.id}`)
    }
    if (!Array.isArray(manifest.languages) || manifest.languages.some((language) => typeof language !== 'string' || language !== language.toUpperCase())) {
      throw new Error(`Invalid Hayase language list for ${manifest.id}`)
    }
  }

  for (const manifest of shiru) {
    const required = ['id', 'name', 'version', 'main', 'update', 'type', 'speed', 'accuracy']
    if (required.some((field) => !(field in manifest))) throw new Error(`Shiru manifest is missing ${manifest.id}`)
    if (manifest.type !== 'torrent' || manifest.accuracy !== 'low') throw new Error(`Invalid Shiru manifest values for ${manifest.id}`)
  }

  if (root.length !== 1 || root[0]?.main !== 'gh:ReWelp/HayasexShiru-Extensions/shiru') {
    throw new Error('Root index does not point to the Shiru package')
  }
}

export async function generateIndexes (repositoryRoot = dirname(fileURLToPath(import.meta.url))) {
  const hayase = buildHayaseIndex()
  const shiru = buildShiruIndex()
  const root = buildRootIndex()
  const shiruPackage = buildShiruPackage()
  validateGeneratedIndexes({ hayase, shiru, root })

  await mkdir(join(repositoryRoot, 'hayase'), { recursive: true })
  await mkdir(join(repositoryRoot, 'shiru'), { recursive: true })
  await Promise.all([
    writeJson(join(repositoryRoot, 'hayase', 'index.json'), hayase),
    writeJson(join(repositoryRoot, 'shiru', 'index.json'), shiru),
    writeJson(join(repositoryRoot, 'shiru', 'package.json'), shiruPackage),
    writeJson(join(repositoryRoot, 'index.json'), root)
  ])
  return { hayase, shiru, root, shiruPackage }
}

async function writeJson (file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

const entryPoint = process.argv[1] && resolve(process.argv[1])
if (entryPoint === fileURLToPath(import.meta.url)) {
  await generateIndexes()
  console.log('Generated Hayase, Shiru, and root indexes.')
}
