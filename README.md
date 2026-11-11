# CatapultTV Hayase Extension

A standalone, community-maintained torrent extension for [Hayase](https://hayase.watch). It combines curated SeaDex releases with title-based Nyaa anime searches in one Hayase extension.

This repository is independent. It is not a fork or package for ReWelp or Shiru.

## Install

In Hayase, open **Settings → Extensions → Repositories**, add this repository manifest, then install **CatapultTV Anime Torrents**:

```
https://raw.githubusercontent.com/CatapultTV/Hayase-Extension/main/index.json
```

## Sources

### SeaDex

- Looks up curated releases using the AniList ID supplied by Hayase.
- Preserves SeaDex's best-release and alternative-release classifications.
- Skips redacted/private entries and invalid info hashes.
- Uses the published info hash to create a standard BitTorrent magnet URI.
- Returns curated results with high matching accuracy.

### Nyaa

- Searches the public Nyaa RSS feed for anime torrents.
- Uses the title alternatives supplied by Hayase.
- Adds episode or batch/movie search terms where applicable.
- Parses info hashes, upload dates, sizes, seeders, leechers and downloads.
- Filters exclusions and known resolution tags.
- Uses low matching accuracy because Nyaa search is title-based.

The extension merges duplicate torrents by info hash. If one provider is unavailable, results from the other provider can still be returned.

## Limitations

- SeaDex needs an AniList ID. If Hayase does not provide one for a title, only Nyaa can contribute results.
- Nyaa's RSS search is text-based and cannot guarantee an exact anime/episode match.
- SeaDex does not expose live swarm statistics through this integration, so those values are reported as zero rather than guessed.
- Provider availability, network restrictions and upstream API changes can affect results.
- The extension does not bypass provider access controls or private-tracker redactions.

## Development

Requirements: Node.js 20 or newer. There are no runtime dependencies.

```sh
npm run generate
npm run validate
npm test
```

- `generate` regenerates the root and Hayase manifest from `generate_indexes.js`.
- `validate` checks JSON, generated-manifest consistency, JavaScript syntax and the source interface.
- `test` runs fast local tests with mocked SeaDex and Nyaa responses. It does not launch Hayase or repeatedly query live providers.

## Repository layout

```
.
├── index.json
├── hayase/
│   ├── index.json
│   └── anime-torrents.js
├── tests/
│   └── extensions.test.js
├── generate_indexes.js
├── validate.js
└── package.json
```

## License

GPL-3.0. See [LICENSE](./LICENSE).
