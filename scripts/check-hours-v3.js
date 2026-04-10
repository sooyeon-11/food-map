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
  // Test with 민정한우수육국밥 which has hours
  const sid = '1552565498';

  const result = await fetchGraphQL(
    'query q($input: PlaceDetailInput!) { placeDetail(input: $input) { base { businessHours { description } } businessHours { description } } }',
    { input: { id: sid } }
  );
  console.log('Result:', JSON.stringify(result, null, 2));
}

main().catch(console.error);
