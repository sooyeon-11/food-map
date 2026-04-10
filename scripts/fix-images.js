const fs = require('fs');
const path = require('path');
const https = require('https');

function fetchJson(url) {
  return new Promise((resolve) => {
    const options = new URL(url);
    https.get({ hostname: options.hostname, path: options.pathname + options.search, headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://map.naver.com/', 'Accept': 'application/json',
    }}, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
    }).on('error', () => resolve(null));
  });
}

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

// Clean and prioritize HTTPS images
function cleanImages(images) {
  if (!images || !images.length) return [];
  // Remove fragment (#123x456) and prefer HTTPS
  const cleaned = images.map(url => {
    if (!url) return null;
    // Strip fragment
    let u = url.split('#')[0];
    // Force HTTPS for blogfiles (it does work with https despite HEAD returning empty)
    // Actually blogfiles.naver.net DOES NOT support HTTPS properly - use wsrv.nl proxy
    return u;
  }).filter(Boolean);

  // Sort: HTTPS first (pstatic.net), HTTP blogfiles last (mixed content issue)
  return cleaned.sort((a, b) => {
    const aHttps = a.startsWith('https://') ? 0 : 1;
    const bHttps = b.startsWith('https://') ? 0 : 1;
    return aHttps - bHttps;
  });
}

// Convert HTTP blogfiles to wsrv.nl proxy (works around mixed content)
function proxyIfNeeded(url) {
  if (!url) return url;
  if (url.startsWith('http://')) {
    // Use wsrv.nl image proxy which supports HTTP sources over HTTPS
    return 'https://wsrv.nl/?url=' + encodeURIComponent(url);
  }
  return url;
}

async function main() {
  const storesPath = path.join(__dirname, '..', 'data', 'stores.json');
  const stores = JSON.parse(fs.readFileSync(storesPath, 'utf8'));

  // Step 1: Clean existing images (reorder HTTPS first, proxy HTTP)
  let cleaned = 0;
  stores.forEach(s => {
    if (s.images && s.images.length > 0) {
      const cleanedImgs = cleanImages(s.images).map(proxyIfNeeded);
      if (JSON.stringify(cleanedImgs) !== JSON.stringify(s.images)) {
        s.images = cleanedImgs;
        s.thumbnail = cleanedImgs[0] || '';
        cleaned++;
      }
    }
    // Also clean menu images
    if (s.menus && s.menus.length > 0) {
      s.menus.forEach(m => {
        if (m.image) m.image = proxyIfNeeded(m.image.split('#')[0]);
      });
    }
  });
  console.log(`Cleaned: ${cleaned} stores`);

  // Step 2: Retry fetching for stores with no images (use Apollo State + Summary)
  const noImg = stores.filter(s => !s.images || s.images.length === 0);
  console.log(`이미지 없는 매장: ${noImg.length}개 - 재수집`);

  let fixed = 0;
  for (let i = 0; i < noImg.length; i++) {
    const s = noImg[i];
    if (i % 10 === 0) console.log(`  ${i}/${noImg.length}...`);

    let foundImages = [];

    // Try Apollo State first
    try {
      const html = await fetchHtml(`https://m.place.naver.com/place/${s.id}`);
      const j = extractApollo(html);
      if (j) {
        const state = JSON.parse(j);
        const stateStr = JSON.stringify(state);
        // Match both pstatic.net and blogfiles.naver.net
        const matches = stateStr.match(/https?:\/\/(?:ldb-phinf\.pstatic\.net|blogfiles\.naver\.net)\/[^"\\#]+/g);
        if (matches) {
          // Deduplicate and clean
          const unique = [...new Set(matches)];
          const menuImgs = new Set((s.menus || []).map(m => m.image).filter(Boolean));
          foundImages = cleanImages(unique).filter(u => !menuImgs.has(u));
        }
      }
    } catch {}

    // Try Summary API
    if (foundImages.length === 0) {
      try {
        const d = await fetchJson(`https://map.naver.com/p/api/place/summary/${s.id}`);
        const pd = d?.data?.placeDetail;
        if (pd?.images?.images) {
          foundImages = cleanImages(pd.images.images.map(img => img.origin));
        }
      } catch {}
    }

    if (foundImages.length > 0) {
      s.images = foundImages.slice(0, 15).map(proxyIfNeeded);
      s.thumbnail = s.images[0];
      fixed++;
    }

    await sleep(500);
  }

  console.log(`\n이미지 추가: ${fixed}개`);
  console.log(`최종: ${stores.filter(s => s.images?.length > 0).length}/${stores.length}`);

  fs.writeFileSync(storesPath, JSON.stringify(stores, null, 2), 'utf8');
  console.log('stores.json 업데이트 완료');
}

main().catch(console.error);
