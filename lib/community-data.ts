// Community Data — Types and Constants Only
// No fake profiles, no fake data. Everything grows organically.

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  company?: string;
  title?: string;
  specialties: string[];
  areas: string[];
  bio?: string;
  experience?: number;
  languages: string[];
  joinedAt: string;
  avatarUrl?: string;
  totalXp?: number;
}

export interface FeedPost {
  id: string;
  authorId: string;
  authorName: string;
  authorTitle?: string;
  authorAvatar?: string;
  content: string;
  category: "market-insight" | "deal-share" | "question" | "announcement" | "discussion";
  createdAt: string;
  likes: string[]; // user IDs
  replies: FeedReply[];
}

export interface FeedReply {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
}

export const POST_CATEGORIES = [
  { value: "market-insight", label: "Market Insight", color: "text-emerald-400 border-emerald-400/20 bg-emerald-400/5" },
  { value: "deal-share", label: "Deal Share", color: "text-blue-400 border-blue-400/20 bg-blue-400/5" },
  { value: "question", label: "Question", color: "text-amber-400 border-amber-400/20 bg-amber-400/5" },
  { value: "announcement", label: "Announcement", color: "text-purple-400 border-purple-400/20 bg-purple-400/5" },
  { value: "discussion", label: "Discussion", color: "text-gray-400 border-gray-400/20 bg-gray-400/5" },
] as const;

export const SPECIALTIES = [
  "Off-Plan", "Ready Properties", "Luxury", "Commercial",
  "Rental", "Investment Advisory", "Holiday Homes", "Property Management"
] as const;

export const AREAS = [
  "Downtown Dubai", "Dubai Marina", "Palm Jumeirah", "Business Bay",
  "JVC", "JLT", "Dubai Hills Estate", "Creek Harbour", "Al Furjan",
  "Arjan", "Sports City", "Town Square", "International City",
  "Dubai South", "DIFC", "MBR City", "Motor City", "Mirdif",
  "Discovery Gardens", "Dubai Silicon Oasis"
] as const;
