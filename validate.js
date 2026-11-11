import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile, readdir } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  buildHayaseIndex,
  buildRootIndex,
  buildShiruPackage,
  buildShiruIndex,
  validateGeneratedIndexes
} from './generate_indexes.js'

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

const actualHayase = await readJson(join(root, 'hayase', 'index.json'))
const actualShiru = await readJson(join(root, 'shiru', 'index.json'))
const actualRoot = await readJson(join(root, 'index.json'))
const actualShiruPackage = await readJson(join(root, 'shiru', 'package.json'))
validateGeneratedIndexes({ hayase: actualHayase, shiru: actualShiru, root: actualRoot })
assert.deepEqual(actualHayase, buildHayaseIndex(), 'Hayase index is out of date; run npm run generate')
assert.deepEqual(actualShiru, buildShiruIndex(), 'Shiru index is out of date; run npm run generate')
assert.deepEqual(actualRoot, buildRootIndex(), 'Root index is out of date; run npm run generate')
assert.deepEqual(actualShiruPackage, buildShiruPackage(), 'Shiru package metadata is out of date; run npm run generate')

const sourceFiles = allFiles.filter((file) => extname(file) === '.js' && basename(file) !== 'validate.js' && basename(file) !== 'generate_indexes.js')
for (const file of sourceFiles) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' })

await import(pathToFileURL(join(root, 'hayase', 'nyaa.js')))
await import(pathToFileURL(join(root, 'hayase', 'sukebei.js')))
const nyaa = (await import(pathToFileURL(join(root, 'shiru', 'sources', 'nyaasrc', 'index.js')))).default
const sukebei = (await import(pathToFileURL(join(root, 'shiru', 'sources', 'sukebeisrc', 'index.js')))).default
for (const source of [nyaa, sukebei]) {
  for (const method of ['single', 'batch', 'movie', 'validate']) assert.equal(typeof source[method], 'function', `${method} is missing`)
}

console.log(`Validated ${jsonFiles.length} JSON files and ${sourceFiles.length} JavaScript files.`)
