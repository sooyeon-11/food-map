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
  const sid = '2008674569';

  // Try placeDetail -> base -> businessHours with just description
  const queries = [
    {
      name: 'placeDetail.businessHours.description only',
      q: 'query q($input: PlaceDetailInput!) { placeDetail(input: $input) { businessHours(source: [tpirates, shopWindow]) { description } } }',
      v: { input: { id: sid } }
    },
    {
      name: 'placeDetail.businessHours without source',
      q: 'query q($input: PlaceDetailInput!) { placeDetail(input: $input) { businessHours { description } } }',
      v: { input: { id: sid } }
    },
    {
      name: 'placeDetail.base',
      q: 'query q($input: PlaceDetailInput!) { placeDetail(input: $input) { base { businessHours { description } } } }',
      v: { input: { id: sid } }
    },
    {
      name: 'placeDetail.base.businessHours with source',
      q: 'query q($input: PlaceDetailInput!) { placeDetail(input: $input) { base { businessHours(source: [tpirates, shopWindow]) { description } } } }',
      v: { input: { id: sid } }
    },
  ];

  for (const { name, q, v } of queries) {
    console.log(`\n=== ${name} ===`);
    const result = await fetchGraphQL(q, v);
    console.log(JSON.stringify(result).substring(0, 800));
  }
}

main().catch(console.error);
