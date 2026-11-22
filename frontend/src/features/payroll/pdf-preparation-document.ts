/**
 * Minimal, text-free preparation screen for payroll print windows.
 * The document uses inline styles because it opens outside the application shell.
 */
export function buildPdfPreparationDocument(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>HRMS · Payroll</title>
  <style>
    * { box-sizing: border-box; }
    html, body { width: 100%; min-height: 100%; margin: 0; }
    body {
      min-height: 100vh;
      display: grid;
      place-items: center;
      overflow: hidden;
      background:
        radial-gradient(circle at 50% 44%, rgba(73, 145, 224, .14), transparent 34%),
        linear-gradient(145deg, #f7faff 0%, #edf3fa 52%, #eaf1f9 100%);
      font-family: Arial, Helvetica, sans-serif;
    }
    .stage {
      display: grid;
      place-items: center;
      width: 100%;
      min-height: 100vh;
    }
    .loader-tile {
      position: relative;
      display: grid;
      place-items: center;
      width: 112px;
      height: 112px;
      border: 1px solid rgba(47, 103, 169, .12);
      border-radius: 30px;
      background: linear-gradient(145deg, rgba(255,255,255,.98), rgba(239,246,255,.94));
      box-shadow:
        0 22px 60px rgba(28, 71, 121, .13),
        0 4px 12px rgba(28, 71, 121, .06),
        inset 0 1px 0 rgba(255,255,255,.98);
    }
    .loader-tile::before {
      position: absolute;
      inset: -13px;
      border: 1px solid rgba(55, 130, 211, .10);
      border-radius: 39px;
      content: "";
    }
    .spinner {
      position: absolute;
      inset: 17px;
      border: 3px solid rgba(44, 112, 190, .12);
      border-top-color: #216ac3;
      border-right-color: #25aaa7;
      border-radius: 50%;
      filter: drop-shadow(0 2px 5px rgba(33, 106, 195, .18));
      animation: hrms-pdf-spin 1s cubic-bezier(.55,.15,.35,.9) infinite;
    }
    .spinner::before {
      position: absolute;
      inset: 7px;
      border: 2px solid transparent;
      border-bottom-color: rgba(45, 133, 198, .7);
      border-left-color: rgba(37, 170, 167, .48);
      border-radius: 50%;
      content: "";
      animation: hrms-pdf-spin-reverse 1.45s linear infinite;
    }
    .spinner::after {
      position: absolute;
      top: 1px;
      left: 50%;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #25aaa7;
      box-shadow: 0 0 12px rgba(37, 170, 167, .65);
      content: "";
      transform: translateX(-50%);
    }
    .core {
      width: 24px;
      height: 24px;
      border: 1px solid rgba(36, 105, 183, .12);
      border-radius: 8px;
      background: linear-gradient(145deg, #2d80d6, #195aa8);
      box-shadow: 0 5px 13px rgba(31, 100, 177, .24);
      transform: rotate(45deg);
    }
    @keyframes hrms-pdf-spin { to { transform: rotate(360deg); } }
    @keyframes hrms-pdf-spin-reverse { to { transform: rotate(-360deg); } }
    @media (prefers-reduced-motion: reduce) {
      .spinner, .spinner::before { animation-duration: .01ms; animation-iteration-count: 1; }
    }
  </style>
</head>
<body>
  <main class="stage" role="status" aria-label="Preparing PDF">
    <div class="loader-tile" aria-hidden="true">
      <span class="spinner"></span>
      <span class="core"></span>
    </div>
  </main>
</body>
</html>`;
}
