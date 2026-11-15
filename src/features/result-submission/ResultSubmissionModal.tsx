import { useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { INVALID_NAME_ERROR, submitStudentResult } from './api'
import type { SubmissionPayload } from './types'

/**
 * Modal that collects the student's name and publishes the finished test.
 *
 * Layering: the overlay/card stay on `z-40` — above the seasonal canvas
 * (`pointer-events-none z-30`) and below the sticky header (`z-50`).
 */

const NAME_MIN_LENGTH = 2
const NAME_MAX_LENGTH = 100
const FALLBACK_ERROR = 'Не вдалося зберегти результат. Спробуйте ще раз.'

const OVERLAY =
  'fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-zinc-950/85 px-4 py-10 sm:items-center dark:bg-neutral-950/85 apple:bg-slate-950/45 apple:backdrop-blur-md'

const CARD =
  'relative z-40 flex w-full max-w-md flex-col gap-5 rounded-none border-2 border-yellow-400 bg-zinc-950 p-6 font-mono text-yellow-400 shadow-[0_0_45px_-12px_rgba(250,204,21,0.45)] dark:rounded-2xl dark:border-neutral-700 dark:bg-neutral-900 dark:font-sans dark:text-neutral-100 dark:shadow-xl dark:shadow-black/30 apple:rounded-3xl apple:border apple:border-white/25 apple:bg-white/15 apple:text-white apple:font-sans apple:shadow-2xl apple:shadow-black/20 apple:backdrop-blur-2xl'

const TITLE =
  'text-base font-bold uppercase tracking-[0.16em] text-yellow-400 dark:text-neutral-100 dark:normal-case dark:tracking-normal apple:text-white apple:normal-case apple:tracking-normal'

const LABEL =
  'text-[11px] font-semibold uppercase tracking-[0.16em] text-yellow-500/80 dark:tracking-[0.12em] dark:text-neutral-400 apple:text-white/80'

const MUTED =
  'text-xs leading-relaxed text-yellow-500/70 dark:text-neutral-400 apple:text-white/70'

const STAT_TILE =
  'rounded-none border border-yellow-500/30 bg-zinc-950 px-3 py-2 dark:rounded-xl dark:border-neutral-700 dark:bg-neutral-950 apple:rounded-2xl apple:border apple:border-white/20 apple:bg-white/10 apple:backdrop-blur-xl'

const INPUT =
  'w-full rounded-none border-2 border-yellow-500/50 bg-zinc-950 px-3 py-2.5 font-mono text-sm text-yellow-400 placeholder:text-yellow-500/40 transition-colors duration-200 focus:border-yellow-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:rounded-lg dark:border-neutral-700 dark:bg-neutral-950 dark:font-sans dark:text-neutral-100 dark:placeholder:text-neutral-600 dark:focus:border-neutral-500 apple:rounded-2xl apple:border apple:border-white/25 apple:bg-white/10 apple:font-sans apple:text-white apple:placeholder:text-white/50 apple:backdrop-blur-2xl apple:focus:border-white/50'

/** Octagon matches the 14px snow offset used by `SeasonalCanvas`. */
const BUTTON_BASE =
  'inline-flex w-full items-center justify-center gap-2 px-4 py-2.5 font-mono text-sm font-bold uppercase tracking-wider transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:cursor-not-allowed disabled:opacity-40 [clip-path:polygon(14px_0,100%_0,100%_calc(100%-14px),calc(100%-14px)_100%,0_100%,0_14px)] apple:rounded-full apple:[clip-path:none] dark:font-sans apple:font-sans apple:normal-case apple:tracking-normal apple:focus-visible:ring-sky-400 apple:focus-visible:ring-offset-slate-950'

const PRIMARY_BUTTON =
  'bg-yellow-400 text-zinc-950 hover:bg-yellow-300 dark:bg-white dark:text-neutral-950 dark:hover:bg-neutral-200 apple:bg-white apple:text-slate-950 apple:hover:bg-white/90 apple:shadow-lg apple:shadow-white/10'

const SECONDARY_BUTTON =
  'border-2 border-yellow-400 bg-zinc-900 text-yellow-400 hover:bg-yellow-400 hover:text-zinc-950 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white apple:border apple:border-white/25 apple:bg-white/15 apple:text-white apple:hover:bg-white/25 apple:backdrop-blur-2xl'

const ALERT =
  'rounded-none border-2 border-rose-500 bg-rose-500/10 px-4 py-3 text-xs leading-relaxed text-rose-400 dark:rounded-xl dark:border-rose-500/40 dark:text-rose-300 apple:rounded-2xl apple:border apple:border-rose-400/40 apple:bg-rose-500/20 apple:text-rose-100 apple:backdrop-blur-2xl'

const SUCCESS =
  'rounded-none border-2 border-emerald-500/60 bg-emerald-500/10 px-4 py-3 text-xs leading-relaxed text-emerald-400 dark:rounded-xl dark:border-emerald-400/40 dark:text-emerald-300 apple:rounded-2xl apple:border apple:border-emerald-300/40 apple:bg-emerald-400/20 apple:text-emerald-100 apple:backdrop-blur-2xl'

type SubmissionStatus = 'idle' | 'submitting' | 'success' | 'error'

export interface ResultSubmissionModalProps {
  testName: string
  score: number
  answers: string[]
  onSuccess?: (submissionId: string) => void
  onClose?: () => void
}

export function ResultSubmissionModal({
  testName,
  score,
  answers,
  onSuccess,
  onClose,
}: ResultSubmissionModalProps) {
  const [studentName, setStudentName] = useState('')
  const [status, setStatus] = useState<SubmissionStatus>('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [savedId, setSavedId] = useState('')

  const isSubmitting = status === 'submitting'
  const isSaved = status === 'success'
  const isLocked = isSubmitting || isSaved
  const roundedScore = Math.round(score)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (isLocked) {
      return
    }

    const trimmedName = studentName.trim()

    if (
      trimmedName.length < NAME_MIN_LENGTH ||
      trimmedName.length > NAME_MAX_LENGTH
    ) {
      setStatus('error')
      setErrorMessage(INVALID_NAME_ERROR)
      return
    }

    setStatus('submitting')
    setErrorMessage('')

    const payload: SubmissionPayload = {
      studentName: trimmedName,
      testName,
      score: roundedScore,
      answers,
    }

    const response = await submitStudentResult(payload)

    if (response.status === 'error') {
      setStatus('error')
      setErrorMessage(response.error || FALLBACK_ERROR)
      return
    }

    const submissionId = response.submissionId ?? ''

    setSavedId(submissionId)
    setStatus('success')
    onSuccess?.(submissionId)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Escape' || isSubmitting) {
      return
    }

    event.stopPropagation()
    onClose?.()
  }

  return (
    <div className={OVERLAY} onKeyDown={handleKeyDown}>
      <div
        className={CARD}
        role="dialog"
        aria-modal="true"
        aria-labelledby="result-submission-title"
        aria-describedby="result-submission-description"
      >
        <div className="flex flex-col gap-1.5">
          <h2 id="result-submission-title" className={TITLE}>
            Зберегти результат
          </h2>
          <p id="result-submission-description" className={MUTED}>
            Вкажіть імʼя та прізвище, щоб викладач побачив ваш результат у
            списку.
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-2.5">
          <div className={`${STAT_TILE} col-span-2`}>
            <dt className={LABEL}>Тест</dt>
            <dd
              className="mt-1 truncate text-sm font-semibold"
              title={testName}
            >
              {testName || '—'}
            </dd>
          </div>
          <div className={STAT_TILE}>
            <dt className={LABEL}>Результат</dt>
            <dd className="mt-1 text-sm font-semibold tabular-nums">
              {roundedScore}
            </dd>
          </div>
          <div className={STAT_TILE}>
            <dt className={LABEL}>Відповідей</dt>
            <dd className="mt-1 text-sm font-semibold tabular-nums">
              {answers.length}
            </dd>
          </div>
        </dl>

        <form className="flex flex-col gap-3" onSubmit={handleSubmit} noValidate>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="result-submission-name" className={LABEL}>
              Ваше імʼя та прізвище
            </label>
            <input
              id="result-submission-name"
              className={INPUT}
              type="text"
              value={studentName}
              onChange={(event) => setStudentName(event.target.value)}
              placeholder="Наприклад, Олена Ковальчук"
              autoComplete="name"
              maxLength={NAME_MAX_LENGTH}
              disabled={isLocked}
              autoFocus
              aria-invalid={status === 'error'}
              aria-describedby="result-submission-hint"
            />
            <p id="result-submission-hint" className={MUTED}>
              Від {NAME_MIN_LENGTH} до {NAME_MAX_LENGTH} символів. Імʼя бачать
              лише викладачі.
            </p>
          </div>

          {status === 'error' && errorMessage ? (
            <p className={ALERT} role="alert">
              {errorMessage}
            </p>
          ) : null}

          {isSaved ? (
            <p className={SUCCESS} role="status">
              Результат збережено
              {savedId ? ` (№ ${savedId})` : ''}. Викладач побачить його у
              списку.
            </p>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <button
              type="submit"
              className={`${BUTTON_BASE} ${PRIMARY_BUTTON}`}
              disabled={isLocked}
            >
              {isSubmitting
                ? 'Надсилання…'
                : isSaved
                  ? 'Збережено'
                  : 'Зберегти результат'}
            </button>
            <button
              type="button"
              className={`${BUTTON_BASE} ${SECONDARY_BUTTON}`}
              onClick={() => onClose?.()}
              disabled={isSubmitting}
            >
              Закрити
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
