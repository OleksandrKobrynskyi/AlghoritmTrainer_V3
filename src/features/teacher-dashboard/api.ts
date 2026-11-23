/**
 * Transport layer of the teacher-dashboard feature.
 *
 * The base URL comes from `VITE_API_BASE_URL` (a trailing slash is stripped so
 * `${baseUrl}/results` never produces a double slash, e.g. `.../prod//results`).
 */
import type {
    FetchResultsParams,
    GetResultsResponse,
    StudentResultItem,
} from './types'

const DEFAULT_LIMIT = 50
const MIN_LIMIT = 1
const MAX_LIMIT = 10000
const REQUEST_TIMEOUT_MS = 20000

/** Marker thrown when the backend rejects the teacher credentials (HTTP 401). */
export const UNAUTHORIZED_ERROR = 'UNAUTHORIZED'

const baseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '')

function clampLimit(limit: number | undefined): number {
    if (typeof limit !== 'number' || !Number.isFinite(limit)) {
        return DEFAULT_LIMIT
    }

    return Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, Math.trunc(limit)))
}

function buildHttpErrorMessage(status: number): string {
    if (status === 400) {
        return 'Сервер відхилив запит: некоректні параметри фільтрації або ліміту.'
    }

    if (status === 403) {
        return 'Доступ заборонено. Переконайтеся, що використовуєте обліковий запис викладача.'
    }

    if (status === 404) {
        return 'Сервіс результатів недоступний. Перевірте адресу API.'
    }

    if (status === 429) {
        return 'Забагато запитів до сервера. Зачекайте кілька секунд і спробуйте знову.'
    }

    if (status >= 500) {
        return `Сервер не зміг обробити запит (код ${status}). Спробуйте пізніше.`
    }

    return `Запит завершився з помилкою (код ${status}). Спробуйте ще раз.`
}

function toRecord(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null
        ? (value as Record<string, unknown>)
        : {}
}

/**
 * `null` means "the backend did not report a score". Missing, `null`,
 * `undefined` and non-numeric values must never collapse into a real `0`:
 * an absent grade is not a failed attempt. A genuine `0` is preserved.
 */
function toNullableScore(value: unknown): number | null {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null
    }

    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value)

        return Number.isFinite(parsed) ? parsed : null
    }

    return null
}

function toAnswers(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return []
    }

    return value
        .filter((answer): answer is string => typeof answer === 'string')
        .map((answer) => answer.trim())
        .filter((answer) => answer.length > 0)
}

function toStudentResultItem(rawItem: unknown): StudentResultItem {
    const record = toRecord(rawItem)

    return {
        submissionId:
            typeof record.submissionId === 'string' ? record.submissionId : '',
        studentName:
            typeof record.studentName === 'string' ? record.studentName : '—',
        testName: typeof record.testName === 'string' ? record.testName : '—',
        score: toNullableScore(record.score),
        answers: toAnswers(record.answers),
        createdAt: typeof record.createdAt === 'string' ? record.createdAt : '',
    }
}

function parseResponse(payload: unknown): GetResultsResponse {
    const record = toRecord(payload)
    const items = Array.isArray(record.items)
        ? record.items.map(toStudentResultItem)
        : []
    const nextKey =
        typeof record.nextKey === 'string' && record.nextKey.length > 0
            ? record.nextKey
            : null

    return {
        items,
        count:
            typeof record.count === 'number' && Number.isFinite(record.count)
                ? record.count
                : items.length,
        nextKey,
    }
}

function isAbortError(error: unknown): boolean {
    return (
        typeof error === 'object' &&
        error !== null &&
        'name' in error &&
        (error as { name?: unknown }).name === 'AbortError'
    )
}

/**
 * `AbortController.abort()` is sticky, so a caller signal that already fired
 * must forward immediately instead of waiting for a future `abort` event.
 */
function linkAbortSignal(
    controller: AbortController,
    externalSignal?: AbortSignal,
): () => void {
    if (!externalSignal) {
        return () => {}
    }

    if (externalSignal.aborted) {
        controller.abort()

        return () => {}
    }

    const forwardAbort = () => controller.abort()
    externalSignal.addEventListener('abort', forwardAbort, { once: true })

    return () => externalSignal.removeEventListener('abort', forwardAbort)
}

/**
 * Converts low-level failures into UI-ready errors.
 *
 * A genuine cancellation (unmount, superseded request) keeps the `AbortError`
 * identity so callers can ignore it; only the internal timeout is translated
 * into a human-readable message.
 */
function toTransportError(error: unknown, timedOut: boolean): Error {
    if (isAbortError(error)) {
        if (!timedOut) {
            return error as Error
        }

        return new Error(
            `Сервер не відповів за ${REQUEST_TIMEOUT_MS / 1000} с. Перевірте з'єднання та спробуйте ще раз.`,
        )
    }

    return new Error(
        "Не вдалося з'єднатися з сервером. Перевірте інтернет-з'єднання.",
    )
}

/**
 * Reads a page of student submissions.
 *
 * The 20 s timeout covers the whole exchange — request *and* body parsing — so
 * a stalled response body cannot leave the caller loading forever.
 *
 * @param externalSignal Optional caller cancellation (unmount, newer request).
 * @throws Error with message `UNAUTHORIZED` on HTTP 401, a Ukrainian
 *   human-readable message for every other failure (HTTP, network, timeout),
 *   or the original `AbortError` when the caller aborted the request.
 */
export async function fetchStudentResults(
    params: FetchResultsParams,
    externalSignal?: AbortSignal,
): Promise<GetResultsResponse> {
    const searchParams = new URLSearchParams()
    searchParams.set('limit', String(clampLimit(params.limit)))

    const testName = params.testName?.trim()
    if (testName) {
        searchParams.set('testName', testName)
    }

    const lastKey = params.lastKey?.trim()
    if (lastKey) {
        searchParams.set('lastKey', lastKey)
    }

    const controller = new AbortController()
    let timedOut = false
    const timeoutId = setTimeout(() => {
        timedOut = true
        controller.abort()
    }, REQUEST_TIMEOUT_MS)
    const detachExternalSignal = linkAbortSignal(controller, externalSignal)

    try {
        let response: Response

        try {
            response = await fetch(
                `${baseUrl}/results?${searchParams.toString()}`,
                {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Admin-Login': params.credentials.login,
                        'X-Admin-Password': params.credentials.password,
                    },
                    signal: controller.signal,
                },
            )
        } catch (error) {
            throw toTransportError(error, timedOut)
        }

        if (response.status === 401) {
            throw new Error(UNAUTHORIZED_ERROR)
        }

        if (!response.ok) {
            throw new Error(buildHttpErrorMessage(response.status))
        }

        try {
            return parseResponse(await response.json())
        } catch (error) {
            if (isAbortError(error)) {
                throw toTransportError(error, timedOut)
            }

            throw new Error(
                'Сервер повернув некоректну відповідь: не вдалося прочитати JSON.',
            )
        }
    } finally {
        // Cleared only after the body is parsed, so `response.json()` shares the
        // same 20 s budget as the request itself.
        clearTimeout(timeoutId)
        detachExternalSignal()
    }
}
