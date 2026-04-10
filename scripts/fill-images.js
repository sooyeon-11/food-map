const fs = require('fs');
const path = require('path');
const https = require('https');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const storesPath = path.join(__dirname, '..', 'data', 'stores.json');
  const stores = JSON.parse(fs.readFileSync(storesPath, 'utf8'));
  const noImg = stores.filter(s => !s.images || s.images.length === 0);
  console.log(`이미지 없는 매장: ${noImg.length}개`);

  let fixed = 0;
  for (let i = 0; i < noImg.length; i++) {
    const s = noImg[i];
    if (i % 10 === 0) console.log(`  ${i}/${noImg.length}...`);
    try {
      const options = new URL(`https://map.naver.com/p/api/place/summary/${s.id}`);
      const data = await new Promise((resolve) => {
        https.get({ hostname: options.hostname, path: options.pathname, headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://map.naver.com/', 'Accept': 'application/json',
        }}, (res) => {
          let d = ''; res.on('data', c => d += c);
          res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
        }).on('error', () => resolve(null));
      });
      const pd = data?.data?.placeDetail;
      const images = pd?.images?.images?.map(img => img.origin) || [];
      if (images.length > 0) { s.images = images.slice(0, 15); s.thumbnail = images[0]; fixed++; }
      if (!s.phone && pd?.tel) s.phone = pd.tel;
      if (!s.hours && pd?.businessHours?.description) s.hours = pd.businessHours.description;
    } catch {}
    await sleep(800);
  }
  console.log(`이미지 추가: ${fixed}개`);
  console.log(`최종: ${stores.filter(s => s.images?.length > 0).length}/${stores.length}`);
  fs.writeFileSync(storesPath, JSON.stringify(stores, null, 2), 'utf8');
}

main().catch(console.error);
