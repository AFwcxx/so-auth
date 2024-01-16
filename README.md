# Sodium based authentication

```sh
 ____          _         _   _     
/ ___|  ___   / \  _   _| |_| |__  
\___ \ / _ \ / _ \| | | | __| '_ \ 
 ___) | (_) / ___ \ |_| | |_| | | |
|____/ \___/_/   \_\__,_|\__|_| |_|
```

A Sodium based authentication framework.\
Set it up either as a centralised service that allows single host or multiple hosts management.\
Where the clients can be either human (browser) or machine (computer).\
Built with the assumption that there is a man-in-the-middle.\
Easy. Secure. Private.

## Communication topology

> No issue with multiple layer of proxies.

```js
          /---> Client Browser(s)
Host <---X                                       /---> Proxy <---> Client Machine
          \---> Client Machine, also a Host <---X
                                                 \---> Client Machine
```

## Demo

### As host
```js
$ npm run host-test
```

### As human on browser
```js
$ npm run browser-test
```

### As machine
```js
$ npm run machine-test
```

## Usage

### Host example
```js
import soauth from '../dist/host/soauth.mjs';
import express from 'express';

soauth.setup({
  secret: 'secret',
  serves: ['test-host-id']
});

const app = express();
app.use(express.json());

app.post('/negotiate', async (req, res, next) => {
  const result = soauth.negotiate(req.body);
  const fingerprint = req.headers['soauth-fingerprint'];
  const intention = result.intention;

  if (soauth.check_store_data(soauth.SOAUTH_HUMAN_STOREDATA, result.data)) {
    if (intention === 'login') {
      // process login data
    } else if (intention === 'register') {
      // process register data
    }
  }

  delete result.data;
  return res.json(result);
});

app.post('/human', async (req, res, next) => {
  const token = req.body.token;
  const data = req.body.data;
  const { hostId, boxPublicKey } = get_from_human_database(token);
  const result = soauth.decrypt(data, hostId, boxPublicKey);
  return res.json(soauth.encrypt('Hello human', hostId, boxPublicKey));
});

app.post('/machine', async (req, res, next) => {
  const data = req.body.data;
  const fingerprint = req.headers['soauth-fingerprint'];
  const { hostId, publicKey } = get_from_machine_database(fingerprint);
  const result = soauth.decrypt(data, hostId, publicKey);
  return res.json(soauth.encrypt('Hello machine', hostId, publicKey));
});
```

### Human example (browser)
```js
import { webgl } from '../dist/human/webgl.js'
import soauth from '../dist/human/soauth.js'

const hostSignPublicKey = "94ab003eb7cb7777c41b34a987863a47c5898516ba2a0e8df835adbc23fdd826";
const hostId = "test-host-id";
const hostEndpoint = "http://127.0.0.1:3000";

await soauth.setup({
  hostId, hostSignPublicKey, hostEndpoint, webgl,
  expired_callback: function () {
    window.location.reload();
  }
});

const credential = {
  username: "malique";
  password: "786";
  bio: "https://open.spotify.com/artist/4ZsSCvTFG2Krx3AyQ6vHzk?si=B0YV5WH3SMSl-tcGgcaY7w";
};

const meta = {
  email: "optional@email.com"
};

const response = await soauth.negotiate('login', credential, '/negotiate', meta });
if (response) {
  const hostReply = await soauth.exchange("Hello host", '/human');
}
```

### Machine example
```js
import soauth from '../dist/machine/soauth.mjs';
import http from 'http';

soauth.setup({
  secret: 'secret',
  hostId: 'test-host-id',
  hostPublicKey: 'c6133c4ccba8a0643af197334ca01597879363d6371f221bcba3e0a970958a6e'
});

const encrypted = soauth.encrypt('Hello host');
const postData = JSON.stringify(encrypted);

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/machine',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData),
    'SoAuth-Fingerprint': 'test-machine'
  },
};

const req = http.request(options, (res) => {
  res.setEncoding('utf8');
  let data = "";
  res.on('data', (chunk) => { data += chunk });
  res.on('end', () => {
    data = JSON.parse(data);
    const decrypted = soauth.decrypt(data);
  });
});
req.write(postData);
req.end();
```

