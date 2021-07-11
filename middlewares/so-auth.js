"use strict";


// ==== CLASS ====
const _sodium = require('libsodium-wrappers');
const express = require('express');
const router = express.Router();
const path = require('path');
const url  = require('url');
const fs = require('fs');

var Access = false;
var Config = {
  secret: false,
  signKeypair: false,
};

class _SoAuth {
  constructor(secret) {
    this.boxKeypair = false;

    this.clientToken = false;
    this.clientBoxPublicKey = false;

    this.secret = secret;
    this.sodium = false;
  }

  async setup() {
    if (this.sodium === false) {
      await _sodium.ready;
      this.sodium = _sodium;
    }

    return this.sodium;
  }


  // Utils
  _refineMessage(something) {
    if (typeof something !== 'string') {
      if (typeof something === 'object' || typeof something === 'array') {
        something = JSON.stringify(something);
      } else {
        throw new Error('Invalid message format');
      }
    }
    return something;
  }


  // Signing process
  async _validate(data) {
    if (
      typeof data === 'object'
      && data.signature !== undefined
      && data.signPublicKey !== undefined
    ) {
      if (typeof data.signature === 'string') {
        data.signature = this.sodium.from_hex(data.signature);
      }

      if (typeof data.signPublicKey === 'string') {
        data.signPublicKey = this.sodium.from_hex(data.signPublicKey);
      }

      let unsigned = await this.sodium.crypto_sign_open(data.signature, data.signPublicKey);

      if (unsigned) {
        let message = JSON.parse(this.sodium.to_string(unsigned));

        if (message.boxPublicKey !== undefined && message.serverSignPublicKey !== undefined) {
          if (typeof message.boxPublicKey === 'string') {
            this.clientBoxPublicKey = this.sodium.from_hex(message.boxPublicKey);
          } else {
            this.clientBoxPublicKey = message.boxPublicKey;
          }

          if (message.serverSignPublicKey === this.sodium.to_hex(Config.signKeypair.publicKey)) {
            return message;
          }
        }
      }
    }
    
    return false;
  }

  async _introduce(intention) {
    let message = this._refineMessage({
      intention: intention,
      boxPublicKey: this.sodium.to_hex(this.boxKeypair.publicKey),
      token: this.clientToken
    });

    let signature = await this.sodium.crypto_sign(this.sodium.from_string(message), Config.signKeypair.privateKey);

    return {
      signature: this.sodium.to_hex(signature)
    };
  }

  async probe(client, req, res, next) {
    if (
      typeof client === 'object'
      && client.signature !== undefined
      && client.signPublicKey !== undefined
    ) {
      if (!this.sodium) {
        throw new Error('Sodium not initialized');
      }

      // authenticate the signed message
      let message = await this._validate(client);

      if (message !== false && this.clientBoxPublicKey !== false) {
        let acceptedIntention = ['register', 'login'];

        if (!acceptedIntention.includes(message.intention)) {
          return false;
        }

        // create seed
        let seed = await this.sodium.crypto_generichash(this.sodium.crypto_generichash_BYTES_MAX, Config.secret);

        // create token
        this.clientToken = await this.sodium.crypto_generichash(this.sodium.crypto_generichash_BYTES_MAX, seed + this.sodium.randombytes_random());
        this.clientToken = this.sodium.to_hex(this.clientToken);

        let findExist = await Access.findOne({ signPublicKey: this.sodium.to_hex(client.signPublicKey), message: message }, req, res, next);
        let creation = false;

        if (message.intention === 'register' && findExist === false) {
          creation = await Access.create({
            boxPublicKey: message.boxPublicKey,
            signPublicKey: this.sodium.to_hex(client.signPublicKey),
            meta: message.meta,
            token: this.clientToken
          }, req, res, next);
        } else if (message.intention === 'login' && findExist !== false) {
          creation = await Access.update({
            _id: findExist._id,
            boxPublicKey: message.boxPublicKey,
            meta: message.meta,
            token: this.clientToken
          }, req, res, next);
        } else {
          return false;
        }

        if (!creation) {
          return false;
        }

        // Create the session authentication key pairs
        let accessData = await Access.findOne({ signPublicKey: this.sodium.to_hex(client.signPublicKey) });

        // Always differ on every new session
        let boxSeed = await this.sodium.crypto_generichash(this.sodium.crypto_box_SEEDBYTES, seed + accessData.lastModified.getTime());
        this.boxKeypair = await this.sodium.crypto_box_seed_keypair(boxSeed);

        return await this._introduce(message.intention);
      }
    }
    return false;
  }


