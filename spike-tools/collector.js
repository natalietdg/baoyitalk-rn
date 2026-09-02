#!/usr/bin/env node
/**
 * Log collector for the RN de-risking spike.
 *
 * The app POSTs one line per probe result here, so the verdict is a file on disk
 * rather than something read off a simulator screen.
 *
 * iOS simulator reaches this at localhost:8899; the Android emulator at 10.0.2.2:8899.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const OUT = process.argv[2] || path.join(__dirname, 'spike-results.log');
const PORT = Number(process.env.SPIKE_PORT || 8900);

http
  .createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (body) {
        const stamped = body
          .split('\n')
          .filter(Boolean)
          .map((l) => `${new Date().toISOString().slice(11, 23)} ${l}`)
          .join('\n');
        fs.appendFileSync(OUT, stamped + '\n');
        process.stdout.write(stamped + '\n');
      }
      res.writeHead(200, { 'Access-Control-Allow-Origin': '*' });
      res.end('ok');
    });
  })
  .listen(PORT, '0.0.0.0', () => console.log(`collector listening :${PORT} -> ${OUT}`));
