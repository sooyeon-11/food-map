const fs = require('fs');
const path = require('path');
const https = require('https');

function fetchHtml(url) {
  return new Promise((resolve) => {
    const options = new URL(url);
    https.get({ hostname: options.hostname, path: options.pathname, headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
      'Accept': 'text/html', 'Accept-Language': 'ko-KR,ko;q=0.9',
    }}, (res) => {
      if (res.statusCode >= 300 && res.headers.location) { fetchHtml(res.headers.location).then(resolve); return; }
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(d));
    }).on('error', () => resolve(''));
  });
}

function extractApollo(html) {
  const m = 'window.__APOLLO_STATE__ = ';
  const s = html.indexOf(m);
  if (s === -1) return null;
  const js = s + m.length;
  let depth = 0, inStr = false, esc = false;
  for (let i = js; i < html.length; i++) {
    const c = html[i];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return html.substring(js, i + 1); }
  }
  return null;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const storesPath = path.join(__dirname, '..', 'data', 'stores.json');
  const stores = JSON.parse(fs.readFileSync(storesPath, 'utf8'));
  const noMenu = stores.filter(s => !s.menus || s.menus.length === 0);
  console.log(`메뉴 없는 매장: ${noMenu.length}개 / 총 ${stores.length}개`);

  let fixed = 0;
  for (let i = 0; i < noMenu.length; i++) {
    const s = noMenu[i];
    if (i % 10 === 0) console.log(`  ${i}/${noMenu.length}...`);

    try {
      const html = await fetchHtml(`https://m.place.naver.com/place/${s.id}`);
      const j = extractApollo(html);
      if (j) {
        const state = JSON.parse(j);
        const menus = [];
        for (const key in state) {
          if (key.startsWith(`Menu:${s.id}_`)) {
            const m = state[key];
            if (m?.name) menus.push({ name: m.name, price: m.price || '', image: m.images?.[0] || '' });
          }
        }
        if (menus.length > 0) {
          s.menus = menus.slice(0, 15);
          fixed++;
        }
      }
    } catch {}
    await sleep(400);
  }

  console.log(`\n메뉴 추가: ${fixed}개`);
  console.log(`최종 메뉴 있는 매장: ${stores.filter(s => s.menus?.length > 0).length}/${stores.length}`);

  fs.writeFileSync(storesPath, JSON.stringify(stores, null, 2), 'utf8');
  console.log('stores.json 업데이트 완료');
}

main().catch(console.error);
