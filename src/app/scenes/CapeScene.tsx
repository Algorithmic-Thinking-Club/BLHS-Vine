import { ISLANDS, useGame } from '../world'
import { useNav } from '../SceneManager'

// The turn-in artifact (Wiseman's verification + the AP-Research outcome): the run ends with
// a graduation summary draping your earned islands/cords on Thor's cape. A real screen now;
// it gains the animated cape + printable diploma + the study export later.

export default function CapeScene() {
  const nav = useNav()
  const { run, reset } = useGame()
  const joined = ISLANDS.filter((i) => run.islandStates[i.id] === 'completed')

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'radial-gradient(120% 90% at 50% 0%, #2a6f73, #0c2b30)',
      display: 'grid', placeItems: 'center', fontFamily: 'Jersey 25, system-ui', color: '#1d1208',
    }}>
      <div style={{
        width: 'min(620px,93vw)', background: '#efe5cd', border: '5px solid #c9a24a', borderRadius: 20,
        padding: '26px 30px', boxShadow: '0 10px 0 rgba(0,0,0,.4)', textAlign: 'center',
      }}>
        <div style={{ fontSize: 14, letterSpacing: 2, color: '#8a6a1e', fontWeight: 700 }}>BONNEY LAKE HIGH SCHOOL</div>
        <h1 style={{ margin: '4px 0 2px', fontSize: 34 }}>🎓 {run.handle}&apos;s Cape</h1>
        <div style={{ opacity: .7, marginBottom: 16 }}>four years · {run.maxYears} advisory voyages</div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 28, marginBottom: 18 }}>
          <div><div style={{ fontSize: 30, fontWeight: 700, color: '#7a5638' }}>{run.gpa.toFixed(2)}</div><div style={{ opacity: .7 }}>GPA</div></div>
          <div><div style={{ fontSize: 30, fontWeight: 700, color: '#2f8e82' }}>{joined.length}</div><div style={{ opacity: .7 }}>islands joined</div></div>
        </div>

        <div style={{ textAlign: 'left', background: '#fffaf0', border: '2px solid #d8c9a6', borderRadius: 12, padding: '12px 16px', marginBottom: 18 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Cords & banners earned</div>
          {joined.length === 0
            ? <div style={{ opacity: .6 }}>You sailed past every island. Next run, drop anchor and join one!</div>
            : joined.map((i) => <div key={i.id} style={{ padding: '3px 0' }}>{i.theme} {i.name} <span style={{ opacity: .6 }}>— {i.category}</span></div>)}
        </div>

        <button className="ui-btn" onClick={() => { reset(); nav.go('title') }}>Sail again ⛵</button>
      </div>
    </div>
  )
}
