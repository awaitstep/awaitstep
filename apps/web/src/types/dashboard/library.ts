/**
 * A module or resource node in a workspace's Library. Always empty until W2
 * (modules and resources) lands; the page shows its empty state.
 */
export interface LibraryEntry {
  id: string
  name: string
  kind: 'module' | 'resource'
}
