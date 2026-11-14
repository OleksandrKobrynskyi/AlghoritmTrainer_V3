/**
 * Public facade of the teacher-dashboard feature.
 * Only this file should be imported by the rest of the application.
 */
export { TeacherDashboard } from './TeacherDashboard'

export { fetchStudentResults, UNAUTHORIZED_ERROR } from './api'

export type {
    FetchResultsParams,
    GetResultsResponse,
    StudentResultItem,
    TeacherCredentials,
} from './types'
