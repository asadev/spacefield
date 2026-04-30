"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  UserProfile,
  FeedPost,
  POST_CATEGORIES,
  SPECIALTIES,
  AREAS,
} from "@/lib/community-data";
import LevelBadge from "@/components/LevelBadge";
import { Region, REGION_SHORT } from "@/lib/region";

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

type Tab = "feed" | "profile";

// --- Avatar ---
function Avatar({ name, url, size = "sm" }: { name: string; url?: string; size?: "sm" | "md" | "lg" }) {
  const sizeClass = size === "lg" ? "h-16 w-16 text-xl" : size === "md" ? "h-10 w-10 text-sm" : "h-8 w-8 text-xs";
  const initials = name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);

  if (url) {
    return (
      <div className={`${sizeClass} rounded-full overflow-hidden border border-white/10 shrink-0`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={name} className="h-full w-full object-cover" />
      </div>
    );
  }
  return (
    <div className={`${sizeClass} rounded-full border border-white/10 bg-white/[0.08] flex items-center justify-center text-gray-400 font-medium shrink-0`}>
      {initials}
    </div>
  );
}

// --- Relative Time ---
function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

// --- Linkify helper ---
function linkifyText(text: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) => {
    if (part.match(/^https?:\/\//)) {
      return (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-white/60 hover:underline break-all">
          {part}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

// --- Region path helpers ---
function regionPrefix(region: Region): string {
  return region === "uae" ? "" : `/${region}`;
}

// --- Supabase data helpers ---
async function loadFeedFromSupabase(): Promise<FeedPost[]> {
  const supabase = createClient();
  const { data: posts } = await supabase
    .from("feed_posts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (!posts) return [];

  const postIds = posts.map(p => p.id);
  if (postIds.length === 0) return [];

  const { data: likes } = await supabase.from("feed_likes").select("*").in("post_id", postIds);
  const { data: replies } = await supabase.from("feed_replies").select("*").in("post_id", postIds).order("created_at", { ascending: true });

  return posts.map(p => ({
    id: p.id,
    authorId: p.author_id,
    authorName: p.author_name,
    authorTitle: p.author_title || undefined,
    authorAvatar: p.author_avatar || undefined,
    content: p.content,
    category: p.category,
    createdAt: p.created_at,
    likes: (likes || []).filter(l => l.post_id === p.id).map(l => l.user_id),
    replies: (replies || []).filter(r => r.post_id === p.id).map(r => ({
      id: r.id,
      authorId: r.author_id,
      authorName: r.author_name,
      content: r.content,
      createdAt: r.created_at,
    })),
  }));
}

async function createPostInSupabase(post: { authorId: string; authorName: string; authorTitle?: string; authorAvatar?: string; content: string; category: string }) {
  const supabase = createClient();
  const { error } = await supabase.from("feed_posts").insert({
    author_id: post.authorId,
    author_name: post.authorName,
    author_title: post.authorTitle,
    author_avatar: post.authorAvatar,
    content: post.content,
    category: post.category,
  });
  if (error) console.error("Post failed:", error.message);
}

async function toggleLikeInSupabase(postId: string, userId: string) {
  const supabase = createClient();
  const { data: existing } = await supabase.from("feed_likes").select("id").eq("post_id", postId).eq("user_id", userId).single();
  if (existing) {
    const { error } = await supabase.from("feed_likes").delete().eq("id", existing.id);
    if (error) console.error("Unlike failed:", error.message);
  } else {
    const { error } = await supabase.from("feed_likes").insert({ post_id: postId, user_id: userId });
    if (error) console.error("Like failed:", error.message);
  }
}

async function createReplyInSupabase(postId: string, reply: { authorId: string; authorName: string; authorAvatar?: string; content: string }) {
  const supabase = createClient();
  const { error } = await supabase.from("feed_replies").insert({
    post_id: postId,
    author_id: reply.authorId,
    author_name: reply.authorName,
    author_avatar: reply.authorAvatar,
    content: reply.content,
  });
  if (error) console.error("Reply failed:", error.message);
}

async function loadAllProfilesFromSupabase(): Promise<UserProfile[]> {
  const supabase = createClient();
  const { data } = await supabase.from("profiles").select("*").order("joined_at", { ascending: false });
  if (!data) return [];
  return data.map(p => ({
    id: p.id,
    name: p.name,
    email: p.email || "",
    company: p.company || undefined,
    title: p.title || undefined,
    specialties: p.specialties || [],
    areas: p.areas || [],
    bio: p.bio || undefined,
    experience: p.experience || undefined,
    languages: p.languages || [],
    joinedAt: p.joined_at,
    avatarUrl: p.avatar_url || undefined,
    totalXp: p.total_xp || 0,
  }));
}

async function loadMyProfileFromSupabase(userId: string): Promise<UserProfile | null> {
  const supabase = createClient();
  const { data } = await supabase.from("profiles").select("*").eq("id", userId).single();
  if (!data) return null;
  return {
    id: data.id,
    name: data.name,
    email: data.email || "",
    company: data.company || undefined,
    title: data.title || undefined,
    specialties: data.specialties || [],
    areas: data.areas || [],
    bio: data.bio || undefined,
    experience: data.experience || undefined,
    languages: data.languages || [],
    joinedAt: data.joined_at,
    avatarUrl: data.avatar_url || undefined,
    totalXp: data.total_xp || 0,
  };
}

async function upsertProfileInSupabase(profile: UserProfile) {
  const supabase = createClient();
  await supabase.from("profiles").upsert({
    id: profile.id,
    name: profile.name,
    email: profile.email,
    company: profile.company || null,
    title: profile.title || null,
    specialties: profile.specialties,
    areas: profile.areas,
    bio: profile.bio || null,
    experience: profile.experience || null,
    languages: profile.languages,
    avatar_url: profile.avatarUrl || null,
    updated_at: new Date().toISOString(),
  });
}

// --- Post Card ---
function PostCard({
  post,
  userId,
  onLike,
  onReply,
  authorProfile,
}: {
  post: FeedPost;
  userId: string | null;
  onLike: (postId: string) => void;
  onReply: (postId: string, content: string) => void;
  authorProfile?: UserProfile;
}) {
  const [showReplies, setShowReplies] = useState(false);
  const [replyText, setReplyText] = useState("");
  const category = POST_CATEGORIES.find((c) => c.value === post.category);
  const liked = userId ? post.likes.includes(userId) : false;

  return (
    <motion.div
      className="relative rounded-lg border border-app bg-surface p-5"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.35, ease }}
    >

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <Link href={`/community/profile/${post.authorId}`}>
            <Avatar name={post.authorName} url={post.authorAvatar} />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Link href={`/community/profile/${post.authorId}`} className="hover:underline">
                <h3 className="text-white font-semibold text-sm">{post.authorName}</h3>
              </Link>
              <LevelBadge totalXP={authorProfile?.totalXp || 0} size="sm" />
              {post.authorTitle && (
                <span className="text-xs text-gray-500">{post.authorTitle}</span>
              )}
            </div>
            <span className="text-[11px] text-gray-600">{relativeTime(post.createdAt)}</span>
          </div>
        </div>
        {category && (
          <span
            className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full border ${category.color}`}
          >
            {category.label}
          </span>
        )}
      </div>

      {/* Content */}
      <p className="mt-3 text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
        {linkifyText(post.content)}
      </p>

      {/* Actions */}
      <div className="mt-4 flex items-center gap-4 border-t border-app pt-3">
        <button
          onClick={() => onLike(post.id)}
          disabled={!userId}
          className={`flex items-center gap-1.5 text-xs transition-colors ${
            liked
              ? "text-rose-400"
              : userId
              ? "text-gray-500 hover:text-rose-400"
              : "text-gray-600 cursor-not-allowed"
          }`}
        >
          <svg className="h-3.5 w-3.5" fill={liked ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
          {post.likes.length > 0 && <span>{post.likes.length}</span>}
        </button>

        <button
          onClick={() => setShowReplies(!showReplies)}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          {post.replies.length > 0 && <span>{post.replies.length}</span>}
        </button>
      </div>

      {/* Replies */}
      {showReplies && (
        <div className="mt-3 space-y-3 border-t border-white/[0.04] pt-3">
          {post.replies.map((reply) => (
            <div key={reply.id} className="pl-4 border-l border-app">
              <div className="flex items-center gap-2">
                <span className="text-xs text-white font-medium">{reply.authorName}</span>
                <span className="text-[10px] text-gray-600">{relativeTime(reply.createdAt)}</span>
              </div>
              <p className="mt-1 text-xs text-gray-400">{reply.content}</p>
            </div>
          ))}

          {userId ? (
            <div className="flex gap-2 mt-2">
              <input
                type="text"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Write a reply..."
                className="flex-1 bg-surface border border-app rounded-lg py-2 px-3 text-xs text-app placeholder:text-faint focus:outline-none focus:border-app-focus"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && replyText.trim()) {
                    onReply(post.id, replyText.trim());
                    setReplyText("");
                  }
                }}
              />
              <button
                onClick={() => {
                  if (replyText.trim()) {
                    onReply(post.id, replyText.trim());
                    setReplyText("");
                  }
                }}
                className="text-xs px-3 py-2 border border-app rounded-lg text-secondary bg-surface-hover hover:text-app transition-colors"
              >
                Reply
              </button>
            </div>
          ) : (
            <p className="text-[11px] text-gray-600 mt-2">
              <Link href="/signin?next=/community" className="text-emerald-300 hover:text-white font-bold">Sign in</Link> to reply
            </p>
          )}
        </div>
      )}
    </motion.div>
  );
}

// --- Member Card ---
function MemberCard({ profile, linkable = true }: { profile: UserProfile; linkable?: boolean }) {
  const joinDate = new Date(profile.joinedAt).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });

  const card = (
    <motion.div
      className="relative rounded-lg border border-app bg-surface p-5 bg-surface-hover border-app-hover transition-colors cursor-pointer"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.35, ease }}
      layout
    >

      <div className="flex items-start gap-3">
        <Avatar name={profile.name} url={profile.avatarUrl} size="md" />
        <div className="min-w-0">
          <h3 className="text-white font-semibold truncate">{profile.name}</h3>
          {profile.title && <p className="text-sm text-gray-400 mt-0.5">{profile.title}</p>}
          {profile.company && <p className="text-xs text-gray-500">{profile.company}</p>}
        </div>
      </div>

      {/* Specialties */}
      {profile.specialties.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {profile.specialties.map((s) => (
            <span
              key={s}
              className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-surface-strong text-secondary border border-app"
            >
              {s}
            </span>
          ))}
        </div>
      )}

      {/* Areas */}
      {profile.areas.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {profile.areas.map((a) => (
            <span
              key={a}
              className="text-[10px] text-muted bg-surface px-1.5 py-0.5 rounded border border-app"
            >
              {a}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between border-t border-app pt-3">
        {profile.experience && (
          <span className="text-[10px] text-gray-500">{profile.experience} yrs experience</span>
        )}
        <span className="text-[10px] text-gray-600">Member since {joinDate}</span>
      </div>
    </motion.div>
  );

  if (linkable) {
    return <Link href={`/community/profile/${profile.id}`}>{card}</Link>;
  }
  return card;
}

// === MAIN FEED COMPONENT ===
export default function CommunityFeed({
  region,
}: {
  region: Region;
  // Header props are consumed by the page wrapper via PageHeader; kept here
  // as optional for future use if the header moves inside the component.
  headerTitle?: string;
  headerDescription?: string;
}) {
  const [tab, setTab] = useState<Tab>("feed");
  const [user, setUser] = useState<{ id: string; email: string; avatarUrl?: string } | null>(null);
  const [feed, setFeed] = useState<FeedPost[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [myProfile, setMyProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Feed state
  const [postContent, setPostContent] = useState("");
  const [postCategory, setPostCategory] = useState<FeedPost["category"]>("discussion");
  const [feedFilter, setFeedFilter] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<"latest" | "popular">("latest");

  // Profile form state
  const [profileForm, setProfileForm] = useState({
    name: "",
    company: "",
    title: "",
    specialties: [] as string[],
    areas: [] as string[],
    bio: "",
    experience: "",
    languages: [] as string[],
  });

  const prefix = regionPrefix(region);
  const regionShort = REGION_SHORT[region];
  const isUAE = region === "uae";

  // Auth check + load data
  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();

      if (authData.user) {
        const avatarUrl = authData.user.user_metadata?.custom_avatar_url || authData.user.user_metadata?.avatar_url || undefined;
        setUser({ id: authData.user.id, email: authData.user.email || "", avatarUrl });

        const existing = await loadMyProfileFromSupabase(authData.user.id);
        if (existing) {
          setMyProfile(existing);
          setProfileForm({
            name: existing.name,
            company: existing.company || "",
            title: existing.title || "",
            specialties: existing.specialties,
            areas: existing.areas,
            bio: existing.bio || "",
            experience: existing.experience?.toString() || "",
            languages: existing.languages,
          });
        } else {
          setProfileForm((prev) => ({
            ...prev,
            name: authData.user.user_metadata?.full_name || "",
          }));
        }
      }

      // Load feed and profiles in parallel
      const [feedData, profilesData] = await Promise.all([
        loadFeedFromSupabase(),
        loadAllProfilesFromSupabase(),
      ]);
      setFeed(feedData);
      setProfiles(profilesData);
      setLoading(false);
    }

    init();
  }, []);

  // --- Refresh feed helper ---
  const refreshFeed = useCallback(async () => {
    const feedData = await loadFeedFromSupabase();
    setFeed(feedData);
  }, []);

  // --- Feed actions ---
  const handlePost = useCallback(async () => {
    if (!user || !postContent.trim()) return;

    // Auto-create a minimal profile if one doesn't exist (FK constraint on author_id -> profiles.id)
    if (!myProfile) {
      const name = user.email.split("@")[0];
      await upsertProfileInSupabase({
        id: user.id,
        name,
        email: user.email,
        specialties: [],
        areas: [],
        languages: [],
        joinedAt: new Date().toISOString(),
        avatarUrl: user.avatarUrl,
      });
      setMyProfile({ id: user.id, name, email: user.email, specialties: [], areas: [], languages: [], joinedAt: new Date().toISOString(), avatarUrl: user.avatarUrl });
    }

    const authorName = myProfile?.name || user.email.split("@")[0];
    await createPostInSupabase({
      authorId: user.id,
      authorName,
      authorTitle: myProfile?.title,
      authorAvatar: myProfile?.avatarUrl || user.avatarUrl,
      content: postContent.trim(),
      category: postCategory,
    });
    setPostContent("");
    await refreshFeed();
  }, [user, myProfile, postContent, postCategory, refreshFeed]);

  const handleLike = useCallback(
    async (postId: string) => {
      if (!user) return;
      // Optimistic update
      setFeed((prev) =>
        prev.map((p) => {
          if (p.id !== postId) return p;
          const alreadyLiked = p.likes.includes(user.id);
          return {
            ...p,
            likes: alreadyLiked
              ? p.likes.filter((id) => id !== user.id)
              : [...p.likes, user.id],
          };
        })
      );
      await toggleLikeInSupabase(postId, user.id);
    },
    [user]
  );

  const handleReply = useCallback(
    async (postId: string, content: string) => {
      if (!user) return;
      const authorName = myProfile?.name || user.email.split("@")[0];
      await createReplyInSupabase(postId, {
        authorId: user.id,
        authorName,
        authorAvatar: myProfile?.avatarUrl || user.avatarUrl,
        content,
      });
      await refreshFeed();
    },
    [user, myProfile, refreshFeed]
  );

  // --- Profile save ---
  const handleSaveProfile = useCallback(async () => {
    if (!user) return;
    const profile: UserProfile = {
      id: user.id,
      name: profileForm.name || user.email.split("@")[0],
      email: user.email,
      company: profileForm.company || undefined,
      title: profileForm.title || undefined,
      specialties: profileForm.specialties,
      areas: profileForm.areas,
      bio: profileForm.bio || undefined,
      experience: profileForm.experience ? parseInt(profileForm.experience) : undefined,
      languages: profileForm.languages,
      joinedAt: myProfile?.joinedAt || new Date().toISOString(),
      avatarUrl: user.avatarUrl || myProfile?.avatarUrl,
    };
    await upsertProfileInSupabase(profile);
    setMyProfile(profile);
    const updatedProfiles = await loadAllProfilesFromSupabase();
    setProfiles(updatedProfiles);
  }, [user, profileForm, myProfile]);

  // --- Filtered feed ---
  const filteredFeed = useMemo(() => {
    const result = feedFilter ? feed.filter((p) => p.category === feedFilter) : [...feed];
    if (sortMode === "popular") {
      result.sort((a, b) => b.likes.length - a.likes.length);
    }
    return result;
  }, [feed, feedFilter, sortMode]);

  // --- Multi-select toggle helper ---
  const toggleArrayItem = (arr: string[], item: string) =>
    arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];

  if (loading) {
    return (
      <section className="relative mx-auto max-w-[1200px] px-6 lg:px-10 pb-24 pt-6">
        <div className="space-y-4">
          <div className="h-12 w-64 animate-pulse border border-app bg-surface rounded-xl" />
          <div className="h-40 animate-pulse border border-app bg-surface rounded-2xl" />
          <div className="h-32 animate-pulse border border-app bg-surface rounded-2xl" />
        </div>
      </section>
    );
  }

  return (
    <>
      {/* Quick links bar */}
      <section className="relative mx-auto max-w-[1200px] px-6 lg:px-10 -mt-8">
        <motion.div
          className="flex items-center justify-end gap-4"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease }}
        >
          {isUAE && (
            <Link href="/community/events" className="text-xs text-gray-500 hover:text-white transition-colors">
              Events
            </Link>
          )}
          {user && (
            <button onClick={() => setTab("profile")} className="text-xs text-gray-500 hover:text-white transition-colors">
              My Profile
            </button>
          )}
        </motion.div>
      </section>

      {/* Content */}
      <section className="relative mx-auto max-w-[1200px] px-6 lg:px-10 mt-6 pb-24">
        <AnimatePresence mode="wait">
          {/* ===== FEED ===== */}
          {tab === "feed" && (
            <motion.div
              key="feed"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.3, ease }}
              className="space-y-6"
            >
              {/* Post Composer */}
              <div className="relative rounded-lg border border-app bg-surface p-5">
                {user ? (
                  <>
                    <textarea
                      value={postContent}
                      onChange={(e) => setPostContent(e.target.value)}
                      placeholder={`Share a market insight, ask a question, or start a discussion${isUAE ? "" : ` with the ${regionShort} community`}...`}
                      rows={3}
                      maxLength={500}
                      className="w-full bg-transparent border-none text-sm text-app placeholder:text-faint focus:outline-none resize-none"
                    />
                    <div className="flex justify-end -mt-1 mb-1">
                      <span className="text-[0.6rem] text-gray-600">{postContent.length}/500</span>
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-app pt-3">
                      <div className="flex flex-wrap gap-1.5">
                        {POST_CATEGORIES.map((cat) => (
                          <button
                            key={cat.value}
                            onClick={() => setPostCategory(cat.value as FeedPost["category"])}
                            className={`text-[10px] font-medium px-2.5 py-1 rounded-full border transition-colors ${
                              postCategory === cat.value
                                ? cat.color
                                : "border-app text-muted hover:text-app bg-surface"
                            }`}
                          >
                            {cat.label}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={handlePost}
                        disabled={!postContent.trim()}
                        className="text-xs font-medium px-4 py-2 bg-white text-black rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        Post
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-sm text-gray-400">
                      <Link href={`/signin?next=${encodeURIComponent(`${prefix}/community`)}`} className="text-emerald-300 hover:text-white font-bold">
                        Sign in
                      </Link>{" "}
                      to join the conversation
                    </p>
                  </div>
                )}
              </div>

              {/* Sort + Feed Filters */}
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  onClick={() => setSortMode("latest")}
                  className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                    sortMode === "latest"
                      ? "bg-emerald-500/15 border-emerald-400/20 text-emerald-300"
                      : "border-app text-muted hover:text-app bg-surface"
                  }`}
                >
                  Latest
                </button>
                <button
                  onClick={() => setSortMode("popular")}
                  className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                    sortMode === "popular"
                      ? "bg-emerald-500/15 border-emerald-400/20 text-emerald-300"
                      : "border-app text-muted hover:text-app bg-surface"
                  }`}
                >
                  Most Liked
                </button>
                <span className="mx-1 h-4 w-px bg-white/[0.08]" />
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setFeedFilter(null)}
                  className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                    !feedFilter
                      ? "bg-emerald-500/15 border-emerald-400/20 text-emerald-300"
                      : "border-app text-muted hover:text-app bg-surface"
                  }`}
                >
                  All
                </button>
                {POST_CATEGORIES.map((cat) => (
                  <button
                    key={cat.value}
                    onClick={() => setFeedFilter(feedFilter === cat.value ? null : cat.value)}
                    className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                      feedFilter === cat.value
                        ? cat.color
                        : "border-app text-muted hover:text-app bg-surface"
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Feed Posts */}
              <div className="space-y-4">
                <AnimatePresence mode="popLayout">
                  {filteredFeed.map((post) => (
                    <PostCard
                      key={post.id}
                      post={post}
                      userId={user?.id || null}
                      onLike={handleLike}
                      onReply={handleReply}
                      authorProfile={profiles.find((p) => p.id === post.authorId)}
                    />
                  ))}
                </AnimatePresence>
              </div>

              {/* Empty State */}
              {filteredFeed.length === 0 && (
                <div className="text-center py-16">
                  <p className="text-gray-500 text-sm">
                    {feedFilter
                      ? `No ${POST_CATEGORIES.find((c) => c.value === feedFilter)?.label || feedFilter} posts yet. Start the conversation.`
                      : "No posts yet. Share a market insight, ask a question, or spark a discussion."}
                  </p>
                </div>
              )}

              {/* Cross-links */}
              <div className="mt-12 flex flex-col items-center gap-4 text-center sm:flex-row sm:justify-center sm:gap-8">
                <Link
                  href={`${prefix}/tools`}
                  className="inline-flex items-center gap-3 text-sm text-gray-400 transition-colors hover:text-emerald-200"
                >
                  Explore {regionShort} tools
                  <span className="h-px w-6 bg-gray-500" />
                </Link>
                <Link
                  href={`${prefix}/market`}
                  className="inline-flex items-center gap-3 text-sm text-gray-400 transition-colors hover:text-emerald-200"
                >
                  See the {regionShort} market
                  <span className="h-px w-6 bg-gray-500" />
                </Link>
              </div>
            </motion.div>
          )}

          {/* ===== MY PROFILE TAB ===== */}
          {tab === "profile" && user && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.3, ease }}
            >
              <div className="grid gap-8 lg:grid-cols-5">
                {/* Form */}
                <div className="lg:col-span-3 relative rounded-lg border border-app bg-surface p-6">
                  <h3 className="text-lg font-semibold text-white mb-6">Edit Profile</h3>

                  <div className="space-y-5">
                    {/* Name */}
                    <div>
                      <label className="block text-[11px] text-gray-500 uppercase tracking-wider mb-1.5">Name</label>
                      <input
                        type="text"
                        value={profileForm.name}
                        onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                        className="w-full bg-surface border border-app rounded-lg py-2.5 px-3 text-sm text-app placeholder:text-faint focus:outline-none focus:border-app-focus"
                        placeholder="Your name"
                      />
                    </div>

                    {/* Company + Title */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] text-gray-500 uppercase tracking-wider mb-1.5">Company</label>
                        <input
                          type="text"
                          value={profileForm.company}
                          onChange={(e) => setProfileForm({ ...profileForm, company: e.target.value })}
                          className="w-full bg-surface border border-app rounded-lg py-2.5 px-3 text-sm text-app placeholder:text-faint focus:outline-none focus:border-app-focus"
                          placeholder="Company name"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-gray-500 uppercase tracking-wider mb-1.5">Title / Role</label>
                        <input
                          type="text"
                          value={profileForm.title}
                          onChange={(e) => setProfileForm({ ...profileForm, title: e.target.value })}
                          className="w-full bg-surface border border-app rounded-lg py-2.5 px-3 text-sm text-app placeholder:text-faint focus:outline-none focus:border-app-focus"
                          placeholder="e.g. Senior Consultant"
                        />
                      </div>
                    </div>

                    {/* Experience */}
                    <div>
                      <label className="block text-[11px] text-gray-500 uppercase tracking-wider mb-1.5">Years of Experience</label>
                      <input
                        type="number"
                        value={profileForm.experience}
                        onChange={(e) => setProfileForm({ ...profileForm, experience: e.target.value })}
                        className="w-32 bg-surface border border-app rounded-lg py-2.5 px-3 text-sm text-app placeholder:text-faint focus:outline-none focus:border-app-focus"
                        placeholder="0"
                        min="0"
                      />
                    </div>

                    {/* Specialties */}
                    <div>
                      <label className="block text-[11px] text-gray-500 uppercase tracking-wider mb-2">Specialties</label>
                      <div className="flex flex-wrap gap-2">
                        {SPECIALTIES.map((s) => (
                          <button
                            key={s}
                            onClick={() =>
                              setProfileForm({
                                ...profileForm,
                                specialties: toggleArrayItem(profileForm.specialties, s),
                              })
                            }
                            className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                              profileForm.specialties.includes(s)
                                ? "bg-surface-strong border-app-strong text-app"
                                : "border-app text-muted hover:text-app"
                            }`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Areas */}
                    <div>
                      <label className="block text-[11px] text-gray-500 uppercase tracking-wider mb-2">Areas</label>
                      <div className="flex flex-wrap gap-2">
                        {AREAS.map((a) => (
                          <button
                            key={a}
                            onClick={() =>
                              setProfileForm({
                                ...profileForm,
                                areas: toggleArrayItem(profileForm.areas, a),
                              })
                            }
                            className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                              profileForm.areas.includes(a)
                                ? "bg-surface-strong border-app-strong text-app"
                                : "border-app text-muted hover:text-app"
                            }`}
                          >
                            {a}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Languages */}
                    <div>
                      <label className="block text-[11px] text-gray-500 uppercase tracking-wider mb-1.5">Languages (comma-separated)</label>
                      <input
                        type="text"
                        value={profileForm.languages.join(", ")}
                        onChange={(e) =>
                          setProfileForm({
                            ...profileForm,
                            languages: e.target.value.split(",").map((l) => l.trim()).filter(Boolean),
                          })
                        }
                        className="w-full bg-surface border border-app rounded-lg py-2.5 px-3 text-sm text-app placeholder:text-faint focus:outline-none focus:border-app-focus"
                        placeholder="English, Arabic, Hindi"
                      />
                    </div>

                    {/* Bio */}
                    <div>
                      <label className="block text-[11px] text-gray-500 uppercase tracking-wider mb-1.5">Bio</label>
                      <textarea
                        value={profileForm.bio}
                        onChange={(e) => setProfileForm({ ...profileForm, bio: e.target.value })}
                        rows={4}
                        className="w-full bg-surface border border-app rounded-lg py-2.5 px-3 text-sm text-app placeholder:text-faint focus:outline-none focus:border-app-focus resize-none"
                        placeholder="Tell others about yourself and your expertise..."
                      />
                    </div>

                    {/* Save */}
                    <button
                      onClick={handleSaveProfile}
                      className="px-6 py-3 bg-white text-black text-sm font-semibold rounded-xl hover:bg-gray-200 transition-colors"
                    >
                      Save Profile
                    </button>
                  </div>
                </div>

                {/* Preview */}
                <div className="lg:col-span-2">
                  <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-3">Preview</p>
                  <MemberCard
                    linkable={false}
                    profile={{
                      id: user.id,
                      name: profileForm.name || user.email.split("@")[0],
                      email: user.email,
                      company: profileForm.company || undefined,
                      title: profileForm.title || undefined,
                      specialties: profileForm.specialties,
                      areas: profileForm.areas,
                      bio: profileForm.bio || undefined,
                      experience: profileForm.experience ? parseInt(profileForm.experience) : undefined,
                      languages: profileForm.languages,
                      joinedAt: myProfile?.joinedAt || new Date().toISOString(),
                      avatarUrl: user.avatarUrl,
                    }}
                  />
                  {myProfile && (
                    <p className="mt-3 text-[11px] text-white/60">Profile saved and visible to other members.</p>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </>
  );
}
