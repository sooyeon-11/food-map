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

async function main() {
  const html = await fetchHtml('https://m.place.naver.com/restaurant/2008674569/home');

  // Find the business hours section - look for patterns like "매일 11:00" or "월요일"
  const dayPattern = /(매일|월요일|화요일|수요일|목요일|금요일|토요일|일요일)\s*[\d:~\- ]+/g;
  const matches = html.match(dayPattern);
  if (matches) {
    console.log('=== Day pattern matches ===');
    [...new Set(matches)].forEach(m => console.log(m.trim()));
  }

  // Try to find the hours block in Apollo State
  const apolloStart = html.indexOf('window.__APOLLO_STATE__');
  if (apolloStart >= 0) {
    // Search around the opening hours area
    const searchArea = html.substring(0, apolloStart);
    // Find all time-like patterns
    const timePattern = /(\d{2}:\d{2})\s*[-~]\s*(\d{2}:\d{2})/g;
    const times = searchArea.match(timePattern);
    if (times) {
      console.log('\n=== Time ranges found in HTML (before Apollo) ===');
      [...new Set(times)].forEach(t => console.log(t));
    }
  }

  // Also search full HTML for time ranges
  const allTimes = html.match(/(\d{2}:\d{2})\s*[-~]\s*(\d{2}:\d{2})/g);
  if (allTimes) {
    console.log('\n=== All time ranges ===');
    [...new Set(allTimes)].forEach(t => console.log(t));
  }

  // Look for structured hours data
  const hoursBlock = html.match(/"(매일|월요일|화요일|수요일|목요일|금요일|토요일|일요일)","([\d:]+)","([\d:]+)"/g);
  if (hoursBlock) {
    console.log('\n=== Structured hours ===');
    hoursBlock.forEach(h => console.log(h));
  }

  // Check for bizHours in Apollo State
  const marker = 'window.__APOLLO_STATE__ = ';
  const s = html.indexOf(marker);
  if (s >= 0) {
    const js = s + marker.length;
    let depth = 0, inStr = false, esc = false;
    let end = -1;
    for (let i = js; i < html.length; i++) {
      const c = html[i];
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    if (end > 0) {
      const state = JSON.parse(html.substring(js, end));
      // Search for any key containing "hour" or "time" or "bizH"
      Object.keys(state).forEach(k => {
        const v = state[k];
        if (typeof v === 'object' && v !== null) {
          const str = JSON.stringify(v);
          if (str.includes('11:00') || str.includes('21:00') || str.includes('영업') || str.includes('브레이크')) {
            console.log(`\n=== ${k} ===`);
            console.log(str.substring(0, 500));
          }
        }
      });
    }
  }
}

main().catch(console.error);
