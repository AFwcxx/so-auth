"use strict";

/*
 * Scopes res.locals created:
 *
 * token - grab from "soauth" param/query/body
 * auth - SoAuth data
 * decrypted - SoAuth decrypted data
 * SoAuth - SoAuth object
 *
 */


// ==== CLASS ====
const _sodium = require('libsodium-wrappers');

var Access = false;

class _SoAuth {
  constructor(hostId) {
    this.boxkeypair = false;
    this.signkeypair = false;

    this.relay = '';
    this.cliqueToken = false;
    this.cliqueBoxPublicKey = false;

    this.hostId = hostId || 'super-secret';
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

        if (message.boxPublicKey !== undefined) {
          if (typeof message.boxPublicKey === 'string') {
            this.cliqueBoxPublicKey = this.sodium.from_hex(message.boxPublicKey);
          } else {
            this.cliqueBoxPublicKey = message.boxPublicKey;
          }

          return message;
        }
      }

      this.cliqueBoxPublicKey = false;
    }
    
    return false;
  }

  async _introduce(intention) {
    let message = this._refineMessage({
      intention: intention,
      boxPublicKey: this.sodium.to_hex(this.boxkeypair.publicKey),
      token: this.cliqueToken
    });

    let signature = await this.sodium.crypto_sign(this.sodium.from_string(message), this.signkeypair.privateKey);

    this.relay = {
      signature: this.sodium.to_hex(signature),
      signPublicKey: this.sodium.to_hex(this.signkeypair.publicKey)
    };

    // Done using
    this.signkeypair = false;

    return this.relay;
  }

  async probe(clique, req, res, next) {
    if (
      typeof clique === 'object'
      && clique.signature !== undefined
      && clique.signPublicKey !== undefined
    ) {
      if (!this.sodium) {
        throw new Error('Sodium not initialized');
      }

      // authenticate the signed intention
      let message = await this._validate(clique);

      if (message !== false && this.cliqueBoxPublicKey !== false) {
        let acceptedIntention = ['register', 'login'];

        if (!acceptedIntention.includes(message.intention)) {
          return false;
        }

        // create seed
        let seed = await this.sodium.crypto_generichash(this.sodium.crypto_generichash_BYTES_MAX, message.boxPublicKey + this.hostId + this.sodium.randombytes_random());

        // create token
        this.cliqueToken = await this.sodium.crypto_generichash(this.sodium.crypto_generichash_BYTES_MAX, seed + this.sodium.randombytes_random());
        this.cliqueToken = this.sodium.to_hex(this.cliqueToken);

        // create keypairs
        let boxSeed = await this.sodium.crypto_generichash(this.sodium.crypto_box_SEEDBYTES, seed);
        let signSeed = await this.sodium.crypto_generichash(this.sodium.crypto_sign_SEEDBYTES, seed);

        this.boxkeypair = await this.sodium.crypto_box_seed_keypair(boxSeed);
        this.signkeypair = await this.sodium.crypto_sign_seed_keypair(signSeed);

        let findExist = await Access.findOne({ signPublicKey: this.sodium.to_hex(clique.signPublicKey), message: message }, req, res, next);
        let creation = false;

        if (message.intention === 'register' && findExist === false) {
          creation = await Access.create({
            boxPublicKey: message.boxPublicKey,
            signPublicKey: this.sodium.to_hex(clique.signPublicKey),
            selfSeed: this.sodium.to_hex(seed),
            meta: message.meta,
            token: this.cliqueToken
          }, req, res, next);
        } else if (message.intention === 'login' && findExist !== false) {
          creation = await Access.update({
            _id: findExist._id,
            boxPublicKey: message.boxPublicKey,
            selfSeed: this.sodium.to_hex(seed),
            meta: message.meta,
            token: this.cliqueToken
          }, req, res, next);
        } else {
          return false;
        }

        if (!creation) {
          return false;
        }

        return await this._introduce(message.intention);
      }
    }
    return false;
  }


  // Authentication process
  async encrypt(message) {
    message = this._refineMessage(message);

    if (message && this.cliqueBoxPublicKey) {
      let nonce = this.sodium.randombytes_buf(this.sodium.crypto_box_NONCEBYTES);
      let ciphertext = await this.sodium.crypto_box_easy(message, nonce, this.cliqueBoxPublicKey, this.boxkeypair.privateKey);    

      this.relay = {
        ciphertext: this.sodium.to_hex(ciphertext),
        nonce: this.sodium.to_hex(nonce)
      };

      return this.relay;
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

      let findAccess = await this.checkToken(data.token);

      if (findAccess) {
        let boxSeed = await this.sodium.crypto_generichash(this.sodium.crypto_box_SEEDBYTES, this.sodium.from_hex(findAccess.selfSeed));

        this.boxkeypair = await this.sodium.crypto_box_seed_keypair(boxSeed);

        let decrypted = await this.sodium.crypto_box_open_easy(data.ciphertext, data.nonce, this.sodium.from_hex(findAccess.boxPublicKey), this.boxkeypair.privateKey);

        if (decrypted) {
          this.cliqueBoxPublicKey = this.sodium.from_hex(findAccess.boxPublicKey);
          try {
            return JSON.parse(this.sodium.to_string(decrypted));
          } catch (err) {
            return this.sodium.to_string(decrypted);
          }
        }

        this.cliqueBoxPublicKey = false;
      }
    }
    
    return false;
  }


  // Token process
  async checkToken(token) {
    return await Access.findOne({ token: token });
  }
}



// ==== MIDDLEWARE ====
var express = require('express');
var router = express.Router();
var path = require('path');
var url  = require('url');
var fs = require('fs');

var SoAuth = false;
var config = false;


// Handles negotiation
router.all('/soauth', function(req, res, next) {
  if (
    req.body.signature !== undefined 
    && req.body.signPublicKey !== undefined
  ) {
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


// Export middleware
module.exports = function(options) {
  config = options;

  if (options.hostId === undefined) {
    config.hostId = 'super-secret';
  }

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
  SoAuth = new _SoAuth(options.hostId);

  return router;
};
