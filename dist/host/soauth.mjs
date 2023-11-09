"use strict";

import _sodium from 'libsodium-wrappers';

await _sodium.ready;

const SOAUTH_INTENTIONS = ['register', 'login'];

const SOAUTH = {
  sodium: _sodium,
  secret: false,
  serves: false,
}

function generate_sign(hostId) {
  const seed = SOAUTH.sodium.crypto_generichash(SOAUTH.sodium.crypto_generichash_BYTES_MAX, SOAUTH.secret + hostId);
  const signSeed = SOAUTH.sodium.crypto_generichash(SOAUTH.sodium.crypto_sign_SEEDBYTES, seed);

  return SOAUTH.sodium.crypto_sign_seed_keypair(signSeed);
}

function generate_auth(hostId, boxPublicKey) {
  if (typeof boxPublicKey === 'object') {
    boxPublicKey = SOAUTH.sodium.to_hex(boxPublicKey);
  } 

  const seed = SOAUTH.sodium.crypto_generichash(SOAUTH.sodium.crypto_generichash_BYTES_MAX, SOAUTH.secret + hostId + boxPublicKey);
  const boxSeed = SOAUTH.sodium.crypto_generichash(SOAUTH.sodium.crypto_box_SEEDBYTES, seed);
  const boxKeypair = SOAUTH.sodium.crypto_box_seed_keypair(boxSeed);

  boxKeypair.token = SOAUTH.sodium.crypto_generichash(SOAUTH.sodium.crypto_generichash_BYTES_MAX, SOAUTH.sodium.to_hex(boxKeypair.publicKey) + hostId);

  return boxKeypair;
}

