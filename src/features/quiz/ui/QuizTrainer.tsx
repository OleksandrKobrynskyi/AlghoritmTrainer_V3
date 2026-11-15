import { useEffect, useRef } from 'react'
import type { QuizMode, SortingStatePayload } from '../model/types'
import { useQuizEngine } from '../lib/useQuizEngine'
import { QuizGame } from './QuizGame'
import { QuizLobby } from './QuizLobby'
import { QuizResults } from './QuizResults'

const TEST_NAMES: Record<QuizMode, string> = {
  mixed: 'Мікс',
  sorting: 'Наступний крок',
  theory: 'Банк тестів',
}

interface QuizTrainerProps {
  /**
   * Optional Module 1 snapshots. When omitted, mockModule1Data is used, so the
   * module can be developed and demoed before the sorting module is ready.
   */
  sortingPayloads?: SortingStatePayload[]
  onFinish?: (draft: { testName: string; score: number; answers: string[] }) => void;
}

export function QuizTrainer({ sortingPayloads, onFinish }: QuizTrainerProps) {
  const engine = useQuizEngine({ payloads: sortingPayloads })
  const finishedAtRef = useRef<number | null>(engine.finishedAt)

  useEffect(() => {
    if (engine.status !== 'finished' || engine.finishedAt === null) {
      return
    }

    if (finishedAtRef.current === engine.finishedAt) {
      return
    }

    finishedAtRef.current = engine.finishedAt

    onFinish?.({
      testName: TEST_NAMES[engine.mode],
      score: engine.score,
      answers: engine.answers.map((answer) => answer.selectedOptionId),
    })
  }, [
    engine.status,
    engine.finishedAt,
    engine.mode,
    engine.score,
    engine.answers,
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
