# CatapultTV Hayase Extensions

Standalone community-maintained torrent extensions for [Hayase](https://hayase.watch). Each provider is a separate installable entry, so you can enable only the sources you want.

This is an independent CatapultTV project, not a fork of either reference repository.

## Install

In Hayase, add this repository manifest:

```
https://raw.githubusercontent.com/CatapultTV/Hayase-Extension/main/index.json
```

Available providers:

- **SeaDex** — curated anime releases matched by AniList ID.
- **Nyaa** — paginated anime torrent searches.
- **Sukebei Nyaa** — paginated anime-category searches on Sukebei.
- **The Pirate Bay** — title searches through the public apibay.org API.
- **SubsPlease** — curated weekly releases with high-accuracy episode matching and resolution selection.

## How results are ranked

The extension no longer treats the largest seeder count as the only measure of quality. Results are deduplicated by info hash and ranked using several signals:

1. SeaDex releases marked **Best** are prioritised.
2. Nyaa uploads marked as trusted are prioritised over untrusted uploads.
3. Remakes are demoted.
4. The requested resolution is preferred when it is known.
5. Release tags such as Blu-ray, WEB-DL and WEBRip provide a quality hint.
6. Seeder count breaks ties between otherwise similar results; upload date is the final tie-breaker.

These are ranking signals, not guarantees. Trackers do not provide a universal quality score, and a torrent with many seeders can still be a poor encode or a mismatched release.

Nyaa and Sukebei searches default to the **exclude remakes** filter. You can change the filter to include everything or restrict results to trusted uploads only.

## Finding older torrents

Nyaa and Sukebei use paginated search pages rather than relying on their recent-only RSS feeds.

Each provider has a **Maximum search pages** setting:

- 5 pages — quicker searches
- 10 pages — default
- 20 pages — searches further back through the site's indexed results

Their **Sort results** setting lets you choose between:
- **Seeders** — strongest swarm first, useful for finding active torrents.
- **Newest** — newest uploads first, useful when browsing further back by date.

The page limit is a maximum; the extension stops when the site returns an empty or invalid page. Results are deduplicated by info hash.

## Provider details

### SeaDex

- Looks up curated releases through the releases.moe API using the AniList ID supplied by Hayase.
- Preserves best-release and alternative-release classifications.
- Skips redacted/private entries and invalid info hashes.
- Adds public trackers to generated magnet links.
- Does not invent live swarm statistics.

### Nyaa and Sukebei

- Search paginated HTML results and parse torrent hashes, upload dates, sizes, seeders, leechers and downloads.
- Use the English-translated anime category on Nyaa and the anime category on Sukebei.
- Support title alternatives, episode, batch and movie searches.
- Support remake/trusted upload filters and seeders/newest sorting.
- Use public tracker fallbacks where a provider's magnet does not already contain them.

### SubsPlease

- Uses the SubsPlease search API for its own catalogue of releases.
- Matches show titles and exact episode numbers.
- Selects the requested resolution where available, then falls back to a supported resolution.
- Converts Base32 BitTorrent hashes to the hexadecimal form expected by Hayase.
- Does not publish live seeder counts, so Hayase displays those as unavailable rather than fabricated.

### The Pirate Bay

- Uses the apibay.org public API.
- Normalises title, hash, seeders, leechers, size and upload date.
- Adds public trackers to generated magnet links.
- Its API has different search and pagination capabilities from Nyaa, so historical coverage is not equivalent.

## Limitations

- SeaDex requires an AniList ID.
- Nyaa-style title search can miss unusual release naming conventions.
- Trusted and release-quality indicators are only used when the provider exposes them.
- Public tracker lists can improve peer discovery but cannot guarantee a healthy swarm.
- Pirate Bay API availability and category coverage can vary.
- A result being listed does not guarantee that it is currently downloadable or has active seeders.
- Provider network restrictions, CORS policies and upstream changes can affect availability.
- The extension does not bypass provider access controls or private-tracker redactions.

## Development

Requirements: Node.js 20 or newer. No runtime dependencies.

```sh
npm run generate
npm run validate
npm test
```

Tests use mocked provider responses. They do not launch Hayase or repeatedly query live torrent sites.

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
