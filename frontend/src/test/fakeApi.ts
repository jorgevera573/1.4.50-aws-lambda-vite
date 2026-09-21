/**
 * API de tareas simulada en memoria que sustituye a `fetch` en las pruebas.
 * Reproduce el contrato de la Lambda (códigos, cuerpos JSON y 204 sin cuerpo)
 * para que las pruebas ejerciten la interfaz como lo haría el backend real.
 */
import { vi } from 'vitest'

import type { Task } from '../api.ts'

export const API_URL = 'https://api.example.test'

interface Failure {
  method: string
  status: number
  message: string
}

interface Call {
  method: string
  path: string
  body: unknown
}

let sequence = 0

export function makeTask(overrides: Partial<Task> = {}): Task {
  sequence += 1
  const stamp = new Date(Date.UTC(2026, 0, 1, 12, 0, sequence)).toISOString()
  return {
    id: `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
    title: `Tarea ${String(sequence)}`,
    completed: false,
    createdAt: stamp,
    updatedAt: stamp,
    ...overrides,
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function notFound(): Response {
  return json(404, { error: { code: 'not_found', message: 'La tarea no existe.' } })
}

export function installFakeApi(initial: Task[] = []) {
  const store = new Map(initial.map((t) => [t.id, { ...t }]))
  const failures: Failure[] = []
  const calls: Call[] = []
  let gate: Promise<void> | null = null

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const method = (init?.method ?? 'GET').toUpperCase()
    const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    calls.push({ method, path: url.pathname, body })

    if (gate) await gate

    const failureIndex = failures.findIndex((f) => f.method === method)
    if (failureIndex >= 0) {
      const [failure] = failures.splice(failureIndex, 1)
      if (failure) {
        if (failure.status === 0) throw new TypeError('Failed to fetch')
        return json(failure.status, { error: { code: 'error', message: failure.message } })
      }
    }

    const match = /^\/tasks(?:\/([^/]+))?$/.exec(url.pathname)
    if (!match || url.origin !== API_URL) return json(404, { error: { message: 'Ruta' } })
    const id = match[1] ? decodeURIComponent(match[1]) : undefined
    const now = new Date().toISOString()

    if (!id && method === 'GET') {
      const tasks = [...store.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      return json(200, { tasks, count: tasks.length })
    }
    if (!id && method === 'POST') {
      const { title } = body as { title: string }
      const task = makeTask({ title, createdAt: now, updatedAt: now })
      store.set(task.id, task)
      return json(201, task)
    }
    const existing = id ? store.get(id) : undefined
    if (!id || !existing) return notFound()
    if (method === 'GET') return json(200, existing)
    if (method === 'PUT') {
      const updated = { ...existing, ...(body as Partial<Task>), updatedAt: now }
      store.set(id, updated)
      return json(200, updated)
    }
    if (method === 'DELETE') {
      store.delete(id)
      return new Response(null, { status: 204 })
    }
    return json(404, { error: { message: 'Ruta' } })
  })

  vi.stubGlobal('fetch', fetchMock)

  return {
    store,
    calls,
    /** La siguiente petición con ese método falla (status 0 = error de red). */
    failNext(method: string, status = 500, message = 'Error interno. Inténtalo de nuevo más tarde.') {
      failures.push({ method, status, message })
    },
    /** Retiene todas las respuestas hasta llamar a la función devuelta. */
    hold(): () => void {
      let release: () => void = () => undefined
      gate = new Promise<void>((resolve) => {
        release = () => {
          gate = null
          resolve()
        }
      })
      return release
    },
    callsTo(method: string) {
      return calls.filter((c) => c.method === method)
    },
  }
}
