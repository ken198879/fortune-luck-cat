// 使い方: node tools/svg2png.js assets/generated/foo.svg [出力.png]
// Claudeが書いたSVGをPNG化します(Playwright使用・無料)。
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const src = process.argv[2];
  if (!src) { console.error('usage: node tools/svg2png.js <in.svg> [out.png]'); process.exit(1); }
  const out = process.argv[3] || src.replace(/\.svg$/i, '.png');
  const svg = fs.readFileSync(src, 'utf8');
  const m = svg.match(/viewBox="[\d.\s-]*?([\d.]+)\s+([\d.]+)"/);
  const w = Math.round(+m[1]), h = Math.round(+m[2]);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.setContent(`<body style="margin:0">${svg}</body>`);
  await p.screenshot({ path: out, omitBackground: false });
  await b.close();
  console.log('wrote', path.resolve(out), `${w}x${h}`);
})();
