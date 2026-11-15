import { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'
import CssWorker from 'monaco-editor/language/css/css.worker?worker'
import HtmlWorker from 'monaco-editor/language/html/html.worker?worker'
import JsonWorker from 'monaco-editor/language/json/json.worker?worker'
import TsWorker from 'monaco-editor/language/typescript/ts.worker?worker'
import { remeasureWhenCodeFontLoads } from './code-font'
import { defineAwaitstepThemes } from './theme'

// The installed Monaco, bundled with the app: the version its types describe,
// served from our own origin instead of a CDN. Imported only through
// `runtime.ts`, client side, so neither the server bundle nor a page that
// never opens an editor loads it.

function workerFor(label: string): Worker {
  switch (label) {
    case 'typescript':
    case 'javascript':
      return new TsWorker()
    case 'json':
      return new JsonWorker()
    case 'css':
    case 'scss':
    case 'less':
      return new CssWorker()
    case 'html':
    case 'handlebars':
    case 'razor':
      return new HtmlWorker()
    default:
      return new EditorWorker()
  }
}

globalThis.MonacoEnvironment = { getWorker: (_workerId, label) => workerFor(label) }
// Before any editor initialises: the wrapper's loader would fetch a CDN copy otherwise.
loader.config({ monaco })
defineAwaitstepThemes(monaco)
void remeasureWhenCodeFontLoads(monaco)

export { monaco }
