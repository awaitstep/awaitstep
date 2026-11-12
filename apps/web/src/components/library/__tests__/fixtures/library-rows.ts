import type { ApiLibraryRow, ApiLibrarySummary } from '../../../../lib/library-api'

const sales = { kind: 'workspace' as const, id: 'ws-sales', name: 'Sales' }
const project = { kind: 'project' as const, id: 'p-101', name: 'Project 101' }

export function row(over: Partial<ApiLibraryRow> & Pick<ApiLibraryRow, 'id'>): ApiLibraryRow {
  return {
    kind: 'module',
    slug: over.id,
    name: over.id,
    description: '',
    owner: sales,
    latestVersion: '1.0.0',
    publishedAt: '2026-11-01T00:00:00.000Z',
    usedBy: 0,
    updatedAt: '2026-11-10T00:00:00.000Z',
    ...over,
  }
}

export function salesSummary(over: Partial<ApiLibrarySummary> = {}): ApiLibrarySummary {
  return {
    own: [
      row({
        id: 'lead',
        slug: 'lead-scoring',
        name: 'Lead scoring',
        latestVersion: '1.4.2',
        usedBy: 3,
      }),
      row({ id: 'quote', slug: 'quote-parser', name: 'Quote parser', latestVersion: null }),
      row({ id: 'digest', kind: 'node', slug: 'sales-digest', name: 'Sales digest' }),
    ],
    fromProject: [
      row({ id: 'addr', slug: 'normalise-address', name: 'Normalise address', owner: project }),
    ],
    marketplace: [],
    counts: { module: 2, node: 1, marketplace: 0 },
    viewerCan: { create: { allowed: true } },
    ...over,
  }
}
