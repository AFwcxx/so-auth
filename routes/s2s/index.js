"use strict";

const _SoAuth = require('../../modules/so-auth').SoAuth;
const SoAuthConfig = require('../../configs/so-auth.json');

var createError = require('http-errors');
var express = require('express');
var router = express.Router();

if (SoAuthConfig.passphrase !== undefined) {
  let SoAuth = new _SoAuth(SoAuthConfig.passphrase);

  SoAuth.setup().then(() => {
    let boxPublicKey = SoAuth.sodium.to_hex(SoAuth.boxKeypair.publicKey);
    console.log('SoAuth S2S Box Public Key: ' + boxPublicKey)
  });
} else {
  console.log('SoAuth S2S, missing passphrase.');
}


// Decrypting ==
router.all("*", function(req, res, next) {
  if (
    req.body.name !== undefined 
    && req.body.data !== undefined
  ) {
    if (SoAuthConfig.cliqueBoxPublicKey[req.body.name] !== undefined) {
      let SoAuth = new _SoAuth(SoAuthConfig.passphrase);

      res.locals.SoAuth = SoAuth;

      SoAuth.setup().then(() => {
        SoAuth.cliqueBoxPublicKey = SoAuth.sodium.from_hex(SoAuthConfig.cliqueBoxPublicKey[req.body.name]);

        SoAuth.decrypt(req.body.data).then(decrypted => {
          res.locals.decrypted = decrypted;
          next();
        });
      });
    } else {
      next(createError(401, 'Invalid permission'));
    }
  } else {
    next(createError(404, 'Request not found'));
  }
});



module.exports = router;

