import { useState } from 'react'
import { useGame } from '../world'
import { useNav } from '../SceneManager'

// One island visit = the core learning beat (Wiseman's loop): meet a host, do one short
// thing, walk away with a real fact + a result that feeds your GPA and drops the island onto
// your cape track. This is the SHELL; in Phase 2 the middle ("do one thing") becomes a real
// grape that ATC members build against a documented interface. The structure is here now.

type Beat = 'intro' | 'result'

const HOST: Record<string, { who: string; line: string }> = {
  commons: { who: 'Principal Panther', line: 'Welcome to the BLHS seas, explorer. Every island out here is a way to belong — go find yours.' },
  atc: { who: 'the ATC President', line: 'New to code? Perfect. Here you LEARN it by building real things — like this game.' },
  football: { who: 'the Head Coach', line: 'Friday nights start on Tuesday. Show up, work, and you can earn that captain’s armband.' },
  pac: { who: 'the Drama Director', line: 'Stage, band, or booth — the PAC has a spotlight for every kind of talent.' },
  culinary: { who: 'Chef', line: 'Knife skills, plating, competition. We cook for real, and we cook to win.' },
}

const THEME_BG: Record<string, string> = {
  commons: 'linear-gradient(160deg,#2f8e82,#1c5b58)',
  atc: 'linear-gradient(160deg,#2b3a55,#14202f)',
  football: 'linear-gradient(160deg,#3a6b34,#1d3a1c)',
  pac: 'linear-gradient(160deg,#5a3a6e,#2a1838)',
  culinary: 'linear-gradient(160deg,#b5642f,#5e2f14)',
}

export default function IslandScene() {
  const nav = useNav()
  const { run, islandById, completeIsland } = useGame()
  const island = run.selectedId ? islandById(run.selectedId) : undefined
  const [beat, setBeat] = useState<Beat>('intro')

  if (!island) {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', color: '#eee' }}>
        <button className="ui-btn" onClick={() => nav.go('overworld')}>Back to the sea</button>
      </div>
    )
  }

  const host = HOST[island.id] ?? { who: 'a friendly face', line: 'Glad you sailed over!' }
  const alreadyDone = run.islandStates[island.id] === 'completed'
  const [justJoined, setJustJoined] = useState(false)

  const doBeat = () => {
    const isNew = !alreadyDone
    if (isNew) completeIsland(island.id, 0.3)
    setJustJoined(isNew)
    setBeat('result')
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: THEME_BG[island.id] ?? '#234',
      display: 'grid', placeItems: 'center', fontFamily: 'Jersey 25, system-ui', color: '#1d1208',
    }}>
      <div style={{
        width: 'min(600px,92vw)', background: '#efe5cd', border: '4px solid #7a5638', borderRadius: 18,
        padding: '22px 26px', boxShadow: '0 8px 0 rgba(0,0,0,.35)',
      }}>
        <div style={{ fontSize: 13, letterSpacing: 1, color: '#2f8e82', fontWeight: 700 }}>{island.category.toUpperCase()}</div>
        <h1 style={{ margin: '2px 0 14px', fontSize: 30 }}>{island.theme} {island.name}</h1>

        {beat === 'intro' ? (
          <>
            <div style={{
              background: '#fffaf0', border: '2px solid #d8c9a6', borderRadius: 12, padding: '12px 14px', marginBottom: 16,
            }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{host.who}</div>
              <div style={{ fontStyle: 'italic' }}>“{host.line}”</div>
            </div>
            <p style={{ opacity: .85, marginTop: 0 }}>{island.blurb}</p>
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <button className="ui-btn" onClick={doBeat}>{alreadyDone ? 'Look around' : 'Give it a shot ▶'}</button>
              <button className="ui-btn" style={{ background: '#d9cdb2' }} onClick={() => nav.go('overworld')}>Back to the sea</button>
            </div>
          </>
        ) : (
          <>
            <div style={{
              background: '#fff7e6', border: '2px solid #c9a24a', borderRadius: 12, padding: '14px 16px', marginBottom: 16,
            }}>
              <div style={{ fontWeight: 700, color: '#8a6a1e', marginBottom: 4 }}>📘 You learned</div>
              <div>{island.fact}</div>
            </div>
            {justJoined && (
              <div style={{ fontWeight: 700, color: '#2f8e82', marginBottom: 12 }}>
                ✓ Joined {island.name} · +0.30 GPA · added to your cape
              </div>
            )}
            <button className="ui-btn" onClick={() => nav.go('overworld')}>Set sail back ⛵</button>
          </>
        )}
      </div>
    </div>
  )
}
