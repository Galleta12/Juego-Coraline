import { handleGameOpen } from "./_core.js";

/** Endpoint de Vercel: POST /api/game-open */
export async function POST(request: Request): Promise<Response> {
  return handleGameOpen(request);
}

export async function OPTIONS(request: Request): Promise<Response> {
  return handleGameOpen(request);
}
