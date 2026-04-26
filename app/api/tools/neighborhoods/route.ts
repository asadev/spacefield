import { communities } from '@/lib/neighborhood-data'
import { computeAllScores } from '@/lib/neighborhood-scoring'

export async function GET() {
  const scoresMap = computeAllScores(communities)
  const scored = communities.map((c) => ({
    ...c,
    scores: scoresMap.get(c.id) ?? null,
  }))
  return Response.json({ data: scored, count: scored.length })
}