## Build your own

### SoAuth components

- [Host](https://github.com/AFwcxx/so-auth/tree/main/dist/host)
- [Human](https://github.com/AFwcxx/so-auth/tree/main/dist/human)
- [Machine](https://github.com/AFwcxx/so-auth/tree/main/dist/machine)


## Concept

1. The clients know the public identity of the host.
2. The host should never store any client private credentials.

Main keypoints:

- **Signing keys:** Deterministic. Used for human identity. Password not required, as long as the human memory is intact.
- **Box keys:** Random on every negotation. Used for encrypted communications.
- **Token:** Random on every negotation. Used for sessions to retrieve private readonly data.
- **Fingerprint:** Unique hash of the client resource information.

## Flow

|  CLIENT   | MAN IN THE MIDDLE |   HOST  |
| ------------- | ------------- |------------- |
|  |  | - Generate Signing key pairs and share the Signing public key to respective clients. |
| - Has the host Signing public key. <br />- Generate Signing key pairs and Box key pairs.<br />- Create a message that consists of the Box public key.<br />- Sign the message with Signing private key.<br />-Seal the message <br />- Send the signature and Signing public key as negotiation. | Has nothing useful here. |  |
|  |  | - Receives the negotation request, unseal and validate the signature and Signing public key.<br />- If valid, generate Box key pairs and Token.<br />- Create a message that consists of the Box public key and Token.<br />- Seal the message with client Box private key and respond to the client with only the seal. |
| Receives the negotiation respond, unseal and keep the host Box public key. | Has nothing useful here.  |  |
| Negotation ends. Communication begins. |
| - Use Box private key and host's Box public key to encrypt message.<br />- Send the ciphertext, nonce and Token.|  | Use the Token session to obtain client's Box public key and decrypt it with host own Box private key.|
| | **In total, it may hold:**<br/><br />- Nothing useful | |

The Man in the Middle:

- Replaying the client signing process with it's own signature to provide it's own
Box public key will only become a new identity since it cannot provide the
client's Signing public key (identity) and have a valid signature.
- Replaying the signing process as the host will only generate invalid
signature when the client validates it.
- Passing the client's Token with it's own ciphertext and nonce
(using it's own Box key pairs) in the communication will only point the host
to retrieve the invalid or non-exist public key and will not able to decrypt the ciphertext.
- Since the Token lifetime remains alive until the next negotation process, Tokens
should NEVER be used to retrieve sensitive information. Useful for static files such as javascript, json, stylesheet or html in private scope. 
Useful to isolate contents that should only be retrievable after authenticated.

About the Persistent mode:

- Client uses local storage (or any secured storage method) to store only the Box key pairs.
Never the signing key pairs.
- Box key pairs lifetime is until the next signing process or
when the local storage is cleared.
- If the local storage is compromised or Box key pairs is copied,
destroy the client Box public key or re-negotiate.
- <b>DO NOT</b> store Signing private key as that is the client identity.

## Specifications

### File structure

```
├── dist
| └── host : Source file to use as host
| └── human : Source file to use as client human on browser
| └── machine : Source file to use as client machine on computer
|
├── host-test : Test as host
|
├── browser-test : Test as client human on browser
|
└── machine-test : Test as client machine on a computer
```

### WebGL Fingerprint

The fingerprint is a hash of the client device user-agent and client device
graphical capabilities. User-agent as a sole unique device identifier is
insufficient as it only has the CPU make model, browser type, and version.
However, different machines would not have similar graphical rendering
criteria, and using this information helps generate even more unique device id.

[WebGL Repository](https://github.com/AFwcxx/webgl-detect)


### Dependencies

- [Libsodium](https://github.com/jedisct1/libsodium.js)
  - [NPM](https://www.npmjs.com/package/libsodium-wrappers)
  - [Browser](https://github.com/jedisct1/libsodium.js/tree/master/dist/browsers)
