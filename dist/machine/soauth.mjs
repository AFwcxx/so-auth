"use strict";

import _sodium from 'libsodium-wrappers';

await _sodium.ready;

const SOAUTH = {
  sodium: _sodium,
  secret: false,
  hostId: false,
  hostPublicKey: false
}

function generate_auth(hostId) {
  const seed = SOAUTH.sodium.crypto_generichash(SOAUTH.sodium.crypto_generichash_BYTES_MAX, SOAUTH.secret + hostId);
  const boxSeed = SOAUTH.sodium.crypto_generichash(SOAUTH.sodium.crypto_box_SEEDBYTES, seed);
  const boxKeypair = SOAUTH.sodium.crypto_box_seed_keypair(boxSeed);

  return boxKeypair;
}

export const serialize_message = function (message) {
  if (typeof message === 'object') {
    message = JSON.stringify(message);
  } else if (typeof message === 'string') {
    // OK
  } else if (typeof message === 'number') {
    message = "" + message;
  } else {
    throw new Error("Invalid message format to serialize");
  }

  return message;
}

export const get_pubkey = function () {
  if (!SOAUTH.hostId) {
    throw new Error("SoAuth: Please run setup first.");
  }

  const auth = generate_auth(SOAUTH.hostId);
  return SOAUTH.sodium.to_hex(auth.publicKey);
}

export const setup = function (options = {}) {
  SOAUTH.secret = options.secret;
  SOAUTH.hostId = options.hostId;
  SOAUTH.hostPublicKey = options.hostPublicKey;

  if (!SOAUTH.secret) {
    throw new Error("SoAuth: Invalid secret format.");
  }

  if (!SOAUTH.hostId) {
    throw new Error("SoAuth: Invalid host id format.");
  }

  if (!SOAUTH.hostPublicKey) {
    throw new Error("SoAuth: Invalid host public key format.");
  }

  SOAUTH.hostPublicKey = SOAUTH.sodium.from_hex(SOAUTH.hostPublicKey);

  console.log('Public key is', get_pubkey());
}

export const encrypt = function (message) {
  if (!SOAUTH.hostId || !SOAUTH.hostPublicKey) {
    throw new Error("SoAuth: Please run setup first.");
  }

  const serialized = serialize_message(message);
  const auth = generate_auth(SOAUTH.hostId);
  const nonce = SOAUTH.sodium.randombytes_buf(SOAUTH.sodium.crypto_box_NONCEBYTES);
  const ciphertext = SOAUTH.sodium.crypto_box_easy(serialized, nonce, SOAUTH.hostPublicKey, auth.privateKey);

  return {
    ciphertext: SOAUTH.sodium.to_hex(ciphertext),
    nonce: SOAUTH.sodium.to_hex(nonce)
  };
}

export const decrypt = function (data) {
  if (!SOAUTH.hostId || !SOAUTH.hostPublicKey) {
    throw new Error("SoAuth: Please run setup first.");
  }

  if (
    typeof data !== 'object'
    || typeof data.ciphertext !== 'string'
    || typeof data.nonce !== 'string'
  ) {
    return false;
  }

  const auth = generate_auth(SOAUTH.hostId);

  data.ciphertext = SOAUTH.sodium.from_hex(data.ciphertext);
  data.nonce = SOAUTH.sodium.from_hex(data.nonce);

  const decrypted = SOAUTH.sodium.crypto_box_open_easy(data.ciphertext, data.nonce, SOAUTH.hostPublicKey, auth.privateKey);

  if (!decrypted) {
    return false;
  }

  const message = SOAUTH.sodium.to_string(decrypted);

  try {
    return JSON.parse(message);
  } catch (err) {
    return message;
  }
}

export default {
  serialize_message, setup, get_pubkey, encrypt, decrypt
}
