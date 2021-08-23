"use strict";

const _SoAuth = require('../modules/so-auth').SoAuth;
const SoAuthConfig = require('../configs/so-auth.json');
const mongo = require('../modules/mongodb');
const db = mongo.getClient();

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


// Begin routing
router.post("*", function(req, res, next) {
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
      res.status(401).json({ message: 'Invalid permission' });
    }
  } else {
    res.status(400).json({ message: 'Invalid action' });
  }
});

router.post("/access/findOne", function(req, res, next) {
  if (res.locals.decrypted) {
    db.collection("access").findOne(res.locals.decrypted.params).then(findData => {
      if (findData !== null) {
        res.locals.SoAuth.encrypt(findData).then(encypted => {
          res.send(encypted);
        });
      } else {
        res.status(404).json({ message: 'Not found' });
      }
    });
  } else {
    res.status(423).json({ message: 'Invalid encryption' });
  }
});

module.exports = router;

