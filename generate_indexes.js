import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPOSITORY_BASE = 'https://raw.githubusercontent.com/CatapultTV/Hayase-Extension/main'
export const EXTENSION_VERSION = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'package.json'), 'utf8')
).version

export const EXTENSION = {
  manifestVersion: 2,
  deprecated: false,
  name: 'CatapultTV Anime Torrents',
  description: 'Combines SeaDex curated releases with direct Nyaa anime RSS searches.',
  id: 'catapulttv.hayase.anime-torrents',
  version: EXTENSION_VERSION,
  type: 'torrent',
  // The unified source also performs title searches through Nyaa, so low is the
  // honest aggregate accuracy even though SeaDex lookups use AniList IDs.
  accuracy: 'low',
  ratio: 0,
  icon: 'https://seadex.moe/favicon.ico',
  media: 'both',
  languages: ['ALL'],
  update: `${REPOSITORY_BASE}/index.json`,
  code: `${REPOSITORY_BASE}/hayase/anime-torrents.js`,
  updatePeers: false,
  rateLimit: 2
}

export function buildIndex () {
  return [{ ...EXTENSION }]
}

export function validateIndex (index) {
  if (!Array.isArray(index) || index.length !== 1) {
    throw new Error('The Hayase index must contain exactly one extension')
  }

  const manifest = index[0]
  const required = [
    'manifestVersion', 'deprecated', 'name', 'description', 'id', 'version',
    'type', 'accuracy', 'icon', 'media', 'languages', 'update', 'code'
  ]
  if (required.some((field) => !(field in manifest))) {
    throw new Error('The Hayase manifest is missing a required field')
  }
  if (
    manifest.manifestVersion !== 2 ||
    manifest.type !== 'torrent' ||
    manifest.accuracy !== 'low' ||
    manifest.update !== `${REPOSITORY_BASE}/index.json` ||
    manifest.code !== `${REPOSITORY_BASE}/hayase/anime-torrents.js`
  ) {
    throw new Error('The Hayase manifest contains invalid values')
  }
  if (!Array.isArray(manifest.languages) || manifest.languages.some((language) => {
    return typeof language !== 'string' || language !== language.toUpperCase()
  })) {
    throw new Error('The Hayase manifest contains invalid language codes')
  }
  if (JSON.stringify(manifest).match(/rewelp|shiru/i)) {
    throw new Error('The Hayase manifest contains obsolete Shiru/ReWelp metadata')
  }
}

export async function generateIndexes (repositoryRoot = dirname(fileURLToPath(import.meta.url))) {
  const index = buildIndex()
  validateIndex(index)
  await mkdir(join(repositoryRoot, 'hayase'), { recursive: true })
  await Promise.all([
    writeJson(join(repositoryRoot, 'index.json'), index),
    writeJson(join(repositoryRoot, 'hayase', 'index.json'), index)
  ])
  return index
}

async function writeJson (file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

const entryPoint = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (entryPoint) {
  await generateIndexes()
  console.log('Generated the standalone Hayase index.')
}
