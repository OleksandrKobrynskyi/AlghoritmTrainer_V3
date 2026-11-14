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

function toFiniteNumber(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value
    }

    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value)

        return Number.isFinite(parsed) ? parsed : 0
    }

    return 0
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
        score: toFiniteNumber(record.score),
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

/**
 * Reads a page of student submissions.
 *
 * @throws Error with message `UNAUTHORIZED` on HTTP 401, a Ukrainian
 *   human-readable message for every other failure (HTTP or network).
 */
export async function fetchStudentResults(
    params: FetchResultsParams,
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
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    let response: Response
    try {
        response = await fetch(`${baseUrl}/results?${searchParams.toString()}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-Admin-Login': params.credentials.login,
                'X-Admin-Password': params.credentials.password,
            },
            signal: controller.signal,
        })
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error(
                `Сервер не відповів за ${REQUEST_TIMEOUT_MS / 1000} с. Перевірте з'єднання та спробуйте ще раз.`,
            )
        }

        throw new Error(
            "Не вдалося з'єднатися з сервером. Перевірте інтернет-з'єднання.",
        )
    } finally {
        clearTimeout(timeoutId)
    }

    if (response.status === 401) {
        throw new Error(UNAUTHORIZED_ERROR)
    }

    if (!response.ok) {
        throw new Error(buildHttpErrorMessage(response.status))
    }

    let payload: unknown
    try {
        payload = await response.json()
    } catch {
        throw new Error(
            'Сервер повернув некоректну відповідь: не вдалося прочитати JSON.',
        )
    }

    return parseResponse(payload)
}
