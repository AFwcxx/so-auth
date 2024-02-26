"use strict"

const SOAUTH_MAX_STORAGE_HOURS = 12;
const SOAUTH_INTENTIONS = ['register', 'login'];

const SOAUTH = {
  _sodium: false,
  sodium: false,
  fingerprint: false,
  hostId: false,
  hostEndpoint: false,
  hostSignPublicKey: false,
  hostBoxPublicKey: false,
  signKeypair: false,
  boxKeypair: false,
  boxSeed: false,
  token: false,
  expired_callback: false,
}

if (window && window.sodium) {
  SOAUTH._sodium = window.sodium;
}

if (!SOAUTH._sodium) {
  throw new Error("Libsodium not loaded.");
}

function serialize_message (message) {
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

function is_local_storage_available(){
  const test = 'test';

  try {
    localStorage.setItem(test, test);
    localStorage.removeItem(test);

    return true;
  } catch(e) {
    return false;
  }
}

async function prepare_keypairs (credential) {
  if (SOAUTH.sodium === false) {
    throw new Error("Please run setup first.");
  }

  if (typeof credential !== 'object') {
    throw new Error("Invalid credential format. Expecting object.");
  }

  let seedString = "";

  for (let key in credential) {
    if (credential.hasOwnProperty(key)) {
      let hash = await SOAUTH.sodium.crypto_generichash(SOAUTH.sodium.crypto_generichash_BYTES_MAX, key + credential[key]);
      let hex = SOAUTH.sodium.to_hex(hash);
      seedString += hex;
    }
  }

  let seed = await SOAUTH.sodium.crypto_generichash(SOAUTH.sodium.crypto_generichash_BYTES_MAX, seedString + SOAUTH.hostSignPublicKey);
  let signSeed = await SOAUTH.sodium.crypto_generichash(SOAUTH.sodium.crypto_sign_SEEDBYTES, seed);

  SOAUTH.boxSeed = await SOAUTH.sodium.crypto_generichash(SOAUTH.sodium.crypto_box_SEEDBYTES, seed + SOAUTH.sodium.randombytes_random());

  SOAUTH.signKeypair = await SOAUTH.sodium.crypto_sign_seed_keypair(signSeed);
  SOAUTH.boxKeypair = await SOAUTH.sodium.crypto_box_seed_keypair(SOAUTH.boxSeed);
}

async function send_message(message, pathname = "") {
  if (SOAUTH.sodium === false) {
    throw new Error("Please run setup first.");
  }

  if (!SOAUTH.fingerprint) {
    throw new Error("Unable to capture device fingerprint.");
  }

  message = serialize_message(message);

  let url = new URL(SOAUTH.hostEndpoint);
  url.pathname = url.pathname.replace(/\/+$/, "") + pathname;

  let response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'SoAuth-Fingerprint': SOAUTH.fingerprint
    },
    body: message
  });

  response = await response.json();

  if (
    typeof response === 'object'
    && typeof response.message === 'string'
    && response.message.toLowerCase().includes('expired fingerprint')
  ) {
    clear_local_storage();

    if (typeof SOAUTH.expired_callback === 'function') {
      SOAUTH.expired_callback();
    }
  }

  return response;
}

export const setup = async function (options = {}) {
  if (
    !options.hostSignPublicKey
    || !options.hostId
    || !options.hostEndpoint
  ) {
    throw new Error("Host information not specified");
  }

  SOAUTH.hostId = options.hostId;
  SOAUTH.hostSignPublicKey = options.hostSignPublicKey;
  SOAUTH.hostEndpoint = options.hostEndpoint;
  SOAUTH.expired_callback = options.expired_callback;

  await SOAUTH._sodium.ready;
  SOAUTH.sodium = SOAUTH._sodium;

  if (options.webgl && typeof options.webgl === 'function') {
    let w = await options.webgl();
    SOAUTH.fingerprint = w.fingerprint;
  }
}

