# SKYLINE — Design Spec

## Concept
A 3D city skyline at night that lights up window-by-window as the user scrolls. Each lit window = a wish for Simren. Pull-back reveals her name floating above the city; final scene releases her photos as paper lanterns rising from the rooftops.

## Color Palette
- `--night-deep` `#0a1424` — base sky, far buildings
- `--night-mid`  `#1a2a4a` — mid-gradient sky
- `--night-soft` `#2a3a5e` — closer building bodies
- `--amber-hot`  `#ffb56b` — emissive lit windows
- `--amber-warm` `#ffd89b` — bloom highlight
- `--amber-soft` `#fff0d6` — final aurora glow tint
- `--ivory`     `#f5e9d4` — body copy / numerals
- `--rose-gold` `#e9b87a` — interactive accent (cursor, focused window border)

## Typography
- **Display**: Cormorant Garamond (italic, 500/700) via `next/font/google`
- **UI**: JetBrains Mono via `next/font/google` (counter, loading text, captions)
- Display sizes: hero `clamp(5rem,16vw,16rem)`, section heads `clamp(3rem,9vw,9rem)`
- Mix-blend-mode: `difference` on overlay headlines so they read against any sky color

## Scene Composition
- **Buildings**: 110 desktop / 55 mobile. Loose 12×9 grid with random offset (±0.4 cell), random skip (~12%) for negative space
- **Heights**: front-center skyscrapers (8–18 stories scaled), receding to background giants (25–55 stories). Per-building random width 0.6–1.4
- **Windows per face**: 4–8 columns × story count rows. Procedural canvas texture (per building, cached by hash)
- **Initial lit ratio**: 4% (sparse warm glow). Target final: 100%
- **Camera path**:
  - Loading→hero: pos `(0, 6, 90)`, lookAt `(0, 14, 0)`, FOV 45
  - Mid-scroll dolly: pos `(8, 12, 50)` — slight orbit right
  - Pull-back final: pos `(0, 38, 110)` — reveal city + name overlay
  - Window-focus: tween to ~6 units in front of clicked face
- **Lighting**:
  - DirectionalLight `(−40, 60, −20)` color `#4a6890` intensity 0.35 (cool moonlight)
  - HemisphereLight sky `#1a2a4a` ground `#050810` intensity 0.18
  - PointLights baked into lit-window faces (sparse — per-building emissive material handles it)
  - Final scene: warm ambient swelling to 0.4 intensity tinted `#ffd89b`
- **Fog**: `FogExp2(#0a1424, 0.012)` desktop, density tweens to `0.005` at full-lit. Disabled on degraded mobile.
- **Bloom**: `@react-three/postprocessing` `<EffectComposer>` + `<Bloom>` luminanceThreshold 0.6, intensity 1.4, radius 0.8. Skipped on degraded mobile.

## Interaction State Machine
States: `loading` → `idle` → `hovering-window` → `window-focused` → `wishes-revealed` → `lanterns`

Transitions:
- loading → idle: when texture/material setup complete (real progress 0→100)
- idle ↔ hovering-window: pointer raycast hits a lit window (cursor inflates)
- idle → window-focused: click lit window. Camera tweens 1.4s ease, glass card fades in 400ms after camera settles. Other UI dims.
- window-focused → idle: click outside / Esc. Camera reverses.
- idle → wishes-revealed: scroll progress ≥ 0.75. All windows now lit. Name overlay floats up.
- wishes-revealed → lanterns: scroll progress ≥ 0.92. Photos rise from city.

## Timing Budget
- 0.0s : page mounted, loading screen visible (already at 0%)
- 0.0–1.5s : real loader progress (font + texture compile + first frame)
- 1.5s : loader fades 400ms; counter, hero overlay visible immediately (CSS keyframes, no rAF deps)
- 2.0s : first 4% of windows lit; ambient drone starts at low gain
- 2.0s+ : passive auto-light at 1 window per ~80ms when scroll progress < 0.4 (so even a non-scroller sees life)
- scroll 0.0–0.4 : "TONIGHT" headline, dolly forward
- scroll 0.4–0.75 : "FOR HER" headline, light ratio surges toward 100%, synth pad swells
- scroll 0.75–0.92 : "SIMREN ZAHRA" reveal, pull-back camera
- scroll 0.92–1.0 : photo lanterns rise

Total scroll page height: 600vh.

