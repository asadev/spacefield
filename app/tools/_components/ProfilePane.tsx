"use client";

/* ProfilePane — rendered inside the SettingsPanel right-pane when the
 * "Profile" sidebar item is active.
 *
 * Reads from + writes to public.profiles. Reads are public (anon role
 * has SELECT), writes are RLS-scoped to auth.uid() = user_id.
 *
 * Includes:
 *   - Avatar (crop-and-upload to the avatars bucket)
 *   - Username (unique, availability check via is_username_available RPC)
 *   - Full Name
 *   - Designation (job title)
 *   - Bio
 *   - Email (read-only, with a Change Email flow that sends a
 *     confirmation to the new address)
 *   - Social links (Twitter/X, Instagram, LinkedIn, GitHub, YouTube,
 *     TikTok, Website)
 *   - Sign-in method indicator
 *   - Change Password (only for email-provider users)
 *   - Sign Out of All Devices (Danger zone)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

interface ProfileRow {
  user_id: string;
  username: string | null;
  full_name: string | null;
  designation: string | null;
  bio: string | null;
  avatar_url: string | null;
  socials: Record<string, string>;
}

const SOCIAL_FIELDS: { key: string; label: string; placeholder: string }[] = [
  { key: "twitter", label: "X / Twitter", placeholder: "@yourhandle" },
  { key: "instagram", label: "Instagram", placeholder: "@yourhandle" },
  { key: "linkedin", label: "LinkedIn", placeholder: "linkedin.com/in/you" },
  { key: "github", label: "GitHub", placeholder: "@yourhandle" },
  { key: "youtube", label: "YouTube", placeholder: "@channel" },
  { key: "tiktok", label: "TikTok", placeholder: "@yourhandle" },
  { key: "website", label: "Website", placeholder: "https://yourdomain.com" },
];

const inputClass =
  "w-full rounded-lg border border-app bg-app-elevated px-3 py-2 text-sm text-app outline-none transition-colors focus:border-tool-accent focus:ring-2 focus:ring-tool-accent-soft placeholder:text-faint";

/* ───────────────── crop helpers ───────────────── */

function hasTransparency(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number
): boolean {
  const data = ctx.getImageData(0, 0, w, h).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) return true;
  }
  return false;
}

async function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 200;
      canvas.height = 200;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas not supported"));
        return;
      }
      ctx.clearRect(0, 0, 200, 200);
      ctx.drawImage(
        img,
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height,
        0,
        0,
        200,
        200
      );
      const transparent = hasTransparency(ctx, 200, 200);
      if (transparent) {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Convert failed"))),
          "image/png"
        );
      } else {
        canvas.toBlob(
          (b) => {
            if (b) {
              resolve(b);
              return;
            }
            canvas.toBlob(
              (j) => (j ? resolve(j) : reject(new Error("Convert failed"))),
              "image/jpeg",
              0.85
            );
          },
          "image/webp",
          0.85
        );
      }
    };
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = imageSrc;
  });
}

/* ───────────────── component ───────────────── */

