import type { Monaco } from '@monaco-editor/react'
import type { editor, Position } from 'monaco-editor'
import {
  analyzeCompletion,
  analyzeHover,
  analyzeIssues,
  type ExpressionEditorContext,
} from '../expressions/editor-support'

export const EXPRESSION_LANGUAGE_ID = 'awaitstep-expression'
const MARKER_OWNER = 'awaitstep-expression'

/**
 * Per-model editing context, keyed by model URI. Providers are registered
 * once per language; each expression field registers its context on mount so
 * completions/hovers know which node is being edited and what is upstream.
 */
const contextByModel = new Map<string, ExpressionEditorContext>()

export function setExpressionContext(modelUri: string, ctx: ExpressionEditorContext): void {
  contextByModel.set(modelUri, ctx)
}

export function clearExpressionContext(modelUri: string): void {
  contextByModel.delete(modelUri)
}

let registered = false

/**
 * Registers the `awaitstep-expression` language: tokenized `{{ref.path}}`
 * spans inside literal text, completions and hovers backed by the same
 * resolveExpressionType/validateExpressionRefs the workflow validator uses.
 * Idempotent — call from every expression editor's beforeMount.
 */
export function configureExpressionLanguage(monaco: Monaco): void {
  if (registered) return
  registered = true

  monaco.languages.register({ id: EXPRESSION_LANGUAGE_ID })

  monaco.languages.setMonarchTokensProvider(EXPRESSION_LANGUAGE_ID, {
    tokenizer: {
      root: [
        [/\{\{/, { token: 'delimiter.expression', next: '@expression' }],
        [/[^{]+/, 'string'],
        [/\{/, 'string'],
      ],
      expression: [
        [/\}\}/, { token: 'delimiter.expression', next: '@pop' }],
        [/"[^"]*"|'[^']*'/, 'string.key'],
        [/[A-Za-z_][A-Za-z0-9_]*/, 'variable'],
        [/[0-9]+/, 'number'],
        [/[.[\]]/, 'delimiter'],
        [/[^}]/, ''],
      ],
    },
  })

  monaco.languages.setLanguageConfiguration(EXPRESSION_LANGUAGE_ID, {
    autoClosingPairs: [
      { open: '{{', close: '}}' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
  })

  monaco.languages.registerCompletionItemProvider(EXPRESSION_LANGUAGE_ID, {
    triggerCharacters: ['{', '.'],
    provideCompletionItems(model: editor.ITextModel, position: Position) {
      const ctx = contextByModel.get(model.uri.toString())
      if (!ctx) return { suggestions: [] }
      const analysis = analyzeCompletion(model.getValue(), model.getOffsetAt(position), ctx)
      if (!analysis) return { suggestions: [] }
      const start = model.getPositionAt(analysis.replaceStart)
      const range = {
        startLineNumber: start.lineNumber,
        startColumn: start.column,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      }
      return {
        suggestions: analysis.suggestions.map((s) => ({
          label: s.label,
          kind:
            s.kind === 'ref'
              ? monaco.languages.CompletionItemKind.Variable
              : monaco.languages.CompletionItemKind.Field,
          insertText: s.insert,
          detail: s.detail,
          ...(s.documentation && { documentation: s.documentation }),
          range,
        })),
      }
    },
  })

  monaco.languages.registerHoverProvider(EXPRESSION_LANGUAGE_ID, {
    provideHover(model: editor.ITextModel, position: Position) {
      const ctx = contextByModel.get(model.uri.toString())
      if (!ctx) return null
      const hover = analyzeHover(model.getValue(), model.getOffsetAt(position), ctx)
      if (!hover) return null
      const start = model.getPositionAt(hover.start)
      const end = model.getPositionAt(hover.end)
      const contents = [{ value: `**${hover.title}**` }]
      if (hover.typeText) contents.push({ value: '```ts\n' + hover.typeText + '\n```' })
      if (hover.description) contents.push({ value: hover.description })
      return {
        range: {
          startLineNumber: start.lineNumber,
          startColumn: start.column,
          endLineNumber: end.lineNumber,
          endColumn: end.column,
        },
        contents,
      }
    },
  })
}

/** Recomputes inline markers for one expression model. */
export function validateExpressionModel(
  monaco: Monaco,
  model: editor.ITextModel,
  ctx: ExpressionEditorContext,
): void {
  const markers = analyzeIssues(model.getValue(), ctx).map((issue) => {
    const start = model.getPositionAt(issue.start)
    const end = model.getPositionAt(issue.end)
    return {
      severity: monaco.MarkerSeverity.Warning,
      message: issue.message,
      startLineNumber: start.lineNumber,
      startColumn: start.column,
      endLineNumber: end.lineNumber,
      endColumn: end.column,
    }
  })
  monaco.editor.setModelMarkers(model, MARKER_OWNER, markers)
}

/** Clears this language's markers (editor unmount). */
export function clearExpressionMarkers(monaco: Monaco, model: editor.ITextModel): void {
  monaco.editor.setModelMarkers(model, MARKER_OWNER, [])
}
