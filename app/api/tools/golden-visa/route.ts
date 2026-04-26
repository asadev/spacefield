import { visaCategories, faqs, DATA_UPDATED } from '@/lib/golden-visa-data'

export async function GET() {
  return Response.json({ categories: visaCategories, faqs, dataUpdated: DATA_UPDATED })
}
