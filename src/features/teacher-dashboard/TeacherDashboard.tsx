
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { fetchStudentResults, UNAUTHORIZED_ERROR } from './api'
import type { StudentResultItem, TeacherCredentials } from './types'

const AUTH_STORAGE_KEY = 'algolab: teacher_auth'
const DEFAULT_PAGE_SIZE = 50
const PAGE_SIZE_OPTIONS = [50, 100, 500, 10000] as const
const VISIBLE_STEP = 100

const UNAUTHORIZED_MESSAGE = 'Невірний логін або пароль викладача'


const PANEL =
    'rounded-none border-2 border-yellow-400 bg-zinc-950 text-yellow-400 dark:rounded-2xl dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:shadow-xl apple:rounded-3xl apple:border apple:border-white/25 apple:bg-white/15 apple:text-white apple:shadow-2xl apple:shadow-black/20 apple:backdrop-blur-2xl'

const OCTAGON =
    '[clip-path:polygon(14px_0,100%_0,100%_calc(100%-14px),calc(100%-14px)_100%,0_100%,0_14px)] apple:rounded-full apple:[clip-path:none]'

const BUTTON_BASE = `inline-flex items-center justify-center gap-2 px-4 py-2.5 font-mono text-sm font-bold uppercase tracking-wider transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:cursor-not-allowed disabled:opacity-40 dark:font-sans dark:focus-visible:ring-white dark:focus-visible:ring-offset-neutral-950 apple:font-sans apple:normal-case apple:tracking-normal apple:focus-visible:ring-sky-400 apple:focus-visible:ring-offset-slate-950 ${OCTAGON}`

const PRIMARY_BUTTON = `${BUTTON_BASE} bg-yellow-400 text-zinc-950 hover:bg-yellow-300 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200 apple:bg-white apple:text-slate-950 apple:hover:bg-white/90 apple:shadow-lg apple:shadow-white/10`

const SECONDARY_BUTTON = `${BUTTON_BASE} border-2 border-yellow-400 bg-zinc-900 text-yellow-400 hover:bg-yellow-400 hover:text-zinc-950 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white apple:border apple:border-white/25 apple:bg-white/15 apple:text-white apple:hover:bg-white/25 apple:backdrop-blur-2xl`

const LABEL =
    'text-[11px] font-semibold uppercase tracking-[0.16em] text-yellow-500/80 dark:tracking-[0.12em] dark:text-neutral-400 apple:text-white/80'

const INPUT =
    'w-full rounded-none border-2 border-yellow-500/50 bg-zinc-950 px-3 py-2 font-mono text-sm text-yellow-400 placeholder:text-yellow-500/40 transition-colors duration-200 focus:border-yellow-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:rounded-lg dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:font-sans dark:placeholder:text-neutral-600 dark:focus:border-neutral-500 apple:rounded-2xl apple:border-white/25 apple:bg-white/10 apple:text-white apple:font-sans apple:placeholder:text-white/50 apple:backdrop-blur-2xl apple:focus:border-white/50'

const ALERT =
    'rounded-none border-2 border-rose-500 bg-rose-500/10 px-4 py-3 text-xs leading-relaxed text-rose-400 dark:rounded-xl dark:border-rose-500/40 dark:text-rose-300 apple:rounded-2xl apple:border apple:border-rose-400/40 apple:bg-rose-500/20 apple:text-rose-100 apple:backdrop-blur-2xl'

const COUNTER_BADGE =
    'rounded-none border border-yellow-500/40 bg-zinc-950 px-3 py-1.5 font-mono text-xs text-yellow-400 dark:rounded-full dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-300 dark:font-sans apple:rounded-full apple:border apple:border-white/25 apple:bg-white/10 apple:text-white apple:font-sans apple:backdrop-blur-2xl'

const MUTED_TEXT =
    'text-xs leading-relaxed text-yellow-500/70 dark:text-neutral-400 apple:text-white/70'

