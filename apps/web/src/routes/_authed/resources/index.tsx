import { createFileRoute, Link } from '@tanstack/react-router'
import { Database, HardDrive, Archive } from 'lucide-react'

export const Route = createFileRoute('/_authed/resources/')({
  component: ResourcesPage,
})

const RESOURCE_TYPES = [
  {
    name: 'KV Namespaces',
    description: 'Browse key-value storage namespaces and their contents',
    icon: HardDrive,
    href: '/resources/kv',
  },
  {
    name: 'D1 Databases',
    description: 'Browse SQL databases and run queries',
    icon: Database,
    href: '/resources/d1',
  },
  {
    name: 'R2 Buckets',
    description: 'Browse object storage buckets and files',
    icon: Archive,
    href: '/resources/r2',
  },
]

function ResourcesPage() {
  return (
    <div>
      <div className="border-b border-border pb-4">
        <h1 className="text-lg font-semibold">Resources</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Browse and manage your Cloudflare resources
        </p>
      </div>

      <div className="mx-auto max-w-screen-md">
      <div className="mt-6 rounded-md border border-border">
        {RESOURCE_TYPES.map((type, i) => (
          <Link
            key={type.name}
            to={type.href}
            className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30 ${
              i < RESOURCE_TYPES.length - 1 ? 'border-b border-border' : ''
            }`}
          >
            <type.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-foreground">{type.name}</h3>
              <p className="text-xs text-muted-foreground">{type.description}</p>
            </div>
          </Link>
        ))}
      </div>
      </div>
    </div>
  )
}
