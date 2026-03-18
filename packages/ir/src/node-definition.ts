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

export interface FieldValidation {
  min?: number
  max?: number
  minLength?: number
  maxLength?: number
  pattern?: string
  format?: 'email' | 'url' | 'uuid' | 'date' | 'date-time'
}

export interface ConfigField {
  type: FieldType
  label: string
  description?: string
  required?: boolean
  default?: unknown
  placeholder?: string
  options?: string[]
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

export type Provider = 'cloudflare' | 'inngest' | 'temporal' | 'stepfunctions'

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

  runtime?: RuntimeHints

  deprecated?: boolean
  deprecationMessage?: string
  replacedBy?: string
}
