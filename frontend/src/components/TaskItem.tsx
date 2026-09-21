import { useEffect, useId, useRef, useState, type SubmitEvent, type KeyboardEvent } from 'react'

import { MAX_TITLE_LENGTH, type Task, type TaskChanges } from '../api.ts'

interface TaskItemProps {
  task: Task
  pending: boolean
  /** Devuelve true si el cambio se guardó. */
  onUpdate: (id: string, changes: TaskChanges) => Promise<boolean>
  onDelete: (id: string) => Promise<void>
}

const dateFormatter = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' })

export function TaskItem({ task, pending, onUpdate, onDelete }: TaskItemProps) {
  const checkboxId = useId()
  const editId = useId()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(task.title)
  const [draftError, setDraftError] = useState<string | null>(null)
  const editInputRef = useRef<HTMLInputElement>(null)
  const editButtonRef = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef(false)

  useEffect(() => {
    if (editing) {
      editInputRef.current?.focus()
      editInputRef.current?.select()
    } else if (returnFocus.current) {
      returnFocus.current = false
      editButtonRef.current?.focus()
    }
  }, [editing])

  function startEditing() {
    setDraft(task.title)
    setDraftError(null)
    setEditing(true)
  }

  function stopEditing() {
    returnFocus.current = true
    setEditing(false)
  }

  async function handleSave(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    const trimmed = draft.trim()
    if (trimmed === '') {
      setDraftError('El título no puede quedar vacío.')
      return
    }
    if (trimmed === task.title) {
      stopEditing()
      return
    }
    if (await onUpdate(task.id, { title: trimmed })) stopEditing()
  }

  function handleEditKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      stopEditing()
    }
  }

  const created = dateFormatter.format(new Date(task.createdAt))

  return (
    <li className="group border-b border-rule py-4 last:border-b-0" aria-busy={pending || undefined}>
      {editing ? (
        <form onSubmit={(e) => void handleSave(e)} noValidate className="space-y-2">
          <label htmlFor={editId} className="block text-sm italic text-muted">
            Editar título
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              ref={editInputRef}
              id={editId}
              type="text"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value)
                setDraftError(null)
              }}
              onKeyDown={handleEditKeyDown}
              maxLength={MAX_TITLE_LENGTH}
              disabled={pending}
              aria-invalid={draftError ? true : undefined}
              className="min-w-0 flex-1 border-0 border-b-2 border-accent bg-transparent px-1 py-1.5 text-lg focus:outline-none disabled:opacity-60"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={pending}
                className="bg-ink px-4 py-1.5 text-sm text-paper transition-colors hover:bg-accent disabled:opacity-60"
              >
                {pending ? 'Guardando…' : 'Guardar'}
              </button>
              <button
                type="button"
                onClick={stopEditing}
                disabled={pending}
                className="border border-ink/40 px-4 py-1.5 text-sm transition-colors hover:border-ink disabled:opacity-60"
              >
                Cancelar
              </button>
            </div>
          </div>
          {draftError && (
            <p role="alert" className="text-sm text-accent">
              {draftError}
            </p>
          )}
        </form>
      ) : (
        <div className="flex items-start gap-3 sm:gap-4">
          <input
            id={checkboxId}
            type="checkbox"
            checked={task.completed}
            disabled={pending}
            onChange={() => void onUpdate(task.id, { completed: !task.completed })}
            className="mt-1.5 size-5 shrink-0 cursor-pointer accent-accent disabled:cursor-wait"
          />
          <div className="min-w-0 flex-1">
            <label
              htmlFor={checkboxId}
              className={`block cursor-pointer break-words text-lg leading-snug transition-colors ${
                task.completed ? 'text-muted line-through decoration-accent/70' : 'text-ink'
              }`}
            >
              <span className="sr-only">{task.completed ? 'Completada: ' : 'Pendiente: '}</span>
              {task.title}
            </label>
            <p className="mt-1 text-xs uppercase tracking-wider text-muted">
              <time dateTime={task.createdAt}>{created}</time>
            </p>
          </div>
          <div className="flex shrink-0 gap-1 text-sm">
            <button
              ref={editButtonRef}
              type="button"
              onClick={startEditing}
              disabled={pending}
              aria-label={`Editar «${task.title}»`}
              className="px-2 py-1 text-muted underline-offset-4 transition-colors hover:text-ink hover:underline disabled:opacity-50"
            >
              Editar
            </button>
            <button
              type="button"
              onClick={() => void onDelete(task.id)}
              disabled={pending}
              aria-label={`Eliminar «${task.title}»`}
              className="px-2 py-1 text-accent underline-offset-4 transition-colors hover:text-accent-deep hover:underline disabled:opacity-50"
            >
              Eliminar
            </button>
          </div>
        </div>
      )}
    </li>
  )
}
