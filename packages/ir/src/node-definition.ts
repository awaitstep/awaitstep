export type FieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'select'
  | 'multiselect'
  | 'secret'
  | 'code'
  | 'json'
  | 'expression'
  | 'textarea'

/** The languages a text field can say it holds. */
export type FieldLanguage = 'sql'

export interface FieldValidation {
  min?: number
  max?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  format?: 'email' | 'url' | 'uuid' | 'date' | 'date-time' | 'duration'
}

export interface ConfigField {
  type: FieldType
  label: string
  description?: string
  required?: boolean
  default?: unknown
  placeholder?: string
  /** What a `textarea`'s text is written in: the editor highlights it. The value stays plain text. */
  language?: FieldLanguage
  options?: string[]
  /**
   * A control an installed web extension draws this field with, by name (its
   * `node.controls` slot). The value it holds is still of the field's `type`;
   * where no extension has the control, the field is drawn by its `type`.
   */
  control?: string
  envVarName?: string
  validation?: FieldValidation
}

export type OutputFieldType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null'

export interface OutputField {
  type: OutputFieldType
  description?: string
  nullable?: boolean
  items?: OutputField
  properties?: Record<string, OutputField>
}

export type Category =
  | 'Payments'
  | 'Email'
  | 'Messaging'
  | 'Database'
  | 'Storage'
  | 'AI'
  | 'Authentication'
  | 'HTTP'
  | 'Scheduling'
  | 'Notifications'
  | 'Data'
  | 'Utilities'
  | 'Control Flow'
  | 'Internal'
  | 'CRM'
  | 'Analytics'
  | 'Developer Tools'
  | 'Project Management'
  | 'E-commerce'
  | 'Customer Support'
  | 'Forms'

/** Provider id; providers register their own ids, so the shared type stays open. */
export type Provider = string

export interface RuntimeHints {
  defaultTimeout?: string
  defaultRetries?: number
  idempotent?: boolean
  streaming?: boolean
}

export interface NodeDefinition {
  id: string
  name: string
  version: string
  description: string
  category: Category
  tags?: string[]
  icon?: string
  docsUrl?: string
  author: string
  license: string

  configSchema: Record<string, ConfigField>
  outputSchema: Record<string, OutputField>
  providers: Provider[]

  dependencies?: Record<string, string>
  runtime?: RuntimeHints

  deprecated?: boolean
  deprecationMessage?: string
  replacedBy?: string
}
