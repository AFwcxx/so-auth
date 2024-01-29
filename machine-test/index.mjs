#!/usr/bin/env node
"use strict";

import soauth from '../dist/machine/soauth.mjs';
import http from 'http';

soauth.setup({
  secret: 'secret',
  hostId: 'test-host-id',
  hostPublicKey: 'c6133c4ccba8a0643af197334ca01597879363d6371f221bcba3e0a970958a6e'
});

const encrypted = soauth.encrypt('hello-world');
const postData = JSON.stringify(encrypted);

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/machine',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData),
    'SoAuth-Fingerprint': 'test-machine'
  },
};

console.log("");
console.log("NOTE:");
console.log("We are using 'test-machine' as Fingerprint for demo purpose.");
console.log("But we can generate a somewhat unique fingerprint with fingerprint().");
console.log("Fingerprint", soauth.fingerprint());
console.log("");

const req = http.request(options, (res) => {
  res.setEncoding('utf8');

  let data = "";

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      data = JSON.parse(data);
      const decrypted = soauth.decrypt(data);
      console.log("Server received", decrypted);
    } catch (err) {
      console.log("error", err.message || err);
    }
  });
});

req.on('error', (e) => {
  console.error(`problem with request: ${e.message}`);
});

// Write data to request body
req.write(postData);
req.end();
