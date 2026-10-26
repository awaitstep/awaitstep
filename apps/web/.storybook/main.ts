import type { StorybookConfig } from '@storybook/react-vite'
import type { PluginOption } from 'vite'

// Stories render bare components, so the app's TanStack Start plugins (server
// functions, route generation, SSR dev server) are dropped from its Vite config.
function withoutTanStackStart(plugins: PluginOption[] = []): PluginOption[] {
  return plugins.flat(Infinity as 1).filter((plugin) => {
    const name = plugin && typeof plugin === 'object' && 'name' in plugin ? plugin.name : ''
    return !name.startsWith('tanstack')
  })
}

const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-a11y'],
  core: { disableTelemetry: true },
  viteFinal(viteConfig) {
    return { ...viteConfig, plugins: withoutTanStackStart(viteConfig.plugins) }
  },
}

export default config