const EYEBROW =
    'text-[11px] font-semibold uppercase tracking-[0.22em] text-yellow-400 dark:text-neutral-400 apple:text-white/70'

const HEAD_CELL =
    'whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-yellow-500 dark:text-neutral-400 apple:text-white/80'


const numberFormatter = new Intl.NumberFormat('uk-UA')

const dateTimeFormatter = new Intl.DateTimeFormat('uk-UA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
})

const compactDateTimeFormatter = new Intl.DateTimeFormat('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
})

function formatSubmittedAt(value: string): string {
    if (!value) {
        return '—'
    }

    const date = new Date(value)

    if (Number.isNaN(date.getTime())) {
        return '—'
    }

    return dateTimeFormatter.format(date)
}

function formatShortDate(value: string): string {
    const date = new Date(value)

    return Number.isNaN(date.getTime()) ? '—' : compactDateTimeFormatter.format(date)
}

function readStoredCredentials(): TeacherCredentials | null {
    try {
        const raw = sessionStorage.getItem(AUTH_STORAGE_KEY)

        if (!raw) {
            return null
        }

        const parsed: unknown = JSON.parse(raw)

        if (typeof parsed !== 'object' || parsed === null) {
            return null
        }

        const record = parsed as Record<string, unknown>
        const login = typeof record.login === 'string' ? record.login.trim() : ''
        const password = typeof record.password === 'string' ? record.password : ''

        if (!login || !password) {
            return null
        }

        return { login, password }
    } catch {
        return null
    }
}

function persistCredentials(credentials: TeacherCredentials | null): void {
    try {
        if (!credentials) {
            sessionStorage.removeItem(AUTH_STORAGE_KEY)
            return
        }

        sessionStorage.setItem(
            AUTH_STORAGE_KEY,
            JSON.stringify({
                login: credentials.login,
                password: credentials.password,
            }),
        )
    } catch {

    }
}

