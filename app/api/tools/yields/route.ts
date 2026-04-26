import { areas, ZONES } from '@/lib/yield-heatmap-data'

export async function GET() {
  return Response.json({ areas, zones: ZONES })
}
