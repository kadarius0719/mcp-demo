// Central agent: connects to the MCP server and runs a tool-use loop using a
// LOCAL model (Ollama) so the demo needs no API key.
//
// In AWS this swaps to Bedrock + Claude — the loop is the same shape:
//   list MCP tools -> model picks a tool -> call MCP -> feed result back -> answer.
// Kept deliberately simple here.
import express from 'express'
import cors from 'cors'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const MCP_URL = process.env.MCP_URL || 'http://mcp:3001/mcp'
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://ollama:11434'
const MODEL = process.env.MODEL || 'llama3.2:3b'

const SYSTEM = `You answer questions about a phone catalog (App A) and user experiences with phones (App B).
Use the read-only tools: search_phones lists/finds canonical phones; list_experiences returns user experiences (optionally for a phoneId from search_phones).
Always call a tool to get data before answering; never invent phones or experiences the tools did not return. Be concise.`

let mcp = null
let mcpTools = []
let mcpResources = []
let dataDictionary = ''

async function connectMcp() {
  const client = new Client({ name: 'query-er-agent', version: '1.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(MCP_URL)))
  mcp = client
  mcpTools = (await client.listTools()).tools
  try {
    mcpResources = (await client.listResources()).resources || []
  } catch {
    mcpResources = []
  }
  try {
    const r = await client.readResource({ uri: 'catalog://phones/schema' })
    dataDictionary = (r.contents || []).map((c) => c.text || '').join('\n')
  } catch {
    dataDictionary = ''
  }
  console.log(
    `[agent] connected to MCP — ${mcpTools.length} tools (${mcpTools.map((t) => t.name).join(', ')}), ` +
      `${mcpResources.length} resources${dataDictionary ? ', data dictionary loaded' : ''}`,
  )
}

// MCP tool inputSchema (JSON Schema) -> Ollama function-tool definition.
const toolDefs = () =>
  mcpTools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.inputSchema } }))

// Base system prompt + data dictionary + (optional) page-entity context.
async function buildSystem(entityContext) {
  let system = SYSTEM
  if (dataDictionary) system += `\n\n${dataDictionary}`
  if (entityContext?.type === 'phone' && entityContext.id) {
    try {
      const r = await mcp.readResource({ uri: `phone://${entityContext.id}` })
      const text = (r.contents || []).map((c) => c.text || '').join('\n')
      if (text) system += `\n\nThe user is currently viewing this phone (page entity):\n${text}`
    } catch {
      /* entity not found — ignore */
    }
  }
  return system
}

async function ollamaChat(messages, tools) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, messages, tools, stream: false }),
  })
  if (!res.ok) throw new Error(`ollama ${res.status}: ${(await res.text()).slice(0, 300)}`)
  return res.json()
}

async function runChat(message, history = [], entityContext = null) {
  const system = await buildSystem(entityContext)
  const messages = [{ role: 'system', content: system }, ...history, { role: 'user', content: message }]
  const tools = toolDefs()
  const toolCalls = []

  for (let i = 0; i < 6; i++) {
    const data = await ollamaChat(messages, tools)
    const msg = data.message || {}
    messages.push(msg)

    const calls = msg.tool_calls || []
    if (calls.length) {
      for (const tc of calls) {
        const name = tc.function?.name
        const args = tc.function?.arguments || {}
        toolCalls.push({ name, input: args })
        let out
        try {
          const r = await mcp.callTool({ name, arguments: args })
          out = (r.content || []).map((c) => c.text || '').join('\n')
        } catch (e) {
          out = `error: ${e?.message || e}`
        }
        messages.push({ role: 'tool', name, content: out })
      }
      continue
    }
    return { reply: msg.content || '', toolCalls, model: MODEL }
  }
  return { reply: 'Stopped after too many tool iterations.', toolCalls, model: MODEL }
}

async function ollamaReachable() {
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2000) })
    return r.ok
  } catch {
    return false
  }
}

const app = express()
app.use(cors())
app.use(express.json())

app.get('/healthz', async (_req, res) =>
  res.json({
    ok: true,
    provider: 'ollama',
    model: MODEL,
    ollama: await ollamaReachable(),
    tools: mcpTools.map((t) => t.name),
    resources: mcpResources.map((r) => r.uri),
  }),
)
app.get('/tools', (_req, res) => res.json({ tools: mcpTools }))
app.get('/resources', (_req, res) => res.json({ resources: mcpResources }))
app.post('/chat', async (req, res) => {
  try {
    const { message, history, entityContext } = req.body || {}
    if (!message) return res.status(400).json({ error: 'message is required' })
    res.json(await runChat(message, Array.isArray(history) ? history : [], entityContext || null))
  } catch (e) {
    console.error('[agent] chat error', e)
    res.status(500).json({ error: String(e?.message || e) })
  }
})

const port = process.env.PORT || 3002
;(async () => {
  for (let i = 0; i < 30; i++) {
    try {
      await connectMcp()
      break
    } catch (e) {
      console.log(`[agent] waiting for MCP server… (${e?.message || e})`)
      await new Promise((r) => setTimeout(r, 2000))
    }
  }
  app.listen(port, () => console.log(`[agent] listening on :${port} — provider=ollama model=${MODEL} ollama=${OLLAMA_URL}`))
})()
