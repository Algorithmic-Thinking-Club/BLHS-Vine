// CAPTAIN MODE — Ash's god authority for testing (standing directive 2026-07-02).
// Enable once with ?captain=thor on any URL; it persists on the device. Grants: one-click
// skip through ENTIRE cutscenes (required gates included, defaults applied), beat tools in
// the settings sheet, and whatever future systems need a master key. Deployment builds gate
// this behind an env flag so students never see it.

const KEY = 'blhs_captain'
const PASS = 'thor'

export function initCaptain() {
  const q = new URLSearchParams(location.search).get('captain')
  if (q === PASS) localStorage.setItem(KEY, '1')
  if (q === 'off') localStorage.removeItem(KEY)
}

export function isCaptain(): boolean {
  return localStorage.getItem(KEY) === '1'
}
