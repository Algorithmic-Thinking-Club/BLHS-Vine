import { describe, expect, it, vi } from 'vitest'
import { ROLE_BY_CONVENTION, declaredRole, roleByConvention, rolesOf } from './roles'

const a = (name: string, meta?: Record<string, unknown>) => ({ name, meta })

describe('which anchor fills a role', () => {
  it('falls back to the name a room uses by convention', () => {
    const m = rolesOf([a('chart_table'), a('hearth'), a('principal_desk')], 'maw')
    expect(m.get('plan')?.name).toBe('chart_table')
    expect(m.get('advisory')?.name).toBe('hearth')
    expect(m.get('principal')?.name).toBe('principal_desk')
  })

  it('lets a map name its own furniture', () => {
    const m = rolesOf([a('the_big_fire', { role: 'advisory' })], 'maw')
    expect(m.get('advisory')?.name).toBe('the_big_fire')
  })

  it('prefers what the map declares over the conventional name', () => {
    const m = rolesOf([a('hearth'), a('the_big_fire', { role: 'advisory' })], 'maw')
    expect(m.get('advisory')?.name).toBe('the_big_fire')
  })

  it('reads a declared role however the meta editor cased it', () => {
    const m = rolesOf([a('the_big_fire', { role: '  Advisory ' })], 'maw')
    expect(m.get('advisory')?.name).toBe('the_big_fire')
  })

  it('refuses a role nobody defined and says which anchor asked for it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const m = rolesOf([a('odd_one', { role: 'canteen' })], 'maw')
    expect(m.size).toBe(0)
    expect(warn.mock.calls[0][0]).toContain('odd_one')
    warn.mockRestore()
  })

  it('refuses a role that is not written as a word', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(declaredRole({ role: 7 }, 'odd_one', 'maw')).toBeNull()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('keeps the first of two anchors claiming one role and names both', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const m = rolesOf([a('one', { role: 'advisory' }), a('two', { role: 'advisory' })], 'maw')
    expect(m.get('advisory')?.name).toBe('one')
    expect(warn.mock.calls[0][0]).toContain('two')
    warn.mockRestore()
  })

  it('does not hand a claimed anchor a second role by convention', () => {
    const m = rolesOf([a('hearth', { role: 'plan' })], 'maw')
    expect(m.get('plan')?.name).toBe('hearth')
    expect(m.has('advisory')).toBe(false)
  })

  it('answers no role for a name the conventions do not know', () => {
    expect(roleByConvention('some_rock')).toBeNull()
    expect(roleByConvention(ROLE_BY_CONVENTION.plan)).toBe('plan')
  })
})
