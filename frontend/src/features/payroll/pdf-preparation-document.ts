export type PdfPreparationKind = "attendance" | "payslip";
export type PdfPreparationTheme = "light" | "dark";

/**
 * Full-page loader used in a same-origin print window while report data is
 * being prepared. The caller passes the active workspace theme so the popup
 * matches the HRMS shell before its final document replaces this screen.
 */
export function buildPdfPreparationDocument(
  kind: PdfPreparationKind,
  theme: PdfPreparationTheme = "light",
): string {
  const label = kind === "attendance"
    ? "Generating attendance report(s)"
    : "Generating payslip(s)";
  const safeTheme = theme === "dark" ? "dark" : "light";
  return `<!doctype html>
<html lang="en" data-theme="${safeTheme}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="${safeTheme}">
  <title>HRMS · Report preparation</title>
  <style>
    * { box-sizing: border-box; }
    :root {
      color-scheme: light;
      --bg: #f5f7fa;
      --surface: #ffffff;
      --surface-muted: #f8fafc;
      --text-strong: #101c2d;
      --muted: #64748b;
      --border: #e3e9f0;
      --accent: #2563eb;
      --accent-strong: #1d4ed8;
      --teal: #0d9488;
      --glow: rgba(37, 99, 235, .15);
      --shadow: 0 24px 70px rgba(15, 23, 42, .10);
    }
    :root[data-theme="dark"] {
      color-scheme: dark;
      --bg: #0c1421;
      --surface: #111d2c;
      --surface-muted: #152234;
      --text-strong: #f5f8fc;
      --muted: #a7b5c7;
      --border: #26374b;
      --accent: #7da9ff;
      --accent-strong: #a6c2ff;
      --teal: #2dd4bf;
      --glow: rgba(89, 143, 255, .19);
      --shadow: 0 24px 70px rgba(0, 0, 0, .28);
    }
    html, body { width: 100%; min-height: 100%; margin: 0; }
    body {
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
      overflow: hidden;
      color: var(--text-strong);
      background:
        radial-gradient(ellipse at 50% 38%, var(--glow), transparent 40%),
        radial-gradient(ellipse at 12% 90%, color-mix(in srgb, var(--teal) 8%, transparent), transparent 42%),
        var(--bg);
      font-family: Inter, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .preparation-scene {
      position: relative;
      display: grid;
      justify-items: center;
      width: min(100%, 350px);
      padding: 34px 28px 30px;
      border: 1px solid var(--border);
      border-radius: 25px;
      background: linear-gradient(155deg, var(--surface), var(--surface-muted));
      box-shadow: var(--shadow), inset 0 1px 0 rgba(255,255,255,.12);
      isolation: isolate;
    }
    .preparation-scene::before {
      position: absolute;
      z-index: -1;
      inset: 9px;
      border: 1px solid color-mix(in srgb, var(--accent) 8%, transparent);
      border-radius: 18px;
      content: "";
      pointer-events: none;
    }
    .spinner-stage {
      position: relative;
      display: grid;
      place-items: center;
      width: 116px;
      height: 116px;
      margin: 0 auto 20px;
      filter: drop-shadow(0 10px 18px var(--glow));
    }
    .spinner-orbit {
      position: absolute;
      inset: 3px;
      border: 3px solid var(--border);
      border-top-color: var(--accent);
      border-right-color: var(--teal);
      border-radius: 50%;
      animation: hrms-orbit-spin 1.1s cubic-bezier(.55,.15,.35,.9) infinite;
    }
    .spinner-orbit::before {
      position: absolute;
      top: 8px;
      left: 50%;
      width: 9px;
      height: 9px;
      border: 2px solid var(--surface);
      border-radius: 50%;
      background: var(--teal);
      box-shadow: 0 0 15px color-mix(in srgb, var(--teal) 55%, transparent);
      content: "";
      transform: translateX(-50%);
    }
    .spinner-orbit::after {
      position: absolute;
      right: 8px;
      bottom: 11px;
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: var(--accent);
      content: "";
      opacity: .8;
    }
    .spinner-inner {
      position: absolute;
      inset: 16px;
      border: 2px solid color-mix(in srgb, var(--accent) 12%, var(--border));
      border-bottom-color: var(--accent-strong);
      border-left-color: var(--teal);
      border-radius: 50%;
      animation: hrms-orbit-reverse 1.65s linear infinite;
    }
    .spinner-core {
      display: grid;
      place-items: center;
      width: 48px;
      height: 48px;
      border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--border));
      border-radius: 15px;
      color: #fff;
      background: linear-gradient(145deg, var(--accent), #2457ad 72%, var(--teal));
      box-shadow:
        0 7px 18px color-mix(in srgb, var(--accent) 28%, transparent),
        inset 0 1px 0 rgba(255,255,255,.35);
      font-size: 12px;
      font-weight: 850;
      letter-spacing: -.04em;
      transform: rotate(45deg);
    }
    .spinner-core::first-letter { transform: rotate(-45deg); }
    .spinner-core { text-shadow: 0 1px 2px rgba(0,0,0,.22); }
    .caption {
      margin: 0;
      color: var(--text-strong);
      font-size: 14px;
      font-weight: 720;
      letter-spacing: -.015em;
      line-height: 1.45;
      text-align: center;
    }
    @keyframes hrms-orbit-spin { to { transform: rotate(360deg); } }
    @keyframes hrms-orbit-reverse { to { transform: rotate(-360deg); } }
    @media (prefers-reduced-motion: reduce) {
      .spinner-orbit, .spinner-inner {
        animation-duration: .01ms;
        animation-iteration-count: 1;
      }
    }
  </style>
</head>
<body>
  <main class="preparation-scene" role="status" aria-label="${label}">
    <div class="spinner-stage" aria-hidden="true">
      <span class="spinner-orbit"></span>
      <span class="spinner-inner"></span>
      <span class="spinner-core">HR</span>
    </div>
    <p class="caption">${label}</p>
  </main>
</body>
</html>`;
}
