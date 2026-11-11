import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPOSITORY_BASE = 'https://raw.githubusercontent.com/CatapultTV/Hayase-Extension/main'
export const EXTENSION_VERSION = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'package.json'), 'utf8')
).version

const shared = {
  manifestVersion: 2,
  deprecated: false,
  version: EXTENSION_VERSION,
  type: 'torrent',
  ratio: 0,
  media: 'both',
  languages: ['ALL'],
  update: REPOSITORY_BASE + '/index.json',
  code: REPOSITORY_BASE + '/hayase/anime-torrents.js',
  updatePeers: false,
  rateLimit: 2
}

export const EXTENSIONS = [
  {
    ...shared,
    name: 'SeaDex',
    description: 'Curated anime releases matched by AniList ID.',
    id: 'catapulttv.hayase.seadex',
    accuracy: 'high',
    icon: 'https://seadex.moe/favicon.ico',
    url: 'aHR0cHM6Ly9yZWxlYXNlcy5tb2U=',
    options: { provider: { type: 'select', description: 'Provider used by this extension.', values: ['seadex'], default: 'seadex' } }
  },
  {
    ...shared,
    name: 'Nyaa',
    description: 'Paginated anime torrent searches, including older releases.',
    id: 'catapulttv.hayase.nyaa',
    accuracy: 'low',
    icon: 'https://nyaa.si/static/favicon.png',
    url: 'aHR0cHM6Ly9ueWFhLnNp',
    options: {
      provider: { type: 'select', description: 'Provider used by this extension.', values: ['nyaa'], default: 'nyaa' },
      pages: { type: 'select', description: 'Maximum search pages to scan for older releases.', values: ['5', '10', '20'], default: '10' }
    }
  },
  {
    ...shared,
    name: 'Sukebei Nyaa',
    description: 'Paginated searches on Sukebei Nyaa.',
    id: 'catapulttv.hayase.sukebei',
    accuracy: 'low',
    icon: 'https://sukebei.nyaa.net/static/favicon.png',
    url: 'aHR0cHM6Ly9zdWtlYmVpLm55YWEubmV0',
    options: {
      provider: { type: 'select', description: 'Provider used by this extension.', values: ['sukebei'], default: 'sukebei' },
      pages: { type: 'select', description: 'Maximum search pages to scan for older releases.', values: ['5', '10', '20'], default: '10' }
    }
  },
  {
    ...shared,
    name: 'The Pirate Bay',
    description: 'Anime torrent searches through the apibay.org public API.',
    id: 'catapulttv.hayase.piratebay',
    accuracy: 'low',
    icon: 'https://thepiratebay.org/favicon.ico',
    url: 'aHR0cHM6Ly9hcGliYXkub3Jn',
    options: { provider: { type: 'select', description: 'Provider used by this extension.', values: ['piratebay'], default: 'piratebay' } }
  }
]

export function buildIndex() {
  return EXTENSIONS.map((extension) => ({ ...extension }))
}

export function validateIndex(index) {
  if (!Array.isArray(index) || index.length !== EXTENSIONS.length) {
    throw new Error('The Hayase index must contain all four provider extensions')
  }

  const ids = new Set()
  for (const manifest of index) {
    const required = [
      'manifestVersion', 'name', 'description', 'id', 'version', 'type',
      'accuracy', 'icon', 'media', 'url', 'languages', 'update', 'code'
    ]
    if (required.some((field) => !(field in manifest))) {
      throw new Error('The Hayase manifest is missing a required field')
    }
    if (ids.has(manifest.id)) throw new Error('Extension IDs must be unique')
    ids.add(manifest.id)
    if (
      manifest.manifestVersion !== 2 ||
      manifest.type !== 'torrent' ||
      !['low', 'medium', 'high'].includes(manifest.accuracy) ||
      manifest.update !== REPOSITORY_BASE + '/index.json' ||
      manifest.code !== REPOSITORY_BASE + '/hayase/anime-torrents.js'
    ) {
      throw new Error('The Hayase manifest contains invalid values')
    }
    if (!Array.isArray(manifest.languages) || manifest.languages.some((language) =>
      typeof language !== 'string' || language !== language.toUpperCase())) {
      throw new Error('The Hayase manifest contains invalid language codes')
    }
    if (/rewelp|shiru/i.test(JSON.stringify(manifest))) {
      throw new Error('The Hayase manifest contains obsolete project metadata')
    }
  }

  for (const id of ['catapulttv.hayase.seadex', 'catapulttv.hayase.nyaa', 'catapulttv.hayase.sukebei', 'catapulttv.hayase.piratebay']) {
    if (!ids.has(id)) throw new Error('Missing provider manifest: ' + id)
  }
}

export async function generateIndexes(repositoryRoot = dirname(fileURLToPath(import.meta.url))) {
  const index = buildIndex()
  validateIndex(index)
  await mkdir(join(repositoryRoot, 'hayase'), { recursive: true })
  await Promise.all([
    writeJson(join(repositoryRoot, 'index.json'), index),
    writeJson(join(repositoryRoot, 'hayase', 'index.json'), index)
  ])
  return index
}

async function writeJson(file, value) {
  await writeFile(file, JSON.stringify(value, null, 2) + '\n', 'utf8')
}

const entryPoint = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (entryPoint) {
  await generateIndexes()
  console.log('Generated the standalone Hayase provider indexes.')
}
