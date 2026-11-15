import { createFileRoute } from '@tanstack/react-router'
import { quickTestSandboxResponse } from '../lib/ide/quick-test-sandbox-page'

// The quick-test sandbox's page (lib/ide/quick-test-sandbox-page.ts): a
// server route, so it goes out under its own `sandbox` policy rather than
// the dashboard's. The dot keeps the path out of the org-slug namespace.
export const Route = createFileRoute('/quick-test-sandbox.html')({
  server: {
    handlers: {
      GET: ({ request }) => quickTestSandboxResponse(request),
    },
  },
})
