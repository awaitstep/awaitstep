import { Badge } from '../../ui/badge'
import type { KeyLevel, KeyPermissions } from '../../../types/dashboard/api-keys'
import { describeGrants } from './key-permissions'

interface GrantSummaryProps {
  level: KeyLevel
  value: KeyPermissions
}

/** "Can: Workflows & functions: read · deploy · run …", under a newly created key. */
export function GrantSummary({ level, value }: GrantSummaryProps) {
  const grants = describeGrants(level, value)
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-2xs text-muted-foreground">
      <span>Can:</span>
      {grants.length === 0 ? (
        <span>Nothing</span>
      ) : (
        <ul aria-label="Permissions" className="flex flex-wrap gap-1.5">
          {grants.map((grant) => (
            <li key={grant}>
              <Badge>{grant}</Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
