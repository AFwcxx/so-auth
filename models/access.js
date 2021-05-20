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
    && params.selfSeed !== undefined
    && params.token !== undefined
    && params.meta !== undefined
  ) {
    let foundOne = await findOne({ signPublicKey: params.signPublicKey });

    if (foundOne === false) {
      let insertRes = await db.collection("access").insertOne({
        signPublicKey: params.signPublicKey,
        boxPublicKey: params.boxPublicKey,
        selfSeed: params.selfSeed,
        token: params.token
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
    && params.selfSeed !== undefined
    && params.token !== undefined
    && params.meta !== undefined
  ) {
    await db.collection("access").updateOne({ _id: params._id }, {
      $set: { 
        boxPublicKey: params.boxPublicKey, 
        selfSeed: params.selfSeed, 
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
  let findData = await db.collection("access").findOne(params);

  if (findData !== null) {
    return findData;
  }

  return false;
}

function mediaFetchController(req, res, next) {
  if (req.params.mediaId !== undefined) {
    let gfs = mongo.getGfs();

    gfs.findOne({ _id: req.params.mediaId }, function (err, file) {
      if (err || file === null) {
        next();
      } else {
        res.set('Content-Type', file.contentType);

        gfs
          .createReadStream({ _id: req.params.mediaId })
          .pipe(res);
      }
    });
  } else {
    next();
  }
}
