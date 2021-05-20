const _SoAuth = require('../modules/so-auth').SoAuth;
const SoAuthConfig = require('../configs/so-auth.json');
const mongo = require('../modules/mongodb');
const db = mongo.getClient();

var express = require('express');
var router = express.Router();

var SoAuth = false;

if (SoAuthConfig.passphrase !== undefined) {
  SoAuth = new _SoAuth({
    passphrase: SoAuthConfig.passphrase,
  });

  SoAuth.setup().then(() => {
    let boxPublicKey = SoAuth.sodium.to_hex(SoAuth.boxkeypair.publicKey);
    console.log('SoAuth S2S ready, Box Public Key: ' + boxPublicKey)
  });
} else {
  console.log('SoAuth S2S, missing passphrase.');
}


// Begin routing
router.post("*", function(req, res, next) {
  if (
    req.body.name !== undefined 
    && req.body.data !== undefined
    && SoAuth !== false
  ) {
    if (SoAuthConfig.cliqueBoxPublicKey[req.body.name] !== undefined) {
      SoAuth.cliqueBoxPublicKey = SoAuth.sodium.from_hex(SoAuthConfig.cliqueBoxPublicKey[req.body.name]);

      SoAuth.decrypt(req.body.data).then(decrypted => {
        res.locals.decrypted = decrypted;
        next();
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
        SoAuth.encrypt(findData).then(encypted => {
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

