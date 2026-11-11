import AbstractSource from '../abstract.js'
import { searchSource, validateSource } from '../rss.js'

/**
 * @typedef {import('../../index.d.ts').TorrentQuery} TorrentQuery
 * @typedef {import('../../index.d.ts').TorrentResult} TorrentResult
 */

export default new class NyaaSource extends AbstractSource {
  url = 'https://nyaa.si'
  category = '1_0'
  settings = {}

  /** @param {TorrentQuery} query @returns {Promise<TorrentResult[]>} */
  async single (query) {
    return searchSource({ baseUrl: this.url, category: this.category, query, mode: 'single' })
  }

  /** @param {TorrentQuery} query @returns {Promise<TorrentResult[]>} */
  async batch (query) {
    return searchSource({ baseUrl: this.url, category: this.category, query, mode: 'batch' })
  }

  /** @param {TorrentQuery} query @returns {Promise<TorrentResult[]>} */
  async movie (query) {
    return searchSource({ baseUrl: this.url, category: this.category, query, mode: 'movie' })
  }

  async validate () {
    return validateSource(this.url, this.category)
  }
}()
