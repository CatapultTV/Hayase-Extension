export type Speed = 'fast' | 'moderate' | 'slow'
export type Accuracy = 'high' | 'medium' | 'low'

export type RepositoryIndex = RepositoryConfig[]

export interface RepositoryConfig {
  main: string | string[]
}

export interface SourceConfig {
  id: string
  name: string
  version: string
  main: string
  update: string | string[]
  nsfw?: boolean
  unregulated?: boolean
  type: 'torrent'
  speed?: Speed
  accuracy?: Accuracy
  settings?: SourceSetting[]
  deprecated?: false
  description?: string
  icon?: string
}

export type SourceSetting = TextSetting | ToggleSetting | DropdownSetting | MultiSelectSetting

interface BaseSourceSetting {
  key: string
  label: string
  description?: string
}

export interface TextSetting extends BaseSourceSetting {
  type: 'text'
  secret?: boolean
  default?: string
  required?: boolean
  placeholder?: string
}

export interface ToggleSetting extends BaseSourceSetting {
  type: 'toggle'
  default?: boolean
}

export interface DropdownSetting extends BaseSourceSetting {
  type: 'dropdown'
  options: DropdownOption[]
  default?: string
}

export interface MultiSelectSetting extends BaseSourceSetting {
  type: 'multiselect'
  options: DropdownOption[]
  default?: string[]
}

export interface DropdownOption {
  label: string
  value: string
}

export interface TorrentResult {
  title: string
  link: string
  id?: number
  seeders: number
  leechers: number
  downloads: number
  accuracy?: Accuracy
  hash: string
  size: number
  date: Date
  type?: 'batch' | 'best' | 'alt'
}

export interface TorrentQuery {
  anilistId: number
  media: object
  mappingsA?: object
  mappingsE?: object
  anidbAid?: number
  anidbEid?: number
  tvdbAid?: number
  tvdbEid?: number
  imdbAid?: string
  mvdbAid?: number
  titles: string[]
  episode?: number
  episodeCount?: number
  resolution: '2160' | '1080' | '720' | '540' | '480' | ''
  exclusions: string[]
}

export type SearchFunction = (
  query: TorrentQuery,
  options?: Record<string, string | number | boolean>
) => Promise<TorrentResult[]>

export class TorrentSource {
  single: SearchFunction
  batch: SearchFunction
  movie: SearchFunction
  validate (): Promise<boolean>
}
