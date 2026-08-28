import { useEffect } from 'react'
import { useThemeStore } from '../stores/theme-store'

const initScript = `(function(){try{var d=JSON.parse(localStorage.getItem('awaitstep-theme'));var t=d&&d.state&&d.state.theme;if(t==='light'||t==='dark')document.documentElement.className=t;else document.documentElement.className='dark';}catch(e){document.documentElement.className='dark';}try{var s=JSON.parse(localStorage.getItem('awaitstep-sidebar'));document.documentElement.dataset.sidebar=s&&s.state&&s.state.collapsed?'collapsed':'expanded';}catch(e){document.documentElement.dataset.sidebar='expanded';}})();`

export function ThemeScript() {
  const theme = useThemeStore((s) => s.theme)

  useEffect(() => {
    document.documentElement.className = theme
  }, [theme])

  return <script dangerouslySetInnerHTML={{ __html: initScript }} />
}
