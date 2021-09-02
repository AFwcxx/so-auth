# Sodium base authentication
```
 ____          _         _   _     
/ ___|  ___   / \  _   _| |_| |__  
\___ \ / _ \ / _ \| | | | __| '_ \ 
 ___) | (_) / ___ \ |_| | |_| | | |
|____/ \___/_/   \_\__,_|\__|_| |_|
```

This is a demo on NodeJS (express) server with full privacy and secure communication.
It only covers the authentication aspects. User and permissions are separate scope but can easily be integrated with.


## Concept
1. The client already know the public identity of the server.
2. The server should never store any client private credentials.

There are 3 main keypoints:
- **Signing keys:** Deterministic and never stored anywhere. Used as identity.
- **Box keys:** Random on every negotation. Used as encrypted communication. Optional to stored in local storage for persistent.
- **Token:** Random on every negotation. Used to retrieve private static files and as a session only.


## Flow
|  CLIENT   | MAN IN THE MIDDLE |   SERVER  |
| ------------- | ------------- |------------- |
|  |  | Generate signing key pairs and share the signing public key to all clients. |
| Has the server signing public key. <br />Generate deterministic seed from inputs for signing key pairs, not stored. <br />Generate random seed for box key pairs and store locally.<br />Create a message that consists of it's box public key.<br />Sign the message with it's own signing private key and send the signature and signing public key as negotiation. | Has the client signature, signing public key and box public key  |  |
|  |  | Receives the negotation request, validate the signature and signing public key.<br />If valid, generate it's own box key pairs and random token.<br />Create a message that consists of it's own box public key and random token.<br />Sign the message with own signing private key and reply to the client with only the signature. |
| Receives the signature, use the server public key that it already has to validate whether the signature is really from the source it trusts. If valid, store the server box public key locally | Has the server signature and box public key. <br /><br />Has the client token.  |  |
| Negotation ends. Communication begins. |
| Use it's own box private key and server box public key to encrypt message.<br />Send the ciphertext, nonce and token  |  | Use the token received to retrieve client box public key and try decrypt it with it's own box private key  |
| | **In total, it holds:**<br/><br />The client's signing public key, box public key and token<br /><br />The server's box public key | |

