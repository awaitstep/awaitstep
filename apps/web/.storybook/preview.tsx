import type { MouseEvent } from 'react'
import type { Decorator, Preview } from '@storybook/react-vite'
import { ShellLinkProvider, type ShellLinkProps } from '../src/components/shell/shell-link'
import '../src/styles.css'

// The app themes by the class on <html> (see theme-script.tsx), so the toolbar
// sets the same class rather than wrapping stories in a themed container.
const withTheme: Decorator = (Story, context) => {
  document.documentElement.className = context.globals.theme === 'light' ? 'light' : 'dark'
  return <Story />
}

// Shell links point at app routes that don't exist inside Storybook's iframe,
// so they render as anchors that don't navigate.
function InertLink({ onClick, ...props }: ShellLinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault()
    onClick?.(event)
  }
  return <a {...props} onClick={handleClick} />
}

const withInertLinks: Decorator = (Story) => (
  <ShellLinkProvider link={InertLink}>
    <Story />
  </ShellLinkProvider>
)

const preview: Preview = {
  decorators: [withTheme, withInertLinks],
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
    // Accessibility panel: axe runs on every story in the current theme and
    // viewport. 'todo' lists violations without failing anything.
    a11y: { test: 'todo' },
    viewport: {
      options: {
        phone: { name: 'Phone (390)', styles: { width: '390px', height: '844px' }, type: 'mobile' },
      },
    },
  },
}

export default preview
