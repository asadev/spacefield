"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * MortgageWidget — embeddable, light-mode-locked, self-contained.
 *
 * Intentionally NOT the same component as app/tools/mortgage-calculator —
 * that one pulls framer-motion + canvas charts + Spacefield design tokens
 * (--tool-accent etc), all of which would either fail or look wrong inside
 * a customer iframe. This is the bare-numbers version.
 *
 * Pure client component. No analytics, no XP, no Supabase, no auth.
 * Inputs are kept simple (principal / rate / term). One result block.
 * ───────────────────────────────────────────────────────────────────── */

import { useMemo, useState } from "react";

function monthlyPayment(principal: number, annualRate: number, years: number): number {
  if (principal <= 0 || years <= 0) return 0;
  if (annualRate <= 0) return principal / (years * 12);
  const r = annualRate / 100 / 12;
  const n = years * 12;
  return (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

const fmt = (n: number, currency: string) =>
  `${currency} ${Math.round(n).toLocaleString()}`;

export default function MortgageWidget() {
  const [principal, setPrincipal] = useState("1500000");
  const [rate, setRate] = useState("4.49");
  const [years, setYears] = useState("25");
  const [currency, setCurrency] = useState("AED");

  const result = useMemo(() => {
    const p = Number(principal);
    const r = Number(rate);
    const y = Number(years);
    if (!p || p <= 0 || isNaN(r) || isNaN(y) || y <= 0) return null;
    const mp = monthlyPayment(p, r, y);
    const total = mp * y * 12;
    const interest = total - p;
    return { monthly: mp, total, interest, principal: p, rate: r, years: y };
  }, [principal, rate, years]);

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "11px",
    fontWeight: 600,
    color: "#64748b",
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    marginBottom: "6px",
  };
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    border: "1px solid #cbd5e1",
    borderRadius: "8px",
    fontSize: "14px",
    background: "#ffffff",
    color: "#0f172a",
    fontFamily: "inherit",
    boxSizing: "border-box",
  };

  return (
    <div style={{ maxWidth: "640px", margin: "0 auto" }}>
      <h1
        style={{
          margin: "0 0 4px",
          fontSize: "20px",
          fontWeight: 700,
          color: "#0f172a",
        }}
      >
        Mortgage Calculator
      </h1>
      <p style={{ margin: "0 0 20px", fontSize: "13px", color: "#64748b" }}>
        Estimate monthly payments for a fixed-rate mortgage.
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: "12px",
          marginBottom: "16px",
        }}
      >
        <div>
          <label style={labelStyle} htmlFor="mw-currency">
            Currency
          </label>
          <select
            id="mw-currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            style={inputStyle}
          >
            <option value="AED">AED</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
            <option value="SAR">SAR</option>
            <option value="INR">INR</option>
          </select>
        </div>
        <div>
          <label style={labelStyle} htmlFor="mw-principal">
            Loan Amount
          </label>
          <input
            id="mw-principal"
            type="text"
            inputMode="numeric"
            value={principal}
            onChange={(e) => setPrincipal(e.target.value.replace(/[^0-9]/g, ""))}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle} htmlFor="mw-rate">
            Interest Rate (%)
          </label>
          <input
            id="mw-rate"
            type="text"
            inputMode="decimal"
            value={rate}
            onChange={(e) => setRate(e.target.value.replace(/[^0-9.]/g, ""))}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle} htmlFor="mw-years">
            Term (years)
          </label>
          <input
            id="mw-years"
            type="text"
            inputMode="numeric"
            value={years}
            onChange={(e) => setYears(e.target.value.replace(/[^0-9]/g, ""))}
            style={inputStyle}
          />
        </div>
      </div>

      <div
        style={{
          background: "#f1f5f9",
          border: "1px solid #e2e8f0",
          borderRadius: "12px",
          padding: "20px",
        }}
      >
        <p
          style={{
            margin: "0 0 4px",
            fontSize: "11px",
            fontWeight: 600,
            color: "#475569",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Monthly Payment
        </p>
        <p
          style={{
            margin: 0,
            fontSize: "32px",
            fontWeight: 700,
            color: "#0f172a",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {result ? fmt(result.monthly, currency) : `${currency} —`}
        </p>
        {result && (
          <div
            style={{
              marginTop: "16px",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
              gap: "12px",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <div>
              <p
                style={{
                  margin: 0,
                  fontSize: "10px",
                  fontWeight: 600,
                  color: "#64748b",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                Total Paid
              </p>
              <p
                style={{
                  margin: "2px 0 0",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#0f172a",
                }}
              >
                {fmt(result.total, currency)}
              </p>
            </div>
            <div>
              <p
                style={{
                  margin: 0,
                  fontSize: "10px",
                  fontWeight: 600,
                  color: "#64748b",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                Total Interest
              </p>
              <p
                style={{
                  margin: "2px 0 0",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#0f172a",
                }}
              >
                {fmt(result.interest, currency)}
              </p>
            </div>
            <div>
              <p
                style={{
                  margin: 0,
                  fontSize: "10px",
                  fontWeight: 600,
                  color: "#64748b",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                Payments
              </p>
              <p
                style={{
                  margin: "2px 0 0",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#0f172a",
                }}
              >
                {result.years * 12}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
