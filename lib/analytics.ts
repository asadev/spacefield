import { createClient } from "@/lib/supabase/client";

type EventName =
  | "page_view"
  | "tool_used"
  | "game_played"
  | "course_started"
  | "course_completed"
  | "sign_up"
  | "sign_in"
  | "community_post"
  | "blog_read"
  | "cta_clicked";

interface AnalyticsEvent {
  event: EventName;
  properties?: Record<string, string | number | boolean>;
}

export function trackEvent({ event, properties = {} }: AnalyticsEvent) {
  // Fire and forget — don't block UI
  try {
    const supabase = createClient();
    supabase
      .from("analytics_events")
      .insert({
        event_name: event,
        properties,
        page_url: typeof window !== "undefined" ? window.location.pathname : "",
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
        timestamp: new Date().toISOString(),
      })
      .then(() => {});
  } catch {
    // Silently fail — analytics should never break the app
  }
}

// Convenience helpers
export const trackToolUsed = (toolSlug: string) =>
  trackEvent({ event: "tool_used", properties: { tool: toolSlug } });

export const trackGamePlayed = (gameSlug: string) =>
  trackEvent({ event: "game_played", properties: { game: gameSlug } });

export const trackCTAClicked = (ctaName: string, location: string) =>
  trackEvent({ event: "cta_clicked", properties: { cta: ctaName, location } });

export const trackBlogRead = (slug: string) =>
  trackEvent({ event: "blog_read", properties: { slug } });

export const trackPageView = (path: string) =>
  trackEvent({ event: "page_view", properties: { path } });
