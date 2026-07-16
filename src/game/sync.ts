// Boot-time server sync, awaitable (§7.7). main.tsx kicks it off; BootScene awaits it (with
// a short cap) so the title's Continue routing reads the PULLED save, not a stale pre-pull
// snapshot — the boot splash was already ~1.6s, so a fast pull costs nothing and a slow or
// offline one never blocks the game.
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
