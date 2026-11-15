/**
 * Domain types of the result-submission feature.
 *
 * Mirrors the POST /results contract of the algolab-backend Lambda:
 * the student sends `{ studentName, testName, score, answers }` and receives
 * `{ status, submissionId? }` (or `{ status, error? }` for soft failures).
 */

export interface SubmissionPayload {
  studentName: string
  testName: string
  score: number
  answers: string[]
}

export interface SubmissionResponse {
  status: string
  submissionId?: string
  error?: string
}
