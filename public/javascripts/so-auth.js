"use strict";

class SoAuth {
  constructor(options) {
    this.hostSignPublicKey = options.hostSignPublicKey;
    this.endpoint = options.endpoint;

    this.meta = options.meta ? options.meta: false;
    this.token = options.token ? options.token : false;
    this.boxSeed = options.boxSeed ? options.boxSeed : false;
    this.boxKeypair = options.boxKeypair ? options.boxKeypair : false;

    this.hostBoxPublicKey = options.hostBoxPublicKey ? options.hostBoxPublicKey : false;

    // WebGL Fingerprint
    this.hash = options.hash ? options.hash : false;

    if (options.enableFingerprint) {
      try{
        let _this = this;

        sodium.ready.then(() => {
          let webgl = new WebGl();

          _this.ready = webgl.ready;

          webgl.ready.then(() => {
            _this.hash = webgl.hash;
          });
        });
      } catch (err) {
        console.warn('WebGL not detected');
        this.ready = sodium.ready;
      }
    } else {
      this.ready = sodium.ready;
    }
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

  // Identity process
  async _log(credential) {
    if (
      typeof credential === 'object'
    ) {
      if (!sodium) {
        throw new Error('Sodium not initialized');
      }

      let key, thisSeedString = "", seedString = "";

      for (key in credential) {
        thisSeedString = "";

        if (credential.hasOwnProperty(key)) {
          thisSeedString = await sodium.crypto_generichash(sodium.crypto_generichash_BYTES_MAX, key + credential[key]);
          thisSeedString = sodium.to_hex(thisSeedString);
          seedString += thisSeedString;
        }
      }

      let seed = await sodium.crypto_generichash(sodium.crypto_generichash_BYTES_MAX, seedString + this.hostSignPublicKey);

      let signSeed = await sodium.crypto_generichash(sodium.crypto_sign_SEEDBYTES, seed);
      this.boxSeed = await sodium.crypto_generichash(sodium.crypto_sign_SEEDBYTES, seed + sodium.randombytes_random());

      this.boxKeypair = await sodium.crypto_box_seed_keypair(this.boxSeed);

      return await sodium.crypto_sign_seed_keypair(signSeed);
    }

    return false;
  }

  async _sign(meta, intention, signKeypair) {
    let message = this._refineMessage({
      intention: intention,
      boxPublicKey: sodium.to_hex(this.boxKeypair.publicKey),
      serverSignPublicKey: this.hostSignPublicKey,
      meta: meta
    });

    let signature = await sodium.crypto_sign(sodium.from_string(message), signKeypair.privateKey);

    return {
      signature: sodium.to_hex(signature),
      signPublicKey: sodium.to_hex(signKeypair.publicKey)
    };
  }

  async _validate(data) {
    if (
      typeof data === 'object'
      && data.signature !== undefined
    ) {
      if (typeof data.signature === 'string') {
        data.signature = sodium.from_hex(data.signature);
      }

      let unsigned = await sodium.crypto_sign_open(data.signature, sodium.from_hex(this.hostSignPublicKey));

      if(unsigned){
        let message = JSON.parse(sodium.to_string(unsigned));

        if (message.boxPublicKey !== undefined && message.token !== undefined) {
          if (typeof message.boxPublicKey === 'string') {
            this.hostBoxPublicKey = sodium.from_hex(message.boxPublicKey);
          } else {
            this.hostBoxPublicKey = message.boxPublicKey;
          }

          this.token = message.token;

          return message;
        }
      }
    }
    
    return false;
  }

  async negotiate(credential, intention, meta = {}) {
    await sodium.ready;

    this.meta = meta;

    let acceptedIntention = [ 'login' , 'register' ];

    if (acceptedIntention.includes(intention)) {
      let signKeypair = await this._log(credential);
      let signed = await this._sign(meta, intention, signKeypair);
      let response = await this._send(signed, { pathname: '/soauth' });

      return await this._validate(response);
    }

    return false;
  }


  // Authentication process
  async _encrypt(message) {
    message = this._refineMessage(message);

    if (message) {
      let nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
      let ciphertext = await sodium.crypto_box_easy(message, nonce, this.hostBoxPublicKey, this.boxKeypair.privateKey);    

      return {
        ciphertext: sodium.to_hex(ciphertext),
        nonce: sodium.to_hex(nonce),
        token: this.token
      };
    }

    return false;
  }

  async _decrypt(data) {
    if (
      typeof data === 'object'
      && data.ciphertext !== undefined
      && data.nonce !== undefined
    ) {
      if (typeof data.ciphertext === 'string') {
        data.ciphertext = sodium.from_hex(data.ciphertext);
      }

      if (typeof data.nonce === 'string') {
        data.nonce = sodium.from_hex(data.nonce);
      }

      let decrypted = await sodium.crypto_box_open_easy(data.ciphertext, data.nonce, this.hostBoxPublicKey, this.boxKeypair.privateKey);

      if (decrypted) {
        try {
          return JSON.parse(sodium.to_string(decrypted));
        } catch (err) {
          return sodium.to_string(decrypted);
        }
      }
    }
    
    // Handles error or non-conformed ciphertext
    try {
      return JSON.parse(data);
    } catch (err) {
      return data;
    }
  }

  async exchange(message, pathname) {
    await sodium.ready;

    if (typeof message === 'string') {
      message = message.trim();
      if (message === '') {
        return;
      }
    }

    let encrypted = await this._encrypt(message);
    let response = await this._send(encrypted, { 
        pathname: pathname
      });
    return await this._decrypt(response);
  }


  // Relay
  async _send(message , options = {}) {
    message = this._refineMessage(message);
    let endpoint = this.endpoint;

    if (options.url !== undefined) {
      endpoint = options.url;
    }

    let url = new URL(endpoint);

    if (options.pathname !== undefined) {
      if (options.pathname.includes("soauth")) {
        url.pathname = options.pathname;
      } else {
        url.pathname = url.pathname.replace(/\/+$/, "") + options.pathname;
      }
    }

    if (message !== false) {
      let res = false;
      let SoAuthFingerprint = this.hash;

      await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'SoAuth-Fingerprint': SoAuthFingerprint
        },
        body: message
      }).then(jsonResponse => {
        return jsonResponse.json();
      }).then(out => {
        res = out;
      }).catch(err => {
        console.error(err);
      });

