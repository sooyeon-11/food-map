#!/usr/bin/env node
/**
 * 네이버 즐겨찾기 → stores.json 동기화 스크립트 (맛집 버전)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// ========== Config ==========
const FOLDERS = [
  { id: '0dabefd7a68c411a870e4c7464c2223e', name: '맛집' },
  { id: '1285dedb282d4997a9b48363de7191e7', name: '술집' },
];
const EXCLUDE_NAMES = [];
const STORES_PATH = path.join(__dirname, '..', 'data', 'stores.json');

// ========== HTTP Helpers ==========
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

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ========== Apollo State Parser ==========
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

// ========== Classification ==========
function getRegion(address) {
  const city = address.split(' ')[0];
  if (city.includes('부산')) return '부산';
  if (city.includes('울산')) return '울산';
  if (city.includes('대구')) return '대구';
  if (city.includes('경북') || city.includes('경상북도')) return '경북';
  if (city.includes('경남') || city.includes('경상남도')) return '경남';
  if (city.includes('제주')) return '제주';
  if (city.includes('서울')) return '서울';
  return city;
}

function getDistrict(address) { return address.split(' ')[1] || ''; }

function classifyCategory(naverCategory, mcid) {
  const cat = (naverCategory || '').toLowerCase();

  // 카페/베이커리/브런치 (먼저 체크)
  if (cat.includes('베이커리') || cat.includes('제과') || cat.includes('빵')) return '베이커리';
  if (cat.includes('브런치') || cat.includes('샌드위치')) return '브런치';

  // 술집
  if (cat.includes('술집') || cat.includes('포차') || cat.includes('이자카야') ||
      cat.includes('요리주점') || cat.includes('와인') || cat.includes('호프') ||
      cat.includes('맥주') || cat.includes('칵테일') || cat.includes('펍')) return '술집';

  // 일식
  if (cat.includes('일식') || cat.includes('초밥') || cat.includes('스시') ||
      cat.includes('라멘') || cat.includes('라면') || cat.includes('돈까스') ||
      cat.includes('돈가스') || cat.includes('우동') || cat.includes('일본')) return '일식';

  // 중식
  if (cat.includes('중식') || cat.includes('중국') || cat.includes('딤섬') ||
      cat.includes('마라')) return '중식';

  // 양식
  if (cat.includes('양식') || cat.includes('파스타') || cat.includes('피자') ||
      cat.includes('스테이크') || cat.includes('이탈리아') || cat.includes('프렌치') ||
      cat.includes('유럽')) return '양식';

  // 고기
  if (cat.includes('삼겹') || cat.includes('갈비') || cat.includes('소고기') ||
      cat.includes('한우') || cat.includes('돼지') || cat.includes('육류') ||
      cat.includes('곱창') || cat.includes('막창') || cat.includes('구이전문')) return '고기';

  // 해산물
  if (cat.includes('해산물') || cat.includes('횟집') || cat.includes('생선회') ||
      cat.includes('조개') || cat.includes('수산') || cat.includes('회전문') ||
      cat.includes('장어')) return '해산물';

  // 국물
  if (cat.includes('국밥') || cat.includes('국수') || cat.includes('설렁탕') ||
      cat.includes('수육') || cat.includes('곰탕') || cat.includes('칼국수') ||
      cat.includes('해장국') || cat.includes('감자탕') || cat.includes('순두부') ||
      cat.includes('샤브샤브') || cat.includes('찌개') || cat.includes('두부요리')) return '국물';

  // 분식
  if (cat.includes('분식') || cat.includes('떡볶이') || cat.includes('김밥')) return '분식';

  // 치킨
  if (cat.includes('치킨')) return '치킨';

  // 카페/디저트
  if (cat.includes('디저트')) return '디저트';
  if (cat.includes('카페')) return '카페';

  // 아시아 음식
  if (cat.includes('베트남') || cat.includes('태국') || cat.includes('동남아') ||
      cat.includes('아시아') || cat.includes('인도') || cat.includes('쌀국수')) return '아시아';

  // 한식 (기타 한국 음식)
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

// ========== Collect Store Data ==========
async function collectStoreData(sid, bookmark) {
  const b = bookmark;
  const region = getRegion(b.address);
  const district = getDistrict(b.address);

  const detail = await fetchJson(`https://map.naver.com/p/api/place/summary/${sid}`);
  const pd = detail?.data?.placeDetail;
  const summaryImages = pd?.images?.images?.map(img => img.origin) || [];

  let menus = [], instagramUrl = '', apolloImages = [], microReview = '', conveniences = [];
  let roadGuide = '', virtualPhone = '', nearestSubway = null, seatInfo = [], naverCategory = '';
  let blogReviews = [], reviewTotal = 0, imageReviewCount = 0, reviewThemes = [];
  let blogUrl = '', homepageUrl = '';

  try {
    const html = await fetchHtml(`https://m.place.naver.com/place/${sid}`);
    const j = extractApollo(html);
    if (j) {
      const state = JSON.parse(j);
      const base = state[`PlaceDetailBase:${sid}`];

      if (base) {
        naverCategory = base.category || '';
        if (base.microReviews?.[0]) microReview = base.microReviews[0];
        if (base.conveniences) conveniences = base.conveniences;
        if (base.road) roadGuide = base.road;
        if (base.virtualPhone) virtualPhone = base.virtualPhone;
        if (base.visitorReviewsTotal) reviewTotal = base.visitorReviewsTotal;

        if (base.homepages?.repr?.url?.includes('instagram.com')) instagramUrl = base.homepages.repr.url;
        const extras = [...(base.homepages?.etc || []), ...(base.homepages?.subLinks || [])];
        extras.forEach(link => {
          if (link?.url?.includes('instagram.com') && !instagramUrl) instagramUrl = link.url;
          if (link?.url?.includes('blog.naver.com') && !blogUrl) blogUrl = link.url;
          if (link?.url && !link.url.includes('instagram.com') && !link.url.includes('blog.naver.com') && !homepageUrl) homepageUrl = link.url;
        });
        if (!instagramUrl) {
          const match = JSON.stringify(state).match(/https?:\/\/(?:www\.)?instagram\.com\/[a-zA-Z0-9_.]+/);
          if (match) instagramUrl = match[0];
        }
      }

      for (const key in state) {
        if (key.startsWith(`Menu:${sid}_`)) {
          const m = state[key];
          if (m?.name) menus.push({ name: m.name, price: m.price || '', image: m.images?.[0] || '' });
        }
      }

      const stateStr = JSON.stringify(state);
      // Match both pstatic.net (HTTPS) and blogfiles.naver.net (HTTP) images
      const imgMatches = stateStr.match(/https?:\/\/(?:ldb-phinf\.pstatic\.net|blogfiles\.naver\.net)\/[^"\\#]+/g);
      if (imgMatches) {
        const menuImgs = new Set(menus.map(m => m.image).filter(Boolean));
        apolloImages = [...new Set(imgMatches)].filter(u => !menuImgs.has(u));
      }

      for (const key in state) {
        if (key.startsWith('SubwayStationInfo:')) {
          const s = state[key];
          nearestSubway = { name: s.displayName || s.name, exit: s.nearestExit, walkTime: s.walkTime };
          break;
        }
      }
      for (const key in state) {
        if (key.startsWith('RestaurantSeatItems:')) {
          seatInfo.push({ name: state[key].name, description: state[key].description || '' });
        }
      }
      for (const key in state) {
        if (key.startsWith('FsasReview:')) {
          const r = state[key];
          if (r?.title && r?.url) blogReviews.push({ title: r.title.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&'), url: r.url, name: r.name });
        }
      }

      const statsKey = `VisitorReviewStatsResult:${sid}`;
      if (state[statsKey]?.review) {
        reviewTotal = state[statsKey].review.totalCount || 0;
        imageReviewCount = state[statsKey].review.imageReviewCount || 0;
      }
      if (state[statsKey]?.analysis?.themes) {
        reviewThemes = state[statsKey].analysis.themes.filter(t => t?.label).map(t => t.label).slice(0, 5);
      }
    }
  } catch {}

  // Visitor reviews
  let visitorReviews = [];
  try {
    const html = await fetchHtml(`https://m.place.naver.com/restaurant/${sid}/review/visitor`);
    const j = extractApollo(html);
    if (j) {
      const state = JSON.parse(j);
      const authors = {};
      Object.keys(state).filter(k => k.startsWith('VisitorReviewAuthor:')).forEach(k => {
        authors[k] = { nickname: state[k].nickname };
      });
      Object.keys(state).filter(k => k.startsWith('VisitorReview:') && !k.includes('Stats')).forEach(k => {
        const r = state[k];
        if (!r?.body) return;
        const images = (r.media || []).map(m => m?.thumbnail || m?.url).filter(Boolean).slice(0, 3);
        const author = r.author?.__ref ? authors[r.author.__ref] : null;
        visitorReviews.push({ body: r.body.substring(0, 200), images, author: author?.nickname || '' });
      });
    }
  } catch {}

  const allImages = [...summaryImages, ...apolloImages];
  // Clean: strip fragment, sort HTTPS first, proxy HTTP via wsrv.nl
  const cleaned = [...new Set(allImages)]
    .map(u => u ? u.split('#')[0] : null)
    .filter(Boolean)
    .sort((a, b) => (a.startsWith('https://') ? 0 : 1) - (b.startsWith('https://') ? 0 : 1))
    .map(u => u.startsWith('http://') ? 'https://wsrv.nl/?url=' + encodeURIComponent(u) : u);
  const uniqueImages = cleaned.slice(0, 15);

  return {
    id: sid, name: b.name, address: b.address,
    roadAddress: pd?.address?.roadAddress || b.address,
    region, district, subRegion: district,
    lat: b.py, lng: b.px,
    category: classifyCategory(naverCategory, b.mcid), mcid: b.mcid, naverCategory,
    phone: pd?.tel || '', virtualPhone,
    hours: pd?.businessHours?.description || '',
    images: uniqueImages, thumbnail: uniqueImages[0] || '',
    reviews: pd?.visitorReviews?.displayText || '',
    naverPlaceUrl: `https://m.place.naver.com/place/${sid}`,
    instagramUrl, blogUrl, homepageUrl,
    menus: menus.slice(0, 10), microReview, conveniences, roadGuide,
    nearestSubway, seatInfo, blogReviews: blogReviews.slice(0, 3),
    reviewTotal, imageReviewCount, reviewThemes,
    visitorReviews: visitorReviews.slice(0, 5),
    folderName: b.folderName || '',
  };
}

// ========== Main ==========
async function main() {
  console.log('=== 맛집 동기화 시작 ===');

  let existing = [];
  try { existing = JSON.parse(fs.readFileSync(STORES_PATH, 'utf8')); } catch {}
  const existingMap = new Map(existing.map(s => [s.id, s]));
  console.log(`기존 매장: ${existing.length}개`);

  let allBookmarks = [];
  let fetchFailed = false;
  for (const folder of FOLDERS) {
    const data = await fetchJson(`https://pages.map.naver.com/save-pages/api/maps-bookmark/v3/shares/${folder.id}/bookmarks?start=0&limit=5000&placeInfo=false`);
    if (data?.bookmarkList) {
      console.log(`${folder.name || '맛집'}: ${data.bookmarkList.length}개`);
      allBookmarks.push(...data.bookmarkList.map(b => ({ ...b, folderName: folder.name })));
    } else {
      console.error(`⚠ 폴더 ${folder.name || folder.id} 로드 실패!`);
      fetchFailed = true;
    }
  }

  // Safety check: abort if data would be lost
  if (fetchFailed || (existing.length > 0 && allBookmarks.length < existing.length * 0.8)) {
    console.error(`❌ 북마크 로드 실패 또는 데이터 급감 (기존 ${existing.length} → 신규 ${allBookmarks.length}). 중단합니다.`);
    process.exit(1);
  }

  const seen = new Set();
  allBookmarks = allBookmarks.filter(b => {
    if (seen.has(b.sid)) return false;
    if (EXCLUDE_NAMES.includes(b.name)) return false;
    seen.add(b.sid);
    return true;
  });
  console.log(`총 북마크: ${allBookmarks.length}개`);

  const newBookmarks = allBookmarks.filter(b => !existingMap.has(b.sid));
  console.log(`새 매장: ${newBookmarks.length}개`);

  const currentIds = new Set(allBookmarks.map(b => b.sid));
  const removed = existing.filter(s => !currentIds.has(s.id));
  if (removed.length > 0) console.log(`삭제된 매장: ${removed.length}개`);

  const newStores = [];
  for (let i = 0; i < newBookmarks.length; i++) {
    const b = newBookmarks[i];
    console.log(`  [${i + 1}/${newBookmarks.length}] ${b.name} 수집 중...`);
    const store = await collectStoreData(b.sid, b);
    newStores.push(store);
    await sleep(800);
  }

  // Update hours for existing stores
  const kept = existing.filter(s => currentIds.has(s.id));
  console.log(`기존 매장 영업시간 갱신 중... (${kept.length}개)`);
  for (let i = 0; i < kept.length; i++) {
    if (i % 50 === 0 && i > 0) console.log(`  ${i}/${kept.length}...`);
    try {
      const d = await fetchJson(`https://map.naver.com/p/api/place/summary/${kept[i].id}`);
      const pd = d?.data?.placeDetail;
      if (pd?.businessHours?.description) kept[i].hours = pd.businessHours.description;
    } catch {}
    await sleep(300);
  }

  const finalStores = [
    ...kept,
    ...newStores,
  ];

  fs.writeFileSync(STORES_PATH, JSON.stringify(finalStores, null, 2), 'utf8');
  console.log(`\n=== 완료 ===`);
  console.log(`최종: ${finalStores.length}개 (추가: ${newStores.length}, 삭제: ${removed.length})`);
}

main().catch(console.error);