The Man in the Middle:
- Replaying the signing process with it's own signature to provide it's own box public key will only become a new identity since it cannot provide the client's signing public key (identity) and have a valid signature.
- Replaying the signing process as the server will only generate invalid signature when the client validates it.
- Passing the client's token with it's own ciphertext and nonce (using it's own box key pairs) in the communication will only make the server to retrieve the access data but will not able to decrypt the ciphertext with the access data box public key.
- Since the token lifetime is until the next signing process, token should NEVER be used to retrieve sensitive information. Only static files such as javascript, stylesheet or html in private scope.

Persistent mode:
- Client uses local storage to store the box key pairs. Never the signing key pairs.
- Box key pairs lifetime is until the next signing process or when the local storage is cleared.
- If the local storage is compromised and box key pairs is stolen, logout or re-negotiate.

## Specifications

### Demo File structure

You don't really need Bootstrap, Vue or MongoDB as shown by the demo. It is just to illustrate how to perform integration with different tech stack.

The structure below is an example except for the `private` folder which is used specifically by SoAuth to allow private static files accessible exclusively by token holders.

```
├── bin
| └── www : NodeJS executable file
|
├── configs
| └── mongodb.json : MongoDB server and database config file
| └── so-auth.json : SoAuth Server-to-Server config file
|
├── middlewares
| └── so-auth.js : *SoAuth middleware file
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
| └── * : Everything that resides here requires token to access.
|
├── public
| └── * : Everything that resides here are for everyone to access
|
├── routes
| └── * : Everything that resides here handle routes
|
├── views
| └── * : Everything that resides here handle views. This demo uses Mustache as template engine.
|
├── .gitignore
├── README.md
├── app.js : Express server file where middleware resides.
└── package.json 
```

### Using SoAuth middleware
```js
// app.js

var soAuth = require('./middlewares/so-auth');
app.use(soAuth({
  secret: 'super-secure-secret',
  handler: require('./models/access')
}));

/*
handler: 
- An object function to manage the SoAuth client data, it can also be used as a "bridge" to create reference to your own model.
- This can be anything really for as long as the requirement is fulfilled.

When the server starts, it will display the signing public key in the console.
*/
```

#### Handler requirements
Since the handler is for you to provide, it means you have the freedom to scale this to whatever you wish, besides storing the client's metadata.

For example:
- Creating an OTP procedure
- Detect if the client is accessed on different device by using agent information
- Create reference between your user model and the `signPublicKey`

```js
// The meta parameter below is where you can use information such as registration data - firstname, lastname, email, username and etc sent from the client.
// By default meta will be an empty object

Promise bool function create(Object params, Router req, Router, res, Router next)
  String params.boxPublicKey
  String params.signPublicKey
  String params.token
  Object params.meta

Promise bool function update(Object params, Router req, Router, res, Router next)
  String params.boxPublicKey
  String params.token
  Object params.meta

Promise Object function findOne(Object params, Router req, Router, res, Router next)
  Object params.message // only in negotation phase
  String params.signPublicKey
  or
  String params.token

[Optional] Express.Router Content function mediaFetchController(Object req, Object res, Object next)
  req, res and next is the Express middleware/router variables
  This function does not return anything, but pipe the output of the GridFS chunks to the res object
```

### Using SoAuth browser

```html
<script src="../javascripts/so-auth.js"></script>
<script>
var soAuth = new SoAuth({
  hostSignPublicKey: 'server-signing-public-key',
  endpoint: 'http://localhost:3000/',
  enableFingerprint: true // Optional - Using WebGL
});
</script>

// This is how to retrieve private file using token
<link href="../private/stylesheets/verified.css?soauth={{token}}" rel="stylesheet">
```

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
// - This meta data is captured in your own handler file mentioned above
let meta = {
  email: 'jondoe@email.com',
  firstname: 'Jon',
  lastname: 'Doe'
};

soAuth.negotiate(credential, 'login', meta).then(response => {
  if (response && response.token !== undefined) {
    soAuth.save();
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
soAuth.load().then(good => {
  if (good === false) {
    window.location.replace("/");
  }
});

// If exchange is use multiple times, it might conflict on the current stored object variable
// Use `clone`
soAuth.clone().exchange('How many cups of sugar does it takes to get to the moon?', '/secret').then(response => {
  if (response) {
    alert('Server said: ' + response);
  } else {
    alert('Communication compromised!');
    location.reload();
  }
});

// Server:
// The decryption is done automatically and can be accessed via res.locals.decrypted
// res.locals.SoAuth, which is the SoAuth object is also available throughout the request cycle. This is used for encrypting data.

app.post("/secret", function(req, res, next) {
  if (
    res.locals.decrypted !== undefined 
    && res.locals.SoAuth !== undefined
  ) {
    res.locals.SoAuth.encrypt(`Your question is: ${res.locals.decrypted} \nMy answer is: 3 and a half.`).then(encrypted => {
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


## Source Code

### SoAuth
- [Express Middleware](https://github.com/AFwcxx/so-auth/blob/master/middlewares/so-auth.js)
- [Browser](https://github.com/AFwcxx/so-auth/blob/master/public/javascripts/so-auth.js)
- [Server-to-Server](https://github.com/AFwcxx/so-auth/blob/master/modules/so-auth.js)

### Dependencies:

- [Libsodium](https://github.com/jedisct1/libsodium.js)
  - [NPM](https://www.npmjs.com/package/libsodium-wrappers)
  - [Browser](https://github.com/jedisct1/libsodium.js/tree/master/dist/browsers)
