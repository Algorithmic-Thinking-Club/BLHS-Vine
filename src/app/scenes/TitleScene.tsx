import { useState } from 'react'
import { useNav } from '../SceneManager'
import Overworld from '../../overworld/Overworld'

// The title is a PLACE, not a logo on flat color: the live ocean plays behind it with a
// carved-wood signboard wordmark and a single ceremonial "Set Sail" button. A returning
// player (save exists) sees "Continue" instead. (Hidden title toys + beacon click: later.)
export default function TitleScene() {
  const nav = useNav()
  const [hasSave] = useState(false) // wired to the save system in the save/resume pass
  const [signOk, setSignOk] = useState(true)

  return (
    <div className="title-root">
      <Overworld />
      <div className="title-veil" />
      <div className="title-content">
        <div className="title-wordmark">
          <div className="title-paper" />
          {signOk && (
            <img
              className="title-sign pix"
              src="/art/ui/title-signboard.png"
              alt=""
              onError={() => setSignOk(false)}
            />
          )}
          <div className="title-wordtext">
            <span className="title-line1">BLHS</span>
            <span className="title-line2">Island Explorer</span>
          </div>
        </div>

        <div className="title-actions">
          <button className="ui-btn" onClick={() => nav.go(hasSave ? 'overworld' : 'intro')}>
            {hasSave ? 'Continue' : 'Set Sail'}
          </button>
        </div>

        <button className="title-gear" aria-label="Settings" title="Settings">⚙</button>
        <div className="title-credit">made by the Algorithmic Thinking Club</div>
      </div>
    </div>
  )
}
