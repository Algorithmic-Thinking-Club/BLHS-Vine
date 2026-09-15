/* who answers an anchor: a door first, then the island's own python handler */

export type AnchorOwner = {
  /* the key to hand `GrapeSession.call`, already in the shape the worker wants */
  handler: string
}

/** who answers to this anchor name, which is the loaded island or nobody */
export function ownerOf(name: string, handlers: readonly string[] = []): AnchorOwner | null {
  const handler = `talk:${name}`
  return handlers.includes(handler) ? { handler } : null
}

/** what a player reads when standing near an anchor, named by whoever placed it */
export const labelFor = (label: string | undefined, name: string): string => label || name
