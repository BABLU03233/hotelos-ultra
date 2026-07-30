import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

export function unauthorized(message = "Not authenticated"): ApiError {
  return new ApiError(401, message);
}

export function forbidden(message = "Not allowed"): ApiError {
  return new ApiError(403, message);
}

export function notFound(message = "Not found"): ApiError {
  return new ApiError(404, message);
}

/**
 * Wraps a Route Handler body so every route gets consistent JSON error
 * shapes without repeating try/catch: ApiError -> its status, ZodError ->
 * 400 with field messages, anything else -> 500 (logged, not leaked).
 */
export function apiRoute<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>
) {
  return async (...args: Args): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof ApiError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      if (err instanceof ZodError) {
        return NextResponse.json(
          { error: "Invalid request", issues: err.issues },
          { status: 400 }
        );
      }
      console.error(err);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}
