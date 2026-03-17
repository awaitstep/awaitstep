import { useEffect, useState } from 'react'
import { Sun, Moon, Type } from 'lucide-react'
import { useThemeStore } from '../stores/theme-store'
import { useFontStore, FONTS } from '../stores/font-store'

// Blocking script — reads Zustand persist format before paint
const initScript = `(function(){try{var d=JSON.parse(localStorage.getItem('awaitstep-theme'));var t=d&&d.state&&d.state.theme;if(t==='light'||t==='dark')document.documentElement.className=t;else document.documentElement.className='dark';}catch(e){document.documentElement.className='dark';}try{var fd=JSON.parse(localStorage.getItem('awaitstep-font'));var f=fd&&fd.state&&fd.state.font;if(f){var m={'outfit':"'Outfit'",'geist':"'Geist'",'ibm-plex':"'IBM Plex Sans'",'dm-sans':"'DM Sans'",'plus-jakarta':"'Plus Jakarta Sans'",'inter':"'Inter'"};if(m[f])document.body.style.fontFamily=m[f]+',ui-sans-serif,system-ui,sans-serif';}}catch(e){}})();`

export function ThemeScript() {
  const theme = useThemeStore((s) => s.theme)
  const font = useFontStore((s) => s.font)
  const fontFamily = FONTS.find((f) => f.id === font)?.family ?? "'Outfit'"

  useEffect(() => {
    document.documentElement.className = theme
  }, [theme])

  useEffect(() => {
    document.body.style.fontFamily = `${fontFamily}, ui-sans-serif, system-ui, sans-serif`
  }, [fontFamily])

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: initScript }} />
      <Controls />
    </>
  )
}

function Controls() {
  const { theme, setTheme } = useThemeStore()
  const { font, setFont } = useFontStore()
  const [fontOpen, setFontOpen] = useState(false)

  const currentFont = FONTS.find((f) => f.id === font)

  return (
    <div className="fixed bottom-4 right-4 z-40 flex items-center gap-2">
      <div className="relative">
        {fontOpen && (
          <>
            <div className="fixed inset-0" onClick={() => setFontOpen(false)} />
            <div className="absolute bottom-full right-0 mb-2 w-48 rounded-md border border-border bg-card p-1 shadow-lg">
              {FONTS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => { setFont(f.id); setFontOpen(false) }}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-1.5 text-xs transition-colors ${
                    font === f.id ? 'bg-muted/70 text-foreground' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                  }`}
                  style={{ fontFamily: `${f.family}, system-ui, sans-serif` }}
                >
                  {f.label}
                  {font === f.id && <span className="text-primary">✓</span>}
                </button>
              ))}
            </div>
          </>
        )}
        <button
          onClick={() => setFontOpen((v) => !v)}
          className="flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs text-muted-foreground shadow-md transition-colors hover:text-foreground"
        >
          <Type className="h-3.5 w-3.5" />
          {currentFont?.label ?? 'Font'}
        </button>
      </div>

      <button
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-muted-foreground shadow-md transition-colors hover:text-foreground"
      >
        {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
    </div>
  )
}
