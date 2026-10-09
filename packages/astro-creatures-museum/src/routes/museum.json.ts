import { museumPlan } from '../museum-content';

// The museum's plan (src/museum-content.ts), fetched when a visitor walks in.
export async function GET() {
  return Response.json(await museumPlan());
}
