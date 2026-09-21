import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App.tsx'
import { API_URL, installFakeApi, makeTask } from './test/fakeApi.ts'

beforeEach(() => {
  vi.stubEnv('VITE_API_URL', `${API_URL}/`)
})

function renderApp() {
  const user = userEvent.setup()
  render(<App />)
  return { user }
}

async function findList() {
  return screen.findByRole('list', { name: 'Lista de tareas' })
}

describe('carga de tareas', () => {
  it('muestra un estado de carga y después las tareas de la API', async () => {
    installFakeApi([
      makeTask({ title: 'Configurar Terraform' }),
      makeTask({ title: 'Probar la Lambda', completed: true }),
    ])
    renderApp()

    expect(screen.getByRole('status')).toHaveTextContent('Cargando tareas')

    const list = await findList()
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(list).getByRole('checkbox', { name: /Configurar Terraform/ })).not.toBeChecked()
    expect(within(list).getByRole('checkbox', { name: /Probar la Lambda/ })).toBeChecked()
    expect(screen.getByText('2 tareas · 1 completada')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('muestra un mensaje cuando no hay tareas', async () => {
    installFakeApi([])
    renderApp()

    expect(await screen.findByText(/Todavía no hay tareas/)).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Lista de tareas' })).not.toBeInTheDocument()
  })

  it('informa de un error de carga y se recupera al reintentar', async () => {
    const api = installFakeApi([makeTask({ title: 'Recuperada' })])
    api.failNext('GET', 500)
    const { user } = renderApp()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('No se pudieron cargar las tareas')
    expect(alert).toHaveTextContent('Error interno')

    await user.click(within(alert).getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByRole('checkbox', { name: /Recuperada/ })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('avisa de un error de red', async () => {
    const api = installFakeApi([])
    api.failNext('GET', 0)
    renderApp()

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo conectar con el servidor')
  })

  it('avisa si falta VITE_API_URL sin llamar a la red', async () => {
    const api = installFakeApi([])
    vi.stubEnv('VITE_API_URL', '')
    renderApp()

    expect(await screen.findByRole('alert')).toHaveTextContent('falta la variable VITE_API_URL')
    expect(api.calls).toHaveLength(0)
  })
})

describe('creación', () => {
  it('crea una tarea, la muestra y vacía el campo', async () => {
    const api = installFakeApi([makeTask({ title: 'Existente' })])
    const { user } = renderApp()
    await findList()

    const input = screen.getByLabelText('Nueva tarea')
    await user.type(input, '  Desplegar en Vercel  {Enter}')

    expect(await screen.findByRole('checkbox', { name: /Desplegar en Vercel/ })).not.toBeChecked()
    expect(input).toHaveValue('')
    expect(api.callsTo('POST')).toEqual([
      { method: 'POST', path: '/tasks', body: { title: 'Desplegar en Vercel' } },
    ])
    const [newest] = within(await findList()).getAllByRole('listitem')
    expect(newest).toHaveTextContent('Desplegar en Vercel')
  })

  it('no envía títulos vacíos', async () => {
    const api = installFakeApi([])
    const { user } = renderApp()
    await screen.findByText(/Todavía no hay tareas/)

    await user.type(screen.getByLabelText('Nueva tarea'), '   ')
    await user.click(screen.getByRole('button', { name: 'Añadir' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Escribe un título')
    expect(api.callsTo('POST')).toHaveLength(0)
  })

  it('limita la longitud del título', async () => {
    installFakeApi([])
    renderApp()
    await screen.findByText(/Todavía no hay tareas/)

    expect(screen.getByLabelText('Nueva tarea')).toHaveAttribute('maxLength', '200')
  })

  it('evita envíos duplicados mientras la petición está pendiente', async () => {
    const api = installFakeApi([])
    const { user } = renderApp()
    await screen.findByText(/Todavía no hay tareas/)

    await user.type(screen.getByLabelText('Nueva tarea'), 'Una sola vez')
    const release = api.hold()
    await user.click(screen.getByRole('button', { name: 'Añadir' }))

    const busyButton = screen.getByRole('button', { name: 'Añadiendo…' })
    expect(busyButton).toBeDisabled()
    await user.click(busyButton)
    await user.keyboard('{Enter}')

    release()
    expect(await screen.findByRole('checkbox', { name: /Una sola vez/ })).toBeInTheDocument()
    expect(api.callsTo('POST')).toHaveLength(1)
  })

  it('conserva el texto y muestra el error si la API rechaza la creación', async () => {
    const api = installFakeApi([])
    api.failNext('POST', 400, 'El título no puede superar 200 caracteres.')
    const { user } = renderApp()
    await screen.findByText(/Todavía no hay tareas/)

    const input = screen.getByLabelText('Nueva tarea')
    await user.type(input, 'Rechazada{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo crear la tarea. El título no puede superar 200 caracteres.',
    )
    expect(input).toHaveValue('Rechazada')
    expect(input).toBeEnabled()
  })
})

describe('edición', () => {
  it('edita el título con el teclado', async () => {
    const task = makeTask({ title: 'Título viejo' })
    const api = installFakeApi([task])
    const { user } = renderApp()
    await findList()

    await user.click(screen.getByRole('button', { name: 'Editar «Título viejo»' }))
    const input = screen.getByLabelText('Editar título')
    expect(input).toHaveFocus()
    await user.clear(input)
    await user.type(input, 'Título nuevo{Enter}')

    expect(await screen.findByRole('checkbox', { name: /Título nuevo/ })).toBeInTheDocument()
    expect(screen.queryByText('Título viejo')).not.toBeInTheDocument()
    expect(api.callsTo('PUT')).toEqual([
      { method: 'PUT', path: `/tasks/${task.id}`, body: { title: 'Título nuevo' } },
    ])
    expect(screen.getByRole('button', { name: 'Editar «Título nuevo»' })).toHaveFocus()
  })

  it('cancela la edición con Escape sin llamar a la API', async () => {
    const api = installFakeApi([makeTask({ title: 'Intacto' })])
    const { user } = renderApp()
    await findList()

    await user.click(screen.getByRole('button', { name: 'Editar «Intacto»' }))
    await user.type(screen.getByLabelText('Editar título'), ' cambiado{Escape}')

    expect(screen.queryByLabelText('Editar título')).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Intacto/ })).toBeInTheDocument()
    expect(api.callsTo('PUT')).toHaveLength(0)
  })

  it('no permite guardar un título vacío', async () => {
    const api = installFakeApi([makeTask({ title: 'No vaciar' })])
    const { user } = renderApp()
    await findList()

    await user.click(screen.getByRole('button', { name: 'Editar «No vaciar»' }))
    await user.clear(screen.getByLabelText('Editar título'))
    await user.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(screen.getByRole('alert')).toHaveTextContent('no puede quedar vacío')
    expect(api.callsTo('PUT')).toHaveLength(0)
  })
})

describe('cambio de estado', () => {
  it('marca y desmarca una tarea como completada', async () => {
    const task = makeTask({ title: 'Alternar' })
    const api = installFakeApi([task])
    const { user } = renderApp()
    await findList()

    const checkbox = screen.getByRole('checkbox', { name: /Alternar/ })
    await user.click(checkbox)
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /Alternar/ })).toBeChecked()
    })
    expect(screen.getByText('1 tarea · 1 completada')).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: /Alternar/ }))
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /Alternar/ })).not.toBeChecked()
    })

    expect(api.callsTo('PUT').map((c) => c.body)).toEqual([
      { completed: true },
      { completed: false },
    ])
    expect(api.store.get(task.id)?.completed).toBe(false)
  })

  it('desactiva los controles de la tarea mientras se guarda', async () => {
    const api = installFakeApi([makeTask({ title: 'Ocupada' })])
    const { user } = renderApp()
    await findList()

    const release = api.hold()
    await user.click(screen.getByRole('checkbox', { name: /Ocupada/ }))

    expect(screen.getByRole('checkbox', { name: /Ocupada/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Eliminar «Ocupada»' })).toBeDisabled()

    release()
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /Ocupada/ })).toBeEnabled()
    })
    expect(api.callsTo('PUT')).toHaveLength(1)
  })

  it('mantiene el estado anterior si la API falla y permite reintentar', async () => {
    const api = installFakeApi([makeTask({ title: 'Frágil' })])
    api.failNext('PUT', 500)
    const { user } = renderApp()
    await findList()

    await user.click(screen.getByRole('checkbox', { name: /Frágil/ }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('No se pudo actualizar la tarea. Error interno')
    expect(screen.getByRole('checkbox', { name: /Frágil/ })).not.toBeChecked()

    await user.click(within(alert).getByRole('button', { name: 'Cerrar aviso' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: /Frágil/ }))
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /Frágil/ })).toBeChecked()
    })
  })
})

