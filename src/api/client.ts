/**
 * Base HTTP client for BhoomiSetu FastAPI backend.
 */

export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '') || 'http://127.0.0.1:8000'

export class ApiError extends Error {
  status: number
  detail?: string

  constructor(message: string, status: number, detail?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

export async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${path}`
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  }

  try {
    const response = await fetch(url, { ...options, headers })

    if (!response.ok) {
      let detailMessage = `HTTP error ${response.status}`
      try {
        const errorData = (await response.json()) as { detail?: string }
        if (errorData?.detail) {
          detailMessage = typeof errorData.detail === 'string' ? errorData.detail : JSON.stringify(errorData.detail)
        }
      } catch {
        detailMessage = response.statusText || detailMessage
      }
      throw new ApiError(detailMessage, response.status, detailMessage)
    }

    return (await response.json()) as T
  } catch (error) {
    if (error instanceof ApiError) {
      throw error
    }
    const message = error instanceof Error ? error.message : 'Network failure while contacting BhoomiSetu API'
    throw new ApiError(message, 0, message)
  }
}
