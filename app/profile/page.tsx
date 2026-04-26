"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import Cropper from "react-easy-crop";
import type { Area } from "react-easy-crop";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

const ease: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

/* /profile — Space Field account settings.
 *
 * Mirrors the example.com profile shape (excluding performance / awards):
 *   - Profile Information: avatar with crop-upload, full name, email
 *   - Change Password: only when signed in via email (provider == "email")
 *   - Danger Zone: sign out of all devices
 *
 * Storage: avatars bucket on the spacefield Supabase project. Per-user
 * RLS lets each user write `<userId>.<ext>`. Public read for everyone.
 */

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
          (blob) =>
            blob ? resolve(blob) : reject(new Error("Failed to convert image")),
          "image/png"
        );
      } else {
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
              return;
            }
            canvas.toBlob(
              (jpegBlob) =>
                jpegBlob
                  ? resolve(jpegBlob)
                  : reject(new Error("Failed to convert image")),
              "image/jpeg",
              0.85
            );
          },
          "image/webp",
          0.85
        );
      }
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = imageSrc;
  });
}

export default function ProfilePage() {
  const supabase = getSupabase();
  const enabled = isSupabaseConfigured();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Profile form
  const [fullName, setFullName] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Avatar
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarMsg, setAvatarMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Crop modal
  const [cropImage, setCropImage] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  // Password form
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const isEmailUser = user?.app_metadata?.provider === "email";

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      const u = data.user;
      setUser(u);
      if (u) {
        setFullName(
          (u.user_metadata?.full_name as string) ||
            (u.user_metadata?.name as string) ||
            ""
        );
        setAvatarUrl(
          (u.user_metadata?.custom_avatar_url as string) ||
            (u.user_metadata?.avatar_url as string) ||
            null
        );
      }
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [supabase, enabled]);

  const handleAvatarUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !user) return;
      e.target.value = "";
      if (!file.type.startsWith("image/")) {
        setAvatarMsg({ type: "error", text: "Please select an image file." });
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setCropImage(reader.result as string);
        setCrop({ x: 0, y: 0 });
        setZoom(1);
        setCroppedAreaPixels(null);
      };
      reader.readAsDataURL(file);
    },
    [user]
  );

  const handleCropComplete = useCallback(
    (_croppedArea: Area, croppedPixels: Area) => {
      setCroppedAreaPixels(croppedPixels);
    },
    []
  );

  const handleCropSave = useCallback(async () => {
    if (!cropImage || !croppedAreaPixels || !user) return;
    setAvatarUploading(true);
    setAvatarMsg(null);
    try {
      const cropped = await getCroppedImg(cropImage, croppedAreaPixels);
      if (cropped.size > 512 * 1024) {
        setAvatarMsg({
          type: "error",
          text: "Image too large even after crop. Try a smaller photo.",
        });
        setAvatarUploading(false);
        return;
      }
      const ext = cropped.type === "image/png" ? "png" : "webp";
      const filePath = `${user.id}.${ext}`;
      await supabase.storage
        .from("avatars")
        .remove([`${user.id}.webp`, `${user.id}.png`]);
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, cropped, {
          cacheControl: "3600",
          upsert: true,
          contentType: cropped.type,
        });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      const { error: updateError } = await supabase.auth.updateUser({
        data: { custom_avatar_url: publicUrl },
      });
      if (updateError) throw updateError;
      setAvatarUrl(publicUrl);
      setAvatarMsg({ type: "success", text: "Photo updated." });
      setCropImage(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Upload failed.";
      setAvatarMsg({ type: "error", text: message });
    } finally {
      setAvatarUploading(false);
    }
  }, [cropImage, croppedAreaPixels, user, supabase]);

  const handleAvatarRemove = useCallback(async () => {
    if (!user) return;
    setAvatarUploading(true);
    setAvatarMsg(null);
    try {
      await supabase.storage
        .from("avatars")
        .remove([`${user.id}.webp`, `${user.id}.png`]);
      const { error } = await supabase.auth.updateUser({
        data: { custom_avatar_url: null },
      });
      if (error) throw error;
      setAvatarUrl(null);
      setAvatarMsg({ type: "success", text: "Photo removed." });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Remove failed.";
      setAvatarMsg({ type: "error", text: message });
    } finally {
      setAvatarUploading(false);
    }
  }, [user, supabase]);

  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setProfileSaving(true);
    setProfileMsg(null);
    const { error } = await supabase.auth.updateUser({
      data: { full_name: fullName },
    });
    if (error) {
      setProfileMsg({ type: "error", text: error.message });
    } else {
      setProfileMsg({ type: "success", text: "Profile updated." });
    }
    setProfileSaving(false);
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
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
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    if (error) {
      setPasswordMsg({ type: "error", text: error.message });
    } else {
      setPasswordMsg({ type: "success", text: "Password updated." });
      setNewPassword("");
      setConfirmPassword("");
    }
    setPasswordSaving(false);
  }

  async function handleGlobalSignOut() {
    await supabase.auth.signOut({ scope: "global" });
    if (typeof window !== "undefined") window.location.href = "/";
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-app">
        <div className="mx-auto max-w-[700px] px-6 pt-24 lg:px-10">
          <div className="space-y-4">
            <div className="h-5 w-40 animate-pulse rounded bg-surface" />
            <div className="h-64 animate-pulse rounded-xl border border-app bg-app-elevated" />
          </div>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-app text-app">
        <div className="mx-auto max-w-xl px-6 py-16">
          <Link
            href="/"
            className="text-[0.72rem] uppercase tracking-[0.14em] text-secondary hover:text-app transition-colors"
          >
            ← Back to workspace
          </Link>
          <h1 className="mt-8 text-3xl font-bold tracking-tight text-app">
            Profile
          </h1>
          <p className="mt-3 text-sm text-secondary">
            Sign in to see and edit your profile.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-tool-accent px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Go to workspace and sign in
          </Link>
        </div>
      </main>
    );
  }

  const inputClass =
    "w-full rounded-lg border border-app bg-app-elevated px-4 py-3 text-sm text-app outline-none transition-colors focus:border-tool-accent focus:ring-2 focus:ring-tool-accent-soft placeholder:text-faint";

  return (
    <main className="min-h-screen bg-app text-app">
      {/* Crop modal — fullscreen overlay */}
      {cropImage && (
        <div className="fixed inset-0 z-[80] flex flex-col bg-black/90">
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
              onCropComplete={handleCropComplete}
            />
          </div>
          <div className="border-t border-white/10 bg-[#0a0a0a] p-4">
            <div className="mx-auto flex max-w-[400px] items-center gap-3">
              <span className="text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>
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
                style={{ color: "rgba(255,255,255,0.6)" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCropSave}
                disabled={avatarUploading}
                className="rounded-lg bg-tool-accent px-6 py-3 text-[0.65rem] uppercase tracking-[0.15em] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {avatarUploading ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="mx-auto max-w-[700px] px-6 pt-12 pb-24 lg:px-10">
        {/* Back link */}
        <motion.div
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, ease }}
          className="mb-6"
        >
          <Link
            href="/"
            className="text-sm text-secondary transition-colors hover:text-app"
          >
            ← Back to workspace
          </Link>
        </motion.div>

        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease }}
        >
          <span className="text-[0.6rem] uppercase tracking-[0.2em] text-muted">
            Account
          </span>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-app sm:text-4xl">
            Profile Settings
          </h1>
        </motion.div>

        {/* Profile Info */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15, ease }}
          className="mt-8"
        >
          <form
            onSubmit={handleProfileSave}
            className="rounded-xl border border-app bg-app-elevated p-5"
          >
            <h3 className="text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              Profile Information
            </h3>

            <div className="mt-5 flex items-center gap-5">
              <div className="relative h-24 w-24 shrink-0">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl}
                    alt="Profile photo"
                    className={`h-24 w-24 rounded-full border border-app object-cover ${
                      avatarUploading ? "animate-pulse opacity-50" : ""
                    }`}
                  />
                ) : (
                  <div
                    className={`flex h-24 w-24 items-center justify-center rounded-full border border-app bg-tool-accent text-3xl font-semibold text-white ${
                      avatarUploading ? "animate-pulse opacity-50" : ""
                    }`}
                  >
                    {(fullName[0] || user?.email?.[0] || "A").toUpperCase()}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={avatarUploading}
                  className="rounded-lg border border-app bg-app px-5 py-2.5 text-[0.65rem] uppercase tracking-[0.15em] font-medium text-app transition-colors hover:bg-surface disabled:opacity-50"
                >
                  {avatarUploading ? "Uploading…" : "Change Photo"}
                </button>
                {avatarUrl && (
                  <button
                    type="button"
                    onClick={handleAvatarRemove}
                    disabled={avatarUploading}
                    className="text-[0.6rem] uppercase tracking-[0.15em] text-muted transition-colors hover:text-app disabled:opacity-50"
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

            <div className="mt-5 space-y-4">
              <div>
                <label className="mb-1.5 block text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                  Full Name
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your full name"
                  className={inputClass}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                  Email
                </label>
                <input
                  type="email"
                  value={user?.email || ""}
                  readOnly
                  className={`${inputClass} cursor-not-allowed opacity-60`}
                />
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
                disabled={profileSaving}
                className="rounded-lg bg-tool-accent px-7 py-3 text-[0.75rem] uppercase tracking-[0.15em] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {profileSaving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </form>
        </motion.div>

        {/* Password — only shown for email-provider users */}
        {isEmailUser && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25, ease }}
            className="mt-6"
          >
            <form
              onSubmit={handlePasswordChange}
              className="rounded-xl border border-app bg-app-elevated p-5"
            >
              <h3 className="text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                Change Password
              </h3>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="mb-1.5 block text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 6 characters"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    className={inputClass}
                  />
                </div>
              </div>

              {passwordMsg && (
                <p
                  className={`mt-4 text-sm ${
                    passwordMsg.type === "success"
                      ? "text-tool-accent"
                      : "text-rose-400"
                  }`}
                >
                  {passwordMsg.text}
                </p>
              )}

              <div className="mt-5">
                <button
                  type="submit"
                  disabled={passwordSaving}
                  className="rounded-lg bg-tool-accent px-7 py-3 text-[0.75rem] uppercase tracking-[0.15em] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {passwordSaving ? "Updating…" : "Update Password"}
                </button>
              </div>
            </form>
          </motion.div>
        )}

        {/* Danger Zone */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.35, ease }}
          className="mt-6"
        >
          <div className="rounded-xl border border-rose-400/25 bg-rose-400/5 p-5">
            <h3 className="text-[0.6rem] uppercase tracking-[0.2em] text-rose-400/90">
              Danger Zone
            </h3>
            <p className="mt-3 text-sm text-secondary">
              Sign out of all devices. You will need to sign in again
              everywhere.
            </p>
            <div className="mt-5">
              <button
                onClick={handleGlobalSignOut}
                className="rounded-lg border border-rose-400/25 bg-rose-400/10 px-7 py-3 text-[0.75rem] uppercase tracking-[0.15em] font-medium text-rose-400 transition-colors hover:bg-rose-400/20"
              >
                Sign Out of All Devices
              </button>
            </div>
          </div>
        </motion.div>
      </section>
    </main>
  );
}
