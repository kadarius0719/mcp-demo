import { useEffect, useMemo, useState } from 'react'
import { searchPhones, listExperiences, createExperience } from './api.js'
import ChatPanel from './ChatPanel.jsx'

function StarsInput({ value, onChange }) {
  return (
    <div className="stars-input">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          type="button"
          key={n}
          className={n <= value ? 'on' : ''}
          onClick={() => onChange(n)}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
        >
          {n <= value ? '★' : '☆'}
        </button>
      ))}
    </div>
  )
}

export default function App() {
  const [mode, setMode] = useState('catalog') // 'catalog' | 'freetext'
  const [phones, setPhones] = useState([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null) // { id, name }
  const [freeText, setFreeText] = useState('')
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [experiences, setExperiences] = useState([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    searchPhones('').then(setPhones).catch((e) => setError(e.message))
    listExperiences().then(setExperiences).catch(() => {})
  }, [])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? phones.filter((p) => p.name.toLowerCase().includes(q)) : phones
    return list.slice(0, 8)
  }, [query, phones])

  async function submit(e) {
    e.preventDefault()
    setError('')
    setNotice('')
    try {
      const payload =
        mode === 'catalog'
          ? { phoneId: selected?.id ?? 0, phoneName: selected?.name ?? '', rating, comment }
          : { phoneId: 0, phoneName: freeText, rating, comment } // legacy free text → no canonical id
      const created = await createExperience(payload)
      setExperiences((prev) => [created, ...prev])
      setNotice(`Saved “${created.phoneName}” (canonical phone #${created.phoneId}).`)
      setSelected(null)
      setQuery('')
      setFreeText('')
      setComment('')
      setRating(5)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="wrap">
      <div className="appbar">
        <div className="brand">
          <div className="logo">📱</div>
          <div>
            <h1>Phone Experiences</h1>
            <p>Captures user reviews · phone field constrained to App A’s catalog</p>
          </div>
        </div>
        <span className="badge">App B</span>
      </div>

      <p className="hero">
        Pick a phone from <strong>App A’s catalog</strong> so every review references a canonical phone — no more
        free-text guesses. Or ask the agent, which reads the same data over <strong>MCP</strong>.
      </p>

      <ChatPanel />

      <div className="grid">
        {/* capture form */}
        <div className="card">
          <div className="card-title">✍️ Share your experience</div>
          <div className="card-sub">The phone field is the deterministic field-population pattern in action.</div>

          <div className="seg">
            <button className={mode === 'catalog' ? 'on' : ''} onClick={() => setMode('catalog')}>
              ✓ From App A catalog
            </button>
            <button className={mode === 'freetext' ? 'on' : ''} onClick={() => setMode('freetext')}>
              Free text (legacy)
            </button>
          </div>

          <form onSubmit={submit}>
            <label className="field">Phone</label>
            {mode === 'catalog' ? (
              <div className="combo">
                <input
                  placeholder="Search phones from App A…"
                  value={selected ? selected.name : query}
                  onChange={(e) => {
                    setSelected(null)
                    setQuery(e.target.value)
                    setOpen(true)
                  }}
                  onFocus={() => setOpen(true)}
                  onBlur={() => setTimeout(() => setOpen(false), 120)}
                />
                {open && !selected && (
                  <ul className="menu">
                    {matches.map((p) => (
                      <li
                        key={p.id}
                        onMouseDown={() => {
                          setSelected({ id: p.id, name: p.name })
                          setOpen(false)
                        }}
                      >
                        <span>{p.name}</span>
                        <span className="yr">{p.releaseYear}</span>
                      </li>
                    ))}
                    {matches.length === 0 && <li className="muted">No match in App A’s catalog</li>}
                  </ul>
                )}
                {selected && (
                  <div className="banner ok">
                    ✓ canonical phone #{selected.id}: <strong>&nbsp;{selected.name}</strong>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <input placeholder="Type any phone name…" value={freeText} onChange={(e) => setFreeText(e.target.value)} />
                <div className="banner warn">
                  ⚠ Free text is non-deterministic — “iPhone 15”, “iphone15”, “Apple iPhone 15” all differ. App B rejects it.
                </div>
              </div>
            )}

            <label className="field">Rating</label>
            <StarsInput value={rating} onChange={setRating} />

            <label className="field">Comment</label>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="How was it?" />

            <button type="submit" className="btn-primary">
              Submit experience
            </button>
            {error && <div className="banner err">{error}</div>}
            {notice && <div className="banner ok">✓ {notice}</div>}
          </form>
        </div>

        {/* experiences */}
        <div className="card">
          <div className="card-title">🗂️ Recent experiences</div>
          <div className="card-sub">Stored with the canonical phone id + name from App A.</div>
          <ul className="exp-list">
            {experiences.map((x) => (
              <li className="exp" key={x.id}>
                <div className="exp-top">
                  <span className="exp-name">{x.phoneName}</span>
                  <span className="id">#{x.phoneId}</span>
                </div>
                <div className="stars">{'★'.repeat(x.rating)}<span className="muted">{'★'.repeat(5 - x.rating)}</span></div>
                {x.comment && <div className="comment">{x.comment}</div>}
              </li>
            ))}
            {experiences.length === 0 && <li className="empty">No experiences yet — add one.</li>}
          </ul>
        </div>
      </div>

      <footer>
        Phone list comes from App A’s read-only <code>/api/phones</code> — the deterministic field-population pattern.
        <br />
        The agent above reads the same data over MCP (tools + entity resources). One exposure, two consumers.
      </footer>
    </div>
  )
}
