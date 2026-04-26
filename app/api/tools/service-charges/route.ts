import { serviceChargeData } from '@/lib/service-charge-data'

export async function GET() {
  return Response.json({ data: serviceChargeData, count: serviceChargeData.length })
}
