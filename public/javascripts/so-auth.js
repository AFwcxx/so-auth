"use strict";

class SoAuth {
  constructor(options) {
    this.hostId = options.hostId || 'super-secret';
    this.endpoint = options.endpoint || 'http://localhost:3000/';

    this.token = options.token || false;
    this.boxSeed = options.boxSeed || false;
    this.boxkeypair = options.boxkeypair || false;
    this.signkeypair = options.signkeypair || false;

    this.relay = '';
    this.cliqueBoxPublicKey = options.cliqueBoxPublicKey || false;
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

      let seed = await sodium.crypto_generichash(sodium.crypto_generichash_BYTES_MAX, seedString + this.hostId);
      let signSeed = await sodium.crypto_generichash(sodium.crypto_sign_SEEDBYTES, seed);

      this.boxSeed = await sodium.crypto_generichash(sodium.crypto_sign_SEEDBYTES, seed + sodium.randombytes_random());
      this.boxkeypair = await sodium.crypto_box_seed_keypair(this.boxSeed);
      this.signkeypair = await sodium.crypto_sign_seed_keypair(signSeed);
    }
  }

  async _sign(intention, meta) {
    let acceptedIntention = ['register', 'login'];
    if (!acceptedIntention.includes(intention)) {
      throw new Error('Invalid intention');
    }

    let message = this._refineMessage({
      intention: intention,
      boxPublicKey: sodium.to_hex(this.boxkeypair.publicKey),
      meta: meta
    });

    let signature = await sodium.crypto_sign(sodium.from_string(message), this.signkeypair.privateKey);

    this.relay = {
      signature: sodium.to_hex(signature),
      signPublicKey: sodium.to_hex(this.signkeypair.publicKey)
    };

    // Done using
    this.signkeypair = false;

    return this.relay;
  }

  async _validate(data) {
    if (
      typeof data === 'object'
      && data.signature !== undefined
      && data.signPublicKey !== undefined
    ) {
      if (typeof data.signature === 'string') {
        data.signature = sodium.from_hex(data.signature);
      }
      if (typeof data.signPublicKey === 'string') {
        data.signPublicKey = sodium.from_hex(data.signPublicKey);
      }

      let unsigned = await sodium.crypto_sign_open(data.signature, data.signPublicKey);

      if(unsigned){
        let message = JSON.parse(sodium.to_string(unsigned));

        if (message.boxPublicKey !== undefined && message.token !== undefined) {
          if (typeof message.boxPublicKey === 'string') {
            this.cliqueBoxPublicKey = sodium.from_hex(message.boxPublicKey);
          } else {
            this.cliqueBoxPublicKey = message.boxPublicKey;
          }

          this.token = message.token;

          return message;
        }
      }

      this.cliqueBoxPublicKey = false;
      this.token = false;
    }
    
    return false;
  }

  async negotiate(credential, intention, meta = {}) {
    await this._log(credential);
    await this._sign(intention, meta);
    let response = await this._send({ pathname: '/soauth' });
    return await this._validate(response);
  }


  // Authentication process
  async _encrypt(message) {
    message = this._refineMessage(message);

    if (message) {
      let nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
      let ciphertext = await sodium.crypto_box_easy(message, nonce, this.cliqueBoxPublicKey, this.boxkeypair.privateKey);    

      this.relay = {
        ciphertext: sodium.to_hex(ciphertext),
        nonce: sodium.to_hex(nonce),
        token: this.token
      };

      return this.relay;
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

      let decrypted = await sodium.crypto_box_open_easy(data.ciphertext, data.nonce, this.cliqueBoxPublicKey, this.boxkeypair.privateKey);

      if (decrypted) {
        try {
          return JSON.parse(sodium.to_string(decrypted));
        } catch (err) {
          return sodium.to_string(decrypted);
        }
      }

      this.cliqueBoxPublicKey = false;
      this.token = false;
    }
    
    // Handles error or non-conformed ciphertext
    try {
      return JSON.parse(data);
    } catch (err) {
      return data;
    }
  }

  async exchange(message, pathname) {
    await this._encrypt(message);
    let response = await this._send({ 
        pathname: pathname
      });
    return await this._decrypt(response);
  }


  // Relay
  async _send(options = {}) {
    let message = this._refineMessage(this.relay);
    let endpoint = this.endpoint;

    if (options.url !== undefined) {
      endpoint = options.url;
    }

    let url = new URL(endpoint);

    if (options.pathname !== undefined) {
      url.pathname = options.pathname;
    }

    if (message !== false) {
      let res = false;

      await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: message
      }).then(jsonResponse => {
        return jsonResponse.json();
      }).then(out => {
        res = out;
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
      hostId: this.hostId,
      endpoint: this.endpoint,
      token: this.token,
      boxSeed: sodium.to_hex(this.boxSeed),
      cliqueBoxPublicKey: sodium.to_hex(this.cliqueBoxPublicKey)
    };

    if (callback) {
      callback(credential);
    } else {
      localStorage.setItem('so-auth', JSON.stringify(credential));
    }
  }

  async load(credential) {
    if (credential === undefined) {
      credential = localStorage.getItem('so-auth');
      credential = JSON.parse(credential);
      localStorage.removeItem('so-auth');
    }

    if (
      typeof credential === 'object'
      && credential !== null
      && credential !== undefined
      && credential.hostId !== undefined
      && credential.endpoint !== undefined
      && credential.token !== undefined
      && credential.boxSeed !== undefined
      && credential.cliqueBoxPublicKey !== undefined
    ) {
      let SoAuth = this;

      let delay = new Promise(resolve => {
        setTimeout(function() {
          SoAuth.hostId = credential.hostId;
          SoAuth.endpoint = credential.endpoint;
          SoAuth.token = credential.token;
          SoAuth.boxSeed = sodium.from_hex(credential.boxSeed);
          SoAuth.cliqueBoxPublicKey = sodium.from_hex(credential.cliqueBoxPublicKey);
          SoAuth.boxkeypair = sodium.crypto_box_seed_keypair(SoAuth.boxSeed);
          resolve(true);
        },500);
      });

      return await delay;
    }

    return false
  }

  clone() {
    return new SoAuth({
      hostId: this.hostId,
      endpoint: this.endpoint,
      token: this.token,
      boxSeed: this.boxSeed,
      cliqueBoxPublicKey: this.cliqueBoxPublicKey,
      boxkeypair: this.boxkeypair
    });
  }
}
