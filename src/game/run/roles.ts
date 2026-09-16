/* what a place on a map is FOR, so the game can ask a room for the fire rather than for "hearth" */

/* this file imports nothing on purpose, so the map reader can read it without a cycle */

export type Role = 'principal' | 'plan' | 'advisory' | 'counselor' | 'wall' | 'outfitter' | 'exit'

export const ROLES: Role[] = ['principal', 'plan', 'advisory', 'counselor', 'wall', 'outfitter', 'exit']

export const isRole = (v: unknown): v is Role =>
  typeof v === 'string' && (ROLES as readonly string[]).includes(v)

/* the anchor name a room uses for a role when the room does not say */
export const ROLE_BY_CONVENTION: Record<Role, string> = {
  principal: 'principal_desk',
  plan: 'chart_table',
  advisory: 'hearth',
  counselor: 'counselor',
  wall: 'trophy_wall',
  outfitter: 'outfitter',
  exit: 'maw_entrance',
}

const BY_NAME = new Map<string, Role>(ROLES.map((r) => [ROLE_BY_CONVENTION[r], r]))

/* the role this anchor name fills by convention, or null */
export const roleByConvention = (name: string): Role | null => BY_NAME.get(name) ?? null

/* the role an anchor declares in its meta bag, or null */
export function declaredRole(meta: Record<string, unknown> | undefined, name: string, mapId?: string): Role | null {
  const raw = meta?.role
  if (raw === undefined || raw === null) return null
  /* the meta editor stores every value as text, so anything else is an author mistake */
  if (typeof raw !== 'string') {
    console.warn(`[roles] ${mapId ?? 'map'}: "${name}" declares a role that is not a word, so it claims nothing`)
    return null
  }
  const word = raw.trim().toLowerCase()
  if (!word) return null
  if (!isRole(word)) {
    console.warn(`[roles] ${mapId ?? 'map'}: "${name}" declares the role "${raw}", which is not one of ${ROLES.join(', ')}`)
    return null
  }
  return word
}

export type RoleAnchor = { name: string; meta?: Record<string, unknown> }

/* which anchor fills each role on this map, a declared role first and the conventional name after */
export function rolesOf<A extends RoleAnchor>(anchors: readonly A[], mapId?: string): Map<Role, A> {
  const out = new Map<Role, A>()
  const claimed = new Set<string>()
  for (const a of anchors) {
    const role = declaredRole(a.meta, a.name, mapId)
    if (!role) continue
    const had = out.get(role)
    if (had) {
      console.warn(`[roles] ${mapId ?? 'map'}: "${had.name}" and "${a.name}" both claim the role "${role}", so the first one keeps it`)
      continue
    }
    out.set(role, a)
    claimed.add(a.name)
  }
  for (const a of anchors) {
    if (claimed.has(a.name)) continue
    const role = roleByConvention(a.name)
    if (!role || out.has(role)) continue
    out.set(role, a)
    claimed.add(a.name)
  }
  return out
}
