import { historicalData } from '@/lib/investment-sim-data'

export async function GET() {
  return Response.json({ data: historicalData, count: historicalData.length })
}
