/** Cliente de la API de tareas (API Gateway → Lambda → DynamoDB). */

export interface Task {
  id: string
  title: string
  completed: boolean
  createdAt: string
  updatedAt: string
}

export type TaskChanges = Partial<Pick<Task, 'title' | 'completed'>>

/** Debe coincidir con MAX_TITLE_LENGTH de lambda/handler.py. */
export const MAX_TITLE_LENGTH = 200

const REQUEST_TIMEOUT_MS = 15_000

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** URL base leída de VITE_API_URL en cada llamada (sin barra final). */
export function getApiBaseUrl(): string | null {
  const raw: unknown = import.meta.env.VITE_API_URL
  if (typeof raw !== 'string' || raw.trim() === '') return null
  return raw.trim().replace(/\/+$/, '')
}

function errorMessageFrom(data: unknown): string | null {
  if (typeof data !== 'object' || data === null || !('error' in data)) return null
  const { error } = data
  if (typeof error !== 'object' || error === null || !('message' in error)) return null
  return typeof error.message === 'string' ? error.message : null
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const baseUrl = getApiBaseUrl()
  if (baseUrl === null) {
    throw new ApiError(0, 'La aplicación no está configurada: falta la variable VITE_API_URL.')
  }

  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: init.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch {
    throw new ApiError(0, 'No se pudo conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.')
  }

  if (response.status === 204) return undefined as T

  let data: unknown = null
  try {
    data = await response.json()
  } catch {
    // Respuesta sin JSON válido (p. ej. un error de la pasarela).
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw new ApiError(429, 'Demasiadas peticiones. Espera unos segundos e inténtalo de nuevo.')
    }
    throw new ApiError(
      response.status,
      errorMessageFrom(data) ?? `El servidor respondió con un error (${String(response.status)}).`,
    )
  }
  return data as T
}

export async function listTasks(): Promise<Task[]> {
  const data = await request<{ tasks: Task[] }>('/tasks')
  return data.tasks
}

export function createTask(title: string): Promise<Task> {
  return request<Task>('/tasks', { method: 'POST', body: JSON.stringify({ title }) })
}

export function updateTask(id: string, changes: TaskChanges): Promise<Task> {
  return request<Task>(`/tasks/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(changes),
  })
}

export function deleteTask(id: string): Promise<void> {
  return request<undefined>(`/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' })
}
