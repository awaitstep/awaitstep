import { redactText, redactValue } from './log-redaction.js'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface BetterStackConfig {
  sourceToken: string
  endpoint: string
}

class Logger {
  #context: string
  #betterStack?: { endpoint: string; headers: Record<string, string> }

  constructor(context: string, betterStack?: BetterStackConfig) {
    this.#context = context
    if (betterStack) {
      this.#betterStack = {
        endpoint: betterStack.endpoint,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${betterStack.sourceToken}`,
        },
      }
    }
  }

  #serializeData(data: unknown): Record<string, unknown> | undefined {
    if (data == null) return undefined
    const redacted = redactValue(data)
    // An error goes under `error`, so its own message never replaces the line's.
    if (data instanceof Error) return { error: redacted }
    if (typeof redacted === 'object' && redacted !== null && !Array.isArray(redacted)) {
      return redacted as Record<string, unknown>
    }
    return { value: redacted }
  }

  /**
   * Every line is redacted (account ids, credentials, email addresses) before
   * it reaches the console or Better Stack; `asIs` is only for the links
   * `LOG_EMAIL_LINKS` asks to see. The line's own fields come last, so data
   * named `message` or `level` can't replace them.
   */
  #log(level: LogLevel, message: string, data?: unknown, asIs = false) {
    const logMessage = {
      ...(this.#serializeData(data) ?? {}),
      dt: new Date().toISOString(),
      level,
      context: this.#context,
      message: asIs ? message : redactText(message),
    }

    if (this.#betterStack) {
      fetch(this.#betterStack.endpoint, {
        method: 'POST',
        headers: this.#betterStack.headers,
        body: JSON.stringify(logMessage),
      }).catch(() => {})
    }

    switch (level) {
      case 'debug':
        console.debug(logMessage)
        break
      case 'info':
        console.info(logMessage)
        break
      case 'warn':
        console.warn(logMessage)
        break
      case 'error':
        console.error(logMessage)
        break
    }
  }

  debug(message: string, data?: unknown) {
    this.#log('debug', message, data)
  }

  info(message: string, data?: unknown) {
    this.#log('info', message, data)
  }

  warn(message: string, data?: unknown) {
    this.#log('warn', message, data)
  }

  error(message: string, data?: unknown) {
    this.#log('error', message, data)
  }

  /**
   * A warning logged without redaction. Only for a sign-in or invitation link
   * that `LOG_EMAIL_LINKS=1` asks to print, on a dev or QA stack: showing the
   * link is that line's job.
   */
  warnAsIs(message: string) {
    this.#log('warn', message, undefined, true)
  }
}

export type { Logger }

export function createLogger(context: string, betterStack?: BetterStackConfig): Logger {
  return new Logger(context, betterStack)
}