export const negotiate = async function (intention, credential, pathname, meta = {}) {
  if (SOAUTH.sodium === false) {
    throw new Error("Please run setup first.");
  }

  if (typeof credential !== 'object') {
    throw new Error("Invalid credential format. Expecting object.");
  }

  if (typeof meta !== 'object') {
    throw new Error("Invalid meta format. Expecting object.");
  }

  if (!SOAUTH_INTENTIONS.includes(intention)) {
    throw new Error("Invalid intention.");
  }

  await prepare_keypairs(credential);

  if (
    !SOAUTH.signKeypair.publicKey 
    || !SOAUTH.signKeypair.privateKey 
    || !SOAUTH.boxKeypair.publicKey 
    || !SOAUTH.boxKeypair.privateKey
  ) {
    throw new Error("Invalid keypairs generated.");
  }

  const message = serialize_message({
    intention,
    meta,
    boxPublicKey: SOAUTH.sodium.to_hex(SOAUTH.boxKeypair.publicKey),
    serverSignPublicKey: SOAUTH.hostSignPublicKey
  });

  const signature = await SOAUTH.sodium.crypto_sign(SOAUTH.sodium.from_string(message), SOAUTH.signKeypair.privateKey);

  const signatureHex = SOAUTH.sodium.to_hex(signature);
  const signPublicKeyHex = SOAUTH.sodium.to_hex(SOAUTH.signKeypair.publicKey);

  // seal this
  const signatureMessage = serialize_message({
    signature: signatureHex,
    signPublicKey: signPublicKeyHex
  });

  const sealed = SOAUTH.sodium.crypto_box_seal(signatureMessage, SOAUTH.sodium.from_hex(SOAUTH.hostSignPublicKey));

  const response = await send_message({
    sealed: SOAUTH.sodium.to_hex(sealed),
    hostId: SOAUTH.hostId,
  }, pathname);

  // validate the response
  if (typeof response !== 'object') {
    throw new Error("Invalid negotiation response from host.");
  }

  if (!response.sealed) {
    return false;
  }

  const extracted = await SOAUTH.sodium.crypto_box_seal_open(SOAUTH.sodium.from_hex(response.sealed), SOAUTH.boxKeypair.publicKey, SOAUTH.boxKeypair.privateKey);

  if (!extracted) {
    throw new Error("Unable to extract host's seal.");
  }

  let data;

  try {
    data = JSON.parse(SOAUTH.sodium.to_string(extracted));
  } catch (err) {
    throw new Error("Invalid extracted host seal format.");
  }

  if (
    typeof data.boxPublicKey !== 'string'
    || typeof data.token !== 'string'
    || typeof data.intention !== 'string'
  ) {
    throw new Error("Invalid host data format.");
  }

  if (data.intention !== intention) {
    throw new Error("Invalid intention from host.");
  }

  SOAUTH.hostBoxPublicKey = SOAUTH.sodium.from_hex(data.boxPublicKey);
  SOAUTH.token = data.token;

  return true;
}

export const exchange = async function (message, pathname) {
  if (SOAUTH.sodium === false) {
    throw new Error("Please run setup first.");
  }

  if (
    !SOAUTH.hostBoxPublicKey
    || !SOAUTH.boxKeypair.publicKey 
    || !SOAUTH.boxKeypair.privateKey
  ) {
    throw new Error("Please negotiate with host first.");
  }

  message = serialize_message(message);

  // encrypt
  const nonce = SOAUTH.sodium.randombytes_buf(SOAUTH.sodium.crypto_box_NONCEBYTES);
  const ciphertext = await SOAUTH.sodium.crypto_box_easy(message, nonce, SOAUTH.hostBoxPublicKey, SOAUTH.boxKeypair.privateKey);    

  const response = await send_message({
    ciphertext: SOAUTH.sodium.to_hex(ciphertext),
    nonce: SOAUTH.sodium.to_hex(nonce),
    token: SOAUTH.token
  }, pathname);

  if (
    typeof response !== 'object'
    || typeof response.ciphertext !== 'string'
    || typeof response.nonce !== 'string'
  ) {
    console.log(response);
    throw new Error("Invalid response format from host.");
  }

  // decrypt
  response.ciphertext = SOAUTH.sodium.from_hex(response.ciphertext);
  response.nonce = SOAUTH.sodium.from_hex(response.nonce);

  let decrypted = await SOAUTH.sodium.crypto_box_open_easy(response.ciphertext, response.nonce, SOAUTH.hostBoxPublicKey, SOAUTH.boxKeypair.privateKey);

  if (!decrypted) {
    throw new Error("Unable to decrypt information from host.");
  }

  try {
    return JSON.parse(SOAUTH.sodium.to_string(decrypted));
  } catch (err) {
    return SOAUTH.sodium.to_string(decrypted);
  }
}

const keygen = async function (secret) {
  const nonce = SOAUTH.sodium.randombytes_buf(SOAUTH.sodium.crypto_box_NONCEBYTES);
  const key = await SOAUTH.sodium.crypto_generichash(SOAUTH.sodium.crypto_secretbox_KEYBYTES, secret);
  return { key, nonce };
}

