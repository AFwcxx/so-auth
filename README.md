# Sodium base authentication

```sh
 ____          _         _   _     
/ ___|  ___   / \  _   _| |_| |__  
\___ \ / _ \ / _ \| | | | __| '_ \ 
 ___) | (_) / ___ \ |_| | |_| | | |
|____/ \___/_/   \_\__,_|\__|_| |_|
```

This is a NodeJS + Express demo server with full privacy and secure communication.
The demo only cover the authentication aspect.
Users and permissions are not covered in this demo but can be implemented easily.

## Concept

1. The clients know the public identity of the server.
2. The server should never store any client private credentials.

There are 3 main keypoints:

- **Signing keys:** Deterministic and not stored anywhere. Used for identity. Sender sign and ecnrypt a message with private key and obtain a signature. Recipient validate the signature and decrypt content with sender public key. Similar to RSA without signature. [Reference](https://libsodium.gitbook.io/doc/public-key_cryptography/public-key_signatures)
- **Box keys:** Random on every negotation. Used for encrypted communications. Optional to store in local storage for persistent. Sender encrypt message with its private key, recipient's public key and a nonce. Recipient decrypt message with sender's public key, it's own private key and the nonce used by sender. More secure than RSA. [Reference](https://libsodium.gitbook.io/doc/public-key_cryptography/authenticated_encryption)
- **Token:** Random on every negotation. Used for sessions to retrieve private
static files only.

## Flow

|  CLIENT   | MAN IN THE MIDDLE |   SERVER  |
| ------------- | ------------- |------------- |
|  |  | Generate Signing key pairs and share the Signing public key to all clients. |
| Has the server Signing public key. <br />Generate deterministic seed from inputs for Signing key pairs. <br />Generate random seed for Box key pairs and store in local storage.<br />Create a message that consists of it's own Box public key.<br />Sign the message with it's own Signing private key and send the signature and Signing public key as negotiation. | Has the client signature, Signing public key and Box public key (if decrypt with the client's Signing public key).  |  |
|  |  | Receives the negotation request, validate the signature and Signing public key.<br />If valid, generate it's own Box key pairs and random Token.  <br />Create a message that consists of it's own Box public key and random Token.<br />Sign the message with own Signing private key and reply to the client with only the signature. |
| Receives the signature, use the server public key that it already has to validate whether the signature is really from the server. If valid, store the server Box public key locally | Has the server signature, server's Box public key (if decrypt with server's Signing public key).  <br /><br />Has the client Token.  |  |
| Negotation ends. Communication begins. |
| Use it's own Box private key and server Box public key to encrypt message.  <br />Send the ciphertext, nonce and Token  |  | Use the Token received to retrieve client Box public key and try decrypt it with it's own Box private key.  |
| | **In total, it may hold:**<br/><br />The client's Signing public key, Box public key, signature, and Token<br /><br />The server's Box pubc key and signature | |

The Man in the Middle:

- Replaying the client signing process with it's own signature to provide it's own
Box public key will only become a new identity since it cannot provide the
client's Signing public key (identity) and have a valid signature.
- Replaying the signing process as the server will only generate invalid
signature when the client validates it.
- Passing the client's Token with it's own ciphertext and nonce
(using it's own Box key pairs) in the communication will only point the server
to retrieve the invalid or non-exist public key and will not able to decrypt the ciphertext.
- Since the Token lifetime is until the next signing process, Tokens
should NEVER be used to retrieve sensitive information.
Only static files such as javascript, json, stylesheet or html in private scope. 
Useful to isolate contents that should only be retrievable post authenticated.

About the Persistent mode:

- Client uses local storage (or any secured storage method) to store only the Box key pairs.
Never the signing key pairs.
- Box key pairs lifetime is until the next signing process or
when the local storage is cleared.
- If the local storage is compromised or Box key pairs is copied,
logout or re-negotiate.
- <b>DO NOT</b> store Signing private key as that is the client identity.

## Specifications

### Demo File structure

This demo uses Bootstrap, Vue and MongoDB to complete the tech stack.
You may use anything you wish but this demo is sufficient by itself to be
customized and add your own features.

The files and folders in the structure below is an example but SoAuth is expecting
the `private` folder, used specifically to allow private static files
accessible only by token holders.

```
├── bin
| └── www : NodeJS executable file
|
├── configs
| └── mongodb.json : MongoDB server and database config file
| └── so-auth.json : SoAuth Server-to-Server config file
|
├── middlewares
| └── so-auth.js : SoAuth middleware file
|
├── models
| └── access.js : Handler that manage SoAuth clients' storage data and GridFS upload. MongoDB in this case.
|
├── modules
| └── mongodb.js : MongoDB module
| └── so-auth.js : SoAuth Server-to-Server module
| └── tool.js : Misc module (JSON string checker and http/https)
|
├── private
| └── * : Everything that resides here requires Token to access.
|
├── public
| └── * : Everything that resides here are for everyone to access
|
├── routes
| └── * : Everything that resides here handle routes
|
├── views
| └── * : Everything that resides here handle views.  This demo uses Mustache as template engine.
|
├── .gitignore
├── README.md
├── app.js : Express application file where middleware resides.
└── package.json 
```

### Using SoAuth middleware

```js
// app.js

var SoAuth = require('./middlewares/so-auth');
app.use(SoAuth({
  secret: 'super-secure-secret',
  handler: require('./models/access'),
  servingHostIds: ['hostId_1', 'hostId_2']
}));

/*
handler: 
- An object that manage SoAuth clients data, it can also be used as a "bridge"
or callbacks to other objects or functions.
- This can be anything really for as long as the requirement is fulfilled, refer
next section.

servingHostIds:
- Allow multiple platform to connect using the same Signing key pairs but
dedicated Box key pairs within the same database.
- Useful to allow the same user credential to login but with unique encryption

Note: When the server starts, it will display the signing public key in the console.
*/
```

#### Handler requirements

The handler allows you to scale SoAuth to whatever you wish,
beside storing the client's metadata and public keys.

Example of additional useful features to have:

- Creating an OTP procedure
- Detect if the client is accessed on different device by using agent information
- Create reference between your user model and the `signPublicKey`

```js
// The meta parameter below is where you can use information sent from the client such as registration data - firstname, lastname, email, username and etc.  Do note that this does not make your database private anymore unless it is encyrpted or hashed from the client side.
// By default meta will be an empty object

Promise bool function create(Object params, Router req, Router, res, Router next)
  String params.boxPublicKey
  String params.signPublicKey
  String params.token
  String params.fingerprint
  Object params.meta

Promise bool function update(Object params, Router req, Router, res, Router next)
  String params.boxPublicKey
  String params.token
  String params.fingerprint
  Object params.meta

Promise Object function findOne(Object params, Router req, Router, res, Router next)
  Object params.message // only in negotation phase
  String params.signPublicKey
  or
  String params.token

[Optional] Express.Router Content function mediaFetchController(Object req,
Object res, Object next)
// req, res and next is the Express middleware/router variables. This function does not return anything, but pipe the output of the GridFS chunks to the res object
```

### Using SoAuth browser

```html
<script src="/javascripts/so-auth.js"></script>
<script>
var SoAuth = new SoAuth({
  hostId: 'hostId_1',
  hostSignPublicKey: 'server-signing-public-key',
  endpoint: 'http://localhost:3000/',
  enableFingerprint: true // Optional - Use WebGL
});
</script>

// This is how to retrieve private file using token
<link href="/private/stylesheets/verified.css?soauth={{token}}" rel="stylesheet">
```

#### WebGL Fingerprint

If you noticed, the handler and browser section above mentioned fingerprint.
The fingerprint is a hash of the client device user-agent and client device
graphical capabilities. User-agent as a sole unique device identifier is
insufficient as it only has the CPU make model, browser type, and version.
However, different machines would not have similar graphical rendering
criteria, and using this information helps generate even more unique device id.

### Signing example

```js
// Client:

// The credential can be anything, just remember that it is used to create a deterministic signing key
// Changing it's structure, format or data will create different key pairs
// So you'll have to think ahead for your use-case

let credential = {
  email: 'jondoe@email.com',
  password: 'super-secure-password'
};

// Optional 
// - Only if you require to handle or store user details for your project
// - This meta data is captured in your own handler file mentioned in the
previous section

let meta = {
  email: 'jondoe@email.com',
  firstname: 'Jon',
  lastname: 'Doe'
};

SoAuth.negotiate(credential, 'login', meta).then(response => {
  if (response && response.token !== undefined) {
    SoAuth.save();
    window.location.replace("?soauth=" + response.token);
  } else {
    alert('Invalid login!');
  }
});

// Server:
// Nothing needs to be done on the NodeJS side.
// Middleware is handling the Signing part automatically
```

### Communication example

```js
// Client:

SoAuth.load().then(good => {
  if (good === false) {
    window.location.replace("/");
  }
});

// If the exchange is use multiple times in parallel, it might conflict on the current stored object parameters.
// Use `clone` to clone the SoAuth object.

SoAuth.clone().exchange('How many cups of sugar does it takes to get to the
moon?', '/secret').then(response => {
  if (response) {
    alert('Server said: ' + response);
  } else {
    alert('Communication compromised!');
    location.reload();
  }
});

// Server:
// The decryption is done automatically and can be accessed via res.locals.decrypted
// res.locals.SoAuth, which is the SoAuth object is also available
throughout the request cycle. This is used for encrypting data.

app.post("/secret", function(req, res, next) {
  if (
    res.locals.decrypted !== undefined 
    && res.locals.SoAuth !== undefined
  ) {
    res.locals.SoAuth.encrypt(`Your question is: ${res.locals.decrypted}\nMy answer is: 3 and a half.`).then(encrypted => {
      res.json(encrypted);
    });
  } else {
    next();
  }
});
```

### Server-to-Server example

```js
// Generating a server public key box

const _SoAuth = require('/path/to/module/so-auth').SoAuth;

let SoAuth = new _SoAuth('super-secret-passphrase');

SoAuth.setup().then(() => {
  let boxPublicKey = SoAuth.sodium.to_hex(SoAuth.boxKeypair.publicKey);
  console.log('SoAuth S2S Box Public Key: ' + boxPublicKey)
});

// When the server starts, it will display the box public key in the console.
```

```js
// Communication topology

              /---> Server A
Server C <---X
              \---> Server B

```

```js
// Server A has the public key for Server C

let config = {
  "passphrase": "i-am-server-a",
  "cliqueBoxPublicKey": {
    "server-c": "soauth-public-key-box-server-c",
  }
}

// Send encrypted data

const _SoAuth = require('/path/to/module/so-auth').SoAuth;

let SoAuth = new _SoAuth(config.passphrase);

SoAuth.setup().then(() => {
  SoAuth.cliqueBoxPublicKey = SoAuth.sodium.from_hex(config.cliqueBoxPublicKey['server-c']);

  SoAuth.encrypt({ message: 'Message from Server A' }).then(encrypted => {
    // refer tool in so-auth/modules/tool.js
    tool.https(endpoint, {
      data: encrypted,
      name: 'server-a'
    }).then(result => {
      if (result.ciphertext) {
        SoAuth.decrypt(result).then(decrypted => {
          console.log(decrypted);
        });
      }
    });
  });
});
```

```js
// Server B has the public key for Server C

let config = {
  "passphrase": "i-am-server-b",
  "cliqueBoxPublicKey": {
    "server-c": "soauth-public-key-box-server-c",
  }
}


// Send encrypted data

const _SoAuth = require('/path/to/module/so-auth').SoAuth;

let SoAuth = new _SoAuth(config.passphrase);

SoAuth.setup().then(() => {
  SoAuth.cliqueBoxPublicKey = SoAuth.sodium.from_hex(config.cliqueBoxPublicKey['server-c']);

  SoAuth.encrypt({ message: 'Message from Server B' }).then(encrypted => {
    // refer tool in so-auth/modules/tool.js
    tool.https(endpoint, {
      data: encrypted,
      name: 'server-b'
    }).then(result => {
      if (result.ciphertext) {
        SoAuth.decrypt(result).then(decrypted => {
          console.log(decrypted);
        });
      }
    });
  });
});
```

```js
// Server C has the public key for Server A and B

let config = {
  "passphrase": "i-am-server-c",
  "cliqueBoxPublicKey": {
    "server-a": "soauth-public-key-box-server-a",
    "server-b": "soauth-public-key-box-server-b"
  }
}

// Response to server accordingly

const _SoAuth = require('/path/to/module/so-auth').SoAuth;

let SoAuth = new _SoAuth(config.passphrase);

SoAuth.setup().then(() => {
  // req.body.name is the body request data in Express
  SoAuth.cliqueBoxPublicKey = SoAuth.sodium.from_hex(config.cliqueBoxPublicKey[req.body.name]);

  SoAuth.decrypt(req.body.data).then(decrypted => {
    if (typeof decrypted.message === 'string') {
      decrypted.message = decrypted.message.replace('Message from ', '');

      // Send encrypted data
      SoAuth.encrypt({ message: `Hello ${decrypted.message}, message received..` }).then(encypted => {
        res.send(encypted);
      });
    }
  });
});
```

## Build your own

### SoAuth components

- [Express Middleware](https://github.com/AFwcxx/so-auth/blob/master/middlewares/so-auth.js)
- [Browser](https://github.com/AFwcxx/so-auth/blob/master/public/javascripts/so-auth.js)
- [Server-to-Server](https://github.com/AFwcxx/so-auth/blob/master/modules/so-auth.js)

### Dependencies

- [Libsodium](https://github.com/jedisct1/libsodium.js)
  - [NPM](https://www.npmjs.com/package/libsodium-wrappers)
  - [Browser](https://github.com/jedisct1/libsodium.js/tree/master/dist/browsers)
