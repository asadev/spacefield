"use client";

/* Client-side helper for tools to mint a share.example.com link.
 *
 * Tools call mintShareLink() from the browser. Behind the scenes it
 * server-actions to lib/share/server.ts and returns the public URL.
 */

import type { ShareType } from "./types";

export interface MintShareLinkInput {
  type: ShareType;
  payload: Record<string, unknown>;
  sourceTool: string;
  workspaceId?: string;
  customSlug?: string;
}

export interface MintShareLinkResult {
  ok: boolean;
  url?: string;
  linkId?: string;
  slug?: string;
  error?: string;
}

export async function mintShareLink(input: MintShareLinkInput): Promise<MintShareLinkResult> {
  try {
    const res = await fetch("/api/share/mint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      return { ok: false, error: json.error ?? "mint failed" };
    }
    return {
      ok: true,
      url: json.url,
      linkId: json.linkId,
      slug: json.slug,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "network error" };
  }
}
