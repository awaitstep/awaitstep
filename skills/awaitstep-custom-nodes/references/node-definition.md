# The custom node definition

`node.json` is a `NodeDefinition`. The Library schema is strict: an unknown key
is refused. `author`, `license` and `providers` have defaults, so a small node
can omit them.

## The object

```json
{
  "id": "weather",
  "name": "Weather",
  "version": "1.0.0",
  "description": "Read current weather for a city",
  "category": "Data",
  "tags": ["weather"],
  "docsUrl": "https://api.example.com/docs",
  "author": "awaitstep",
  "license": "Apache-2.0",
  "configSchema": {},
  "outputSchema": {},
  "providers": ["cloudflare"],
  "dependencies": { "zod": "^4.0.0" },
  "runtime": { "defaultRetries": 2, "defaultTimeout": "30 seconds" }
}
```

| Field                                            | Required | Rules                                                                        |
| ------------------------------------------------ | -------- | ---------------------------------------------------------------------------- |
| `id`                                             | yes      | `^[a-z][a-z0-9_-]*$`; keep it the slug (the deploy forces `custom:<itemId>`) |
| `name`                                           | yes      | Palette label                                                                |
| `version`                                        | yes      | Must equal the version folder (`1.0.0`)                                      |
| `description`                                    | yes      | At most 120 characters                                                       |
| `category`                                       | yes      | One of the palette categories                                                |
| `tags`                                           | no       | Search tags                                                                  |
| `icon`                                           | no       | Ignored for Library nodes; the item's `icon.svg` is served                   |
| `docsUrl`                                        | no       | Must be a URL                                                                |
| `author`                                         | no       | Defaults to `custom`                                                         |
| `license`                                        | no       | Defaults to `UNLICENSED`                                                     |
| `configSchema`                                   | yes      | Config fields, below                                                         |
| `outputSchema`                                   | yes      | Output fields, below                                                         |
| `providers`                                      | no       | Defaults to `["cloudflare"]`; name only platforms with a template            |
| `dependencies`                                   | no       | npm package name → version range; the template may import these              |
| `runtime`                                        | no       | `defaultRetries`, `defaultTimeout`, `idempotent`, `streaming`                |
| `deprecated`, `deprecationMessage`, `replacedBy` | no       | Marks an older node                                                          |

Categories: `Payments`, `Email`, `Messaging`, `Database`, `Storage`, `AI`,
`Authentication`, `HTTP`, `Scheduling`, `Notifications`, `Data`, `Utilities`,
`Control Flow`, `Internal`, `CRM`, `Analytics`, `Developer Tools`,
`Project Management`, `E-commerce`, `Customer Support`, `Forms`.

## Config fields

Each key of `configSchema` is a field:

```json
{
  "action": {
    "type": "select",
    "label": "Action",
    "required": true,
    "options": ["Current weather", "Forecast"],
    "default": "Current weather"
  },
  "city": {
    "type": "string",
    "label": "City",
    "required": true,
    "description": "City name",
    "placeholder": "Amsterdam",
    "validation": { "minLength": 1, "maxLength": 80 }
  },
  "apiKey": {
    "type": "secret",
    "label": "API key",
    "required": true,
    "envVarName": "WEATHER_API_KEY"
  }
}
```

| Type          | UI control        | Notes                                         |
| ------------- | ----------------- | --------------------------------------------- |
| `string`      | Text input        |                                               |
| `textarea`    | Multi-line text   |                                               |
| `number`      | Numeric input     | `validation.min` / `max`                      |
| `boolean`     | Toggle            |                                               |
| `select`      | Dropdown          | `options` required, non-empty                 |
| `multiselect` | Multi-select      | `options` required, non-empty                 |
| `secret`      | Masked input      | `envVarName` required; reads `ctx.env.<NAME>` |
| `code`        | Monaco TypeScript | `ctx.config` receives the text                |
| `json`        | Monaco JSON       |                                               |
| `expression`  | Expression picker | `{{…}}` resolved before the template          |

`validation` is `{ min, max, minLength, maxLength, pattern, format }`, with
`format` one of `email`, `url`, `uuid`, `date`, `date-time`, `duration`.

The schema does not reject a `select`/`multiselect` without `options`, nor a
`secret` without `envVarName`. The editor renders no choices for the first and
cannot bind the second, so treat both as required.

`inline`, `export` and `exportAs` are reserved and may not be config fields:
codegen uses them for placement and response export.

## Output fields

```json
{
  "temperature": { "type": "number", "description": "Degrees Celsius" },
  "data": { "type": "object", "description": "Full provider response" },
  "message": { "type": "string", "nullable": true },
  "items": {
    "type": "array",
    "items": { "type": "object", "properties": { "id": { "type": "string" } } }
  }
}
```

Types: `string`, `number`, `boolean`, `object`, `array`, `null`. `items` and
`properties` are recursive; mark a field `nullable: true` when it can be
missing. Downstream expressions and `inputs` see these fields.

List actions return the provider's full response under `data` rather than a bare
array, so a later field addition is not a breaking output change.

## Dependencies

```json
{ "dependencies": { "zod": "^4.0.0" } }
```

- Names and ranges are validated (npm registry ranges only).
- The deploy installs them with the consumer's; a conflict names both sides.
- Import only what is declared.

## Runtime hints

```json
{ "runtime": { "defaultRetries": 2, "defaultTimeout": "30 seconds", "idempotent": true } }
```

A placed node with no explicit retry/timeout config uses these. Keep
`defaultRetries` at 2 unless the integration needs otherwise.

## Validation

`POST /library/items/:id/check` parses the manifest, checks the version folder,
the paths, the file sizes and the imports. Publishing applies the same rules.
An unknown key is an error, not a warning.