export default function ProfilePane() {
  const supabase = getSupabase();
  const enabled = isSupabaseConfigured();

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);

  // Form state
  const [username, setUsername] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<
    "idle" | "checking" | "available" | "taken" | "invalid"
  >("idle");
  const [fullName, setFullName] = useState("");
  const [designation, setDesignation] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [socials, setSocials] = useState<Record<string, string>>({});

  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Email change
  const [newEmail, setNewEmail] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Password change
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Avatar upload
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cropImage, setCropImage] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const provider =
    (user?.app_metadata?.provider as string | undefined) ?? "email";
  const isEmailUser = provider === "email";

  /* ───────── Hydrate user + profile ───────── */

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: au } = await supabase.auth.getUser();
      if (cancelled) return;
      const u = au.user;
      setUser(u);
      if (!u) {
        setLoading(false);
        return;
      }
      const { data: p } = await supabase
        .from("profiles")
        .select(
          "user_id, username, full_name, designation, bio, avatar_url, socials"
        )
        .eq("user_id", u.id)
        .maybeSingle();
      if (cancelled) return;
      const row: ProfileRow =
        (p as ProfileRow | null) ?? {
          user_id: u.id,
          username: null,
          full_name: null,
          designation: null,
          bio: null,
          avatar_url: null,
          socials: {},
        };
      setProfile(row);
      setUsername(row.username ?? "");
      setFullName(
        row.full_name ??
          (u.user_metadata?.full_name as string) ??
          (u.user_metadata?.name as string) ??
          ""
      );
      setDesignation(row.designation ?? "");
      setBio(row.bio ?? "");
      setAvatarUrl(
        row.avatar_url ??
          (u.user_metadata?.custom_avatar_url as string) ??
          (u.user_metadata?.avatar_url as string) ??
          null
      );
      setSocials(row.socials ?? {});
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, enabled]);

  /* ───────── Username availability check (debounced) ───────── */

  useEffect(() => {
    if (!enabled || !user) return;
    const trimmed = username.trim();
    if (!trimmed) {
      setUsernameStatus("idle");
      return;
    }
    if (!/^[a-zA-Z0-9_-]{3,30}$/.test(trimmed)) {
      setUsernameStatus("invalid");
      return;
    }
    if (
      profile?.username &&
      trimmed.toLowerCase() === profile.username.toLowerCase()
    ) {
      setUsernameStatus("available"); // their current name
      return;
    }
    setUsernameStatus("checking");
    const t = window.setTimeout(async () => {
      const { data, error } = await supabase.rpc("is_username_available", {
        check_username: trimmed,
        for_user_id: user.id,
      });
      if (error) {
        setUsernameStatus("idle");
        return;
      }
      setUsernameStatus(data ? "available" : "taken");
    }, 350);
    return () => window.clearTimeout(t);
  }, [username, supabase, enabled, user, profile?.username]);

  /* ───────── Save profile ───────── */

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enabled || !user || savingProfile) return;
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      const trimmedUsername = username.trim() || null;
      if (trimmedUsername && usernameStatus === "taken") {
        throw new Error("That username is taken");
      }
      if (trimmedUsername && usernameStatus === "invalid") {
        throw new Error("Username must be 3–30 letters, digits, _ or -");
      }
      const cleanedSocials: Record<string, string> = {};
      for (const [k, v] of Object.entries(socials)) {
        const t = (v ?? "").trim();
        if (t) cleanedSocials[k] = t;
      }
      const payload = {
        user_id: user.id,
        username: trimmedUsername,
        full_name: fullName.trim() || null,
        designation: designation.trim() || null,
        bio: bio.trim() || null,
        avatar_url: avatarUrl,
        socials: cleanedSocials,
      };
      const { error: upErr } = await supabase
        .from("profiles")
        .upsert(payload, { onConflict: "user_id" });
      if (upErr) throw upErr;

      // Mirror canonical fields into auth.user_metadata so the topbar
      // avatar + greeting can read them without an extra DB call.
      await supabase.auth.updateUser({
        data: {
          ...user.user_metadata,
          full_name: payload.full_name,
          custom_avatar_url: payload.avatar_url,
          username: payload.username,
        },
      });

      setProfile({ ...payload } as ProfileRow);
      setProfileMsg({ type: "success", text: "Profile saved." });
    } catch (err) {
      setProfileMsg({
        type: "error",
        text: err instanceof Error ? err.message : "Save failed",
      });
    } finally {
      setSavingProfile(false);
    }
  };

  /* ───────── Email change ───────── */

  const changeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enabled || !user || emailSaving) return;
    const next = newEmail.trim();
    if (!next || next === user.email) return;
    setEmailSaving(true);
    setEmailMsg(null);
    try {
      const { error } = await supabase.auth.updateUser({ email: next });
      if (error) throw error;
      setEmailMsg({
        type: "success",
        text: `Confirmation sent to ${next}. Click the link to confirm the change.`,
      });
      setNewEmail("");
    } catch (err) {
      setEmailMsg({
        type: "error",
        text: err instanceof Error ? err.message : "Email change failed",
      });
    } finally {
      setEmailSaving(false);
    }
  };

  /* ───────── Password change ───────── */

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enabled || passwordSaving) return;
    setPasswordSaving(true);
    setPasswordMsg(null);
    if (newPassword.length < 6) {
      setPasswordMsg({
        type: "error",
        text: "Password must be at least 6 characters.",
      });
      setPasswordSaving(false);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: "error", text: "Passwords do not match." });
      setPasswordSaving(false);
      return;
    }
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;
      setPasswordMsg({ type: "success", text: "Password updated." });
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setPasswordMsg({
        type: "error",
        text: err instanceof Error ? err.message : "Update failed",
      });
    } finally {
      setPasswordSaving(false);
    }
  };

  /* ───────── Avatar upload ───────── */

  const pickAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !user) return;
    e.target.value = "";
    if (!f.type.startsWith("image/")) {
      setAvatarMsg({ type: "error", text: "Please pick an image file." });
      return;
    }
    const r = new FileReader();
    r.onload = () => {
      setCropImage(r.result as string);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
    };
    r.readAsDataURL(f);
  };

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const saveCrop = async () => {
    if (!cropImage || !croppedAreaPixels || !user) return;
    setAvatarUploading(true);
    setAvatarMsg(null);
    try {
      const cropped = await getCroppedImg(cropImage, croppedAreaPixels);
      if (cropped.size > 512 * 1024) {
        throw new Error("Image still too large after crop. Try smaller.");
      }
      const ext = cropped.type === "image/png" ? "png" : "webp";
      const filePath = `${user.id}.${ext}`;
      await supabase.storage
        .from("avatars")
        .remove([`${user.id}.webp`, `${user.id}.png`]);
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(filePath, cropped, {
          cacheControl: "3600",
          upsert: true,
          contentType: cropped.type,
        });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      // Persist to profiles + auth metadata
      await supabase
        .from("profiles")
        .upsert(
          { user_id: user.id, avatar_url: publicUrl },
          { onConflict: "user_id" }
        );
      await supabase.auth.updateUser({
        data: { ...user.user_metadata, custom_avatar_url: publicUrl },
      });
      setAvatarUrl(publicUrl);
      setAvatarMsg({ type: "success", text: "Photo updated." });
      setCropImage(null);
    } catch (err) {
      setAvatarMsg({
        type: "error",
        text: err instanceof Error ? err.message : "Upload failed",
      });
    } finally {
      setAvatarUploading(false);
    }
  };

  const removeAvatar = async () => {
    if (!user) return;
    setAvatarUploading(true);
    setAvatarMsg(null);
    try {
      await supabase.storage
        .from("avatars")
        .remove([`${user.id}.webp`, `${user.id}.png`]);
      await supabase
        .from("profiles")
        .upsert(
          { user_id: user.id, avatar_url: null },
          { onConflict: "user_id" }
        );
      await supabase.auth.updateUser({
        data: { ...user.user_metadata, custom_avatar_url: null },
      });
      setAvatarUrl(null);
      setAvatarMsg({ type: "success", text: "Photo removed." });
    } catch (err) {
      setAvatarMsg({
        type: "error",
        text: err instanceof Error ? err.message : "Remove failed",
      });
    } finally {
      setAvatarUploading(false);
    }
  };

  const globalSignOut = async () => {
    if (!enabled) return;
    await supabase.auth.signOut({ scope: "global" });
    if (typeof window !== "undefined") window.location.href = "/";
  };

  /* ───────────────── render ───────────────── */

  if (!enabled) {
    return (
      <div className="text-sm text-secondary">
        Sign-in isn&apos;t configured for this build.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-5 w-40 animate-pulse rounded bg-surface" />
        <div className="h-32 animate-pulse rounded-xl bg-surface" />
        <div className="h-48 animate-pulse rounded-xl bg-surface" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="rounded-xl border border-app bg-app-elevated p-5 text-sm text-secondary">
        Sign in to manage your profile. Use the avatar in the top-right
        corner.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Crop modal */}
      {cropImage && (
        <div className="fixed inset-0 z-[90] flex flex-col bg-black/90">
          <div className="relative flex-1">
            <Cropper
              image={cropImage}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          </div>
          <div
            className="border-t p-4"
            style={{
              background: "#0a0a0a",
              borderColor: "rgba(255,255,255,0.10)",
            }}
          >
            <div className="mx-auto flex max-w-[400px] items-center gap-3">
              <span
                className="text-xs"
                style={{ color: "rgba(255,255,255,0.6)" }}
              >
                Zoom
              </span>
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="flex-1 accent-white"
              />
            </div>
            <div className="mt-4 flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => setCropImage(null)}
                className="px-6 py-3 text-[0.65rem] uppercase tracking-[0.15em]"
                style={{ color: "rgba(255,255,255,0.7)" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveCrop}
                disabled={avatarUploading}
                className="rounded-lg bg-tool-accent px-6 py-3 text-[0.65rem] uppercase tracking-[0.15em] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {avatarUploading ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Profile form */}
      <form
        onSubmit={saveProfile}
        className="rounded-xl border border-app bg-app-elevated p-5"
      >
        <h3 className="text-[0.6rem] uppercase tracking-[0.2em] text-muted">
          Profile
        </h3>

        {/* Avatar row */}
        <div className="mt-5 flex items-center gap-5">
          <div className="relative h-20 w-20 shrink-0">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt="Avatar"
                className={`h-20 w-20 rounded-full border border-app object-cover ${
                  avatarUploading ? "animate-pulse opacity-50" : ""
                }`}
              />
            ) : (
              <div
                className={`flex h-20 w-20 items-center justify-center rounded-full bg-tool-accent text-2xl font-semibold text-white ${
                  avatarUploading ? "animate-pulse opacity-50" : ""
                }`}
              >
                {(fullName[0] || user.email?.[0] || "?").toUpperCase()}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={pickAvatar}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={avatarUploading}
              className="rounded-lg border border-app bg-app px-4 py-2 text-[0.7rem] uppercase tracking-[0.14em] font-medium text-app transition-colors hover:bg-surface disabled:opacity-50"
            >
              {avatarUploading ? "Uploading…" : "Change photo"}
            </button>
            {avatarUrl && (
              <button
                type="button"
                onClick={removeAvatar}
                disabled={avatarUploading}
                className="text-left text-[0.65rem] uppercase tracking-[0.14em] text-muted transition-colors hover:text-app disabled:opacity-50"
              >
                Remove
              </button>
            )}
            {avatarMsg && (
              <p
                className={`text-xs ${
                  avatarMsg.type === "success"
                    ? "text-tool-accent"
                    : "text-rose-400"
                }`}
              >
                {avatarMsg.text}
              </p>
            )}
          </div>
        </div>

        {/* Fields */}
        <div className="mt-6 space-y-4">
          <div>
            <label className="mb-1.5 block text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              Username
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">
                @
              </span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={30}
                placeholder="yourhandle"
                className={`${inputClass} pl-7`}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
            <UsernameStatus status={usernameStatus} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                Full Name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                maxLength={64}
                placeholder="Your full name"
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                Designation
              </label>
              <input
                type="text"
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                maxLength={64}
                placeholder="Real Estate Broker, Founder, etc."
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              Bio
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={280}
              rows={3}
              placeholder="A line or two about you."
              className={`${inputClass} resize-none`}
            />
            <span className="mt-1 block text-[11px] text-muted">
              {bio.length}/280
            </span>
          </div>

          {/* Socials */}
          <div>
            <label className="mb-2 block text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              Social links
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {SOCIAL_FIELDS.map((s) => (
                <div key={s.key}>
                  <label className="mb-1 block text-[10px] uppercase tracking-[0.12em] text-muted">
                    {s.label}
                  </label>
                  <input
                    type="text"
                    value={socials[s.key] ?? ""}
                    onChange={(e) =>
                      setSocials((prev) => ({
                        ...prev,
                        [s.key]: e.target.value,
                      }))
                    }
                    placeholder={s.placeholder}
                    className={inputClass}
                    autoCapitalize="none"
                    autoCorrect="off"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {profileMsg && (
          <p
            className={`mt-4 text-sm ${
              profileMsg.type === "success"
                ? "text-tool-accent"
                : "text-rose-400"
            }`}
          >
            {profileMsg.text}
          </p>
        )}

        <div className="mt-5">
          <button
            type="submit"
            disabled={
              savingProfile ||
              usernameStatus === "checking" ||
              usernameStatus === "taken" ||
              usernameStatus === "invalid"
            }
            className="rounded-lg bg-tool-accent px-6 py-2.5 text-[0.72rem] uppercase tracking-[0.15em] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {savingProfile ? "Saving…" : "Save profile"}
          </button>
        </div>
      </form>

      {/* Account / Email */}
      <div className="rounded-xl border border-app bg-app-elevated p-5">
        <h3 className="text-[0.6rem] uppercase tracking-[0.2em] text-muted">
          Account
        </h3>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-secondary">Email</dt>
            <dd className="truncate text-app">{user.email}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-secondary">Sign-in method</dt>
            <dd className="text-app capitalize">{provider}</dd>
          </div>
        </dl>

        <form onSubmit={changeEmail} className="mt-5 space-y-3">
          <label className="block">
            <span className="text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              Change email
            </span>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="new@email.com"
              className={`${inputClass} mt-1.5`}
            />
          </label>
          {emailMsg && (
            <p
              className={`text-sm ${
                emailMsg.type === "success"
                  ? "text-tool-accent"
                  : "text-rose-400"
              }`}
            >
              {emailMsg.text}
            </p>
          )}
          <button
            type="submit"
            disabled={emailSaving || !newEmail.trim() || newEmail === user.email}
            className="rounded-lg border border-app bg-app px-5 py-2 text-[0.7rem] uppercase tracking-[0.14em] font-medium text-app transition-colors hover:bg-surface disabled:opacity-50"
          >
            {emailSaving ? "Sending…" : "Send confirmation"}
          </button>
        </form>
      </div>

      {/* Password (email-provider users only) */}
      {isEmailUser && (
        <form
          onSubmit={changePassword}
          className="rounded-xl border border-app bg-app-elevated p-5"
        >
          <h3 className="text-[0.6rem] uppercase tracking-[0.2em] text-muted">
            Change password
          </h3>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password"
              className={inputClass}
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm password"
              className={inputClass}
            />
          </div>
          {passwordMsg && (
            <p
              className={`mt-3 text-sm ${
                passwordMsg.type === "success"
                  ? "text-tool-accent"
                  : "text-rose-400"
              }`}
            >
              {passwordMsg.text}
            </p>
          )}
          <button
            type="submit"
            disabled={passwordSaving}
            className="mt-4 rounded-lg border border-app bg-app px-5 py-2 text-[0.7rem] uppercase tracking-[0.14em] font-medium text-app transition-colors hover:bg-surface disabled:opacity-50"
          >
            {passwordSaving ? "Updating…" : "Update password"}
          </button>
        </form>
      )}

      {/* Danger zone */}
      <div className="rounded-xl border border-rose-400/25 bg-rose-400/5 p-5">
        <h3 className="text-[0.6rem] uppercase tracking-[0.2em] text-rose-400/90">
          Danger zone
        </h3>
        <p className="mt-2 text-sm text-secondary">
          Sign out of all devices. You&apos;ll have to sign in again
          everywhere.
        </p>
        <button
          type="button"
          onClick={globalSignOut}
          className="mt-4 rounded-lg border border-rose-400/25 bg-rose-400/10 px-5 py-2 text-[0.7rem] uppercase tracking-[0.14em] font-medium text-rose-400 transition-colors hover:bg-rose-400/20"
        >
          Sign out of all devices
        </button>
      </div>
    </div>
  );
}

function UsernameStatus({
  status,
}: {
  status: "idle" | "checking" | "available" | "taken" | "invalid";
}) {
  if (status === "idle") return null;
  const palette = {
    checking: { color: "text-muted", text: "Checking availability…" },
    available: { color: "text-tool-accent", text: "Available ✓" },
    taken: { color: "text-rose-400", text: "Already taken" },
    invalid: {
      color: "text-rose-400",
      text: "3–30 chars, letters/digits/_/-",
    },
  } as const;
  const { color, text } = palette[status];
  return <p className={`mt-1.5 text-xs ${color}`}>{text}</p>;
}
