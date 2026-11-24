import { useEffect, useRef } from 'react'
import type {
  QuizAnswerRecord,
  QuizMode,
  QuizQuestion,
  SortingStatePayload,
} from '../model/types'
import { useQuizEngine } from '../lib/useQuizEngine'
import {
  hasQuizResultBeenEmitted,
  markQuizResultEmitted,
} from '../lib/storage'
import { QuizGame } from './QuizGame'
import { QuizLobby } from './QuizLobby'
import { QuizResults } from './QuizResults'

const TEST_NAMES: Record<QuizMode, string> = {
  mixed: 'Мікс',
  sorting: 'Наступний крок',
  theory: 'Банк тестів',
}

const MAX_SCALED_SCORE = 1000
const MAX_ANSWER_LENGTH = 256

function scaleScore(score: number, totalQuestions: number): number {
  if (totalQuestions <= 0) {
    return 0
  }

  const scaledScore = Math.round((score / totalQuestions) * MAX_SCALED_SCORE)

  return Math.min(MAX_SCALED_SCORE, Math.max(0, scaledScore))
}

function formatAnswer(
  answer: QuizAnswerRecord,
  questions: QuizQuestion[],
): string {
  const questionId = answer.questionId.trim() || 'unknown-question'
  const selectedOptionId = answer.selectedOptionId.trim() || 'unknown-option'
  const question = questions.find((item) => item.id === answer.questionId)
  const option = question?.options.find(
    (item) => item.id === answer.selectedOptionId,
  )
  const optionText =
    option?.label?.trim() || option?.value?.trim() || selectedOptionId
  const formatted = `${questionId}: [${selectedOptionId}] ${optionText}`

  return formatted.slice(0, MAX_ANSWER_LENGTH).trim() || 'unknown-answer'
}

interface QuizTrainerProps {
  /**
   * Optional Module 1 snapshots. When omitted, mockModule1Data is used, so the
   * module can be developed and demoed before the sorting module is ready.
   */
  sortingPayloads?: SortingStatePayload[]
  onFinish?: (draft: { testName: string; score: number; answers: string[] }) => void
}

export function QuizTrainer({ sortingPayloads, onFinish }: QuizTrainerProps) {
  const engine = useQuizEngine({ payloads: sortingPayloads })
  const emittedRunRef = useRef<string | null>(null)

  useEffect(() => {
    if (engine.status !== 'finished') {
      // A restart/quit/reset starts a new lifecycle; forget the previous run so
      // its successor can emit even if the clock returns the same timestamp.
      emittedRunRef.current = null
      return
    }

    if (engine.finishedAt === null) {
      return
    }

    const runId = String(engine.finishedAt)

    if (emittedRunRef.current === runId) {
      return
    }

    if (hasQuizResultBeenEmitted(runId)) {
      emittedRunRef.current = runId
      return
    }

    // Mark the run before invoking onFinish so StrictMode's double effect
    // invocation cannot open the submission modal twice.
    emittedRunRef.current = runId
    markQuizResultEmitted(runId)

    onFinish?.({
      testName: TEST_NAMES[engine.mode],
      score: scaleScore(engine.score, engine.totalQuestions),
      answers: engine.answers.map((answer) =>
        formatAnswer(answer, engine.questions),
      ),
    })
  }, [
    engine.status,
    engine.finishedAt,
    engine.mode,
    engine.score,
    engine.totalQuestions,
    engine.answers,
    engine.questions,
    onFinish,
  ])

  if (engine.status === 'playing' && engine.currentQuestion) {
    return (
      <QuizGame
        question={engine.currentQuestion}
        questions={engine.questions}
        answers={engine.answers}
        currentIndex={engine.currentIndex}
        totalQuestions={engine.totalQuestions}
        score={engine.score}
        selectedOptionId={engine.selectedOptionId}
        isAnswered={engine.isAnswered}
        isCorrect={engine.isCorrect}
        onSelectAnswer={engine.selectAnswer}
        onNext={engine.nextQuestion}
        onQuit={engine.quitSession}
      />
    )
  }

  if (engine.status === 'finished') {
    return (
      <QuizResults
        questions={engine.questions}
        answers={engine.answers}
        score={engine.score}
        total={engine.totalQuestions}
        stats={engine.stats}
        startedAt={engine.startedAt}
        finishedAt={engine.finishedAt}
        onRestart={engine.restartQuiz}
        onExit={engine.quitSession}
      />
    )
  }

  return (
    <QuizLobby
      stats={engine.stats}
      onStart={engine.startQuiz}
      onResetProgress={engine.resetProgress}
    />
  )
}
