// test-benchmark.js
const http = require('http');

const data = JSON.stringify({
  batchName: "Test Batch",
  providers: ["google:gemini-1.5-flash-latest"],
  judgeProvider: ["google:gemini-1.5-flash-latest"],
  tests: [
    {
      id: "mcq-1",
      type: "mcq",
      question: "Apa ibukota Indonesia?",
      expectedAnswer: "B"
    }
  ]
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/benchmark/run',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    console.log(JSON.stringify(JSON.parse(body), null, 2));
  });
});

req.on('error', e => console.error(e));
req.write(data);
req.end();
