# CatapultTV Hayase Extensions

Standalone community-maintained torrent extensions for [Hayase](https://hayase.watch). Each provider is a separate installable entry, so you can enable only the sources you want.

This is an independent CatapultTV project, not a ReWelp or Shiru fork.

## Install

In Hayase, add this repository manifest:

```
https://raw.githubusercontent.com/CatapultTV/Hayase-Extension/main/index.json
```

Available providers:

- **SeaDex** — curated anime releases matched by AniList ID.
- **Nyaa** — anime torrent searches with HTML pagination, so older results can be reached.
- **Sukebei Nyaa Nyaa** — separate paginated searches on Sukebei.
- **The Pirate Bay** — title searches through the public apibay.org API.

## Finding older torrents

Nyaa's RSS feed is limited to a small set of recent results. The Nyaa and Sukebei extensions now use their paginated search pages instead.

Open the provider's extension options and set **Maximum search pages**:

- 5 pages — quicker searches
- 10 pages — default
- 20 pages — searches further back through the site's result pages

The search stops early when the site returns an empty page. Results are deduplicated by info hash.

Pagination follows the provider's own search ordering. It can reach older indexed results, but it cannot guarantee a torrent will still be seeded, available, or indexed by the site.

## Provider details

### SeaDex

- Looks up curated releases through the releases.moe API using the AniList ID supplied by Hayase.
- Preserves best-release and alternative-release classifications.
- Skips redacted/private entries and invalid info hashes.
- Creates BitTorrent magnet URIs from published info hashes.
- Does not invent live swarm statistics.

### Nyaa and Sukebei

- Searches each site's HTML result pages, rather than relying on the recent-only RSS feed.
- Supports title alternatives, episode, batch and movie searches.
- Parses info hashes, upload dates, sizes, seeders, leechers and downloads.
- Applies exclusions and resolution filters.
- Uses low matching accuracy because the searches are title-based.

### The Pirate Bay

- Uses the apibay.org public API.
- Normalises title, hash, seeders, leechers, size and upload date.
- Filters results using the requested episode/movie/batch mode and resolution where those details are present.
- Does not claim that a result is verified or currently seeded beyond the returned swarm count.

## Limitations

- SeaDex requires an AniList ID.
- Nyaa-style search is text-based; matching cannot be guaranteed for every release naming convention.
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
