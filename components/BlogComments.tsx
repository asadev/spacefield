"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import { awardXP } from "@/lib/xp-actions";

interface Comment {
  id: string;
  author_name: string;
  author_avatar: string | null;
  content: string;
  created_at: string;
}

export default function BlogComments({ slug }: { slug: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    // Load comments
    supabase
      .from("blog_comments")
      .select("id, author_name, author_avatar, content, created_at")
      .eq("post_slug", slug)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        setComments(data || []);
        setLoading(false);
      });

    // Check auth
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  async function handlePost() {
    if (!user || !newComment.trim() || posting) return;
    setPosting(true);

    const authorName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email?.split("@")[0] ||
      "Anonymous";

    const authorAvatar =
      user.user_metadata?.custom_avatar_url ||
      user.user_metadata?.avatar_url ||
      null;

    const { data, error } = await supabase
      .from("blog_comments")
      .insert({
        post_slug: slug,
        author_id: user.id,
        author_name: authorName,
        author_avatar: authorAvatar,
        content: newComment.trim(),
      })
      .select()
      .single();

    if (!error && data) {
      setComments((prev) => [...prev, data]);
      setNewComment("");
      awardXP("reply_create", "blog", slug).catch(() => {});
    }

    setPosting(false);
  }

  return (
    <section className="mt-16 border-t border-white/[0.06] pt-12">
      <h3 className="text-[0.6rem] uppercase tracking-[0.25em] text-gray-500 mb-8">
        Comments {comments.length > 0 && `(${comments.length})`}
      </h3>

      {/* Comments list */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="border border-white/[0.06] bg-white/[0.02] p-5">
              <div className="h-4 w-32 animate-pulse rounded bg-white/5" />
              <div className="mt-3 h-3 w-64 animate-pulse rounded bg-white/5" />
            </div>
          ))}
        </div>
      ) : comments.length === 0 ? (
        <p className="text-sm text-gray-600">No comments yet. Be the first to share your thoughts.</p>
      ) : (
        <div className="space-y-4 mb-8">
          {comments.map((comment) => (
            <div
              key={comment.id}
              className="border border-white/[0.06] bg-white/[0.02] p-4 sm:p-5"
            >
              <div className="flex items-center gap-2 sm:gap-3 mb-3">
                {comment.author_avatar ? (
                  <img
                    src={comment.author_avatar}
                    alt={comment.author_name}
                    className="h-7 w-7 rounded-full border border-white/10 object-cover"
                  />
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-[0.6rem] font-semibold text-gray-400">
                    {comment.author_name[0]?.toUpperCase() || "?"}
                  </div>
                )}
                <span className="text-sm font-medium text-gray-300">
                  {comment.author_name}
                </span>
                <span className="text-[0.55rem] text-gray-600">
                  {new Date(comment.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>
              <p className="text-sm leading-relaxed text-gray-400">
                {comment.content}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Post comment */}
      {user ? (
        <div className="border border-white/[0.08] bg-white/[0.02] p-5">
          <textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Share your thoughts..."
            rows={3}
            className="w-full resize-none border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-white placeholder-gray-600 outline-none transition-colors focus:border-white/15"
          />
          <div className="mt-3 flex justify-end">
            <button
              onClick={handlePost}
              disabled={!newComment.trim() || posting}
              className="border border-white/15 bg-white/[0.08] px-6 py-2.5 text-[0.65rem] uppercase tracking-[0.15em] text-gray-300 transition-colors hover:bg-white/[0.14] hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {posting ? "Posting..." : "Post Comment"}
            </button>
          </div>
        </div>
      ) : (
        <div className="border border-white/[0.06] bg-white/[0.02] p-5 text-center">
          <p className="text-sm text-gray-500">
            <a href="/signin" className="text-gray-300 underline underline-offset-4 hover:text-white">
              Sign in
            </a>{" "}
            to leave a comment.
          </p>
        </div>
      )}
    </section>
  );
}