## Generative Audio Strategy
Mounted only if NO `<audio>` from parent layout AND user has interacted (Tone.start needs a gesture). Detect via `document.querySelector('audio')` having a `src` attribute set.
- **Drone**: `Tone.FMSynth` low C2, volume tied to lit-ratio (range −38dB → −22dB)
- **Pad**: `Tone.PolySynth` chord (Cmaj7) at scroll ≥ 0.4, volume −∞ → −18dB tied to ratio above 0.4
- **Chime**: `Tone.MetalSynth` short pluck on window-click and on every passive light ignition (heavily filtered, −34dB so it's a whisper)
- Master limiter; volume capped at −16dB to never dominate.
- Provide a tiny mute toggle in bottom-right (small dot icon).

## Wishes (40)
Each: `{ name, role, city, text }`. Text under 25 words. Mix Pakistani, Indian, Gulf, UK, US cities. Authentic, varied — humor, gratitude, friendship, professional respect. No stereotypes.

1. Anya, baker — Karachi: "Tonight I baked an extra loaf and left it warm by the window. Wherever you are, that one's for you."
2. Talha, designer — Dubai: "Every project I touch this year, I'm secretly designing it for someone with your taste."
3. Mira, doctor — Lahore: "After the night shift I sat on the roof and thought about how lucky your friends are."
4. Junaid, architect — Islamabad: "Buildings I draw next year will have softer corners because of you."
5. Sana, teacher — Multan: "Told my class today that the best people listen more than they speak. I was thinking of you."
6. Rizwan, engineer — Riyadh: "When the city lights came on tonight, I pretended a few of them were blinking just for you."
7. Fatima, lawyer — London: "You taught me that grace is a kind of strength. Happy birthday, my friend."
8. Hamza, chef — Manchester: "Pulled a perfect espresso this morning and named it after you. The regulars now ask for 'a Simren'."
9. Ayesha, photographer — Bangalore: "Took a picture of the moon for you. It came out blurry. So did my eyes."
10. Daniyal, founder — Toronto: "If presence were a currency, you'd be the richest person I know."
11. Noor, midwife — Karachi: "Held a baby today whose mother was scared. Thought of how you make people feel safe."
12. Imran, pilot — Doha: "Crossed your time zone at 03:14. Tipped the wing once. That was for you."
13. Saba, journalist — Delhi: "Filed my hardest story this week. Could only do it because you taught me to be unafraid."
14. Bilal, musician — Berlin: "Wrote a chord I've never played before today. Saving it for the next time we meet."
15. Hira, dentist — Sharjah: "May the year ahead be as steady as your hands and as warm as your laugh."
16. Adeel, farmer — Bahawalpur: "First mango of the season ripened today. The garden insists you have it."
17. Zara, animator — Brooklyn: "Drew you as a tiny character lighting lamps in a dark city. Turns out that was always you."
18. Kashif, mechanic — Birmingham: "Tuned a fussy old engine into a purr today. Felt like something you'd be proud of."
19. Mehreen, marine biologist — Karachi: "Saw bioluminescence off the coast last week. The whole sea was glowing softly. Made me think of you."
20. Faisal, comedian — Lahore: "Wrote a joke today and immediately wished you were the one to hear it first."
21. Lubna, professor — Boston: "A student asked me what kindness looks like in practice. I almost said your name."
22. Usman, climber — Skardu: "Every summit gets named in my head. The next one is yours."
23. Reema, dancer — Mumbai: "Choreographed a turn today that only works because of pause, not movement. Like the way you listen."
24. Wajid, accountant — Faisalabad: "Numbers behaved themselves today. I'm choosing to believe it's because of you."
25. Ghazala, painter — Istanbul: "Mixed a new color tonight — somewhere between dawn and amber. I'm calling it 'Simren'."
26. Aamir, taxi driver — Karachi: "A passenger sang on the back seat tonight. I didn't tell her to stop. You'd have approved."
27. Saima, nurse — Riyadh: "An old man asked me to read him a poem. I read your favorite. He smiled. So did I."
28. Tariq, fisherman — Gwadar: "The sea was calm today. The catch was honest. The kind of day I'd want for you, every year."
29. Naila, scientist — Geneva: "Discovered nothing today. Still proud of the work. Thank you for teaching me patience counts."
30. Yusuf, gardener — Marrakech: "A jasmine bloomed out of season this week. I think it heard your name on the breeze."
31. Erum, social worker — Karachi: "Walked an elderly woman home. She told me I had a kind face. I borrowed yours for the day."
32. Sohail, programmer — San Francisco: "Closed a bug that had haunted me for weeks. Felt like cleaning my room because you were coming over."
33. Komal, midwife — Sukkur: "Three babies born tonight. Two cried. One smiled. The world's gentler with you in it."
34. Asher, calligrapher — Cairo: "Wrote your name in three scripts today. None of them were as graceful as the actual you."
35. Maryam, librarian — Edinburgh: "Re-shelved a book I think you'd love. Left a note inside. Just in case."
36. Shahbaz, director — Karachi: "Cut a scene today that wasn't working. The film breathes again. You always taught me when to let go."
37. Bina, florist — Mumbai: "Tied a bouquet today and the colors arranged themselves. I think the flowers know it's your day."
38. Owais, vet — Quetta: "A stray came in limping. Walked out wagging. Some days are pure. This one's for you."
39. Rabia, baker — Hyderabad: "Made a cake too pretty to cut. We cut it anyway. To you, and to all the things worth ruining beautifully."
40. Hadi, poet — Karachi: "I have written you into a small poem nobody will read. It is enough that it exists."

## Failure-Mode Pre-Checks
- Hero overlay: pure CSS `@keyframes` fadeIn, runs regardless of WebGL state. Counter mounted in DOM with `useState`, not framer.
- iPhone EXIF: photos loaded via `createImageBitmap(blob,{imageOrientation:"from-image"})` for textures; plain `<img>` tags also OK because browsers honor EXIF on `<img>` natively.
- Mobile perf: detect `(pointer:coarse) && hardwareConcurrency < 6` → degraded mode (55 buildings, no fog, no bloom, simpler shading).
- DPR cap: `[1, 1.5]`.
- Loading screen: shown until `useProgress().progress === 100` OR 2.5s timeout (whichever first) — don't trap the user.
- Title meta: `title:{absolute:"Happy Birthday, Simren — Skyline"}`.
- No "Asad" anywhere.
- Generative audio gated on parent-audio detection AND first user gesture.

## Render Order
1. `<Canvas>` full viewport, fixed
2. DOM overlay (loading, counter, hero text, focused-window card, mute button, lanterns CSS) — `position: fixed`, `z-index` layered
3. Scroll-spacer div 600vh, transparent — gives the page real scroll height for Lenis
