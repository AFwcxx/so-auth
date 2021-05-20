const tool = require('../modules/tool');
const _SoAuth = require('../modules/so-auth').SoAuth;
const SoAuthConfig = require('../configs/so-auth.json');

var express = require('express');
var router = express.Router();

// Setup SoAuth
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

router.post("*", function(req, res, next) {
  if (
    res.locals.decrypted !== undefined 
    && res.locals.SoAuth !== undefined
  ) {
    // Respond to the browser encryption
    res.locals.SoAuth.encrypt('Received: ' + res.locals.decrypted).then(encrypted => {
      res.json(encrypted);
    });

    // Test the server-to-server (send to self basically)
    let endpoint = 'http://localhost:3000/s2s/access/findOne';
    if (SoAuthConfig.cliqueBoxPublicKey['self'] !== undefined) {
      SoAuth.cliqueBoxPublicKey = SoAuth.sodium.from_hex(SoAuthConfig.cliqueBoxPublicKey['self']);

      SoAuth.encrypt({
        params: { token: res.locals.token }
      }).then(encrypted => {
        tool.httpPost(endpoint, {
          data: encrypted,
          name: 'self'
        }).then(result => {
          SoAuth.decrypt(result).then(decrypted => {
            console.log('===============================================')
            console.log('Server-to-Server result: ');
            console.log('===============================================')
            console.log(decrypted);
            console.log('===============================================')
          });
        });
      });
    }
  } else {
    next();
  }
});

module.exports = router;
