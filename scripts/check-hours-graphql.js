const https = require('https');

function fetchGraphQL(query, variables) {
  return new Promise((resolve) => {
    const data = JSON.stringify([{ operationName: 'q', variables, query }]);
    const req = https.request({
      hostname: 'api.place.naver.com',
      path: '/graphql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
        'Referer': 'https://m.place.naver.com/',
        'Content-Length': Buffer.byteLength(data),
      },
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.write(data);
    req.end();
  });
}

async function main() {
  const sid = '2008674569'; // 몽벨쉘터

  // Try various query patterns
  const queries = [
    // Pattern 1: placeDetail with businessHours
    {
      q: 'query q($input: PlaceDetailInput!) { placeDetail(input: $input) { id name businessHours(source: [tpirates, shopWindow]) { status statusDescription description bizHours { dayOfWeek startTime endTime description isToday } } } }',
      v: { input: { id: sid } }
    },
    // Pattern 2: separate businessHours query
    {
      q: 'query q($id: String!) { restaurant(id: $id) { businessHours { status description bizHours { dayOfWeek startTime endTime } } } }',
      v: { id: sid }
    },
    // Pattern 3: restaurantBase
    {
      q: 'query q($input: PlaceDetailInput!) { placeDetail(input: $input) { id businessHours { status description bizHours { type startTime endTime dayOfWeek description isToday } } } }',
      v: { input: { id: sid } }
    },
  ];

  for (let i = 0; i < queries.length; i++) {
    console.log(`\n=== Query ${i + 1} ===`);
    const result = await fetchGraphQL(queries[i].q, queries[i].v);
    console.log(JSON.stringify(result).substring(0, 500));
  }
}

main().catch(console.error);
