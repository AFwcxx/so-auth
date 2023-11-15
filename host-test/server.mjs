#!/usr/bin/env node
"use strict";

import express from 'express';
import http from 'http';
import soauth from '../dist/host/soauth.mjs';
import cors from 'cors';

soauth.setup({
  secret: 'secret',
  serves: ['test-host-id']
});

function normalizePort(val) {
  const port = parseInt(val, 10);

  if (isNaN(port)) {
    // named pipe
    return val;
  }

  if (port >= 0) {
    // port number
    return port;
  }

  return false;
}

const port = normalizePort(process.env.PORT || '3000');
const app = express();
app.set('port', port);
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
server.listen(port);
server.on('error', error => {
  if (error.syscall !== 'listen') {
    throw error;
  }

  const bind = typeof port === 'string'
    ? 'Pipe ' + port
    : 'Port ' + port;

  // handle specific listen errors with friendly messages
  switch (error.code) {
    case 'EACCES':
      console.error(bind + ' requires elevated privileges');
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(bind + ' is already in use');
      process.exit(1);
      break;
    default:
      throw error;
  }
});
server.on('listening', () => {
  const addr = server.address();
  const bind = typeof addr === 'string'
    ? 'pipe ' + addr
    : 'port ' + addr.port;

  console.log('Listening on ' + bind);
});

// Temporary database
const humanData = [];
const machineData = [];

// Register a machine ==
const registerMachine = {
  hostId: 'test-host-id',
  fingerprint: 'test-machine',
  publicKey: '02a131f6c11648f43757163d71622ac524e303e2e68c0e5bad4eaec07437847c'
};

if (soauth.check_store_data(soauth.SOAUTH_MACHINE_STOREDATA, registerMachine)) {
  machineData.push(registerMachine);
}

for (let i = 0; i < machineData.length; i++) {
  const boxPublicKey = soauth.get_box_pubkey(machineData[i].hostId, machineData[i].publicKey);
  console.log(`Box public key for ${machineData[i].fingerprint} is ${boxPublicKey}`);
}

// ==

app.post('/negotiate', async (req, res, next) => {
  try {
    const result = soauth.negotiate(req.body);
    let pass = false;

    if (
      typeof result === 'object'
      && typeof result.data === 'object'
    ) {
      result.data.fingerprint = req.headers['soauth-fingerprint'];

      if (soauth.check_store_data(soauth.SOAUTH_HUMAN_STOREDATA, result.data)) {
        let foundHumanDataIndex = humanData.findIndex(item => {
          return item.signPublicKey === result.data.signPublicKey && item.hostId === result.data.hostId;
        });

        result.data.ts = new Date();

        if (result.data.intention === 'login' && foundHumanDataIndex !== -1) {
          humanData[foundHumanDataIndex] = result.data;
          pass = true;
        } else if (result.data.intention === 'register' && foundHumanDataIndex === -1) {
          humanData.push(result.data);
          pass = true;
        }
      }
    }

    if (!pass) {
      result.success = false;
      result.message = 'Unable to ' + result.data.intention;
      delete result.signature;
    }

    console.log('Human Data:');
    console.dir(humanData, { depth:null });

    delete result.data;
    return res.json(result);
  } catch (err) {
    return next(err);
  }
});

app.post('/message', async (req, res, next) => {
  try {
    if (!req.body.token) {
      return res.json({
        success: false,
        message: 'Insufficient parameter received.'
      });
    }

    let foundHumanDataIndex = humanData.findIndex(item => { return item.token === req.body.token });

    if (foundHumanDataIndex === -1) {
      return res.json({
        success: false,
        message: 'Invalid request.'
      });
    }

    const hostId = humanData[foundHumanDataIndex].hostId;
    const boxPublicKey = humanData[foundHumanDataIndex].boxPublicKey;
    const result = soauth.decrypt(req.body, hostId, boxPublicKey);

    console.log('result', result);

    return res.json(soauth.encrypt(result, hostId, boxPublicKey));
  } catch (err) {
    return next(err);
  }
});

app.post('/machine', async (req, res, next) => {
  try {
    const fingerprint = req.headers['soauth-fingerprint'];

    if (!fingerprint) {
      return res.json({
        success: false,
        message: 'Insufficient parameter received.'
      });
    }

    let foundMachineDataIndex = machineData.findIndex(item => { return item.fingerprint === fingerprint });

    if (foundMachineDataIndex === -1) {
      return res.json({
        success: false,
        message: 'Invalid request.'
      });
    }

    const hostId = machineData[foundMachineDataIndex].hostId;
    const publicKey = machineData[foundMachineDataIndex].publicKey;
    const result = soauth.decrypt(req.body, hostId, publicKey);

    console.log('result', result);

    return res.json(soauth.encrypt(result, hostId, publicKey));
  } catch (err) {
    return next(err);
  }
});

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(new Error("Not found"));
});

app.use(function(err, req, res, next) {
  res.json({
    success: false,
    message: err.message
  });
});
