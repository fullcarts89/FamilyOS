/** Errors that map to a JSON response. Messages are fixed codes, never user input. */
export class ApiError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 422,
    readonly code: string,
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

export const notFound = () => new ApiError(404, 'not_found');
export const forbidden = () => new ApiError(403, 'forbidden');
export const conflict = (code = 'version_conflict') => new ApiError(409, code);