export const save = async function (secret, manual = false) {
  if (!is_local_storage_available()) {
    manual = true;
  }

  let store = {
    hostId: SOAUTH.hostId,
    hostEndpoint: SOAUTH.hostEndpoint,
    hostBoxPublicKey: SOAUTH.hostBoxPublicKey,
    boxSeed: SOAUTH.boxSeed,
    token: SOAUTH.token,
    ts: new Date()
  };

  if (SOAUTH.hostBoxPublicKey && typeof SOAUTH.hostBoxPublicKey !== 'string') {
    store.hostBoxPublicKey = SOAUTH.sodium.to_hex(SOAUTH.hostBoxPublicKey);
  }

  if (SOAUTH.boxSeed && typeof SOAUTH.boxSeed !== 'string') {
    store.boxSeed = SOAUTH.sodium.to_hex(SOAUTH.boxSeed);
  }

  const message = JSON.stringify(store);
  const { nonce, key } = await keygen(secret);

  const ciphertext = SOAUTH.sodium.crypto_secretbox_easy(SOAUTH.sodium.from_string(message), nonce, key);
  const ciphertextHex = SOAUTH.sodium.to_hex(ciphertext);
  const nonceHex = SOAUTH.sodium.to_hex(nonce);
  const boxed = ciphertextHex + "," + nonceHex;

  if (manual) {
    return boxed;
  } else {
    localStorage.setItem('soauth-' + SOAUTH.hostSignPublicKey, boxed);
  }
}

export const load = async function (secret, options = {}, data = false) {
  if (!options.hostSignPublicKey) {
    throw new Error("Expecting host signature public key in options");
  }

  let useLocalStorage = false;

  if (data === false && is_local_storage_available()) {
    useLocalStorage = true;
    data = localStorage.getItem('soauth-' + options.hostSignPublicKey);

    if (!data) {
      return false;
    }

    const splitBoxed = data.split(",");
    const ciphertextHex = splitBoxed[0];
    const ciphertext = SOAUTH.sodium.from_hex(ciphertextHex);
    const nonceHex = splitBoxed[1];
    const nonce = SOAUTH.sodium.from_hex(nonceHex);
    const { key } = await keygen(secret);

    data = await SOAUTH.sodium.crypto_secretbox_open_easy(ciphertext, nonce, key);
    data = JSON.parse(SOAUTH.sodium.to_string(data));
  }

  if (
    typeof data !== 'object'
    || typeof data.hostId !== 'string'
    || typeof data.hostEndpoint !== 'string'
    || typeof data.hostBoxPublicKey !== 'string'
    || typeof data.boxSeed !== 'string'
    || typeof data.token !== 'string'
    || typeof data.ts !== 'string'
  ) {
    return false;
  }

  SOAUTH.hostId = data.hostId;
  SOAUTH.hostEndpoint = data.hostEndpoint;
  SOAUTH.hostSignPublicKey = options.hostSignPublicKey;
  SOAUTH.hostBoxPublicKey = SOAUTH.sodium.from_hex(data.hostBoxPublicKey);
  SOAUTH.boxSeed = SOAUTH.sodium.from_hex(data.boxSeed);
  SOAUTH.boxKeypair = SOAUTH.sodium.crypto_box_seed_keypair(SOAUTH.boxSeed);
  SOAUTH.token = data.token;
  SOAUTH.expired_callback = options.expired_callback;

  if (useLocalStorage) {
    let timestamp = Math.round(new Date().getTime() / 1000);
    timestamp = timestamp - (SOAUTH_MAX_STORAGE_HOURS * 3600);
    let isPast = data.ts >= new Date(timestamp * 1000).getTime();

    if (isPast) {
      clear_local_storage();

      if (typeof SOAUTH.expired_callback === 'function') {
        SOAUTH.expired_callback();
      } else {
        return false;
      }
    }
  }

  await SOAUTH._sodium.ready;
  SOAUTH.sodium = SOAUTH._sodium;

  if (options.webgl && typeof options.webgl === 'function') {
    let w = await options.webgl();
    SOAUTH.fingerprint = w.fingerprint;
  }

  return true;
}

export const clear_local_storage = function () {
  if (is_local_storage_available()) {
    let stored = localStorage.getItem('soauth-' + SOAUTH.hostSignPublicKey);

    if (stored) {
      localStorage.clear();
    }
  }
}

export default {
  setup, negotiate, exchange, save, load, clear_local_storage
}