function describeError(error: unknown): string {
    if (error instanceof Error && error.message) {
        return error.message
    }

    return 'Не вдалося завантажити результати. Спробуйте ще раз.'
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
 * Merges a freshly loaded page into the accumulated journal.
 *
 * Only records with a real, non-empty `submissionId` are deduplicated. Legacy
 * records without one are always appended: two students can submit within the
 * same second, so `createdAt` is not a safe identity key.
 */
function mergeResults(
    current: StudentResultItem[],
    incoming: StudentResultItem[],
): StudentResultItem[] {
    const knownSubmissionIds = new Set<string>()

    for (const item of current) {
        const submissionId = item.submissionId.trim()

        if (submissionId) {
            knownSubmissionIds.add(submissionId)
        }
    }

    const merged = [...current]

    for (const item of incoming) {
        const submissionId = item.submissionId.trim()

        if (submissionId) {
            if (knownSubmissionIds.has(submissionId)) {
                continue
            }

            knownSubmissionIds.add(submissionId)
        }

        merged.push(item)
    }

    return merged
}

function scoreToneClass(score: number | null): string {
    // Neutral styling: a missing score is unknown, not a failed attempt.
    if (score === null) {
        return 'border-yellow-500/30 bg-zinc-950 text-yellow-500/70 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-400 apple:border-white/20 apple:bg-white/10 apple:text-white/70'
    }

    if (score >= 80) {
        return 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400 dark:border-emerald-400/30 dark:text-emerald-300 apple:border-emerald-300/40 apple:bg-emerald-400/20 apple:text-emerald-100'
    }

    if (score >= 50) {
        return 'border-yellow-500/50 bg-yellow-400/10 text-yellow-400 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 apple:border-white/25 apple:bg-white/15 apple:text-white'
    }

    return 'border-rose-500/50 bg-rose-500/10 text-rose-400 dark:border-rose-400/30 dark:text-rose-300 apple:border-rose-300/40 apple:bg-rose-400/20 apple:text-rose-100'
}


interface LoginFormProps {
    readonly error: string | null
    readonly isSubmitting: boolean
    readonly onSubmit: (credentials: TeacherCredentials) => void
}

function LoginForm({ error, isSubmitting, onSubmit }: LoginFormProps) {
    const [login, setLogin] = useState('')
    const [password, setPassword] = useState('')
    const [validationError, setValidationError] = useState<string | null>(null)

    const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault()

        const trimmedLogin = login.trim()

        if (!trimmedLogin || !password) {
            setValidationError('Введіть логін і пароль викладача.')
            return
        }

        setValidationError(null)
        onSubmit({ login: trimmedLogin, password })
    }

    const visibleError = validationError ?? error

    return (
        <section className="relative z-40 mx-auto w-full max-w-md">
            <form
                onSubmit={handleSubmit}
                className={`${PANEL} p-6 sm:p-8`}
                data-snow-surface="true"
                noValidate
                aria-busy={isSubmitting}
            >
                <p className={EYEBROW}>Teacher · AlgoLab</p>
                <h1 className="mt-2 font-mono text-2xl font-bold tracking-tight text-yellow-400 dark:font-sans dark:text-white apple:font-sans apple:text-white sm:text-3xl">
                    Кабінет викладача
                </h1>
                <p className={`mt-2 ${MUTED_TEXT}`}>
                    Результати студентів доступні лише за обліковими даними
                    викладача.
                </p>

                <div className="mt-6 flex flex-col gap-4">
                    <label className="flex flex-col gap-1.5">
                        <span className={LABEL}>Логін викладача</span>
                        <input
                            type="text"
                            name="login"
                            value={login}
                            onChange={(event) => setLogin(event.target.value)}
                            autoComplete="username"
                            placeholder="login"
                            className={INPUT}
                            disabled={isSubmitting}
                        />
                    </label>

                    <label className="flex flex-col gap-1.5">
                        <span className={LABEL}>Пароль</span>
                        <input
                            type="password"
                            name="password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            autoComplete="current-password"
                            placeholder="••••••••"
                            className={INPUT}
                            disabled={isSubmitting}
                        />
                    </label>
                </div>

                {visibleError && (
                    <div role="alert" className={`${ALERT} mt-4`}>
                        {visibleError}
                    </div>
                )}

                <button
                    type="submit"
                    className={`${PRIMARY_BUTTON} mt-6 w-full`}
                    disabled={isSubmitting}
                >
                    {isSubmitting ? 'Перевірка доступу…' : 'Увійти'}
                </button>

                <p className="mt-4 text-center text-[11px] leading-relaxed text-yellow-500/60 dark:text-neutral-500 apple:text-white/60">
                    Сесія зберігається до закриття вкладки браузера.
                </p>
            </form>
        </section>
    )
}


interface ResultsPanelProps {
    readonly credentials: TeacherCredentials
    readonly onLogout: () => void
    readonly onSessionExpired: (message: string) => void
}

