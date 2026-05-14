"use client";

/* AutoMusic — invisible audio element that autoplays muted (allowed by
 * browsers) and unmutes silently the first time the user taps, clicks,
 * or scrolls anywhere on the page.
 *
 * To the user it feels like background music just starts on its own —
 * because their first interaction within the first few seconds (tapping
 * the cake, scrolling, etc.) flips the mute off without a UI prompt.
 *
 * No buttons. No volume slider. Just music.
 *
 * If the audio glob returns no file, this component renders nothing
 * and is a no-op — safe to mount unconditionally from the layout.
 */

import { useEffect, useRef } from "react";

interface Props {
  src: string | null;
  /** Initial volume after unmute (0–1). Defaults to 0.45 — soft. */
  volume?: number;
}

export default function AutoMusic({ src, volume = 0.45 }: Props) {
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (!src) return;
    const audio = ref.current;
    if (!audio) return;

    audio.volume = volume;
    // Try to autoplay — succeeds when muted on every modern browser.
    audio.play().catch(() => {
      /* swallowed — first interaction will start it */
    });

    let unmuted = false;
    const unmute = () => {
      if (unmuted) return;
      unmuted = true;
      audio.muted = false;
      // If autoplay was blocked entirely, this also kicks playback off.
      audio.play().catch(() => {});
      removeListeners();
    };

    const opts: AddEventListenerOptions = { once: true, passive: true };
    const events: Array<keyof WindowEventMap> = [
      "pointerdown",
      "touchstart",
      "click",
      "keydown",
      "scroll",
      "wheel",
    ];
    function removeListeners() {
      events.forEach((e) => window.removeEventListener(e, unmute));
    }
    events.forEach((e) => window.addEventListener(e, unmute, opts));

    return () => {
      removeListeners();
      audio.pause();
    };
  }, [src, volume]);

  if (!src) return null;
  return (
    <audio
      ref={ref}
      src={src}
      autoPlay
      muted
      loop
      preload="auto"
      playsInline
      // Hidden but mounted in DOM so the audio element exists.
      style={{
        position: "fixed",
        width: 0,
        height: 0,
        opacity: 0,
        pointerEvents: "none",
        top: -9999,
        left: -9999,
      }}
      aria-hidden="true"
    />
  );
}
