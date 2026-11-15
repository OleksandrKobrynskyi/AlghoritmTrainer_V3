/**
 * Public facade of the result-submission feature.
 * Only this file should be imported by the rest of the application.
 */
export { ResultSubmissionModal } from './ResultSubmissionModal'
export type { ResultSubmissionModalProps } from './ResultSubmissionModal'

export { submitStudentResult, INVALID_NAME_ERROR } from './api'

export type { SubmissionPayload, SubmissionResponse } from './types'
