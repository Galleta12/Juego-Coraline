import { handleProgress } from "./_core.js";

/** Endpoint de Vercel: POST /api/progress */
export async function POST(request: Request): Promise<Response> {
  return handleProgress(request);
}

export async function OPTIONS(request: Request): Promise<Response> {
  return handleProgress(request);
}
