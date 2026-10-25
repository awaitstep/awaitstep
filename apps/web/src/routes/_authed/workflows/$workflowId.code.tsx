import { createFileRoute, redirect } from '@tanstack/react-router'
import { editorSearch } from '../../../lib/workflows/surfaces'

// Legacy URL: Code is now the editor's `ide` view. Kept so bookmarks and
// shared links still land; `replace` keeps the old URL out of history.
export const Route = createFileRoute('/_authed/workflows/$workflowId/code')({
  validateSearch: (search: Record<string, unknown>): { version?: string; file?: string } => ({
    version: typeof search.version === 'string' ? search.version : undefined,
    file: typeof search.file === 'string' ? search.file : undefined,
  }),
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: '/workflows/$workflowId/editor',
      params,
      search: editorSearch('ide', search),
      replace: true,
    })
  },
})
