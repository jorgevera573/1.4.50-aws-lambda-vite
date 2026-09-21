import { useCallback, useEffect, useRef, useState } from 'react'

import {
  ApiError,
  createTask,
  deleteTask,
  listTasks,
  updateTask,
  type Task,
  type TaskChanges,
} from './api.ts'
import { TaskForm } from './components/TaskForm.tsx'
import { TaskItem } from './components/TaskItem.tsx'

type LoadState = { status: 'loading' } | { status: 'ready' } | { status: 'error'; message: string }

function messageOf(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Ha ocurrido un error inesperado.'
}

const todayFormatter = new Intl.DateTimeFormat('es-ES', { dateStyle: 'full' })

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const [actionError, setActionError] = useState<string | null>(null)
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set())
  // Copia síncrona de pendingIds para rechazar clics repetidos antes del siguiente render.
  const inFlightIds = useRef(new Set<string>())

  const fetchTasks = useCallback(async () => {
    setLoad({ status: 'loading' })
    try {
      setTasks(await listTasks())
      setLoad({ status: 'ready' })
    } catch (error) {
      setLoad({ status: 'error', message: messageOf(error) })
    }
  }, [])

  useEffect(() => {
    // Carga inicial desde la API; el estado se actualiza al resolver la petición.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchTasks()
  }, [fetchTasks])

  function setPending(id: string, pending: boolean) {
    if (pending) inFlightIds.current.add(id)
    else inFlightIds.current.delete(id)
    setPendingIds((current) => {
      const next = new Set(current)
      if (pending) next.add(id)
      else next.delete(id)
      return next
    })
  }

  async function handleCreate(title: string): Promise<boolean> {
    setActionError(null)
    try {
      const task = await createTask(title)
      setTasks((current) => [task, ...current])
      return true
    } catch (error) {
      setActionError(`No se pudo crear la tarea. ${messageOf(error)}`)
      return false
    }
  }

  async function handleUpdate(id: string, changes: TaskChanges): Promise<boolean> {
    if (inFlightIds.current.has(id)) return false
    setActionError(null)
    setPending(id, true)
    try {
      const updated = await updateTask(id, changes)
      setTasks((current) => current.map((t) => (t.id === id ? updated : t)))
      return true
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setTasks((current) => current.filter((t) => t.id !== id))
      }
      setActionError(`No se pudo actualizar la tarea. ${messageOf(error)}`)
      return false
    } finally {
      setPending(id, false)
    }
  }

  async function handleDelete(id: string): Promise<void> {
    if (inFlightIds.current.has(id)) return
    setActionError(null)
    setPending(id, true)
    try {
      await deleteTask(id)
      setTasks((current) => current.filter((t) => t.id !== id))
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setTasks((current) => current.filter((t) => t.id !== id))
      }
      setActionError(`No se pudo eliminar la tarea. ${messageOf(error)}`)
    } finally {
      setPending(id, false)
    }
  }

  const completed = tasks.filter((t) => t.completed).length

  return (
    <div className="min-h-dvh bg-paper px-4 py-8 text-ink sm:px-6 sm:py-14">
      <div className="mx-auto max-w-2xl">
        <header className="border-b-4 border-double border-ink pb-6 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-muted">
            Práctica 1.4.50 · Serverless en AWS
          </p>
          <h1 className="mt-3 font-display text-5xl font-bold tracking-tight sm:text-6xl">
            Cuaderno de tareas
          </h1>
          <p className="mt-3 font-display text-base italic text-muted first-letter:uppercase">
            {todayFormatter.format(new Date())}
          </p>
        </header>

        <p className="mt-4 border-y border-rule py-2 text-center text-sm italic text-muted">
          Demostración pública: las tareas son compartidas con cualquier visitante. No escribas
          datos personales.
        </p>

        <main className="mt-8">
          <section aria-labelledby="new-task-heading" className="bg-paper-deep/60 p-5 sm:p-6">
            <h2 id="new-task-heading" className="sr-only">
              Añadir tarea
            </h2>
            <TaskForm onCreate={handleCreate} disabled={load.status !== 'ready'} />
          </section>

          {actionError && (
            <div
              role="alert"
              className="mt-6 flex items-start justify-between gap-4 border-l-4 border-accent bg-accent/5 px-4 py-3"
            >
              <p>{actionError}</p>
              <button
                type="button"
                onClick={() => {
                  setActionError(null)
                }}
                className="shrink-0 text-sm underline underline-offset-4 hover:text-accent"
              >
                Cerrar aviso
              </button>
            </div>
          )}

          <section aria-labelledby="list-heading" className="mt-10">
            <div className="flex items-baseline justify-between gap-4 border-b border-ink pb-2">
              <h2 id="list-heading" className="font-display text-2xl font-semibold">
                Tareas
              </h2>
              {load.status === 'ready' && tasks.length > 0 && (
                <p className="text-sm text-muted" aria-live="polite">
                  {tasks.length} {tasks.length === 1 ? 'tarea' : 'tareas'} · {completed}{' '}
                  {completed === 1 ? 'completada' : 'completadas'}
                </p>
              )}
            </div>

            {load.status === 'loading' && (
              <p role="status" className="py-10 text-center italic text-muted">
                Cargando tareas…
              </p>
            )}

            {load.status === 'error' && (
              <div role="alert" className="py-10 text-center">
                <p className="text-accent">No se pudieron cargar las tareas. {load.message}</p>
                <button
                  type="button"
                  onClick={() => void fetchTasks()}
                  className="mt-4 border border-ink px-5 py-2 text-sm transition-colors hover:bg-ink hover:text-paper"
                >
                  Reintentar
                </button>
              </div>
            )}

            {load.status === 'ready' && tasks.length === 0 && (
              <p className="py-10 text-center font-display text-lg italic text-muted">
                Todavía no hay tareas. Escribe la primera arriba.
              </p>
            )}

            {load.status === 'ready' && tasks.length > 0 && (
              <ul aria-label="Lista de tareas">
                {tasks.map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    pending={pendingIds.has(task.id)}
                    onUpdate={handleUpdate}
                    onDelete={handleDelete}
                  />
                ))}
              </ul>
            )}
          </section>
        </main>

        <footer className="mt-16 border-t border-rule pt-4 text-center text-xs uppercase tracking-[0.2em] text-muted">
          Vite · React · API Gateway · Lambda · DynamoDB
        </footer>
      </div>
    </div>
  )
}
