/* ═══════════════════════════════════════════════════════════════════════════
   lib/poster/templates/fitness/ — 2 templates for gyms / studios / coaches
   ═══════════════════════════════════════════════════════════════════════════ */

"use client";

import type { PosterRenderProps, PosterTemplate } from "../../types";
import { AgentBar, PosterImageBox, StoryShell, dataImage, dataStr } from "../../_shared";

function read(props: PosterRenderProps) {
  const d = props.data;
  return {
    programName: dataStr(d, "programName"),
    tagline: dataStr(d, "tagline"),
    price: dataStr(d, "price"),
    duration: dataStr(d, "duration"),
    startDate: dataStr(d, "startDate"),
    spotsLeft: dataStr(d, "spotsLeft"),
    classTitle: dataStr(d, "classTitle"),
    schedule: dataStr(d, "schedule"),
    trainer: dataStr(d, "trainer"),
    image1: dataImage(d, "image1"),
  };
}

/* 1. Program Launch / Challenge */
function TemplateProgramLaunch(props: PosterRenderProps) {
  const f = read(props);
  if (props.format === "story") {
    return (
      <StoryShell
        posterRef={props.posterRef}
        theme="dark"
        title={f.programName}
        subtitle={f.spotsLeft ? `${f.spotsLeft} spots left` : "JOIN NOW"}
        price={f.price}
        location={f.startDate}
        image={f.image1}
        features={f.tagline}
        currency={props.currency}
        branding={props.branding}
      />
    );
  }
  return (
    <div ref={props.posterRef} className="relative flex w-full flex-col overflow-hidden bg-black" style={{ aspectRatio: "1080/1350" }}>
      <PosterImageBox image={f.image1} className="absolute inset-0" />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-black/40" />
      <div className="absolute top-[5%] left-[5%] z-10">
        <span className="inline-block rounded-sm bg-yellow-400 px-[0.8em] py-[0.3em] text-[0.55em] font-extrabold tracking-[0.25em] text-black uppercase">
          {f.spotsLeft ? `${f.spotsLeft} Spots Left` : "Join Now"}
        </span>
      </div>
      <div className="flex-1" />
      <div className="relative z-10 p-[6%]">
        <h2 className="text-[1.6em] font-extrabold leading-[1.05] text-white">{f.programName}</h2>
        {f.tagline ? <p className="mt-[0.3em] text-[0.55em] uppercase tracking-[0.15em] text-yellow-300/90">{f.tagline}</p> : null}
        <div className="mt-[0.4em] flex items-baseline gap-[0.5em]">
          {f.price ? (
            <span className="text-[1.4em] font-extrabold text-white">{props.currency} {f.price}</span>
          ) : null}
          {f.duration ? (
            <span className="text-[0.5em] text-white/60 uppercase tracking-wider">{f.duration}</span>
          ) : null}
        </div>
        {f.startDate ? (
          <p className="mt-[0.3em] text-[0.5em] text-white/70">Starts {f.startDate}</p>
        ) : null}
        <div className="mt-[0.8em]">
          <AgentBar branding={props.branding} theme="dark" />
        </div>
      </div>
    </div>
  );
}

/* 2. Class Schedule */
function TemplateClassSchedule(props: PosterRenderProps) {
  const f = read(props);
  if (props.format === "story") {
    return (
      <StoryShell
        posterRef={props.posterRef}
        theme="gradient"
        title={f.classTitle}
        subtitle={f.trainer ? `With ${f.trainer}` : "WEEKLY CLASS"}
        location={f.schedule}
        image={f.image1}
        currency={props.currency}
        branding={props.branding}
      />
    );
  }
  return (
    <div ref={props.posterRef} className="flex w-full flex-col overflow-hidden" style={{ aspectRatio: "1080/1350", background: "linear-gradient(160deg, #0e7490 0%, #0f766e 100%)" }}>
      <div className="px-[6%] pt-[6%]">
        <span className="inline-block rounded-full bg-white/15 backdrop-blur-sm px-[1em] py-[0.3em] text-[0.5em] font-bold tracking-[0.25em] text-white uppercase">
          Weekly Class
        </span>
      </div>
      <div className="relative mx-[6%] mt-[3%] flex-shrink-0 h-[40%] rounded-2xl overflow-hidden">
        <PosterImageBox image={f.image1} className="absolute inset-0" />
      </div>
      <div className="flex flex-1 flex-col justify-between p-[6%] pt-[1em]">
        <div>
          <h2 className="text-[1.4em] font-extrabold leading-[1.1] text-white">{f.classTitle}</h2>
          {f.trainer ? <p className="mt-[0.3em] text-[0.55em] text-white/80">With {f.trainer}</p> : null}
          {f.schedule ? (
            <p className="mt-[0.4em] text-[0.6em] font-medium text-white whitespace-pre-line">{f.schedule}</p>
          ) : null}
        </div>
        <div className="mt-[0.6em] rounded-xl bg-white/10 backdrop-blur-sm p-[0.5em]">
          <AgentBar branding={props.branding} theme="gradient" />
        </div>
      </div>
    </div>
  );
}

export const FITNESS_TEMPLATES: PosterTemplate[] = [
  {
    id: "fitness-program-launch",
    industry: "fitness",
    name: "Program Launch",
    description: "Bold dark layout for new challenges, transformation programs, bootcamps.",
    thumbnail: "🏋️",
    fields: [
      { key: "programName", label: "Program Name", type: "text", required: true, placeholder: "8-Week Transformation", group: "Basics" },
      { key: "tagline", label: "Tagline", type: "text", required: false, placeholder: "Train. Eat. Win.", group: "Basics" },
      { key: "price", label: "Price", type: "price", required: true, placeholder: "12,000", group: "Basics" },
      { key: "duration", label: "Duration / Pricing Note", type: "text", required: false, placeholder: "/ 8 weeks", group: "Basics" },
      { key: "startDate", label: "Start Date", type: "text", required: false, placeholder: "1 July", group: "Basics" },
      { key: "spotsLeft", label: "Spots Left (urgency)", type: "number", required: false, placeholder: "8", group: "Basics" },
      { key: "image1", label: "Hero Image", type: "image", required: false, group: "Photos" },
    ],
    defaultData: {
      programName: "8-Week Transformation",
      tagline: "Train. Eat. Win.",
      price: "12,000",
      duration: "/ 8 weeks",
      startDate: "1 July",
      spotsLeft: "8",
    },
    dimensions: "both",
    Render: TemplateProgramLaunch,
  },
  {
    id: "fitness-class-schedule",
    industry: "fitness",
    name: "Class Schedule",
    description: "Weekly class promo — yoga, HIIT, spin, etc.",
    thumbnail: "🧘",
    fields: [
      { key: "classTitle", label: "Class Title", type: "text", required: true, placeholder: "Vinyasa Flow", group: "Basics" },
      { key: "trainer", label: "Trainer Name", type: "text", required: false, placeholder: "Ayesha K.", group: "Basics" },
      { key: "schedule", label: "Schedule", type: "multiline", required: true, placeholder: "Mon · Wed · Fri\n7:00 AM · 6:30 PM", group: "Basics" },
      { key: "image1", label: "Hero Image", type: "image", required: false, group: "Photos" },
    ],
    defaultData: {
      classTitle: "Vinyasa Flow",
      trainer: "Ayesha K.",
      schedule: "Mon · Wed · Fri\n7:00 AM · 6:30 PM",
    },
    dimensions: "both",
    Render: TemplateClassSchedule,
  },
];
