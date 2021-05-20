"use strict";

/*
 * This is basic end-to-end sodium encryption
 * Public key and private key must be specified on both side
 * Suitable for server-to-server
 */

const _sodium = require('libsodium-wrappers');

// ==== CLASS ====

class SoAuth {
  constructor(params) {
    this.passphrase = params.passphrase || null;
    this.cliqueBoxPublicKey = params.cliqueBoxPublicKey || null;

    this.sodium = false;
  }

  async setup() {
    if (this.sodium === false) {
      await _sodium.ready;
      this.sodium = _sodium;

      let seed = await this.sodium.crypto_generichash(this.sodium.crypto_generichash_BYTES_MAX, this.passphrase);
      let boxSeed = await this.sodium.crypto_generichash(this.sodium.crypto_box_SEEDBYTES, seed);
      this.boxkeypair = await this.sodium.crypto_box_seed_keypair(boxSeed);
    }

    return this.sodium;
  }

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

  async encrypt(message) {
    message = this._refineMessage(message);

    if (message && this.cliqueBoxPublicKey) {
      let nonce = this.sodium.randombytes_buf(this.sodium.crypto_box_NONCEBYTES);
      let ciphertext = await this.sodium.crypto_box_easy(message, nonce, this.cliqueBoxPublicKey, this.boxkeypair.privateKey);    

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
    ) {
      if (typeof data.ciphertext === 'string') {
        data.ciphertext = this.sodium.from_hex(data.ciphertext);
      }
      if (typeof data.nonce === 'string') {
        data.nonce = this.sodium.from_hex(data.nonce);
      }
      if (typeof this.cliqueBoxPublicKey === 'string') {
        this.cliqueBoxPublicKey = this.sodium.from_hex(this.cliqueBoxPublicKey);
      }

      let decrypted = await this.sodium.crypto_box_open_easy(data.ciphertext, data.nonce, this.cliqueBoxPublicKey, this.boxkeypair.privateKey);

      if (decrypted) {
        try {
          return JSON.parse(this.sodium.to_string(decrypted));
        } catch (err) {
          return this.sodium.to_string(decrypted);
        }
      }
    }
    
    return false;
  }
}

exports.SoAuth = SoAuth;
