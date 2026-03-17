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
    if (data instanceof Error) {
      return { name: data.name, message: data.message, stack: data.stack }
    }
    if (typeof data === 'object' && !Array.isArray(data)) {
      return data as Record<string, unknown>
    }
    return { value: data }
  }

  #log(level: LogLevel, message: string, data?: unknown) {
    const logMessage = {
      dt: new Date().toISOString(),
      level,
      context: this.#context,
      message,
      ...(this.#serializeData(data) ?? {}),
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
}

export type { Logger }

export function createLogger(context: string, betterStack?: BetterStackConfig): Logger {
  return new Logger(context, betterStack)
}
