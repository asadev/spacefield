import { developers } from '@/lib/developer-data'

export async function GET() {
  return Response.json({ data: developers, count: developers.length })
}
