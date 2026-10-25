import { createFileRoute, redirect } from '@tanstack/react-router'

// Legacy URL: Canvas is now the editor's `canvas` view. Kept so bookmarks
// and shared links still land; `replace` keeps the old URL out of history.
export const Route = createFileRoute('/_authed/workflows/$workflowId/canvas')({
  validateSearch: (
    search: Record<string, unknown>,
  ): { template?: boolean; version?: string; kind?: 'workflow' | 'script' } => ({
    template:
      search.template === true || search.template === '1' || search.template === 'true'
        ? true
        : undefined,
    version: typeof search.version === 'string' ? search.version : undefined,
    kind: search.kind === 'script' || search.kind === 'workflow' ? search.kind : undefined,
  }),
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: '/workflows/$workflowId/editor',
      params,
      search: { view: 'canvas', ...search },
      replace: true,
    })
  },
})
