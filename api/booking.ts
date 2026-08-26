import { handleBooking } from "./_core.js";

/** Endpoint de Vercel: POST /api/booking */
export async function POST(request: Request): Promise<Response> {
  return handleBooking(request);
}

export async function OPTIONS(request: Request): Promise<Response> {
  return handleBooking(request);
}
