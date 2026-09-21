import { useId, useRef, useState, type SubmitEvent } from 'react'

import { MAX_TITLE_LENGTH } from '../api.ts'

interface TaskFormProps {
  /** Devuelve true si la tarea se creó, para vaciar el campo. */
  onCreate: (title: string) => Promise<boolean>
  disabled?: boolean
}

export function TaskForm({ onCreate, disabled = false }: TaskFormProps) {
  const inputId = useId()
  const hintId = useId()
  const errorId = useId()
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Bloqueo síncrono: el estado no cambia hasta el siguiente render.
  const inFlight = useRef(false)

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current) return
    const trimmed = title.trim()
    if (trimmed === '') {
      setError('Escribe un título para la tarea.')
      return
    }
    setError(null)
    inFlight.current = true
    setSubmitting(true)
    try {
      if (await onCreate(trimmed)) setTitle('')
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }

  const busy = submitting || disabled

  return (
    <form onSubmit={(e) => void handleSubmit(e)} noValidate className="space-y-2">
      <label htmlFor={inputId} className="block font-display text-lg italic text-ink">
        Nueva tarea
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          id={inputId}
          type="text"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            if (error) setError(null)
          }}
          maxLength={MAX_TITLE_LENGTH}
          placeholder="Por ejemplo: repasar la política IAM"
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${errorId} ${hintId}` : hintId}
          disabled={busy}
          className="min-w-0 flex-1 border-0 border-b-2 border-ink/70 bg-transparent px-1 py-2 text-lg placeholder:text-muted/70 focus:border-accent focus:outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={busy}
          className="bg-ink px-6 py-2.5 font-display text-sm uppercase tracking-[0.2em] text-paper transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Añadiendo…' : 'Añadir'}
        </button>
      </div>
      <div className="flex justify-between gap-4 text-sm">
        <p id={errorId} className="text-accent" role={error ? 'alert' : undefined}>
          {error}
        </p>
        <p id={hintId} className="shrink-0 tabular-nums text-muted">
          {title.length}/{MAX_TITLE_LENGTH}
        </p>
      </div>
    </form>
  )
}
