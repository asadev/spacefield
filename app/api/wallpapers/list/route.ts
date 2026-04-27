import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/* GET /api/wallpapers/list
 *   Returns the catalogue of admin-uploaded wallpapers. Any signed-in
 *   user can read. The corresponding RLS policy on public.wallpapers
 *   ("anyone reads wallpapers") restricts to authenticated, so the
 *   user-scoped client is the right thing to use here.
 */

export const dynamic = "force-dynamic";

export type WallpaperRow = {
  id: string;
  slug: string;
  name: string;
  category: string;
  light_url: string | null;
  dark_url: string | null;
  mode_preference: string;
  created_by: string;
  created_at: string;
};

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("wallpapers")
    .select(
      "id, slug, name, category, light_url, dark_url, mode_preference, created_by, created_at"
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ wallpapers: (data ?? []) as WallpaperRow[] });
}