export const setup = function (options = {}) {
  SOAUTH.secret = options.secret;
  SOAUTH.serves = options.serves;

  if (!SOAUTH.secret) {
    throw new Error("SoAuth: Invalid secret format.");
  }

  if (typeof SOAUTH.serves !== 'object' || !Array.isArray(SOAUTH.serves) || SOAUTH.serves.length === 0) {
    throw new Error("SoAuth: Invalid serves format.");
  }

  for (let i = 0; i < SOAUTH.serves.length; i++) {
    const sign = generate_sign(SOAUTH.serves[i]);
    console.log('Signature public key for ' + SOAUTH.serves[i] + ' is', SOAUTH.sodium.to_hex(sign.publicKey));
  }
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

export const negotiate = function (request) {
  const response = {
    success: false,
    message: "Invalid request",
    signature: null,
    data: null
  };

  try {
    if (
      typeof request !== 'object'
      || typeof request.signature !== 'string'
      || typeof request.signPublicKey !== 'string'
    ) {
      throw new Error('Invalid request format.');
    }

    request.signature = SOAUTH.sodium.from_hex(request.signature);
    request.signPublicKey = SOAUTH.sodium.from_hex(request.signPublicKey);

    const extracted = SOAUTH.sodium.crypto_sign_open(request.signature, request.signPublicKey);

    if (!extracted) {
      throw new Error('Invalid request signature.');
    }

    const message = JSON.parse(SOAUTH.sodium.to_string(extracted));

    if (
      typeof message !== 'object'
      || typeof message.hostId !== 'string' 
      || typeof message.intention !== 'string' 
      || typeof message.boxPublicKey !== 'string'
      || typeof message.serverSignPublicKey !== 'string' 
    ) {
      throw new Error("Invalid signed message format.");
    }

    if (!SOAUTH_INTENTIONS.includes(message.intention)) {
      throw new Error("Invalid intention.");
    }

    if (!SOAUTH.serves.includes(message.hostId)) {
      throw new Error("Invalid host id.");
    }

    const sign = generate_sign(message.hostId);

    if (message.serverSignPublicKey !== SOAUTH.sodium.to_hex(sign.publicKey)) {
      throw new Error("Invalid host signature requested.");
    }

    const auth = generate_auth(message.hostId, message.boxPublicKey);

    const serialized = serialize_message({
      intention: message.intention,
      boxPublicKey: SOAUTH.sodium.to_hex(auth.publicKey),
      token: SOAUTH.sodium.to_hex(auth.token)
    });

    const signature = SOAUTH.sodium.crypto_sign(SOAUTH.sodium.from_string(serialized), sign.privateKey);

    response.data = {
      intention: message.intention,
      hostId: message.hostId,
      boxPublicKey: message.boxPublicKey,
      signPublicKey: SOAUTH.sodium.to_hex(request.signPublicKey),
      meta: message.meta,
      token: SOAUTH.sodium.to_hex(auth.token)
    };
    response.signature = SOAUTH.sodium.to_hex(signature);
  } catch (err) {
    response.message = err.message || err;
    return response;
  }

  response.success = true;
  response.message = 'OK';

  return response;
}

export const verify_token = function (hostId, boxPublicKey, token) {
  const auth = generate_auth(hostId, boxPublicKey);

  return SOAUTH.sodium.to_hex(auth.token) === token;
}

export const SOAUTH_HUMAN_STOREDATA = {
  hostId: {
    type: 'string',
    index: true
  },
  signPublicKey: {
    type: 'string',
    index: true
  },
  boxPublicKey: {
    type: 'string',
    index: false
  },
  meta: {
    type: 'object',
    index: false
  },
  token: {
    type: 'string',
    index: false
  },
  fingerprint: {
    type: 'string',
    index: false
  }
}

export const SOAUTH_MACHINE_STOREDATA = {
  hostId: {
    type: 'string',
    index: true
  },
  fingerprint: {
    type: 'string',
    index: true
  },
  publicKey: {
    type: 'string',
    index: false
  }
}

export const check_store_data = function (SOAUTH_STOREDATA, data) {
  if (typeof data !== 'object') {
    throw new Error('SoAuth: Invalid store data format.');
  }

  if (typeof SOAUTH_STOREDATA !== 'object') {
    throw new Error('SoAuth: Invalid SOAUTH_STOREDATA data format.');
  }

  let pass = true;

  for (let k in SOAUTH_STOREDATA) {
    if (SOAUTH_STOREDATA.hasOwnProperty(k)) {
      if (typeof data[k] !== SOAUTH_STOREDATA[k].type) {
        pass = false;
        console.log(`SoAuth: Missing or invalid ${k} format in store data.`)
        break;
      }
    }
  }

  return pass;
}

export const encrypt = function (message, hostId, boxPublicKey) {
  if (typeof boxPublicKey !== 'string') {
    throw new Error("Expecting boxPublicKey to be string.");
  }

  boxPublicKey = SOAUTH.sodium.from_hex(boxPublicKey);

  const serialized = serialize_message(message);
  const auth = generate_auth(hostId, boxPublicKey);
  const nonce = SOAUTH.sodium.randombytes_buf(SOAUTH.sodium.crypto_box_NONCEBYTES);
  const ciphertext = SOAUTH.sodium.crypto_box_easy(serialized, nonce, boxPublicKey, auth.privateKey);

  return {
    ciphertext: SOAUTH.sodium.to_hex(ciphertext),
    nonce: SOAUTH.sodium.to_hex(nonce)
  };
}

export const decrypt = function (data, hostId, boxPublicKey) {
  if (
    typeof data !== 'object'
    || typeof data.ciphertext !== 'string'
    || typeof data.nonce !== 'string'
  ) {
    return false;
  }

  if (typeof boxPublicKey !== 'string') {
    throw new Error("Expecting boxPublicKey to be string.");
  }

  if (typeof data.token === 'string') {
    if (!verify_token(hostId, boxPublicKey, data.token)) {
      return false;
    }
  }

  const auth = generate_auth(hostId, boxPublicKey);

  data.ciphertext = SOAUTH.sodium.from_hex(data.ciphertext);
  data.nonce = SOAUTH.sodium.from_hex(data.nonce);
  boxPublicKey = SOAUTH.sodium.from_hex(boxPublicKey);

  const decrypted = SOAUTH.sodium.crypto_box_open_easy(data.ciphertext, data.nonce, boxPublicKey, auth.privateKey);

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

export const get_box_pubkey = function (hostId, boxPublicKey) {
  const auth = generate_auth(hostId, boxPublicKey);

  return SOAUTH.sodium.to_hex(auth.publicKey);
}

export default {
  setup, serialize_message, negotiate, verify_token, SOAUTH_HUMAN_STOREDATA, SOAUTH_MACHINE_STOREDATA, check_store_data, encrypt, decrypt, get_box_pubkey
}
