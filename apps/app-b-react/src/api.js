// App A = phone catalog (source of truth). App B = this app's experience API.
const APP_A = import.meta.env.VITE_APP_A_URL || 'http://localhost:8001'
const APP_B = import.meta.env.VITE_APP_B_URL || 'http://localhost:8002'
const AGENT = import.meta.env.VITE_AGENT_URL || 'http://localhost:8003'

export async function searchPhones(q) {
  const url = new URL('/api/phones', APP_A)
  if (q) url.searchParams.set('q', q)
  const res = await fetch(url)
  if (!res.ok) throw new Error('Could not load phones from App A')
  return (await res.json()).items
}

export async function listExperiences() {
  const res = await fetch(new URL('/api/experiences', APP_B))
  if (!res.ok) throw new Error('Could not load experiences')
  return (await res.json()).items
}

export async function createExperience(payload) {
  const res = await fetch(new URL('/api/experiences', APP_B), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((body.errors || ['Request failed']).join(' '))
  return body
}

// --- AI agent (MCP) ---
export async function agentHealth() {
  const res = await fetch(new URL('/healthz', AGENT))
  if (!res.ok) throw new Error('agent down')
  return res.json()
}

export async function chatAgent(message, history, entityContext) {
  const res = await fetch(new URL('/chat', AGENT), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history, entityContext }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || 'chat failed')
  return body
}