  // Authentication process
  async encrypt(message) {
    message = this._refineMessage(message);

    if (message && this.clientBoxPublicKey) {
      let nonce = this.sodium.randombytes_buf(this.sodium.crypto_box_NONCEBYTES);
      let ciphertext = await this.sodium.crypto_box_easy(message, nonce, this.clientBoxPublicKey, this.boxKeypair.privateKey);    

      return {
        ciphertext: this.sodium.to_hex(ciphertext),
        nonce: this.sodium.to_hex(nonce)
      };
    }

    return false;
  }

  async decrypt(data) {
    if (
      typeof data === 'object'
      && data.ciphertext !== undefined
      && data.nonce !== undefined
      && data.token !== undefined
    ) {
      if (typeof data.ciphertext === 'string') {
        data.ciphertext = this.sodium.from_hex(data.ciphertext);
      }
      if (typeof data.nonce === 'string') {
        data.nonce = this.sodium.from_hex(data.nonce);
      }

      let accessData = await this.checkToken(data.token);

      if (accessData) {
        let seed = await this.sodium.crypto_generichash(this.sodium.crypto_generichash_BYTES_MAX, Config.secret);
        let boxSeed = await this.sodium.crypto_generichash(this.sodium.crypto_box_SEEDBYTES, seed + accessData.lastModified.getTime());
        this.boxKeypair = await this.sodium.crypto_box_seed_keypair(boxSeed);

        let decrypted = await this.sodium.crypto_box_open_easy(data.ciphertext, data.nonce, this.sodium.from_hex(accessData.boxPublicKey), this.boxKeypair.privateKey);

        this.clientBoxPublicKey = this.sodium.from_hex(accessData.boxPublicKey);

        if (decrypted) {
          try {
            return JSON.parse(this.sodium.to_string(decrypted));
          } catch (err) {
            return this.sodium.to_string(decrypted);
          }
        }
      }
    }
    
    return false;
  }


  // Token process
  async checkToken(token) {
    return await Access.findOne({ token: token });
  }

  // Logout
  async logout(token) {
    let accessData = await Access.findOne({ token: token });
    if (accessData) {
      return await Access.update({
        _id: accessData._id,
        boxPublicKey: '',
        token: ''
      });
    }

    return false;
  }
}



// ==== MIDDLEWARE ====

// Export middleware
module.exports = function (options) {
  if (options.secret === undefined) {
    throw new Error('Must provide SoAuth secret');
  }

  Config.secret = options.secret;

  if (options.handler === undefined) {
    throw new Error('Handler not provided.');
  }

  if (
    typeof options.handler === 'object'
    && typeof options.handler.create === 'function'
    && typeof options.handler.update === 'function'
    && typeof options.handler.findOne === 'function'
  ) {
    // OK
  } else {
    throw new Error('Handler does not meet specifications.');
  }

  // Default media fetch controller if not exists
  if (typeof options.handler.mediaFetchController !== 'function') {
    options.handler.mediaFetchController = function () {};
  }

  Access = options.handler;

  let SoAuth = new _SoAuth(Config.secret);
  SoAuth.setup().then(sodium => {
    // Create the signature keypair
    let seed = sodium.crypto_generichash(sodium.crypto_generichash_BYTES_MAX, Config.secret);
    let signSeed = sodium.crypto_generichash(sodium.crypto_sign_SEEDBYTES, seed);

    Config.signKeypair = sodium.crypto_sign_seed_keypair(signSeed);
    console.log('Signature public key is', sodium.to_hex(Config.signKeypair.publicKey));
  });

  return router;
};