      return res;
    }
  }


  // Transit
  save(callback) {
    if (callback !== undefined && typeof callback !== 'function') {
      throw new Error('Callback is not a function')
    }

    let credential = {
      endpoint: this.endpoint,
      meta: this.meta,
      token: this.token,
      boxSeed: sodium.to_hex(this.boxSeed),
      hostBoxPublicKey: sodium.to_hex(this.hostBoxPublicKey),
      ts: new Date()
    };

    if (callback) {
      callback(credential);
    } else {
      localStorage.setItem('so-auth-' + this.hostSignPublicKey, JSON.stringify(credential));
    }
  }

  async load(credential) {
    await sodium.ready;

    if (credential === undefined) {
      credential = localStorage.getItem('so-auth-' + this.hostSignPublicKey);
      if (!credential) {
        return false;
      }
      credential = JSON.parse(credential);
    }

    if (
      typeof credential === 'object'
      && credential.endpoint !== undefined
      && credential.meta !== undefined
      && credential.token !== undefined
      && credential.boxSeed !== undefined
      && credential.hostBoxPublicKey !== undefined
      && credential.ts !== undefined
    ) {
      let timestamp = Math.round(new Date().getTime() / 1000);
      let hourMax = 12;

      timestamp = timestamp - (hourMax * 3600);

      let isPast = credential.ts >= new Date(timestamp * 1000).getTime();

      if (!isPast) {
        let SoAuth = this;

        SoAuth.endpoint = credential.endpoint;
        SoAuth.meta = credential.meta;
        SoAuth.token = credential.token;
        SoAuth.boxKeypair = sodium.crypto_box_seed_keypair(sodium.from_hex(credential.boxSeed));
        SoAuth.hostBoxPublicKey = sodium.from_hex(credential.hostBoxPublicKey);

        // WebGL Fingerprint
        try{
          let webgl = new WebGl();

          await webgl.ready;
          SoAuth.hash = webgl.hash;
        } catch (err) {
          console.warn('WebGL not detected');
        }

        return true;
      } else {
        localStorage.removeItem('so-auth-' + this.hostSignPublicKey);
        return false;
      }
    } else {
      return false;
    }
  }

  clone() {
    return new SoAuth({
      endpoint: this.endpoint,
      token: this.token,
      boxKeypair: this.boxKeypair,
      hostBoxPublicKey: this.hostBoxPublicKey,
      hash: this.hash
    });
  }

  async logout() {
    let response = await this._send('', { pathname: '/soauth/logout/' + this.token });

    if (response.success === true) {
      localStorage.removeItem('so-auth-' + this.hostSignPublicKey);
      return true;
    }

    return false;
  }
}
