import { Crown, Eye, Pencil, ShieldCheck, User, type LucideIcon } from 'lucide-react'
import { Badge, type BadgeProps } from './badge'

/** Org roles (Owner, Admin, Member) and workspace roles (Admin, Editor, Viewer). */
export type Role = 'owner' | 'admin' | 'member' | 'editor' | 'viewer'

const ROLE_LOOK: Record<Role, { label: string; icon: LucideIcon; variant: BadgeProps['variant'] }> =
  {
    owner: { label: 'Owner', icon: Crown, variant: 'default' },
    admin: { label: 'Admin', icon: ShieldCheck, variant: 'default' },
    member: { label: 'Member', icon: User, variant: 'neutral' },
    editor: { label: 'Editor', icon: Pencil, variant: 'neutral' },
    viewer: { label: 'Viewer', icon: Eye, variant: 'info' },
  }

/** The current person's role in a scope, e.g. "Viewer" in the top bar of a read-only workspace. */
export function RolePill({ role }: { role: Role }) {
  const look = ROLE_LOOK[role]
  const Icon = look.icon
  return (
    <Badge variant={look.variant} className="gap-1.5 px-2.5 py-1 text-xs">
      <Icon className="size-3.5" aria-hidden="true" />
      {look.label}
    </Badge>
  )
}
