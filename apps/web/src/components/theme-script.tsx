import { useEffect } from 'react'
import { Sun, Moon } from 'lucide-react'
import { useThemeStore } from '../stores/theme-store'

const initScript = `(function(){try{var d=JSON.parse(localStorage.getItem('awaitstep-theme'));var t=d&&d.state&&d.state.theme;if(t==='light'||t==='dark')document.documentElement.className=t;else document.documentElement.className='dark';}catch(e){document.documentElement.className='dark';}})();`

export function ThemeScript() {
  const theme = useThemeStore((s) => s.theme)

  useEffect(() => {
    document.documentElement.className = theme
  }, [theme])

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: initScript }} />
      <ThemeToggle />
    </>
  )
}

function ThemeToggle() {
  const { theme, setTheme } = useThemeStore()

  function handleToggle() {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  return (
    <div className="fixed bottom-4 right-4 z-40">
      <button
        onClick={handleToggle}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground shadow-md transition-colors hover:text-foreground"
      >
        {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
    </div>
  )
}
