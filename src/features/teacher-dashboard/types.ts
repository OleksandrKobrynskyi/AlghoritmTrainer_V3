/**
 * Domain types of the teacher-dashboard feature.
 *
 * Mirrors the GET /results contract of the algolab-backend Lambda:
 * `{ items, count?, nextKey }`, where `nextKey` is an opaque cursor.
 */

export interface StudentResultItem {
    submissionId: string
    studentName: string
    testName: string
    /**
     * `null` when the backend did not report a score (missing, `null` or
     * non-numeric). An absent grade must stay distinguishable from a real `0`.
     */
    score: number | null
    answers: string[]
    createdAt: string
}

export interface GetResultsResponse {
    items: StudentResultItem[]
    count?: number
    nextKey: string | null
}

export interface TeacherCredentials {
    login: string
    password: string
}

export interface FetchResultsParams {
    credentials: TeacherCredentials
    limit?: number
    lastKey?: string | null
    testName?: string
}
