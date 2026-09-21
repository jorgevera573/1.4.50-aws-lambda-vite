#!/usr/bin/env node
/**
 * Comprueba las políticas IAM de iam/*.json.
 *
 * Sin conexión (--offline): sintaxis JSON, Version, Sids únicos, tamaño máximo de
 * una política gestionada (6144 caracteres sin espacios) y marcadores pendientes.
 *
 * Con conexión (por defecto): además descarga la Service Authorization Reference
 * oficial de AWS (https://servicereference.us-east-1.amazonaws.com) y verifica que
 * cada acción existe y que cada clave de condición la admite CADA acción de su
 * sentencia (las claves globales aws:* que no dependen de la acción no se usan aquí).
 *
 * Uso: node scripts/check-iam-policies.mjs [--offline]
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const DIR = join(ROOT, 'iam')
const MANAGED_POLICY_MAX = 6144
const REFERENCE = 'https://servicereference.us-east-1.amazonaws.com/v1'
const offline = process.argv.includes('--offline')

// Acciones que AWS exige en la práctica (AccessDenied real) pero que no figuran en la
// Service Reference. Se aceptan solo si están aquí, con la evidencia documentada en
// docs/permisos-iam.md; cualquier otra acción desconocida sigue siendo un error.
const OBSERVED_ACTIONS_NOT_IN_REFERENCE = new Map([
  ['apigateway:TagResource', 'AccessDenied en CreateStage con etiquetas (21/09/2026)'],
])

const errors = []
const warnings = []
const cache = new Map()

async function reference(service) {
  if (!cache.has(service)) {
    const res = await fetch(`${REFERENCE}/${service}/${service}.json`)
    if (!res.ok) throw new Error(`No se pudo descargar la referencia de ${service}: HTTP ${res.status}`)
    cache.set(service, await res.json())
  }
  return cache.get(service)
}

function supports(actionDef, key) {
  return (actionDef.ActionConditionKeys ?? []).some(
    (s) => s === key || (s.endsWith('/${TagKey}') && key.startsWith(s.slice(0, -'${TagKey}'.length))),
  )
}

for (const file of readdirSync(DIR).filter((f) => f.endsWith('.json')).sort()) {
  const raw = readFileSync(join(DIR, file), 'utf8')
  let policy
  try {
    policy = JSON.parse(raw)
  } catch (e) {
    errors.push(`${file}: JSON inválido (${e.message})`)
    continue
  }
  const size = JSON.stringify(policy).replace(/\s/g, '').length
  if (policy.Version !== '2012-10-17') errors.push(`${file}: Version debe ser 2012-10-17`)
  if (size > MANAGED_POLICY_MAX) errors.push(`${file}: ${size} caracteres (> ${MANAGED_POLICY_MAX})`)
  const sids = policy.Statement.map((s) => s.Sid)
  if (new Set(sids).size !== sids.length) errors.push(`${file}: Sid duplicado`)
  const placeholders = raw.includes('__API_ID__') ? ' (contiene __API_ID__: sustituir antes de crearla)' : ''
  console.log(`${file}: ${policy.Statement.length} sentencias, ${size} caracteres${placeholders}`)

  if (offline) continue
  for (const st of policy.Statement) {
    const keys = Object.values(st.Condition ?? {}).flatMap((o) => Object.keys(o))
    for (const action of [].concat(st.Action)) {
      const [service, name] = action.split(':')
      if (service === 'sts') continue
      const def = (await reference(service)).Actions.find((a) => a.Name === name)
      if (!def) {
        if (OBSERVED_ACTIONS_NOT_IN_REFERENCE.has(action)) {
          if (keys.length) errors.push(`${file} ${st.Sid}: ${action} no documentada; no admite condiciones verificables`)
          warnings.push(`${file} ${st.Sid}: ${action} no está en la referencia; aceptada por evidencia: ${OBSERVED_ACTIONS_NOT_IN_REFERENCE.get(action)}`)
        } else {
          errors.push(`${file} ${st.Sid}: la acción ${action} no existe`)
        }
        continue
      }
      for (const key of keys) {
        if (!supports(def, key)) errors.push(`${file} ${st.Sid}: ${action} no admite ${key}`)
      }
    }
  }
}

for (const w of warnings) console.warn(`AVISO ${w}`)
if (errors.length) {
  for (const e of errors) console.error(`ERROR ${e}`)
  process.exit(1)
}
console.log(offline ? 'Comprobación sin conexión correcta.' : 'Acciones y condiciones verificadas contra la referencia oficial.')
