// MCP server that federates App A (phones) + App B (experiences) as READ-ONLY
// tools AND resources. Models the AgentCore Gateway role locally.
//
// Tools  = queries/actions (search_phones, list_experiences).
// Resources = addressable entity info:
//   phones://catalog          -> the canonical phone list (the "set list")
//   catalog://phones/schema   -> data dictionary (field descriptions)
//   phone://{id}              -> a single phone entity (the "page entity")
import express from 'express'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'

const APP_A = process.env.APP_A_URL || 'http://app-a:8000'
const APP_B = process.env.APP_B_URL || 'http://app-b-api:8000'

const fetchPhones = async (q) => {
  const url = new URL('/api/phones', APP_A)
  if (q) url.searchParams.set('q', q)
  return (await (await fetch(url)).json()).items
}
const fetchExperiences = async () => (await (await fetch(new URL('/api/experiences', APP_B))).json()).items || []

const DATA_DICTIONARY = `# Phone catalog — data dictionary (App A)

A phone entity has these fields:
- **id**: canonical identifier. Use this as \`phoneId\` when referencing a phone in another app.
- **brand**: manufacturer (e.g. Apple, Samsung, Google).
- **model**: model name (e.g. "iPhone 15 Pro").
- **name**: "{brand} {model}" — the canonical display name shown to users.
- **releaseYear**: year the phone was released.
- **storageOptions**: list of available storage capacities (e.g. 128GB, 256GB).

App B experiences reference a phone by **phoneId** + **phoneName** copied from App A,
which is what keeps the captured data deterministic.`

// ---- tools ----
const TOOLS = [
  {
    name: 'search_phones',
    description:
      "Search App A's canonical phone catalog (read-only). Use when the user asks which phones exist, or to find a phone by brand/model.",
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Free text to filter by brand or model. Omit to list all.' } },
    },
  },
  {
    name: 'list_experiences',
    description:
      'List user-submitted phone experiences from App B (read-only). Optionally filter by the canonical phoneId from search_phones.',
    inputSchema: {
      type: 'object',
      properties: { phoneId: { type: 'integer', description: 'Canonical App A phone id to filter by. Omit for all.' } },
    },
  },
]

async function callTool(name, args) {
  if (name === 'search_phones') return await fetchPhones(args?.query)
  if (name === 'list_experiences') {
    let items = await fetchExperiences()
    if (args?.phoneId) items = items.filter((e) => e.phoneId === Number(args.phoneId))
    return items
  }
  throw new Error(`Unknown tool: ${name}`)
}

// ---- resources ----
const RESOURCES = [
  { uri: 'phones://catalog', name: 'Phone catalog', description: 'All canonical phones (App A) as a list.', mimeType: 'application/json' },
  { uri: 'catalog://phones/schema', name: 'Phone data dictionary', description: 'Field descriptions for phone entities.', mimeType: 'text/markdown' },
]
const RESOURCE_TEMPLATES = [
  { uriTemplate: 'phone://{id}', name: 'Phone entity', description: 'A single canonical phone by id (the page entity).', mimeType: 'application/json' },
]

async function readResource(uri) {
  if (uri === 'phones://catalog') {
    return { uri, mimeType: 'application/json', text: JSON.stringify(await fetchPhones()) }
  }
  if (uri === 'catalog://phones/schema') {
    return { uri, mimeType: 'text/markdown', text: DATA_DICTIONARY }
  }
  if (uri.startsWith('phone://')) {
    const id = Number(uri.slice('phone://'.length))
    const phone = (await fetchPhones()).find((p) => p.id === id)
    if (!phone) throw new Error(`No phone with id ${id}`)
    return { uri, mimeType: 'application/json', text: JSON.stringify(phone) }
  }
  throw new Error(`Unknown resource: ${uri}`)
}

function buildServer() {
  const server = new Server({ name: 'phone-interop', version: '1.0.0' }, { capabilities: { tools: {}, resources: {} } })

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }))
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    try {
      return { content: [{ type: 'text', text: JSON.stringify(await callTool(req.params.name, req.params.arguments || {})) }] }
    } catch (e) {
      return { content: [{ type: 'text', text: String(e?.message || e) }], isError: true }
    }
  })

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: RESOURCES }))
  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({ resourceTemplates: RESOURCE_TEMPLATES }))
  server.setRequestHandler(ReadResourceRequestSchema, async (req) => ({ contents: [await readResource(req.params.uri)] }))

  return server
}

const app = express()
app.use(express.json())

app.post('/mcp', async (req, res) => {
  const server = buildServer()
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  res.on('close', () => {
    transport.close()
    server.close()
  })
  await server.connect(transport)
  await transport.handleRequest(req, res, req.body)
})

app.get('/healthz', (_req, res) =>
  res.json({ ok: true, tools: TOOLS.map((t) => t.name), resources: RESOURCES.map((r) => r.uri), templates: RESOURCE_TEMPLATES.map((t) => t.uriTemplate) }),
)

const port = process.env.PORT || 3001
app.listen(port, () => console.log(`[mcp] listening on :${port} (App A=${APP_A}, App B=${APP_B})`))