describe('eliminación', () => {
  it('elimina solo la tarea indicada', async () => {
    const target = makeTask({ title: 'Borrar' })
    const api = installFakeApi([target, makeTask({ title: 'Conservar' })])
    const { user } = renderApp()
    await findList()

    await user.click(screen.getByRole('button', { name: 'Eliminar «Borrar»' }))

    await waitFor(() => {
      expect(screen.queryByText('Borrar')).not.toBeInTheDocument()
    })
    expect(screen.getByRole('checkbox', { name: /Conservar/ })).toBeInTheDocument()
    expect(api.callsTo('DELETE')).toEqual([
      { method: 'DELETE', path: `/tasks/${target.id}`, body: undefined },
    ])
  })

  it('muestra el error y conserva la tarea si falla el borrado', async () => {
    const api = installFakeApi([makeTask({ title: 'Resistente' })])
    api.failNext('DELETE', 503, 'Servicio no disponible.')
    const { user } = renderApp()
    await findList()

    await user.click(screen.getByRole('button', { name: 'Eliminar «Resistente»' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo eliminar la tarea. Servicio no disponible.',
    )
    expect(screen.getByRole('checkbox', { name: /Resistente/ })).toBeEnabled()
  })

  it('retira de la lista una tarea que ya no existe en el servidor', async () => {
    const ghost = makeTask({ title: 'Fantasma' })
    const api = installFakeApi([ghost])
    const { user } = renderApp()
    await findList()
    api.store.delete(ghost.id)

    await user.click(screen.getByRole('button', { name: 'Eliminar «Fantasma»' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('La tarea no existe')
    expect(screen.queryByRole('checkbox', { name: /Fantasma/ })).not.toBeInTheDocument()
  })
})

describe('persistencia', () => {
  it('los cambios provienen de la API y se ven tras recargar la aplicación', async () => {
    installFakeApi([])
    const first = renderApp()
    await screen.findByText(/Todavía no hay tareas/)
    await first.user.type(screen.getByLabelText('Nueva tarea'), 'Persistente{Enter}')
    await first.user.click(await screen.findByRole('checkbox', { name: /Persistente/ }))
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /Persistente/ })).toBeChecked()
    })

    // Simula recargar la página: se desmonta y se vuelve a montar desde cero.
    cleanup()
    renderApp()

    expect(await screen.findByRole('checkbox', { name: /Persistente/ })).toBeChecked()
    expect(window.localStorage.length).toBe(0)
  })
})
