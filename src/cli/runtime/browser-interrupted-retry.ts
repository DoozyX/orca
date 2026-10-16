import type { RuntimeClient } from './client'
import { RuntimeConnectionClosedError } from './transport'
import { RuntimeClientError } from './types'

/** A browser command lost its answer while the runtime stayed reachable: the page stalled. */
export class BrowserCommandInterruptedError extends RuntimeClientError {
  constructor(method: string, page: string | undefined) {
    super(
      'browser_command_interrupted',
      `${method} on ${page ? `page ${page}` : 'the active page'} lost its connection before answering, but the Orca runtime is reachable. The page may be hung; reload it or open a new tab.`
    )
  }
}

type BrowserCommand = {
  method: string
  page: string | undefined
  /** Only commands that leave the page unchanged may be sent twice. */
  readOnly: boolean
}

/**
 * Tells a stalled page from a dead runtime after the socket closes early (#28): if `status.get`
 * still answers, a read-only command retries once and anything else fails `browser_command_interrupted`.
 */
export async function withBrowserInterruptRecovery<TResult>(
  client: Pick<RuntimeClient, 'call'>,
  command: BrowserCommand,
  send: () => Promise<TResult>
): Promise<TResult> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await send()
    } catch (error) {
      if (!(error instanceof RuntimeConnectionClosedError) || !(await isRuntimeReachable(client))) {
        throw error
      }
      if (!command.readOnly || attempt > 1) {
        throw new BrowserCommandInterruptedError(command.method, command.page)
      }
    }
  }
}

async function isRuntimeReachable(client: Pick<RuntimeClient, 'call'>): Promise<boolean> {
  try {
    await client.call('status.get')
    return true
  } catch {
    return false
  }
}
