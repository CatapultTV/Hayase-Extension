# HayasexShiru Extensions

Community-maintained torrent extensions for Hayase and Shiru. This repository provides direct Nyaa and Sukebei search sources without depending on the retired `torrent-search-api-livid.vercel.app` service.

## Available extensions

- Hayase: Nyaa and Sukebei torrent extensions.
- Shiru: Nyaa SRC and Sukebei SRC torrent sources.

Both sources use the public Nyaa RSS endpoint. They return the source's `.torrent` download URL, the published info hash, upload date, size, and tracker statistics. Searches are title-based, so Hayase classifies their accuracy as low; the source itself cannot guarantee an exact AniList/AniDB match.

## Installation

### Hayase

In Hayase, open **Settings → Extensions → Repositories**, add the following URL, and import the extensions:

<https://raw.githubusercontent.com/ReWelp/HayasexShiru-Extensions/main/hayase/index.json>

### Shiru

In Shiru, open **Settings → Extensions → Sources** and add:

<https://raw.githubusercontent.com/ReWelp/HayasexShiru-Extensions/main/shiru/index.json>

Alternatively, add `gh:ReWelp/HayasexShiru-Extensions/shiru`.

Sukebei is an adult-content source. Shiru may require its adult-content setting to be enabled, and network, ISP, parental-control, or regional filtering can prevent access to it.

## Updating

Hayase checks the manifest URL automatically. Shiru checks the repository's generated index through its `update` entry. If an update does not appear, remove the existing source and import the repository again.

## Development

This project intentionally has no runtime dependencies. With Node.js 20 or newer installed:

```sh
npm run generate
npm run validate
npm test
```

`generate` creates all repository indexes from the single source definition in `generate_indexes.js`. `validate` checks JSON, JavaScript syntax, generated-file consistency, manifest fields, IDs, and local source imports. Tests mock RSS responses and cover successful searches, title alternatives, episode and resolution terms, malformed data, empty queries, failed requests, and the required Shiru methods.

## Limitations

- Results depend on Nyaa or Sukebei availability and their RSS response.
- Search matching is text-based; alternative titles are queried, but no result can be claimed as an exact media-ID match.
- RSS provides a valid `.torrent` download URL rather than the HTML search page's magnet URL. The info hash is preserved and validated instead of constructing a magnet link with guessed trackers.
- Sukebei could not be live-tested from every network because adult-content filtering and TLS/network policy may block the host.

## Contributing

Please open an issue or pull request with a reproducible source response or mocked test case. Keep both application APIs separate, preserve the GPL-3.0 license, and run all three commands above before submitting changes.

## License

This project is licensed under the GNU General Public License v3.0. See [LICENSE](./LICENSE).
