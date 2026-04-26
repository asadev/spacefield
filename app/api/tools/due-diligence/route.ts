import { CHECKLISTS, PROPERTY_TYPES, CATEGORY_META } from '@/lib/due-diligence-data'

export async function GET() {
  return Response.json({ propertyTypes: PROPERTY_TYPES, checklists: CHECKLISTS, categoryMeta: CATEGORY_META })
}
