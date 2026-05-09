import type {
  OnboardingFlowRow,
  OnboardingStepRow,
} from "../../_types";
import KindChip from "./KindChip";

/**
 * Right-pane live preview of an onboarding flow as a user would see it.
 * Server component — pure rendering, no state. Steps render top-to-bottom
 * with the chrome an actual onboarding overlay would use.
 */
export default function Preview({
  flow,
  steps,
}: {
  flow: OnboardingFlowRow;
  steps: OnboardingStepRow[];
}) {
  return (
    <section className="rounded-xl border border-app bg-app-elevated p-4">
      <header className="mb-3">
        <h2 className="text-sm font-semibold text-app">Live preview</h2>
        <p className="mt-0.5 text-[11px] text-muted">
          Approximation of what the user sees. The actual runtime may layer
          this onto a modal / overlay; here we just stack the cards.
        </p>
      </header>

      <div className="space-y-3">
        <div className="rounded-lg border border-dashed border-app bg-app/40 px-3 py-2 text-[11px] text-faint">
          Trigger:{" "}
          <code className="font-mono text-secondary">
            {flow.trigger_event}
          </code>{" "}
          · Audience:{" "}
          <code className="font-mono text-secondary">{flow.audience}</code>
        </div>

        {steps.length === 0 ? (
          <div className="rounded-lg border border-dashed border-app bg-app/40 p-6 text-center text-xs text-faint">
            No steps yet — add one to see the preview.
          </div>
        ) : (
          steps.map((s, idx) => (
            <PreviewCard key={s.id} step={s} index={idx} total={steps.length} />
          ))
        )}
      </div>
    </section>
  );
}

function PreviewCard({
  step,
  index,
  total,
}: {
  step: OnboardingStepRow;
  index: number;
  total: number;
}) {
  return (
    <article className="rounded-xl border border-app bg-app p-4 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-muted">
        <span className="font-mono tabular-nums">
          {index + 1} / {total}
        </span>
        <KindChip kind={step.kind} />
      </div>
      <h3 className="text-sm font-semibold text-app">{step.title}</h3>
      {step.body && (
        <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-secondary">
          {step.body}
        </p>
      )}
      {step.cta_label && (
        <div className="mt-3">
          <span className="inline-flex items-center gap-1 rounded-lg bg-tool-accent px-3 py-1.5 text-[11px] font-medium text-white">
            {step.cta_label}
            {step.cta_href && (
              <span className="font-mono text-[10px] opacity-70">
                → {step.cta_href}
              </span>
            )}
          </span>
        </div>
      )}
      {step.config && Object.keys(step.config).length > 0 && (
        <details className="mt-3 text-[11px] text-faint">
          <summary className="cursor-pointer">Config</summary>
          <pre className="mt-1 overflow-x-auto rounded-md border border-app bg-app-elevated p-2 font-mono text-[10px] text-secondary">
            {JSON.stringify(step.config, null, 2)}
          </pre>
        </details>
      )}
    </article>
  );
}
