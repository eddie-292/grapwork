import Fastify from 'fastify'
import cors from '@fastify/cors'
import dotenv from 'dotenv'

dotenv.config()

const fastify = Fastify({
  logger: true,
})

await fastify.register(cors, {
  origin: true,
})

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787

fastify.get('/api/health', async () => ({ ok: true }))

fastify.post('/api/chat', async (request, reply) => {
  const { messages = [], model = 'gpt-4o-mini' } = request.body || {}

  if (!process.env.OPENAI_API_KEY) {
    reply.code(500)
    return { error: 'OPENAI_API_KEY not set on server' }
  }

  const controller = new AbortController()
  request.raw.on('close', () => controller.abort())

  const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      stream: true,
    }),
    signal: controller.signal,
  })

  reply.header('Content-Type', 'text/event-stream')
  reply.header('Cache-Control', 'no-cache')
  reply.header('Connection', 'keep-alive')

  if (!upstream.ok || !upstream.body) {
    reply.code(upstream.status)
    const text = await upstream.text()
    reply.send(`data: ${JSON.stringify({ error: text })}\n\n`)
    return
  }

  for await (const chunk of upstream.body) {
    reply.raw.write(chunk)
  }
  reply.raw.end()
})

try {
  await fastify.listen({ port: PORT, host: '0.0.0.0' })
} catch (err) {
  fastify.log.error(err)
  process.exit(1)
}
