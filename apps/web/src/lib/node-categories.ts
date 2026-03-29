import type { Category } from '@awaitstep/ir'
import {
  Blocks,
  MessageSquare,
  Database,
  Briefcase,
  Wrench,
  Sparkles,
  FolderKanban,
  type LucideIcon,
} from 'lucide-react'

export type SuperCategory = 'core' | 'comms' | 'data' | 'business' | 'devops' | 'ai' | 'projects'

export interface SuperCategoryMeta {
  key: SuperCategory
  label: string
  icon: LucideIcon
}

const SUPER_CATEGORY_MAP: Record<Category, SuperCategory> = {
  'Control Flow': 'core',
  Scheduling: 'core',
  HTTP: 'core',
  Internal: 'core',
  Email: 'comms',
  Messaging: 'comms',
  Notifications: 'comms',
  Database: 'data',
  Storage: 'data',
  Data: 'data',
  Analytics: 'data',
  Payments: 'business',
  CRM: 'business',
  'E-commerce': 'business',
  'Customer Support': 'business',
  Forms: 'business',
  'Developer Tools': 'devops',
  Authentication: 'devops',
  Utilities: 'devops',
  AI: 'ai',
  'Project Management': 'projects',
}

const SUPER_CATEGORY_META: Record<SuperCategory, { label: string; icon: LucideIcon }> = {
  core: { label: 'Core', icon: Blocks },
  comms: { label: 'Communication', icon: MessageSquare },
  data: { label: 'Data & Storage', icon: Database },
  business: { label: 'Business', icon: Briefcase },
  devops: { label: 'DevOps', icon: Wrench },
  ai: { label: 'AI', icon: Sparkles },
  projects: { label: 'Projects', icon: FolderKanban },
}

const CATEGORY_ORDER: SuperCategory[] = [
  'core',
  'comms',
  'data',
  'business',
  'devops',
  'ai',
  'projects',
]

export function getSuperCategory(category: string): SuperCategory {
  return SUPER_CATEGORY_MAP[category as Category] ?? 'core'
}

export function getSuperCategoryMeta(key: SuperCategory): SuperCategoryMeta {
  const meta = SUPER_CATEGORY_META[key]
  return { key, label: meta.label, icon: meta.icon }
}

export function groupByCategory<T extends { category: string }>(
  items: T[],
): Map<SuperCategory, T[]> {
  const groups = new Map<SuperCategory, T[]>()

  for (const item of items) {
    const sc = getSuperCategory(item.category)
    const list = groups.get(sc)
    if (list) {
      list.push(item)
    } else {
      groups.set(sc, [item])
    }
  }

  const sorted = new Map<SuperCategory, T[]>()
  for (const key of CATEGORY_ORDER) {
    const group = groups.get(key)
    if (group) sorted.set(key, group)
  }

  return sorted
}

export function getPopulatedCategories<T extends { category: string }>(
  items: T[],
): (SuperCategoryMeta & { count: number })[] {
  const grouped = groupByCategory(items)
  const result: (SuperCategoryMeta & { count: number })[] = []

  for (const [key, group] of grouped) {
    result.push({ ...getSuperCategoryMeta(key), count: group.length })
  }

  return result
}

export function filterNodes<T extends { name: string; description: string; tags?: string[] }>(
  items: T[],
  search: string,
): T[] {
  if (!search) return items
  const lower = search.toLowerCase()
  return items.filter(
    (item) =>
      item.name.toLowerCase().includes(lower) ||
      item.description.toLowerCase().includes(lower) ||
      item.tags?.some((t) => t.toLowerCase().includes(lower)),
  )
}
