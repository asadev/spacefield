"use client";

/* Products panel (EPIC-18) — lightweight catalog feeding the in-inbox product
 * picker. Lazy-loaded. Add products manually or import from CRM inventory; the
 * picker (in the chat composer) sends image + caption + price into a thread.
 * NOT a native WA catalog/cart.
 *
 * Mobile-first; responsive CSS only.
 */

import { useCallback, useEffect, useState } from "react";
import {
  createProduct,
  deleteProduct,
  fetchProducts,
  updateProduct,
  type WaProduct,
} from "./api";
import {
  EmptyState,
  ErrorBlock,
  MiniIcon,
  Pill,
  PrimaryButton,
  SecondaryButton,
  formatRelative,
} from "./ui";

interface Props {
  workspaceId: string;
  compact: boolean;
}

export default function ProductsPanel({ workspaceId, compact }: Props) {
  const [items, setItems] = useState<WaProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<WaProduct | "new" | null>(null);
  const [search, setSearch] = useState("");

  const refresh = useCallback(async () => {
    const res = await fetchProducts(workspaceId, search.trim() || undefined);
    setLoading(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    setItems(res.data);
  }, [workspaceId, search]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="flex h-full flex-col bg-app">
      <header className="flex shrink-0 items-center gap-2 border-b border-app bg-app-elevated px-3 py-2">
        <label className="flex flex-1 items-center gap-2 rounded-md border border-app bg-surface px-2 py-1.5">
          <MiniIcon name="search" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products"
            className="w-full bg-transparent text-sm text-app outline-none placeholder:text-faint"
          />
        </label>
        <PrimaryButton onClick={() => setEditing("new")}>
          <MiniIcon name="plus" /> Add
        </PrimaryButton>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-xs text-faint">loading…</div>
        ) : error ? (
          <div className="p-3">
            <ErrorBlock body={error} onRetry={refresh} />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            kicker="whatsapp.products"
            compact={compact}
            title="No products yet"
            body={
              <span>
                Add products (or import from your CRM inventory). Tap a product in
                a chat to send its photo, price, and order link in one go.
              </span>
            }
          />
        ) : (
          <ul role="list" className="divide-y divide-app">
            {items.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.media_url ? (
                  <img
                    src={p.media_url}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-md border border-app object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-app bg-surface text-faint">
                    <MiniIcon name="image" size={18} />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setEditing(p)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-app">
                      {p.name}
                    </span>
                    {!p.active ? <Pill tone="neutral">hidden</Pill> : null}
                    {p.source === "inventory" ? <Pill tone="info">inventory</Pill> : null}
                  </div>
                  <div className="truncate text-xs text-secondary">
                    {p.price != null && p.price !== ""
                      ? `${p.currency} ${p.price}`
                      : "no price"}
                    {p.sku ? ` · ${p.sku}` : ""} · {formatRelative(p.created_at)}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirm(`Delete "${p.name}"?`)) return;
                    const res = await deleteProduct(workspaceId, p.id);
                    if (res.ok) void refresh();
                  }}
                  className="shrink-0 rounded-md p-1 text-rose-500 hover:bg-rose-500/10"
                  aria-label="Delete product"
                >
                  <MiniIcon name="trash" size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {editing ? (
        <ProductEditor
          workspaceId={workspaceId}
          product={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function ProductEditor({
  workspaceId,
  product,
  onClose,
  onSaved,
}: {
  workspaceId: string;
  product: WaProduct | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(product?.name ?? "");
  const [price, setPrice] = useState(product?.price != null ? String(product.price) : "");
  const [currency, setCurrency] = useState(product?.currency ?? "PKR");
  const [sku, setSku] = useState(product?.sku ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [mediaUrl, setMediaUrl] = useState(product?.media_url ?? "");
  const [orderLink, setOrderLink] = useState(product?.order_link ?? "");
  const [active, setActive] = useState(product?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(async () => {
    setError(null);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setBusy(true);
    const body = {
      name: name.trim(),
      price: price.trim() === "" ? null : price.trim(),
      currency: currency.trim() || "PKR",
      sku: sku.trim() || null,
      description: description.trim() || null,
      media_url: mediaUrl.trim() || null,
      order_link: orderLink.trim() || null,
      active,
    };
    const res = product
      ? await updateProduct(workspaceId, product.id, body)
      : await createProduct(workspaceId, body);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onSaved();
  }, [workspaceId, product, name, price, currency, sku, description, mediaUrl, orderLink, active, onSaved]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-app bg-app-elevated shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 border-b border-app px-4 py-3">
          <h3 className="text-base font-semibold text-app">
            {product ? "Edit product" : "Add product"}
          </h3>
        </header>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-app bg-surface px-2 py-1.5 text-sm text-app outline-none focus:border-tool-accent"
            />
          </Field>
          <div className="flex gap-2">
            <Field label="Price" className="flex-1">
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                inputMode="decimal"
                className="w-full rounded-md border border-app bg-surface px-2 py-1.5 text-sm text-app outline-none focus:border-tool-accent"
              />
            </Field>
            <Field label="Currency" className="w-24">
              <input
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full rounded-md border border-app bg-surface px-2 py-1.5 text-sm text-app outline-none focus:border-tool-accent"
              />
            </Field>
          </div>
          <Field label="SKU (optional)">
            <input
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              className="w-full rounded-md border border-app bg-surface px-2 py-1.5 text-sm text-app outline-none focus:border-tool-accent"
            />
          </Field>
          <Field label="Description (optional)">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full resize-y rounded-md border border-app bg-surface px-2 py-1.5 text-sm text-app outline-none focus:border-tool-accent"
            />
          </Field>
          <Field label="Image URL (optional)">
            <input
              value={mediaUrl}
              onChange={(e) => setMediaUrl(e.target.value)}
              placeholder="https://…"
              className="w-full rounded-md border border-app bg-surface px-2 py-1.5 text-sm text-app outline-none focus:border-tool-accent"
            />
          </Field>
          <Field label="Order link (optional)">
            <input
              value={orderLink}
              onChange={(e) => setOrderLink(e.target.value)}
              placeholder="https://wa.me/… or checkout URL"
              className="w-full rounded-md border border-app bg-surface px-2 py-1.5 text-sm text-app outline-none focus:border-tool-accent"
            />
          </Field>
          <label className="flex items-center gap-2 text-xs text-secondary">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            Active (show in the product picker)
          </label>
          {error ? <ErrorBlock body={error} /> : null}
        </div>
        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-app px-4 py-3">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={save} loading={busy}>
            {product ? "Save" : "Add product"}
          </PrimaryButton>
        </footer>
      </div>
    </div>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="font-mono text-[0.6rem] uppercase tracking-[0.16em] text-faint">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
