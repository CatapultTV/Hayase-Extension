import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { buildIndex, validateIndex } from './generate_indexes.js'

const root = dirname(fileURLToPath(import.meta.url))

async function filesUnder (directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const file = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await filesUnder(file))
    else files.push(file)
  }
  return files
}

async function readJson (file) {
  return JSON.parse(await readFile(file, 'utf8'))
}

const allFiles = await filesUnder(root)
const jsonFiles = allFiles.filter((file) => extname(file) === '.json')
for (const file of jsonFiles) await readJson(file)

const actualRoot = await readJson(join(root, 'index.json'))
const actualHayase = await readJson(join(root, 'hayase', 'index.json'))
validateIndex(actualRoot)
validateIndex(actualHayase)
assert.deepEqual(actualRoot, buildIndex(), 'Root index is out of date; run npm run generate')
assert.deepEqual(actualHayase, buildIndex(), 'Hayase index is out of date; run npm run generate')
assert.equal(JSON.stringify(actualRoot).match(/rewelp|shiru/i), null, 'Obsolete metadata remains')

const sourceFiles = allFiles.filter((file) => extname(file) === '.js' && basename(file) !== 'validate.js' && basename(file) !== 'generate_indexes.js')
for (const file of sourceFiles) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' })

const source = (await import(pathToFileURL(join(root, 'hayase', 'anime-torrents.js')))).default
for (const method of ['single', 'batch', 'movie', 'test']) {
  assert.equal(typeof source[method], 'function', `${method} is missing`)
}

console.log(`Validated ${jsonFiles.length} JSON files and ${sourceFiles.length} JavaScript files.`)
