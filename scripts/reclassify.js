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

// Same classify function as sync.js
function classifyCategory(naverCategory, mcid) {
  const cat = (naverCategory || '').toLowerCase();
  if (cat.includes('베이커리') || cat.includes('제과') || cat.includes('빵')) return '베이커리';
  if (cat.includes('브런치') || cat.includes('샌드위치')) return '브런치';
  if (cat.includes('술집') || cat.includes('포차') || cat.includes('이자카야') ||
      cat.includes('요리주점') || cat.includes('와인') || cat.includes('호프') ||
      cat.includes('맥주') || cat.includes('칵테일') || cat.includes('펍')) return '술집';
  if (cat.includes('일식') || cat.includes('초밥') || cat.includes('스시') ||
      cat.includes('라멘') || cat.includes('라면') || cat.includes('돈까스') ||
      cat.includes('돈가스') || cat.includes('우동') || cat.includes('일본')) return '일식';
  if (cat.includes('중식') || cat.includes('중국') || cat.includes('딤섬') ||
      cat.includes('마라')) return '중식';
  if (cat.includes('양식') || cat.includes('파스타') || cat.includes('피자') ||
      cat.includes('스테이크') || cat.includes('이탈리아') || cat.includes('프렌치') ||
      cat.includes('유럽')) return '양식';
  if (cat.includes('삼겹') || cat.includes('갈비') || cat.includes('소고기') ||
      cat.includes('한우') || cat.includes('돼지') || cat.includes('육류') ||
      cat.includes('곱창') || cat.includes('막창') || cat.includes('구이전문')) return '고기';
  if (cat.includes('해산물') || cat.includes('횟집') || cat.includes('생선회') ||
      cat.includes('조개') || cat.includes('수산') || cat.includes('회전문') ||
      cat.includes('장어')) return '해산물';
  if (cat.includes('국밥') || cat.includes('국수') || cat.includes('설렁탕') ||
      cat.includes('수육') || cat.includes('곰탕') || cat.includes('칼국수') ||
      cat.includes('해장국') || cat.includes('감자탕') || cat.includes('순두부') ||
      cat.includes('샤브샤브') || cat.includes('찌개') || cat.includes('두부요리')) return '국물';
  if (cat.includes('분식') || cat.includes('떡볶이') || cat.includes('김밥')) return '분식';
  if (cat.includes('치킨')) return '치킨';
  if (cat.includes('디저트')) return '디저트';
  if (cat.includes('카페')) return '카페';
  if (cat.includes('베트남') || cat.includes('태국') || cat.includes('동남아') ||
      cat.includes('아시아') || cat.includes('인도') || cat.includes('쌀국수')) return '아시아';
  if (cat.includes('한식') || cat.includes('한정식') || cat.includes('비빔밥') ||
      cat.includes('덮밥') || cat.includes('보쌈') || cat.includes('족발') ||
      cat.includes('백반') || cat.includes('생선구이') || cat.includes('떡갈비') ||
      cat.includes('전문점') || cat.includes('만두') || cat.includes('국수전문') ||
      cat.includes('곱창전골') || cat.includes('닭갈비') || cat.includes('찜닭') ||
      cat.includes('전골')) return '한식';
  if (mcid === 'CAFE') return '카페';
  if (mcid === 'BAR') return '술집';
  return '음식점';
}

async function main() {
  const storesPath = path.join(__dirname, '..', 'data', 'stores.json');
  const stores = JSON.parse(fs.readFileSync(storesPath, 'utf8'));

  // Step 1: Fetch naverCategory for stores without it
  const needFetch = stores.filter(s => !s.naverCategory);
  console.log(`naverCategory 없는 매장: ${needFetch.length}개 / 총 ${stores.length}개`);

  for (let i = 0; i < needFetch.length; i++) {
    const s = needFetch[i];
    if (i % 20 === 0) console.log(`  수집 중... ${i}/${needFetch.length}`);
    try {
      const html = await fetchHtml(`https://m.place.naver.com/place/${s.id}`);
      const j = extractApollo(html);
      if (j) {
        const state = JSON.parse(j);
        const base = state[`PlaceDetailBase:${s.id}`];
        if (base?.category) s.naverCategory = base.category;
      }
    } catch {}
    await sleep(300);
  }

  // Step 2: Reclassify all stores
  let changed = 0;
  stores.forEach(s => {
    const newCat = classifyCategory(s.naverCategory, s.mcid);
    if (s.category !== newCat) {
      changed++;
      s.category = newCat;
    }
  });
  console.log(`\n재분류: ${changed}개 변경`);

  // Stats
  const cats = {};
  stores.forEach(s => { cats[s.category] = (cats[s.category] || 0) + 1; });
  console.log('\n새 카테고리 분포:');
  Object.entries(cats).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  fs.writeFileSync(storesPath, JSON.stringify(stores, null, 2), 'utf8');
  console.log('\nstores.json 업데이트 완료');
}

main().catch(console.error);
