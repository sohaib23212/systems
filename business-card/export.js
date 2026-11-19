// تصدير ملفات المطبعة لكرت من مجلد business-card:
//   <name>-card.pdf        وجهان بمقاس القص 90 × 50 مم
//   <name>-card-bleed.pdf  وجهان مع هامش قص 3 مم (96 × 56 مم، وخط القص محدد في TrimBox)
//   <name>-front.png / <name>-back.png  صور بدقة 600 نقطة/إنش (2126 × 1181)
//
// الاستعمال (يحتاج Node):
//   npm i playwright pdf-lib && npx playwright install chromium
//   node business-card/export.js business-card/abu-khadij

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { PDFDocument } = require('pdf-lib');

const CARD = { w: 90, h: 50 }; // مم
const BLEED = 3; // مم
const DPI = 600;
const PNG_W = Math.round((CARD.w * DPI) / 25.4);
const PNG_H = Math.round((CARD.h * DPI) / 25.4);
const PT = 72 / 25.4; // نقطة PDF لكل ملّيمتر
const SIDES = ['front', 'back'];

async function open(browser, url, viewport) {
  const page = await browser.newPage(viewport ? { viewport } : {});
  await page.goto(url);
  await page.emulateMedia({ media: 'print' });
  await page.evaluate(() => document.fonts.ready);
  return page;
}

// Chromium يقرّب مقاس صفحة PDF، فنطبع على صفحة أكبر بـ 1 مم ثم نقصّها من الزاوية العليا اليسرى بالمقاس المضبوط
async function printPdf(page, file, wMm, hMm, bleedMm) {
  await page.addStyleTag({ content: `@page { size: ${wMm + 1}mm ${hMm + 1}mm; margin: 0; }` });
  const doc = await PDFDocument.load(await page.pdf({ preferCSSPageSize: true, printBackground: true }));
  const w = wMm * PT;
  const h = hMm * PT;
  const b = bleedMm * PT;
  for (const p of doc.getPages()) {
    const y = p.getHeight() - h;
    p.setMediaBox(0, y, w, h);
    p.setCropBox(0, y, w, h);
    p.setBleedBox(0, y, w, h);
    p.setTrimBox(b, y + b, w - 2 * b, h - 2 * b);
  }
  fs.writeFileSync(file, await doc.save());
  return doc.getPageCount();
}

(async () => {
  const dir = path.resolve(process.argv[2] || path.join(__dirname, 'abu-khadij'));
  const name = path.basename(dir);
  const out = path.join(dir, 'print');
  const url = 'file://' + path.join(dir, 'index.html');
  fs.mkdirSync(out, { recursive: true });

  const browser = await chromium.launch();
  try {
    const sides = await (await open(browser, url)).locator('.side').count();

    const pdf = await open(browser, url);
    const pages = await printPdf(pdf, path.join(out, `${name}-card.pdf`), CARD.w, CARD.h, 0);
    await pdf.evaluate(() => document.documentElement.classList.add('bleed'));
    const bleedPages = await printPdf(pdf, path.join(out, `${name}-card-bleed.pdf`), CARD.w + 2 * BLEED, CARD.h + 2 * BLEED, BLEED);
    if (pages !== sides || bleedPages !== sides) throw new Error(`عدد صفحات PDF غير صحيح: ${pages} و ${bleedPages} بدل ${sides}`);

    // الصور: نكبّر وحدة الكرت حتى يصير عرضه 2126 بكسل، ونصوّر كل وجه وحده
    const png = await open(browser, url, { width: PNG_W, height: PNG_H });
    await png.addStyleTag({ content: `:root { --u: ${PNG_W / CARD.w}px !important; }` });
    for (let i = 0; i < sides; i++) {
      await png.evaluate((n) => {
        document.querySelectorAll('.side').forEach((el, j) => { el.style.display = j === n ? '' : 'none'; });
      }, i);
      await png.screenshot({ path: path.join(out, `${name}-${SIDES[i] || i + 1}.png`), clip: { x: 0, y: 0, width: PNG_W, height: PNG_H } });
    }
  } finally {
    await browser.close();
  }
  console.log('تم التصدير إلى ' + out);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
