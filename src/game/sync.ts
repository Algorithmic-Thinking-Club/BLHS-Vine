// boot-time server sync, awaitable, so the title's Continue reads the pulled save
import { startStateSync, pullState } from './net'

let started: Promise<boolean> | null = null

export function startSync(): Promise<boolean> {
  if (!started) {
    startStateSync()
    started = pullState().catch(() => false)
  }
  return started
}

/** resolves when the boot pull finishes or maxMs passes, whichever is first */
export function syncReady(maxMs = 2500): Promise<void> {
  return Promise.race([
    startSync().then(() => undefined),
    new Promise<void>((r) => setTimeout(r, maxMs)),
  ])
}
