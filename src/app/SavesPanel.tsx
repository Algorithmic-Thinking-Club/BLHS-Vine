import { useState } from 'react'
import { activateSave, deleteSave, listSaves, renameSave, type SaveGame } from '../game/save'
import './saves.css'

// THE CREW ROSTER (GAME-DESIGN §7.7 evolved) — the device's local explorers. Each row is one
// participant run; clicking opens continue / rename / delete. This is the shared-Chromebook
// convenience: a returning student picks themselves instead of re-typing the class code. Not
// save slots — every entry maps to a participant, so the study stays one-student-one-run.

const when = (t: number) => {
  const d = new Date(t)
  const day = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return `${day}, ${time}`
}

export function SavesPanel({ onClose, onContinue }: { onClose: () => void; onContinue: (s: SaveGame) => void }) {
  const [, bump] = useState(0)
  const [openId, setOpenId] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [rename, setRename] = useState('')
  const saves = listSaves()

  const doContinue = (s: SaveGame) => { activateSave(s.id); onContinue(s) }
  const doDelete = (s: SaveGame) => { deleteSave(s.id); setOpenId(null); bump((v) => v + 1) }
  const startRename = (s: SaveGame) => { setRenaming(s.id); setRename(s.handle) }
  const commitRename = (s: SaveGame) => {
    if (rename.trim()) renameSave(s.id, rename.trim())
    setRenaming(null); setOpenId(null); bump((v) => v + 1)
  }

  return (
    <div className="sv-veil" onClick={onClose}>
      <div className="sv-panel" onClick={(e) => e.stopPropagation()}>
       <div className="sv-inner">
        <div className="sv-title">Your voyages</div>
        <div className="sv-list">
          {saves.map((s) => (
            <div key={s.id} className="sv-row-wrap">
              <button className="sv-row" onClick={() => setOpenId(openId === s.id ? null : s.id)}>
                <span className="sv-handle">{s.handle || 'Unnamed Panther'}</span>
                <span className="sv-meta">
                  {s.introDone ? `Year ${s.year}, ${s.season}` : 'Just ashore'}
                  {s.classCode ? ` · ${s.classCode}` : ''}
                </span>
                <span className="sv-date">{when(s.savedAt)}</span>
              </button>
              {openId === s.id && (
                <div className="sv-actions">
                  {renaming === s.id ? (
                    <div className="sv-renamerow">
                      <input className="sv-renameinput" value={rename} maxLength={14} autoFocus
                        onChange={(e) => setRename(e.target.value.replace(/[^a-zA-Z0-9 '&-]/g, ''))}
                        onKeyDown={(e) => { if (e.key === 'Enter') commitRename(s) }} />
                      <button className="sv-btn" onClick={() => commitRename(s)}>Save name</button>
                    </div>
                  ) : (
                    <>
                      <button className="sv-btn sv-go" onClick={() => doContinue(s)}>Continue</button>
                      <button className="sv-btn" onClick={() => startRename(s)}>Rename</button>
                      <button className="sv-btn sv-del" onClick={() => doDelete(s)}>Delete</button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
          {!saves.length && <div className="sv-empty">No voyages yet. Set sail to begin one.</div>}
        </div>
        <button className="sv-close" onClick={onClose}>Back</button>
       </div>
      </div>
    </div>
  )
}
