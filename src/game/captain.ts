// CAPTAIN MODE — Ash's god authority for testing (standing directive 2026-07-02, law §2.14).
// Enable once with ?captain=<key> on any URL; it persists on the device. Grants: one-click
// skip through ENTIRE cutscenes (required gates included, defaults applied), beat tools in
// the settings sheet, and whatever future systems need a master key.
//
// The key ships via env config, never committed (law §2.14): dev builds accept 'thor';
// production only honors VITE_CAPTAIN_KEY, so a deploy WITHOUT that env var has no captain
// mode at all — students cannot stumble into it. Captain sessions log flagged dev:true and
// never sync state (net.ts), so god-mode play can't contaminate the study.

const KEY = 'blhs_captain'

function pass(): string | null {
  const env = (import.meta.env?.VITE_CAPTAIN_KEY as string | undefined) ?? null
  if (env) return env
  return import.meta.env?.DEV ? 'thor' : null
}

export function initCaptain() {
  const p = pass()
  const q = new URLSearchParams(location.search).get('captain')
  if (q === null) return
  if (p !== null && q === p) localStorage.setItem(KEY, '1')
  else localStorage.removeItem(KEY)   // any other value stands down: off/0/false/...
}

export function isCaptain(): boolean {
  return pass() !== null && localStorage.getItem(KEY) === '1'
}
