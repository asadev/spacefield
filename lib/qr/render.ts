"use client";

/* QR rendering helpers that honor the user's saved QrPrefs.
 *
 * If a logo is set, we draw it in the center of the QR with a small
 * white pad. The QR's error-correction level should be 'H' for reliable
 * scanning when a logo is occluding ~20% of the modules.
 */

import QRCode from "qrcode";
import type { QrPrefs } from "./preferences";

export async function renderStyledQrPng(text: string, prefs: QrPrefs): Promise<string> {
  // Boost ECL when a logo is present to keep scannability
  const ecl = prefs.logoUrl ? "H" : prefs.ecl;
  const baseDataUrl = await QRCode.toDataURL(text, {
    errorCorrectionLevel: ecl,
    margin: prefs.margin,
    width: prefs.width,
    color: { dark: prefs.dark, light: prefs.light },
  });

  if (!prefs.logoUrl) return baseDataUrl;

  // Composite the logo onto the QR via a temporary canvas
  const qrImg = await loadImage(baseDataUrl);
  const logoImg = await loadImage(prefs.logoUrl).catch(() => null);
  if (!logoImg) return baseDataUrl;

  const canvas = document.createElement("canvas");
  canvas.width = qrImg.width;
  canvas.height = qrImg.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return baseDataUrl;

  ctx.drawImage(qrImg, 0, 0);

  const logoSize = Math.round(qrImg.width * prefs.logoScale);
  const logoX = (qrImg.width - logoSize) / 2;
  const logoY = (qrImg.height - logoSize) / 2;
  const padded = logoSize + prefs.logoPadding * 2;
  const padX = (qrImg.width - padded) / 2;
  const padY = (qrImg.height - padded) / 2;

  // White pad behind the logo so the dark modules don't bleed into it
  ctx.fillStyle = prefs.light;
  ctx.fillRect(padX, padY, padded, padded);

  ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);

  return canvas.toDataURL("image/png");
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}
