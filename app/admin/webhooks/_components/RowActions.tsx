import {
  deleteEndpoint,
  rotateSecret,
  setEndpointEnabled,
  testEndpoint,
} from "../_actions";

const ACTION_BTN =
  "inline-flex items-center rounded-md border border-app bg-app px-2 py-1 text-[11px] text-secondary transition-colors hover:border-tool-accent hover:text-app disabled:opacity-40";
const PRIMARY_BTN =
  "inline-flex items-center rounded-md bg-tool-accent px-2 py-1 text-[11px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50";
const DANGER_BTN =
  "inline-flex items-center rounded-md border border-app bg-app px-2 py-1 text-[11px] text-rose-500 transition-colors hover:border-rose-500 disabled:opacity-40";

/* Wrappers that adapt our `Promise<ActionResult>` server actions to
 * Next's `<form action>` constraint of `Promise<void>`. Same pattern
 * /admin/domains uses. */

async function toggleEnabledVoid(formData: FormData): Promise<void> {
  "use server";
  await setEndpointEnabled(formData);
}

async function testVoid(formData: FormData): Promise<void> {
  "use server";
  await testEndpoint(formData);
}

async function rotateVoid(formData: FormData): Promise<void> {
  "use server";
  await rotateSecret(formData);
}

async function deleteVoid(formData: FormData): Promise<void> {
  "use server";
  await deleteEndpoint(formData);
}

export function EnabledToggle({
  id,
  enabled,
}: {
  id: string;
  enabled: boolean;
}) {
  return (
    <form action={toggleEnabledVoid}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="enabled" value={enabled ? "off" : "on"} />
      <button type="submit" className={ACTION_BTN}>
        {enabled ? "Disable" : "Enable"}
      </button>
    </form>
  );
}

export function TestSendButton({
  id,
  variant = "ghost",
}: {
  id: string;
  variant?: "primary" | "ghost";
}) {
  return (
    <form action={testVoid}>
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className={variant === "primary" ? PRIMARY_BTN : ACTION_BTN}
      >
        Test send
      </button>
    </form>
  );
}

export function RotateSecretButton({ id }: { id: string }) {
  return (
    <form action={rotateVoid}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" className={ACTION_BTN}>
        Rotate
      </button>
    </form>
  );
}

export function DeleteButton({ id }: { id: string }) {
  return (
    <form action={deleteVoid}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" className={DANGER_BTN}>
        Delete
      </button>
    </form>
  );
}

export function RowActions({
  id,
  enabled,
  variant = "compact",
}: {
  id: string;
  enabled: boolean;
  variant?: "compact" | "stacked";
}) {
  const wrap =
    variant === "stacked"
      ? "flex flex-wrap items-center gap-2"
      : "flex flex-wrap items-center justify-end gap-1.5";
  return (
    <div className={wrap}>
      <EnabledToggle id={id} enabled={enabled} />
      <TestSendButton id={id} />
      <DeleteButton id={id} />
    </div>
  );
}
