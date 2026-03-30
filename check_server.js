const http = require('http');
http.get('http://localhost:3000/api/events?limit=1', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log('Status: OK, Total:', json.total);
    } catch(e) {
      console.log('Response:', data.substring(0, 200));
    }
  });
}).on('error', (e) => {
  console.log('Status: ERROR -', e.message);
});
