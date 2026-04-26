import { Community } from "./neighborhood-data";
export type { Community } from "./neighborhood-data";

export interface CommunityScores {
  overall: number;
  investment: number;
  livability: number;
  connectivity: number;
  family: number;
  value: number;
  growth: number;
}

// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------
const WEIGHTS = {
  investment: 0.2,
  livability: 0.2,
  connectivity: 0.15,
  family: 0.15,
  value: 0.15,
  growth: 0.15,
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function mid(r: { min: number; max: number }): number {
  return (r.min + r.max) / 2;
}

function parseTxVolume(s: string): number {
  const parts = s.split("-").map(Number);
  if (parts.length === 2) return (parts[0] + parts[1]) / 2;
  return parts[0] || 0;
}

function percentileRanks(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  return values.map((v) => {
    const below = sorted.filter((s) => s < v).length;
    const equal = sorted.filter((s) => s === v).length;
    return (below + equal / 2) / sorted.length;
  });
}

function clamp(v: number, lo = 0, hi = 10): number {
  return Math.min(hi, Math.max(lo, v));
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

// ---------------------------------------------------------------------------
// Category scorers
// ---------------------------------------------------------------------------

function scoreInvestment(c: Community, txPercentile: number): number {
  const yieldMid = mid(c.investment.rentalYieldPct);
  const yieldScore = yieldMid >= 8 ? 10 : yieldMid >= 6 ? 8 : yieldMid >= 4 ? 6 : 4;

  const yoyMid = mid(c.pricing.priceChangeYoY);
  const yoyScore =
    yoyMid > 15 ? 10 : yoyMid >= 10 ? 8 : yoyMid >= 5 ? 6 : yoyMid >= 0 ? 4 : 2;

  const txScore = clamp(1 + txPercentile * 9);

  const capMid = mid(c.investment.capitalAppreciation3y);
  const capScore =
    capMid > 40 ? 10 : capMid >= 30 ? 8 : capMid >= 20 ? 6 : capMid >= 10 ? 4 : 2;

  return (yieldScore + yoyScore + txScore + capScore) / 4;
}

function scoreLivability(c: Community): number {
  const amenityCount =
    c.livability.nearbyMalls.length +
    c.livability.nearbyHospitals.length +
    c.livability.nearbySupermarkets.length;
  const amenityScore =
    amenityCount >= 8
      ? 10
      : amenityCount >= 5
        ? 8
        : amenityCount >= 3
          ? 6
          : amenityCount >= 1
            ? 4
            : 2;

  const parksCount = c.livability.nearbyParks.length;
  const parksScore =
    parksCount >= 3 ? 10 : parksCount === 2 ? 7 : parksCount === 1 ? 5 : 2;

  const bd = c.livability.beachDistanceKm;
  const beachScore = bd < 2 ? 10 : bd <= 5 ? 8 : bd <= 10 ? 5 : bd <= 20 ? 3 : 1;

  const noiseScore =
    c.livability.noiseLevel === "low"
      ? 10
      : c.livability.noiseLevel === "moderate"
        ? 6
        : 3;

  const petScore = c.livability.petFriendly ? 8 : 4;

  return (amenityScore + parksScore + beachScore + noiseScore + petScore) / 5;
}

function scoreConnectivity(c: Community): number {
  const md = c.connectivity.nearestMetro.distanceKm;
  const metroScore = md < 0.5 ? 10 : md <= 1 ? 8 : md <= 3 ? 6 : md <= 5 ? 4 : 2;

  const avgCommute =
    (c.connectivity.commuteMinutes.difc +
      c.connectivity.commuteMinutes.businessBay +
      c.connectivity.commuteMinutes.marina) /
    3;
  const commuteScore =
    avgCommute < 10 ? 10 : avgCommute <= 20 ? 8 : avgCommute <= 30 ? 6 : avgCommute <= 45 ? 4 : 2;

  const walkScore = c.connectivity.walkabilityScore;

  return (metroScore + commuteScore + walkScore) / 3;
}

function scoreFamily(c: Community): number {
  const schoolCount = c.familyFriendliness.schools.length;
  const schoolCountScore =
    schoolCount >= 5 ? 10 : schoolCount >= 3 ? 8 : schoolCount >= 1 ? 5 : 2;

  const ratingMap: Record<string, number> = {
    Outstanding: 10,
    "Very Good": 8,
    Good: 6,
    Acceptable: 4,
  };
  const bestRating = Math.max(
    ...c.familyFriendliness.schools.map((s) => ratingMap[s.rating] ?? 4),
    2
  );

  const playCount = c.familyFriendliness.playAreas;
  const playScore =
    playCount >= 5 ? 10 : playCount >= 3 ? 8 : playCount >= 1 ? 5 : 2;

  const safetyScore = c.familyFriendliness.safetyPerception === "high" ? 10 : 6;

  return (schoolCountScore + bestRating + playScore + safetyScore) / 4;
}

function scoreValue(
  c: Community,
  pricePercentile: number,
  yieldToPricePercentile: number
): number {
  const priceInvScore =
    pricePercentile <= 0.2
      ? 10
      : pricePercentile <= 0.4
        ? 8
        : pricePercentile <= 0.6
          ? 6
          : pricePercentile <= 0.8
            ? 4
            : 3;

  const scMid = mid(c.pricing.serviceChargePerSqft);
  const scScore = scMid < 10 ? 10 : scMid <= 15 ? 8 : scMid <= 20 ? 6 : scMid <= 30 ? 4 : 3;

  const ytpScore = clamp(1 + yieldToPricePercentile * 9);

  return (priceInvScore + scScore + ytpScore) / 3;
}

function scoreGrowth(c: Community): number {
  const d2040Score =
    c.futureGrowth.dubai2040Impact === "high"
      ? 10
      : c.futureGrowth.dubai2040Impact === "medium"
        ? 6
        : 3;

  const projCount = c.futureGrowth.upcomingProjects.length;
  const projScore =
    projCount >= 3 ? 10 : projCount === 2 ? 7 : projCount === 1 ? 5 : 2;

  const infraScore = c.futureGrowth.infrastructurePlanned.length > 0 ? 8 : 3;

  const cs = c.futureGrowth.completionStatus;
  const compScore = cs < 0.5 ? 10 : cs <= 0.8 ? 7 : 5;

  return (d2040Score + projScore + infraScore + compScore) / 4;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function computeAllScores(
  communities: Community[]
): Map<string, CommunityScores> {
  const txVolumes = communities.map((c) =>
    parseTxVolume(c.pricing.transactionVolume12m)
  );
  const txPercentiles = percentileRanks(txVolumes);

  const priceMids = communities.map((c) => mid(c.pricing.pricePerSqft));
  const pricePercentiles = percentileRanks(priceMids);

  const yieldToPrices = communities.map(
    (c) => mid(c.investment.rentalYieldPct) / mid(c.pricing.pricePerSqft)
  );
  const ytpPercentiles = percentileRanks(yieldToPrices);

  const result = new Map<string, CommunityScores>();

  for (let i = 0; i < communities.length; i++) {
    const c = communities[i];

    const investment = round1(scoreInvestment(c, txPercentiles[i]));
    const livability = round1(scoreLivability(c));
    const connectivity = round1(scoreConnectivity(c));
    const family = round1(scoreFamily(c));
    const value = round1(scoreValue(c, pricePercentiles[i], ytpPercentiles[i]));
    const growth = round1(scoreGrowth(c));

    const overall = round1(
      investment * WEIGHTS.investment +
        livability * WEIGHTS.livability +
        connectivity * WEIGHTS.connectivity +
        family * WEIGHTS.family +
        value * WEIGHTS.value +
        growth * WEIGHTS.growth
    );

    result.set(c.id, {
      overall,
      investment,
      livability,
      connectivity,
      family,
      value,
      growth,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

export function getScoreColor(score: number): string {
  if (score >= 8) return "text-emerald-400";
  if (score >= 5) return "text-amber-400";
  return "text-red-400";
}

export function getScoreBgColor(score: number): string {
  if (score >= 8) return "bg-emerald-400";
  if (score >= 5) return "bg-amber-400";
  return "bg-red-400";
}

export function getScoreLabel(score: number): string {
  if (score >= 8) return "Excellent";
  if (score >= 6) return "Good";
  if (score >= 4) return "Average";
  return "Below Average";
}

// ---------------------------------------------------------------------------
// Dubai-wide averages
// ---------------------------------------------------------------------------

export interface DubaiAverages {
  pricePerSqft: number;
  serviceCharge: number;
  rentalYield: number;
  beachDistance: number;
  walkability: number;
  metroDistance: number;
  commuteAvg: number;
  schoolCount: number;
  playAreas: number;
  nurseries: number;
  overallScore: number;
  investmentScore: number;
  livabilityScore: number;
  connectivityScore: number;
  familyScore: number;
  valueScore: number;
  growthScore: number;
}

export function computeAverages(
  communities: Community[],
  scores: Map<string, CommunityScores>
): DubaiAverages {
  const n = communities.length;
  if (n === 0) {
    return {
      pricePerSqft: 0,
      serviceCharge: 0,
      rentalYield: 0,
      beachDistance: 0,
      walkability: 0,
      metroDistance: 0,
      commuteAvg: 0,
      schoolCount: 0,
      playAreas: 0,
      nurseries: 0,
      overallScore: 0,
      investmentScore: 0,
      livabilityScore: 0,
      connectivityScore: 0,
      familyScore: 0,
      valueScore: 0,
      growthScore: 0,
    };
  }

  let totalPricePerSqft = 0;
  let totalServiceCharge = 0;
  let totalRentalYield = 0;
  let totalBeachDistance = 0;
  let totalWalkability = 0;
  let totalMetroDistance = 0;
  let totalCommuteAvg = 0;
  let totalSchoolCount = 0;
  let totalPlayAreas = 0;
  let totalNurseries = 0;
  let totalOverall = 0;
  let totalInvestment = 0;
  let totalLivability = 0;
  let totalConnectivity = 0;
  let totalFamily = 0;
  let totalValue = 0;
  let totalGrowth = 0;

  for (const c of communities) {
    totalPricePerSqft += mid(c.pricing.pricePerSqft);
    totalServiceCharge += mid(c.pricing.serviceChargePerSqft);
    totalRentalYield += mid(c.investment.rentalYieldPct);
    totalBeachDistance += c.livability.beachDistanceKm;
    totalWalkability += c.connectivity.walkabilityScore;
    totalMetroDistance += c.connectivity.nearestMetro.distanceKm;
    totalCommuteAvg +=
      (c.connectivity.commuteMinutes.difc +
        c.connectivity.commuteMinutes.businessBay +
        c.connectivity.commuteMinutes.marina) /
      3;
    totalSchoolCount += c.familyFriendliness.schools.length;
    totalPlayAreas += c.familyFriendliness.playAreas;
    totalNurseries += c.familyFriendliness.nearbyNurseries;

    const s = scores.get(c.id);
    if (s) {
      totalOverall += s.overall;
      totalInvestment += s.investment;
      totalLivability += s.livability;
      totalConnectivity += s.connectivity;
      totalFamily += s.family;
      totalValue += s.value;
      totalGrowth += s.growth;
    }
  }

  return {
    pricePerSqft: round1(totalPricePerSqft / n),
    serviceCharge: round1(totalServiceCharge / n),
    rentalYield: round1(totalRentalYield / n),
    beachDistance: round1(totalBeachDistance / n),
    walkability: round1(totalWalkability / n),
    metroDistance: round1(totalMetroDistance / n),
    commuteAvg: round1(totalCommuteAvg / n),
    schoolCount: round1(totalSchoolCount / n),
    playAreas: round1(totalPlayAreas / n),
    nurseries: round1(totalNurseries / n),
    overallScore: round1(totalOverall / n),
    investmentScore: round1(totalInvestment / n),
    livabilityScore: round1(totalLivability / n),
    connectivityScore: round1(totalConnectivity / n),
    familyScore: round1(totalFamily / n),
    valueScore: round1(totalValue / n),
    growthScore: round1(totalGrowth / n),
  };
}

// ---------------------------------------------------------------------------
// Compare to average
// ---------------------------------------------------------------------------

export function compareToAverage(
  value: number,
  avg: number,
  threshold: number = 0.05
): "above" | "below" | "similar" {
  if (value > avg * (1 + threshold)) return "above";
  if (value < avg * (1 - threshold)) return "below";
  return "similar";
}
