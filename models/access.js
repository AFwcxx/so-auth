"use strict";

const env = process.env.NODE_ENV || 'development';
const config = require('../configs/default.json');

const mongo = require('../modules/mongodb');
const db = mongo.getClient();

exports.create = create;
exports.update = update;
exports.findOne = findOne;
exports.mediaFetchController = mediaFetchController;

async function create(params, req, res, next) {
  if (
    typeof params === 'object'
    && params.boxPublicKey !== undefined
    && params.signPublicKey !== undefined
    && params.token !== undefined
  ) {
    let foundOne = await findOne({ signPublicKey: params.signPublicKey });

    if (foundOne === false) {
      let insertRes = await db.collection("access").insertOne({
        signPublicKey: params.signPublicKey,
        boxPublicKey: params.boxPublicKey,
        token: params.token,
        fingerprint: params.fingerprint
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

async function update(params, req, res, next) {
  if (
    typeof params === 'object'
    && params._id !== undefined
    && params.boxPublicKey !== undefined
    && params.token !== undefined
  ) {
    await db.collection("access").updateOne({ _id: params._id }, {
      $set: { 
        boxPublicKey: params.boxPublicKey, 
        token: params.token,
        fingerprint: params.fingerprint
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

async function findOne(params, req, res, next) {
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
        console.log('Access: Register fail');
      } else if (message.intention === 'login') {
        // Login success
        console.log('Access: Login success');
      }
    }

    return findData;
  }

  if (typeof message === 'object') {
    // This is called from SoAuth middleware - treat as an event of the following case
    if (message.intention === 'register') {
      // Register success
      console.log('Access: Register success');
    } else if (message.intention === 'login') {
      // Login fail
      console.log('Access: Login fail');
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

        if (options && options.owner && options.owner !== 'public') {
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
