"use client";

/* ─────────────────────────────────────────────────────────────────────────
 * RoiWidget — embeddable, light-mode-locked, self-contained.
 *
 * Simple return-on-investment estimator. Inputs: initial investment,
 * final value, holding period in years. Outputs: total return %, net
 * profit, annualised return (CAGR).
 *
 * Same constraints as MortgageWidget — no framer-motion, no Spacefield
 * design tokens, no external state. Just numbers in / numbers out.
 * ───────────────────────────────────────────────────────────────────── */

import { useMemo, useState } from "react";

function cagr(initial: number, final: number, years: number): number {
  if (initial <= 0 || years <= 0 || final <= 0) return 0;
  return (Math.pow(final / initial, 1 / years) - 1) * 100;
}

const fmtMoney = (n: number, currency: string) =>
  `${currency} ${Math.round(n).toLocaleString()}`;
const fmtPct = (n: number) => `${n.toFixed(2)}%`;

export default function RoiWidget() {
  const [initial, setInitial] = useState("100000");
  const [finalValue, setFinalValue] = useState("150000");
  const [years, setYears] = useState("3");
  const [currency, setCurrency] = useState("AED");

  const result = useMemo(() => {
    const i = Number(initial);
    const f = Number(finalValue);
    const y = Number(years);
    if (!i || i <= 0 || isNaN(f) || isNaN(y) || y <= 0) return null;
    const profit = f - i;
    const totalReturn = (profit / i) * 100;
    const annualised = cagr(i, f, y);
    return { profit, totalReturn, annualised };
  }, [initial, finalValue, years]);

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

  const positive = result ? result.profit >= 0 : true;
  const accent = positive ? "#059669" : "#dc2626";
  const accentSoft = positive ? "#ecfdf5" : "#fef2f2";

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
        ROI Calculator
      </h1>
      <p style={{ margin: "0 0 20px", fontSize: "13px", color: "#64748b" }}>
        Compute total return, profit, and annualised growth (CAGR).
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
          <label style={labelStyle} htmlFor="rw-currency">
            Currency
          </label>
          <select
            id="rw-currency"
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
          <label style={labelStyle} htmlFor="rw-initial">
            Initial Investment
          </label>
          <input
            id="rw-initial"
            type="text"
            inputMode="numeric"
            value={initial}
            onChange={(e) => setInitial(e.target.value.replace(/[^0-9]/g, ""))}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle} htmlFor="rw-final">
            Final Value
          </label>
          <input
            id="rw-final"
            type="text"
            inputMode="numeric"
            value={finalValue}
            onChange={(e) => setFinalValue(e.target.value.replace(/[^0-9]/g, ""))}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle} htmlFor="rw-years">
            Holding Period (years)
          </label>
          <input
            id="rw-years"
            type="text"
            inputMode="decimal"
            value={years}
            onChange={(e) => setYears(e.target.value.replace(/[^0-9.]/g, ""))}
            style={inputStyle}
          />
        </div>
      </div>

      <div
        style={{
          background: accentSoft,
          border: `1px solid ${accent}33`,
          borderRadius: "12px",
          padding: "20px",
        }}
      >
        <p
          style={{
            margin: "0 0 4px",
            fontSize: "11px",
            fontWeight: 600,
            color: accent,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Total Return
        </p>
        <p
          style={{
            margin: 0,
            fontSize: "32px",
            fontWeight: 700,
            color: accent,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {result ? fmtPct(result.totalReturn) : "—"}
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
                Net Profit
              </p>
              <p
                style={{
                  margin: "2px 0 0",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#0f172a",
                }}
              >
                {fmtMoney(result.profit, currency)}
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
                Annualised (CAGR)
              </p>
              <p
                style={{
                  margin: "2px 0 0",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "#0f172a",
                }}
              >
                {fmtPct(result.annualised)}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
