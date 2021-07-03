const mongo = require('../modules/mongodb');
const db = mongo.getClient();

exports.create = create;
exports.update = update;
exports.findOne = findOne;
exports.mediaFetchController = mediaFetchController;

async function create(params) {
  if (
    typeof params === 'object'
    && params.boxPublicKey !== undefined
    && params.signPublicKey !== undefined
    && params.token !== undefined
    && params.meta !== undefined
  ) {
    let foundOne = await findOne({ signPublicKey: params.signPublicKey });

    if (foundOne === false) {
      let insertRes = await db.collection("access").insertOne({
        signPublicKey: params.signPublicKey,
        boxPublicKey: params.boxPublicKey,
        token: params.token,
        lastModified: new Date()
      });

      if (params.meta !== undefined) {
        // Do what ever you want with the meta
      }

      return insertRes.ops[0]._id;
    }

    return false;
  }

  throw new Error('Insufficient parameter received');
}

async function update(params) {
  if (
    typeof params === 'object'
    && params._id !== undefined
    && params.boxPublicKey !== undefined
    && params.token !== undefined
    && params.meta !== undefined
  ) {
    await db.collection("access").updateOne({ _id: params._id }, {
      $set: { 
        boxPublicKey: params.boxPublicKey, 
        token: params.token 
      },
      $currentDate: { lastModified: true }
    });

    if (params.meta !== undefined) {
      // Do what ever you want with the meta
    }

    return true;
  }

  throw new Error('Insufficient parameter received');
}

async function findOne(params) {
  let message = false;
  if (typeof params.message === 'object') {
    message = params.message;
    delete params.message;
  }

  let findData = await db.collection("access").findOne(params);

  if (findData !== null) {
    if (typeof message === 'object') {
      // This is called from SoAuth middleware - treat as an event of the following case
      if (message.intention === 'register') {
        // Register fail
        console.log('REGISTER FAIL');
      } else if (message.intention === 'login') {
        // Login success
        console.log('LOGIN SUCCESS');
      }
    }

    return findData;
  }

  if (typeof message === 'object') {
    // This is called from SoAuth middleware - treat as an event of the following case
    if (message.intention === 'register') {
      // Register success
      console.log('REGISTER SUCCESS');
    } else if (message.intention === 'login') {
      // Login fail
      console.log('LOGIN FAIL');
    }
  }

  return false;
}

function mediaFetchController(req, res, next, options) {
  if (req.params.mediaId !== undefined) {
    let gfs = mongo.getGfs();

    db.collection("fs.files").findOne({ 'metadata.hash': req.params.mediaId }, function (err, file) {
      if (err || file === null) {
        next();
      } else {
        let goFlag = true;
        if (options.owner && options.owner !== 'public') {
          if (options.owner !== file.metadata.owner) {
            goFlag = false;
          }
        }

        if (goFlag) {
          res.set('Content-Type', file.contentType);

          gfs
            .openDownloadStream(file._id)
            .pipe(res);
        } else {
          next();
        }
      }
    });
  } else {
    next();
  }
}
