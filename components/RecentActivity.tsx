"use client";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";

interface ActivityItem {
  id: string;
  action: string;
  username: string;
  timestamp: string;
}

const ACTION_LABELS: Record<string, string> = {
  tool_use: "used a tool",
  game_play: "played a game",
  game_highscore: "set a high score",
  lesson_complete: "completed a lesson",
  course_complete: "completed a course",
  community_post: "posted in the community",
  level_up: "leveled up",
};

export default function RecentActivity() {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const supabase = createClient();

  useEffect(() => {
    async function fetchActivity() {
      const { data } = await supabase
        .from("xp_events")
        .select("id, action, created_at, profiles(full_name)")
        .order("created_at", { ascending: false })
        .limit(5);

      if (data) {
        setActivities(
          data.map((item: any) => ({
            id: item.id,
            action: item.action,
            username: item.profiles?.full_name || "A member",
            timestamp: item.created_at,
          }))
        );
      }
    }
    fetchActivity();
  }, []);

  if (activities.length === 0) return null;

  return (
    <div className="rounded-lg border border-white/[0.10] bg-white/[0.04] p-5">
      <h3 className="mb-4 text-xs font-medium uppercase tracking-widest text-white/60">
        Recent Activity
      </h3>
      <div className="space-y-3">
        <AnimatePresence>
          {activities.map((item, i) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="flex items-center gap-3 text-sm"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
              <span className="text-white/70">
                <span className="font-medium text-white">{item.username}</span>{" "}
                {ACTION_LABELS[item.action] || item.action}
              </span>
              <span className="ml-auto text-xs text-white/30">
                {getTimeAgo(item.timestamp)}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function getTimeAgo(timestamp: string): string {
  const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
