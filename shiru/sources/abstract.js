/** @typedef {import('../index.d.ts').TorrentSource} TorrentSource */

/** @implements {TorrentSource} */
export default class AbstractSource {
  /** @type {import('../index.d.ts').SearchFunction} */
  async single () {
    throw new Error('Source does not implement method #single()')
  }

  /** @type {import('../index.d.ts').SearchFunction} */
  async batch () {
    throw new Error('Source does not implement method #batch()')
  }

  /** @type {import('../index.d.ts').SearchFunction} */
  async movie () {
    throw new Error('Source does not implement method #movie()')
  }

  /** @returns {Promise<boolean>} */
  async validate () {
    throw new Error('Source does not implement method #validate()')
  }
}