function ResultsPanel({
    credentials,
    onLogout,
    onSessionExpired,
}: ResultsPanelProps) {
    const [items, setItems] = useState<StudentResultItem[]>([])
    const [nextKey, setNextKey] = useState<string | null>(null)
    const [visibleCount, setVisibleCount] = useState(VISIBLE_STEP)
    const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE)
    const [testNameInput, setTestNameInput] = useState('')
    const [appliedTestName, setAppliedTestName] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [isLoadingMore, setIsLoadingMore] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const initialLoadRef = useRef(false)
    const tableScrollRef = useRef<HTMLDivElement | null>(null)
    /** Monotonic id: only the newest request may touch state. */
    const requestIdRef = useRef(0)
    /** Request currently in flight, aborted when superseded or on unmount. */
    const activeControllerRef = useRef<AbortController | null>(null)
    const isMountedRef = useRef(true)
    /** Latest committed rows, used for pagination-progress accounting. */
    const itemsRef = useRef<StudentResultItem[]>([])

    useEffect(() => {
        isMountedRef.current = true

        return () => {
            isMountedRef.current = false
            // StrictMode remounts in dev after this cleanup, so let the initial
            // page load run again once the aborted request is discarded.
            initialLoadRef.current = false
            activeControllerRef.current?.abort()
            activeControllerRef.current = null
        }
    }, [])

    useEffect(() => {
        itemsRef.current = items
    }, [items])

    const beginRequest = useCallback(() => {
        activeControllerRef.current?.abort()

        const controller = new AbortController()
        activeControllerRef.current = controller
        requestIdRef.current += 1

        return { requestId: requestIdRef.current, controller }
    }, [])

    const handleFailure = useCallback(
        (caught: unknown, requestId: number) => {
            if (
                !isMountedRef.current ||
                requestId !== requestIdRef.current ||
                isAbortError(caught)
            ) {
                return
            }

            if (caught instanceof Error && caught.message === UNAUTHORIZED_ERROR) {
                onSessionExpired(UNAUTHORIZED_MESSAGE)
                return
            }

            setError(describeError(caught))
        },
        [onSessionExpired],
    )

    const loadFirstPage = useCallback(
        async (testName: string, limit: number) => {
            const { requestId, controller } = beginRequest()

            setIsLoading(true)
            // A fresh first page supersedes any in-flight "load next page".
            setIsLoadingMore(false)
            setError(null)

            try {
                const response = await fetchStudentResults(
                    { credentials, limit, testName },
                    controller.signal,
                )

                if (!isMountedRef.current || requestId !== requestIdRef.current) {
                    return
                }

                setItems(response.items)
                setNextKey(response.nextKey)
                setVisibleCount(VISIBLE_STEP)
                setAppliedTestName(testName)
                tableScrollRef.current?.scrollTo({ top: 0 })
            } catch (caught) {
                handleFailure(caught, requestId)
            } finally {
                // An aborted/stale request must not turn off the spinner of the
                // request that replaced it.
                if (isMountedRef.current && requestId === requestIdRef.current) {
                    setIsLoading(false)

                    if (activeControllerRef.current === controller) {
                        activeControllerRef.current = null
                    }
                }
            }
        },
        [beginRequest, credentials, handleFailure],
    )

    useEffect(() => {
        if (initialLoadRef.current) {
            return
        }

        initialLoadRef.current = true
        void loadFirstPage('', DEFAULT_PAGE_SIZE)
    }, [loadFirstPage])

    const visibleItems = useMemo(
        () => items.slice(0, visibleCount),
        [items, visibleCount],
    )

    const handleRefresh = () => {
        void loadFirstPage(testNameInput.trim(), pageSize)
    }

    const handlePageSizeChange = (event: ChangeEvent<HTMLSelectElement>) => {
        const nextPageSize = Number(event.target.value)
        setPageSize(nextPageSize)
        // Preserve the filter that is actually applied — never the unsubmitted
        // text sitting in the input.
        void loadFirstPage(appliedTestName, nextPageSize)
    }

    const handleShowMore = () => {
        setVisibleCount((current) => Math.min(items.length, current + VISIBLE_STEP))
    }

    const handleLoadNextPage = async () => {
        if (!nextKey || isLoading || isLoadingMore) {
            return
        }

        const requestedLastKey = nextKey
        const { requestId, controller } = beginRequest()

        setIsLoadingMore(true)
        setError(null)

        try {
            const response = await fetchStudentResults(
                {
                    credentials,
                    limit: pageSize,
                    lastKey: requestedLastKey,
                    testName: appliedTestName,
                },
                controller.signal,
            )

            if (!isMountedRef.current || requestId !== requestIdRef.current) {
                return
            }

            // Requests are serialized, so the ref holds the latest committed
            // rows; merging functionally keeps React from seeing a stale array.
            const snapshot = itemsRef.current
            const addedCount =
                mergeResults(snapshot, response.items).length - snapshot.length

            setItems((previous) => mergeResults(previous, response.items))
            setVisibleCount((current) => current + addedCount)

            // Stop pagination when the cursor loops, the page is empty or the
            // page only repeats records we already have.
            const paginationStalled =
                response.items.length === 0 ||
                addedCount === 0 ||
                !response.nextKey ||
                response.nextKey === requestedLastKey

            setNextKey(paginationStalled ? null : response.nextKey)
        } catch (caught) {
            handleFailure(caught, requestId)
        } finally {
            if (isMountedRef.current && requestId === requestIdRef.current) {
                setIsLoadingMore(false)

                if (activeControllerRef.current === controller) {
                    activeControllerRef.current = null
                }
            }
        }
    }

    const hiddenCount = Math.max(0, items.length - visibleItems.length)

    return (
        <section className="relative z-40 mx-auto w-full max-w-6xl space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <p className={EYEBROW}>Teacher · AlgoLab</p>
                    <h1 className="mt-1 font-mono text-2xl font-bold tracking-tight text-zinc-100 dark:font-sans dark:text-white apple:font-sans apple:text-white sm:text-3xl">
                        Результати студентів
                    </h1>
                    <p className={`mt-1 ${MUTED_TEXT}`}>
                        Ви увійшли як{' '}
                        <span className="font-mono text-yellow-400 dark:font-sans dark:text-neutral-200 apple:text-sky-200">
                            {credentials.login}
                        </span>
                        .
                    </p>
                </div>

                <button type="button" onClick={onLogout} className={SECONDARY_BUTTON}>
                    Вийти
                </button>
            </div>

            <div className={`${PANEL} p-4 sm:p-5`} data-snow-surface="true">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-end">
                        <label className="flex w-full min-w-0 flex-col gap-1.5 sm:max-w-sm">
                            <span className={LABEL}>Фільтр за назвою тесту</span>
                            <input
                                type="search"
                                name="testName"
                                value={testNameInput}
                                onChange={(event) => setTestNameInput(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                        event.preventDefault()
                                        handleRefresh()
                                    }
                                }}
                                placeholder="Наприклад, Модуль 1 · Сортування"
                                className={INPUT}
                                disabled={isLoading}
                            />
                        </label>

                        <label className="flex shrink-0 flex-col gap-1.5">
                            <span className={LABEL}>Розмір сторінки</span>
                            <select
                                name="pageSize"
                                value={pageSize}
                                onChange={handlePageSizeChange}
                                className={`${INPUT} min-w-[7rem] cursor-pointer`}
                                disabled={isLoading}
                            >
                                {PAGE_SIZE_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                        {numberFormatter.format(option)}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <span className={COUNTER_BADGE}>
                            Завантажено: {numberFormatter.format(items.length)}
                        </span>
                        <button
                            type="button"
                            onClick={handleRefresh}
                            className={PRIMARY_BUTTON}
                            disabled={isLoading}
                        >
                            {isLoading ? 'Оновлення…' : 'Оновити'}
                        </button>
                    </div>
                </div>
            </div>

            {error && (
                <div role="alert" className={ALERT}>
                    {error}
                </div>
            )}

            <div className={`${PANEL} flex flex-col overflow-hidden`} data-snow-surface="true">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-yellow-500/30 px-4 py-3 dark:border-neutral-800 apple:border-b apple:border-white/15">
                    <h2 className="text-sm font-semibold text-yellow-400 dark:text-neutral-100 apple:text-white">
                        Журнал спроб
                    </h2>
                    <p className="font-mono text-[11px] text-yellow-500/70 dark:font-sans dark:text-neutral-400 apple:text-white/70">
                        Показано {numberFormatter.format(visibleItems.length)} з{' '}
                        {numberFormatter.format(items.length)}
                        {appliedTestName && ` · ${appliedTestName}`}
                    </p>
                </div>

                <div ref={tableScrollRef} className="max-h-[30rem] overflow-auto">
                    <table className="w-full min-w-[780px] border-collapse text-left">
                        <thead className="sticky top-0 z-10 bg-zinc-950 dark:bg-neutral-900 apple:bg-slate-900/95 apple:backdrop-blur-2xl">
                            <tr>
                                <th scope="col" className={HEAD_CELL}>
                                    Студент
                                </th>
                                <th scope="col" className={HEAD_CELL}>
                                    Тест
                                </th>
                                <th scope="col" className={HEAD_CELL}>
                                    Бали
                                </th>
                                <th scope="col" className={HEAD_CELL}>
                                    Відповіді
                                </th>
                                <th scope="col" className={HEAD_CELL}>
                                    Дата
                                </th>
                            </tr>
                        </thead>

                        <tbody className="text-sm">
                            {isLoading && items.length === 0 &&
                                Array.from({ length: 5 }, (_, index) => (
                                    <tr
                                        key={`skeleton-${index}`}
                                        className="border-t border-yellow-500/15 dark:border-neutral-800 apple:border-t apple:border-white/10"
                                        aria-hidden="true"
                                    >
                                        {Array.from({ length: 5 }, (_, cell) => (
                                            <td key={cell} className="px-4 py-3">
                                                <span className="block h-3 w-full max-w-[9rem] animate-pulse rounded-none bg-yellow-500/15 dark:rounded dark:bg-neutral-700/60 apple:rounded-full apple:bg-white/15" />
                                            </td>
                                        ))}
                                    </tr>
                                ))}

                            {visibleItems.map((item, index) => (
                                <tr
                                    key={item.submissionId || `${item.createdAt}-${index}`}
                                    className="border-t border-yellow-500/15 align-top transition-colors duration-150 even:bg-yellow-400/[0.04] hover:bg-yellow-400/10 dark:border-neutral-800 dark:even:bg-neutral-800/40 dark:hover:bg-neutral-800/70 apple:border-t apple:border-white/10 apple:even:bg-white/[0.06] apple:hover:bg-white/[0.12]"
                                >
                                    <td className="px-4 py-3">
                                        <p className="max-w-[14rem] truncate font-medium text-yellow-300 dark:text-neutral-100 apple:text-white">
                                            {item.studentName}
                                        </p>
                                        <p
                                            className="max-w-[14rem] truncate font-mono text-[10px] text-yellow-500/50 dark:font-sans dark:text-neutral-500 apple:text-white/50"
                                            title={item.submissionId}
                                        >
                                            {item.submissionId || '—'}
                                        </p>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="inline-block max-w-[13rem] truncate text-yellow-200/90 dark:text-neutral-300 apple:text-white/90">
                                            {item.testName}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span
                                            className={`inline-flex min-w-[3.5rem] items-center justify-center rounded-none border px-2 py-1 font-mono text-xs font-semibold dark:rounded-full dark:font-sans apple:rounded-full apple:border apple:backdrop-blur-2xl ${scoreToneClass(item.score)}`}
                                            title={
                                                item.score === null
                                                    ? 'Бал не вказано'
                                                    : undefined
                                            }
                                        >
                                            {item.score === null
                                                ? '—'
                                                : numberFormatter.format(item.score)}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        {item.answers.length === 0 ? (
                                            <span className="text-yellow-500/40 dark:text-neutral-600 apple:text-white/40">
                                                —
                                            </span>
                                        ) : (
                                            <span className="flex flex-wrap gap-1">
                                                {item.answers.slice(0, 3).map((answer, answerIndex) => (
                                                    <span
                                                        key={`${answer}-${answerIndex}`}
                                                        className="max-w-[9rem] truncate rounded-none border border-yellow-500/30 bg-yellow-400/10 px-1.5 py-0.5 font-mono text-[10px] text-yellow-300 dark:rounded dark:border-neutral-700 dark:bg-neutral-800 dark:font-sans dark:text-neutral-300 apple:rounded-full apple:border apple:border-white/20 apple:bg-white/10 apple:text-white/90"
                                                        title={answer}
                                                    >
                                                        {answer}
                                                    </span>
                                                ))}
                                                {item.answers.length > 3 && (
                                                    <span className="rounded-none border border-yellow-500/30 px-1.5 py-0.5 font-mono text-[10px] text-yellow-500/80 dark:rounded dark:border-neutral-700 dark:font-sans dark:text-neutral-400 apple:rounded-full apple:border apple:border-white/20 apple:text-white/70">
                                                        +{item.answers.length - 3}
                                                    </span>
                                                )}
                                            </span>
                                        )}
                                    </td>
                                    <td
                                        className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-yellow-500/70 dark:font-sans dark:text-neutral-400 apple:text-white/70"
                                        title={item.createdAt}
                                    >
                                        <span className="hidden sm:inline">
                                            {formatSubmittedAt(item.createdAt)}
                                        </span>
                                        <span className="sm:hidden">
                                            {formatShortDate(item.createdAt)}
                                        </span>
                                    </td>
                                </tr>
                            ))}

                            {!isLoading && items.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-4 py-12 text-center">
                                        <p className="text-sm font-semibold text-yellow-400 dark:text-neutral-200 apple:text-white">
                                            Результатів поки немає
                                        </p>
                                        <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-yellow-500/70 dark:text-neutral-400 apple:text-white/70">
                                            Спробуйте змінити фільтр за назвою тесту
                                            або натисніть «Оновити».
                                        </p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                <div className="flex flex-col gap-3 border-t border-yellow-500/30 px-4 py-3 dark:border-neutral-800 apple:border-t apple:border-white/15 sm:flex-row sm:items-center sm:justify-between">
                    <p className="font-mono text-[11px] leading-relaxed text-yellow-500/70 dark:font-sans dark:text-neutral-400 apple:text-white/70">
                        {items.length === 0
                            ? 'Немає завантажених записів.'
                            : hiddenCount > 0
                              ? `Ще ${numberFormatter.format(hiddenCount)} записів приховано для швидкодії.`
                              : nextKey
                                ? 'Показано всі завантажені записи.'
                                : 'Усі записи з бази завантажено.'}
                    </p>

                    <div className="flex flex-wrap gap-2">
                        {hiddenCount > 0 && (
                            <button
                                type="button"
                                onClick={handleShowMore}
                                className={SECONDARY_BUTTON}
                            >
                                Показати ще 100 зі списку
                            </button>
                        )}

                        {nextKey && (
                            <button
                                type="button"
                                onClick={handleLoadNextPage}
                                className={PRIMARY_BUTTON}
                                disabled={isLoadingMore || isLoading}
                            >
                                {isLoadingMore
                                    ? 'Завантаження…'
                                    : 'Завантажити наступну сторінку з бази'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </section>
    )
}


export function TeacherDashboard() {
    const [credentials, setCredentials] = useState<TeacherCredentials | null>(
        readStoredCredentials,
    )
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [authError, setAuthError] = useState<string | null>(null)

    const handleSubmit = async (nextCredentials: TeacherCredentials) => {
        setIsSubmitting(true)
        setAuthError(null)

        try {
            // Credential probe: the smallest useful page keeps the check cheap.
            await fetchStudentResults({
                credentials: nextCredentials,
                limit: DEFAULT_PAGE_SIZE,
            })

            persistCredentials(nextCredentials)
            setCredentials(nextCredentials)
        } catch (caught) {
            if (caught instanceof Error && caught.message === UNAUTHORIZED_ERROR) {
                setAuthError(UNAUTHORIZED_MESSAGE)
            } else {
                setAuthError(describeError(caught))
            }
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleLogout = useCallback(() => {
        persistCredentials(null)
        setCredentials(null)
        setAuthError(null)
    }, [])

    const handleSessionExpired = useCallback((message: string) => {
        persistCredentials(null)
        setCredentials(null)
        setAuthError(message)
    }, [])

    if (!credentials) {
        return (
            <LoginForm
                error={authError}
                isSubmitting={isSubmitting}
                onSubmit={(nextCredentials) => {
                    void handleSubmit(nextCredentials)
                }}
            />
        )
    }

    return (
        <ResultsPanel
            credentials={credentials}
            onLogout={handleLogout}
            onSessionExpired={handleSessionExpired}
        />
    )
}
