import type { Decorator, Preview } from '@storybook/react-vite'
import '../src/styles.css'

// The app themes by the class on <html> (see theme-script.tsx), so the toolbar
// sets the same class rather than wrapping stories in a themed container.
const withTheme: Decorator = (Story, context) => {
  document.documentElement.className = context.globals.theme === 'light' ? 'light' : 'dark'
  return <Story />
}

const preview: Preview = {
  decorators: [withTheme],
  globalTypes: {
    theme: {
      description: 'Colour theme',
      toolbar: {
        title: 'Theme',
        icon: 'mirror',
        items: [
          { value: 'dark', title: 'Dark' },
          { value: 'light', title: 'Light' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: 'dark',
  },
  parameters: {
    layout: 'padded',
    viewport: {
      options: {
        phone: { name: 'Phone (390)', styles: { width: '390px', height: '844px' }, type: 'mobile' },
      },
    },
  },
}

export default preview
