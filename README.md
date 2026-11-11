# CatapultTV Hayase Extensions

Standalone, community-maintained torrent extensions for [Hayase](https://hayase.watch). This repository provides separate SeaDex and Nyaa entries, each scoped to its own upstream domain for Hayase's CORS configuration.

This is an independent CatapultTV project. It is not a fork or package for ReWelp or Shiru.

## Install

In Hayase, open **Settings → Extensions → Repositories**, add this repository manifest, then import the extensions:

```
https://raw.githubusercontent.com/CatapultTV/Hayase-Extension/main/index.json
```

Two entries will be available to enable independently:

- **SeaDex** — curated releases matched using AniList IDs.
- **Nyaa** — title-based searches through the public Nyaa RSS feed.

## Sources

### SeaDex

- Looks up curated releases through the releases.moe API using the AniList ID supplied by Hayase.
- Preserves SeaDex's best-release and alternative-release classifications.
- Skips redacted/private entries and invalid info hashes.
- Creates standard BitTorrent magnet URIs from published info hashes, including v2 hashes.
- Returns curated results with high matching accuracy.
- Does not invent live seed, leech or download counts.

### Nyaa

- Searches the public Nyaa RSS feed for anime torrents.
- Uses title alternatives supplied by Hayase.
- Adds episode, batch or movie search terms where applicable.
- Parses info hashes, upload dates, sizes, seeders, leechers and downloads.
- Filters exclusions and known resolution tags.
- Uses low matching accuracy because results are based on text search.

Each manifest selects its provider through a Hayase extension option and declares the corresponding upstream URL for CORS. The entries can be enabled or disabled separately.

## Limitations

- SeaDex needs an AniList ID. If Hayase does not provide one for a title, SeaDex cannot return results.
- Nyaa's RSS search is text-based and cannot guarantee an exact anime or episode match.
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

- `generate` regenerates the root and Hayase manifests from `generate_indexes.js`.
- `validate` checks JSON, generated-manifest consistency, JavaScript syntax and the standalone repository structure.
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