// ==== ROUTER ====


// Handles logout
router.all('/soauth/logout/:token', function(req, res, next) {
  if (req.params.token !== undefined) {
    let SoAuth = new _SoAuth(Config.secret);

    SoAuth.setup().then(() => {
      SoAuth.logout(req.params.token).then(result => {
        if (result) {
          res.json({
            success: true,
            message: 'OK'
          });
        } else {
          next();
        }
      });
    });
  } else {
    next();
  }
});

// Handles negotiation
router.all('/soauth', function(req, res, next) {
  if (
    req.body.signature !== undefined 
    && req.body.signPublicKey !== undefined
  ) {
    let SoAuth = new _SoAuth(Config.secret);

    SoAuth.setup().then(() => {
      SoAuth.probe({
        signature: req.body.signature,
        signPublicKey: req.body.signPublicKey
      }, req, res, next).then(introduce => {
        res.json(introduce);
      });
    });
  } else {
    next();
  }
});


// Handles all token ("soauth" is the identifier)
router.all('*', function(req, res, next) {
  if (req.body.soauth !== undefined) {
    res.locals.token = req.body.soauth;
  }
  if (req.query.soauth !== undefined) {
    res.locals.token = req.query.soauth;
  }
  if (req.params.soauth !== undefined) {
    res.locals.token = req.params.soauth;
  }

  if (
    req.body.ciphertext !== undefined 
    && req.body.nonce !== undefined 
    && req.body.token !== undefined
  ) {
    res.locals.token = req.body.token;
  }

  //  Check if the token is valid
  if (res.locals.token !== undefined) {
    let SoAuth = new _SoAuth(Config.secret);

    SoAuth.setup().then(() => {
      SoAuth.checkToken(res.locals.token).then(data => {
        if (data) {
          res.locals.auth = data;
        } else {
          delete res.locals.token;
        }
        next();
      });
    });
  } else {
    next();
  }
});

// private upload file if exists
router.use('/private/download/:mediaId', function(req, res, next) {
  if (res.locals.token === undefined) {
    next();
  } else {
    Access.mediaFetchController(req, res, next);
  }
});

// Apply token to string <<soauth>>
router.use('/private/vues/*.vue', function(req, res, next){
  let urlParts = url.parse(req.baseUrl);
  let lePath = path.join(process.env.PWD, urlParts.pathname);
  if (fs.existsSync(lePath)) {
    fs.readFile(lePath, 'utf8', function (err, data) {
      if (err) {
        next(err);
      }

      if (data !== undefined) {
        let result = data.replace(/<<soauth>>/g, res.locals.token);

        res.setHeader('Content-Type', 'application/javascript');
        res.setHeader('Content-Length', result.length);
        res.send(result);
      }
    });
  }
});

// Secure private static file
router.all('/private/*', function(req, res, next) {
  if (res.locals.token === undefined) {
    next(new Error('Invalid access'));
  } else {
    next();
  }
});
router.use('/private', express.static(path.join(process.env.PWD, 'private')));


// Handles authentication
router.all('*', function(req, res, next) {
  if (
    req.body.ciphertext !== undefined 
    && req.body.nonce !== undefined 
    && req.body.token !== undefined
  ) {
    let SoAuth = new _SoAuth(Config.secret);

    SoAuth.setup().then(() => {
      SoAuth.decrypt({
        ciphertext: req.body.ciphertext,
        nonce: req.body.nonce,
        token: req.body.token
      }).then(decrypted => {
        if (decrypted) {
          res.locals.decrypted = decrypted;
          res.locals.SoAuth = SoAuth;

          next();
        } else {
          next(new Error('Invalid access'));
        }
      });
    });
  } else {
    next();
  }
});
