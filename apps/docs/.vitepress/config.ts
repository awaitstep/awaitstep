import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

export default withMermaid(
  defineConfig({
    title: 'AwaitStep',
    description: 'Self-hosted visual workflow builder for Cloudflare Workflows',
    cleanUrls: true,
    head: [
      ['link', { rel: 'icon', href: '/favicon.ico' }],
      [
        'script',
        {},
        'window.tryhet=window.tryhet||{event:function(){(window.__tryhet_q=window.__tryhet_q||[]).push([].slice.call(arguments))}};',
      ],
      [
        'script',
        {
          'data-project-id': '17',
          async: 'true',
          src: 'https://cdn.tryhet.io/sdk/init.js',
        },
      ],
      ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
      ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
      [
        'link',
        {
          href: 'https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700&display=swap',
          rel: 'stylesheet',
        },
      ],
    ],
    themeConfig: {
      logo: { src: '/logo.svg', alt: 'AwaitStep' },
      siteTitle: false,
      search: { provider: 'local' },
      socialLinks: [{ icon: 'github', link: 'https://github.com/awaitstep/awaitstep' }],
      editLink: {
        pattern: 'https://github.com/awaitstep/awaitstep/edit/main/apps/docs/:path',
      },
      sidebar: [
        {
          text: 'Getting Started',
          items: [
            { text: 'Introduction', link: '/' },
            { text: 'Quickstart', link: '/getting-started/quickstart' },
            { text: 'Prerequisites', link: '/getting-started/prerequisites' },
          ],
        },
        {
          text: 'Installation',
          items: [
            { text: 'Docker Compose', link: '/installation/docker-compose' },
            {
              text: 'Cloudflare Workers',
              link: '/installation/cloudflare-workers',
            },
            {
              text: 'Environment Variables',
              link: '/installation/environment-variables',
            },
            { text: 'Database', link: '/installation/database' },
            {
              text: 'Cloudflare Connection',
              link: '/installation/cloudflare-connection',
            },
            { text: 'Reverse Proxy', link: '/installation/reverse-proxy' },
            { text: 'Upgrading', link: '/installation/upgrading' },
            { text: 'Health Checks', link: '/installation/health-checks' },
            {
              text: 'Platforms',
              collapsed: true,
              items: [
                { text: 'Coolify', link: '/installation/platforms/coolify' },
                { text: 'Railway', link: '/installation/platforms/railway' },
                { text: 'Render', link: '/installation/platforms/render' },
                {
                  text: 'DigitalOcean',
                  link: '/installation/platforms/digitalocean',
                },
              ],
            },
          ],
        },
        {
          text: 'Core Concepts',
          items: [
            { text: 'Architecture', link: '/concepts/architecture' },
            { text: 'Workflows vs Functions', link: '/concepts/workflow-ir#scripts-vs-workflows' },
            { text: 'Workflow & Script IR', link: '/concepts/workflow-ir' },
            { text: 'Node Types', link: '/concepts/node-types' },
            { text: 'Canvas', link: '/concepts/canvas' },
            { text: 'Compilation', link: '/concepts/compilation' },
            { text: 'Deploy Pipeline', link: '/concepts/deploy-pipeline' },
            { text: 'Run Lifecycle', link: '/concepts/run-lifecycle' },
            { text: 'Cloudflare Limits', link: '/concepts/cloudflare-limits' },
          ],
        },
        {
          text: 'Node Registry',
          items: [
            { text: 'Overview', link: '/nodes/overview' },
            { text: 'Built-in Nodes', link: '/nodes/built-in' },
            { text: 'Custom Nodes', link: '/nodes/custom-nodes' },
            { text: 'Versioning', link: '/nodes/versioning' },
            { text: 'Marketplace', link: '/nodes/marketplace' },
          ],
        },
        {
          text: 'Building Workflows',
          items: [
            { text: 'Sequential Steps', link: '/building-workflows/sequential' },
            { text: 'Branching', link: '/building-workflows/branching' },
            {
              text: 'Parallel Execution',
              link: '/building-workflows/parallel',
            },
            { text: 'Sleeping & Waiting', link: '/building-workflows/sleeping' },
            {
              text: 'Error Handling',
              link: '/building-workflows/error-handling',
            },
            { text: 'Loops', link: '/building-workflows/loops' },
            { text: 'Expressions', link: '/building-workflows/expressions' },
            { text: 'Secrets & Env Vars', link: '/building-workflows/secrets' },
            { text: 'Triggering', link: '/building-workflows/triggering' },
            { text: 'Custom Routes', link: '/building-workflows/custom-routes' },
            {
              text: 'Sub-Workflows',
              link: '/building-workflows/sub-workflows',
            },
          ],
        },
        {
          text: 'Templates',
          items: [
            { text: 'Overview', link: '/templates/' },
            { text: 'Order Processing', link: '/templates/order-processing' },
            { text: 'Webhook Handler', link: '/templates/webhook-handler' },
            { text: 'Scheduled Report', link: '/templates/scheduled-report' },
            { text: 'Human Approval', link: '/templates/human-approval' },
            { text: 'AI Agent Pipeline', link: '/templates/ai-agent' },
          ],
        },
        {
          text: 'API Reference',
          items: [
            { text: 'REST API', link: '/api/rest' },
            { text: 'Functions', link: '/api/rest#functions' },
            { text: 'Triggers', link: '/api/triggers' },
            { text: 'Webhooks', link: '/api/webhooks' },
            { text: 'IR Schema', link: '/api/ir-schema' },
          ],
        },
        { text: 'Configuration Reference', link: '/configuration' },
        {
          text: 'Troubleshooting',
          items: [
            { text: 'Deploy Failures', link: '/troubleshooting/deploy-failures' },
            { text: 'Stuck Runs', link: '/troubleshooting/stuck-runs' },
            { text: 'Timeouts', link: '/troubleshooting/timeouts' },
            { text: 'Token Errors', link: '/troubleshooting/token-errors' },
            { text: 'Wrangler Errors', link: '/troubleshooting/wrangler-errors' },
          ],
        },
        {
          text: 'Contributing',
          items: [
            { text: 'Local Setup', link: '/contributing/local-setup' },
            {
              text: 'Project Structure',
              link: '/contributing/project-structure',
            },
            { text: 'Adding Nodes', link: '/contributing/adding-nodes' },
            {
              text: 'Adding Providers',
              link: '/contributing/adding-providers',
            },
            { text: 'Pull Requests', link: '/contributing/pull-requests' },
          ],
        },
      ],
    },
  }),
)
