export default async function run(page, ui) {
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // Measure the actual vertical gap between navbar bottom and category bar top
  const layout = await page.evaluate(() => {
    const header = document.querySelector('header');
    const stickyBar = document.querySelector('.sticky');
    if (!header || !stickyBar) return { header: !!header, bar: !!stickyBar };
    const h = header.getBoundingClientRect();
    const b = stickyBar.getBoundingClientRect();
    return { headerBottom: h.bottom, barTop: b.top, gap: b.top - h.bottom };
  });

  const pills = await page.evaluate(() => document.querySelectorAll('.sticky button').length);

  return { layout, pills, errors: errors.slice(0, 5) };
}
