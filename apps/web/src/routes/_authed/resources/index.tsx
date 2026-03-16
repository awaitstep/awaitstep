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
    color: 'text-blue-400 bg-blue-500/10',
  },
  {
    name: 'D1 Databases',
    description: 'Browse SQL databases and run queries',
    icon: Database,
    href: '/resources/d1',
    color: 'text-amber-400 bg-amber-500/10',
  },
  {
    name: 'R2 Buckets',
    description: 'Browse object storage buckets and files',
    icon: Archive,
    href: '/resources/r2',
    color: 'text-emerald-400 bg-emerald-500/10',
  },
]

function ResourcesPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Resources</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Browse and manage your Cloudflare resources
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {RESOURCE_TYPES.map((type) => (
          <Link
            key={type.name}
            to={type.href}
            className="group rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
          >
            <div className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${type.color}`}>
              <type.icon className="h-5 w-5" />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-foreground group-hover:text-primary">
              {type.name}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">{type.description}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
