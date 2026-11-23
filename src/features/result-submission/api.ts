/**
 * Transport layer of the result-submission feature.
 *
 * The base URL comes from `VITE_API_BASE_URL`; trailing slashes are stripped so
 * `${baseUrl}/results` can never become `.../prod//results`.
 *
 * Expected failures (400/429/5xx, offline, cold-start timeout) resolve to
 * `{ status: 'error', error }` instead of rejecting, so the modal always gets a
 * typed value to render and no caller has to wrap the call in try/catch.
 */
import type { SubmissionPayload, SubmissionResponse } from './types'

const ERROR_STATUS = 'error'
const SUCCESS_STATUS = 'success'

/**
 * Java 21 Lambdas may spend several seconds on a cold start; 15 s keeps the
 * request alive through that without freezing the UI forever.
 */
const REQUEST_TIMEOUT_MS = 15000

const INVALID_NAME_ERROR =
  'Перевірте правильність введеного імені (від 2 до 100 символів)'
const VALIDATION_ERROR =
  'Сервер відхилив результат: перевірте введені дані та спробуйте ще раз'
const RATE_LIMIT_ERROR =
  'Забагато запитів. Зачекайте кілька секунд і спробуйте знову'
const NETWORK_ERROR =
  "Не вдалося з'єднатися з сервером. Перевірте інтернет-з'єднання."

const baseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '')

function errorResponse(message: string): SubmissionResponse {
  return { status: ERROR_STATUS, error: message }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

/**
 * Extracts a human-readable message from a backend error body.
 *
 * The API may answer with either `{ "error": "..." }` or
 * `{ "message": "..." }`; anything else falls back to a generic message so a
 * malformed body can never leak `[object Object]` into the modal.
 */
function extractBackendMessage(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) {
    return null
  }

  const record = payload as Record<string, unknown>

  for (const key of ['error', 'message'] as const) {
    const value = record[key]
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim()
    }
  }

  return null
}

/**
 * HTTP 400 carries the backend's own validation message (invalid score,
 * payload size, answers format, …), so the body must be read before choosing
 * a fallback. `INVALID_NAME_ERROR` is intentionally not used here: it belongs
 * to the client-side name check in `ResultSubmissionModal`.
 */
async function buildHttpErrorMessage(response: Response): Promise<string> {
  const { status } = response

  if (status === 400) {
    let payload: unknown = null
    try {
      payload = await response.json()
    } catch {
      payload = null
    }

    return extractBackendMessage(payload) ?? VALIDATION_ERROR
  }

  if (status === 429) {
    return RATE_LIMIT_ERROR
  }

  if (status >= 500) {
    return `Сервер не зміг зберегти результат (код ${status}). Спробуйте пізніше.`
  }

  return `Не вдалося зберегти результат (код ${status}). Спробуйте ще раз.`
}

function normalizePayload(payload: SubmissionPayload): SubmissionPayload {
  return {
    studentName: payload.studentName.trim(),
    testName: payload.testName,
    // The backend expects an integer score, so 7.4 / 7.6 must not leak through.
    score: Number.isFinite(payload.score) ? Math.round(payload.score) : 0,
    answers: payload.answers,
  }
}

function parseSubmission(payload: unknown): SubmissionResponse {
  if (typeof payload !== 'object' || payload === null) {
    return { status: SUCCESS_STATUS }
  }

  const record = payload as Record<string, unknown>
  const status =
    typeof record.status === 'string' && record.status.trim() !== ''
      ? record.status
      : SUCCESS_STATUS
  const submissionId =
    typeof record.submissionId === 'string' && record.submissionId.trim() !== ''
      ? record.submissionId
      : undefined

  return submissionId ? { status, submissionId } : { status }
}

/**
 * Creates a student submission (`POST /results`).
 *
 * Never rejects: transport, timeout and HTTP failures are reported through
 * `SubmissionResponse.error` with a Ukrainian, user-facing message.
 */
export async function submitStudentResult(
  payload: SubmissionPayload,
): Promise<SubmissionResponse> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(`${baseUrl}/results`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(normalizePayload(payload)),
      signal: controller.signal,
    })

    if (!response.ok) {
      return errorResponse(await buildHttpErrorMessage(response))
    }

    let raw: unknown = null
    try {
      raw = await response.json()
    } catch (error) {
      // An abort during the body read is a timeout, not a malformed body.
      if (isAbortError(error)) throw error
      raw = null
    }

    return parseSubmission(raw)
  } catch (error) {
    if (isAbortError(error)) {
      return errorResponse(
        `Сервер не відповів за ${REQUEST_TIMEOUT_MS / 1000} с. Спробуйте ще раз.`,
      )
    }

    return errorResponse(NETWORK_ERROR)
  } finally {
    clearTimeout(timeoutId)
  }
}

export { INVALID_NAME_ERROR }
