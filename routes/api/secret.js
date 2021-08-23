"use strict";

const env = process.env.NODE_ENV || 'development';
const config = require('../../configs/default.json');
const _SoAuth = require('../../modules/so-auth').SoAuth;
const SoAuthConfig = require('../../configs/so-auth.json');

var createError = require('http-errors');
var express = require('express');
var router = express.Router();

var accessModel = require('../../models/access');

var tool = require('../../modules/tool');


if (SoAuthConfig.passphrase === undefined) {
  throw new Error('S2S passphrase not set');
}

let SoAuth = new _SoAuth(SoAuthConfig.passphrase);

SoAuth.setup().then(() => {
  SoAuth.cliqueBoxPublicKey = SoAuth.sodium.from_hex(SoAuthConfig.cliqueBoxPublicKey['self']);
});



// Simple check
router.all("*", function(req, res, next) {
  if (
    res.locals.decrypted !== undefined 
    && res.locals.SoAuth !== undefined
  ) {
    // get the current soauth user data
    accessModel.findOne({ _id: res.locals.auth._id }).then(result => {
      if (result) {
        res.locals.access = result;
        next();
      } else {
        next(createError(401, 'Invalid permission'));
      }
    });
  } else {
    next();
  }
});


router.post("*", function(req, res, next) {
  // Respond to the browser encryption
  res.locals.SoAuth.encrypt({
    success: true,
    message: 'OK',
    rdata: 'Received: ' + res.locals.decrypted
  }).then(encrypted => {
    res.json(encrypted);
  });

  // Test the server-to-server (send to self basically)
  let endpoint = config[env].base + '/s2s/access/findOne';

  SoAuth.encrypt({
    params: { token: res.locals.token }
  }).then(encrypted => {
    tool.post(endpoint, {
      data: encrypted,
      name: SoAuthConfig.hostId
    }).then(result => {
      if (result.ciphertext) {
        SoAuth.decrypt(result).then(decrypted => {
          console.log('===============================================')
          console.log('Server-to-Server result: ');
          console.log('===============================================')
          console.log(decrypted);
          console.log('===============================================')
        });
      } else {
        console.log('S2S Error:', result.message);
      }
    });
  });
});

module.exports = router;
