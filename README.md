#  SoAuth - Remove the need to store password or private key
This is a BootstrapVue demo that runs SoAuth NodeJS server with full privacy and secure communication.
It only covers the authentication aspects. User and permissions are separate scope but can easily be integrated with.


## Concept
- Signing: 
  - Process of registration and login. Login requires you to prove yourself without having to share username, email or password.
  - Signing keys are deterministic, suitable to identify an entity.
  - Only Signing public key is stored in the server database or memory.

- Authentication: 
  - Process of communication that is considered to be real and truth from the source that completed Signing process.
  - Authentication keys are random and changes everytime a new communication is established. Suitable for session management.
  - Only Authentication public key is stored in the server database or memory.


### Signing
Process flow:
1. Client's Username and password is used to generate deterministic Signing keys and random Authentication keys.
2. Client signed intention (login or register) data with Signing private key and send to server for negotiation. Signing and Authentication public key is shared during the negotiation.
3. Server probe the intention data with the received Signing public key and process the intention.
4. Server generate itself a new sets of random Signing and Authentication keys; and random generated token. 
5. Server signed introduction data (contains token) with Signing private key and send back to the Client by sharing Signing and Authentication public key.
5. Client probe the introduction data, remove the existence of it's own Singing keys from memory and ready to begin encrypted communication - Authentication process.

### Authentication
Process flow:
1. Client encrypt data with Authentication private key and send to server which contains a ciphertext, nonce and token.
2. Server receives the payload and check again if the token received is the same with the Authentication public key it had received previously.
3. Server decrypt the ciphertext with nonce and Client's Authentication public key, process it's request, encrypt the response and send back to Client.
4. Client receives the payload, decrypt the ciphertext with nonce and Server's Authentication public key.
5. Repeat.

Note: SoAuth also support static files privacy out of the box that uses the token for identity check after Signing process. This is explained below.


## Specifications

### Demo File structure
You don't really need Bootstrap, Vue or MongoDB as shown by the demo. It is just to illustrate how to perform integration with different tech stack.
The structure below is an example except for the `private` folder which is used specifically by SoAuth to filter viewers.
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
| └── so-auth.js : SoAuth Server-toServer module
| └── tool.js : Misc module (JSON string checker and http/https)
|
├── private
| └── * : Everything that resides here requires token (verified Signing process) to access.
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
  hostId: hostId,
  handler: require('./models/access')
}));

// hostId: 
// - Any string to identify your service. Can be different value for different redundancy server.
//
// handler: 
// - An object function to manage the SoAuth client data, it can also be used as a "bridge" to create reference to your own model.
// - This can be anything really for as long as the requirement is fulfilled.
```

#### Handler requirements
Since the handler is for you to provide, it means you have the freedom to scale this to whatever you wish, besides storing the client data.
For example:
- Creating an OTP procedure
- Detect if the client is accessed on different device by using agent information into the Signing key creation
- Create reference between your user model and the `signPublicKey`

```js
// The meta parameter below is where you can use the data such as registration data - firstname, lastname, email, username and etc sent from the client.
// By default meta will be an empty object

Promise bool function create(Object params)
  String params.boxPublicKey
  String params.signPublicKey
  String params.selfSeed
  String params.token
  Object params.meta

Promise bool function update(Object params)
  String params.boxPublicKey
  String params.selfSeed
  String params.token
  Object params.meta

Promise Object function findOne(Object params)
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
  hostId: 'localhost:3000-soAuth',
  endpoint: 'http://localhost:3000/'
});
</script>

// This is how to retrieve private file using token
<link href="../private/stylesheets/verified.css?soauth={{token}}" rel="stylesheet">
```

### Signing example
```js
// Client:

// The credential can be anything, just remember that it is used to create a deterministic signing key
// So you'll have to think ahead for your use-case
let credential = {
  email: 'jondoe@email.com',
  password: 'super-secure'
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

### Authentication example
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

SoAuth = new _SoAuth({
  passphrase: 'very-secret',
});

SoAuth.setup().then(() => {
  let boxPublicKey = SoAuth.sodium.to_hex(SoAuth.boxkeypair.publicKey);
  console.log('SoAuth S2S ready, Box Public Key: ' + boxPublicKey)
});
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

SoAuth = new _SoAuth({
  passphrase: config.passphrase,
});

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

SoAuth = new _SoAuth({
  passphrase: config.passphrase,
});

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

SoAuth = new _SoAuth({
  passphrase: config.passphrase,
});

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
