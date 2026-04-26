"use client";

import { useState } from "react";
import MarketingShell from "../_components/MarketingShell";

/* Contact page — single-screen form that posts to a Supabase row.
 *
 * For now we use a simple `contact_messages` table with anon-insert
 * permission. We can wire an email notification (Resend / Postmark)
 * as a follow-up.
 */

import { getSupabase } from "@/lib/supabase/client";

export default function ContactPage() {
  const supabase = getSupabase();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState("general");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "sending") return;
    setStatus("sending");
    setErrorMsg(null);
    try {
      const { error } = await supabase.from("contact_messages").insert({
        name: name.trim() || null,
        email: email.trim(),
        topic,
        message: message.trim(),
      });
      if (error) throw error;
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Failed to send");
    }
  };

  const inputClass =
    "w-full rounded-lg border border-app bg-app-elevated px-3 py-2.5 text-sm text-app outline-none transition-colors focus:border-tool-accent focus:ring-2 focus:ring-tool-accent-soft placeholder:text-faint";

  return (
    <MarketingShell eyebrow="Contact" title="Get in touch.">
      <p>
        Have a feature request, found a bug, or want to chat about a custom
        deployment? Fill in the form and we&apos;ll reply within a day or
        two. For account-specific issues, please include the email you
        signed in with.
      </p>

      {status === "sent" ? (
        <div className="rounded-xl border border-tool-accent-soft bg-tool-accent-soft/40 p-5 text-app">
          Message sent — we&apos;ll get back to you at{" "}
          <strong>{email}</strong>.
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                Your name
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Optional"
                className={`${inputClass} mt-1.5`}
              />
            </label>
            <label className="block">
              <span className="text-[0.6rem] uppercase tracking-[0.2em] text-muted">
                Email
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@yourdomain.com"
                className={`${inputClass} mt-1.5`}
              />
            </label>
          </div>

          <label className="block">
            <span className="text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              Topic
            </span>
            <select
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className={`${inputClass} mt-1.5`}
            >
              <option value="general">General question</option>
              <option value="feature">Feature request</option>
              <option value="bug">Bug report</option>
              <option value="business">Partnership / business</option>
              <option value="press">Press</option>
            </select>
          </label>

          <label className="block">
            <span className="text-[0.6rem] uppercase tracking-[0.2em] text-muted">
              Message
            </span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              rows={6}
              placeholder="Tell us what you&apos;re trying to do."
              className={`${inputClass} mt-1.5 resize-none`}
            />
          </label>

          {errorMsg && (
            <div className="rounded-lg border border-rose-400/25 bg-rose-400/10 px-3 py-2 text-sm text-rose-400">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={status === "sending"}
            className="rounded-lg bg-tool-accent px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {status === "sending" ? "Sending…" : "Send message"}
          </button>
        </form>
      )}
    </MarketingShell>
  );
}
