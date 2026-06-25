import { useEffect, useRef, useState } from 'react'
import { chatAgent, agentHealth, searchPhones } from './api.js'

const EXAMPLES = [
  'Which Apple phones do we have?',
  'What do people think of the iPhone 15 Pro?',
  'Which phone has the best ratings?',
]

export default function ChatPanel() {
  const [messages, setMessages] = useState([]) // { role, text, tools?, error? }
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(null)
  const [phones, setPhones] = useState([])
  const [viewing, setViewing] = useState('') // phone id as string; '' = none
  const endRef = useRef(null)

  useEffect(() => {
    agentHealth().then(setStatus).catch(() => setStatus({ down: true }))
    searchPhones('').then(setPhones).catch(() => {})
  }, [])
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy])

  async function send(e) {
    e.preventDefault()
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    const history = messages.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.text }))
    setMessages((prev) => [...prev, { role: 'user', text }])
    setBusy(true)
    try {
      const entityContext = viewing ? { type: 'phone', id: Number(viewing) } : null
      const res = await chatAgent(text, history, entityContext)
      setMessages((prev) => [...prev, { role: 'assistant', text: res.reply, tools: res.toolCalls }])
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'assistant', text: `Error: ${err.message}`, error: true }])
    } finally {
      setBusy(false)
    }
  }

  const online = status && !status.down && status.ollama
  const statusText = status?.down
    ? 'agent offline'
    : status
      ? `${status.model}${status.ollama ? '' : ' · loading…'}`
      : 'connecting…'

  return (
    <div className="card chat">
      <div className="chat-head">
        <div className="card-title">🤖 Ask the agent</div>
        <span className="status-pill">
          <span className={`dot ${online ? '' : 'off'}`} />
          {statusText}
        </span>
      </div>

      <div className="viewing-row">
        <span>📄 Viewing (page entity):</span>
        <select value={viewing} onChange={(e) => setViewing(e.target.value)}>
          <option value="">— none —</option>
          {phones.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="chat-log">
        {messages.length === 0 && (
          <div className="examples">
            <div className="lead">Natural-language questions answered via MCP tools + entity resources:</div>
            {EXAMPLES.map((q, i) => (
              <button type="button" key={i} className="chip" onClick={() => setInput(q)}>
                {q}
              </button>
            ))}
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i}>
            <div className={`row ${m.role}`}>
              <div className={`avatar ${m.role === 'user' ? 'you' : 'bot'}`}>{m.role === 'user' ? '🧑' : '🤖'}</div>
              <div className={`bubble ${m.error ? 'err' : ''}`}>{m.text}</div>
            </div>
            {m.tools && m.tools.length > 0 && (
              <div className="tools">
                {m.tools.map((t, j) => (
                  <span className="tool-chip" key={j}>
                    🔧 {t.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}

        {busy && (
          <div className="row assistant">
            <div className="avatar bot">🤖</div>
            <div className="bubble">
              <span className="typing">
                <span />
                <span />
                <span />
              </span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} className="composer">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about phones or experiences…" />
        <button type="submit" disabled={busy}>
          Send
        </button>
      </form>
    </div>
  )
}
