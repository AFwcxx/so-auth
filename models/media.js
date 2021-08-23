"use strict";

const mongoConfig = require('../configs/mongodb.json');

var createError = require('http-errors');
var path = require('path');

const mongo = require('../modules/mongodb');
const db = mongo.getClient();
const fs = require('fs');
const sha256 = require('crypto-js/sha256');

exports.uploadBase64 = uploadBase64;

// https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types/Common_types
var acceptedMedia = mongoConfig.upload.media;

async function findOne(params) {
  let findData = await db.collection("fs.files").findOne(params);

  if (findData !== null) {
    return findData;
  }

  return false;
}

function uploadBase64(params, res, next) {
  let maximumFilesize = mongoConfig.upload.size ** 7; // MB

  // Check data received
  if (
    typeof params === 'object' 
    && params.owner !== undefined 
    && params.name !== undefined 
    && params.size !== undefined
    && params.type !== undefined
    && params.file !== undefined
  ) {
    // Check media type
    if (acceptedMedia.includes(params.type)) {
      // Check size
      if (params.size <= maximumFilesize) {
        let gfs = mongo.getGfs();

        // Find extension of file
        let baseImage = params.file;
        let ext = baseImage.substring(baseImage.indexOf("/") + 1, baseImage.indexOf(";base64"));
        let fileType = baseImage.substring("data:".length,baseImage.indexOf("/"));

        //Forming regex to extract base64 data of file.
        let regex = new RegExp(`^data:${fileType}\/${ext};base64,`, 'gi');

        // Extract base64 data.
        let base64_data = baseImage.replace(regex, "");
        let hash = sha256(base64_data).toString();

        // Check if same file has already been uploaded, and just return the result
        findOne({ 'metadata.hash': hash }).then(result => {
          if (result) {
            console.log('Media: Use exists');

            if (res.locals.SoAuth !== undefined) {
              res.locals.SoAuth.encrypt({
                success: true,
                message: 'Uploaded',
                rdata: hash
              }).then(encrypted => {
                res.json(encrypted);
              });
            } else {
              res.json({
                success: true,
                message: 'Uploaded',
                rdata: hash
              });
            }
          } else {
            console.log('Media: Use new');

            let bitmap = new Buffer.from(base64_data, 'base64');

            let filepath = path.join(__dirname, '../private/uploads/' + hash + '.' + ext);
            fs.writeFileSync(filepath, bitmap);

            let writestream = gfs.openUploadStream(params.name, { 
              contentType: params.type,
              metadata: {
                owner: params.owner,
                hash: hash
              }
            });

            // open a stream to the temporary file created by Express...
            fs.createReadStream(filepath)
              .on('end', function() {
                fs.unlink(filepath, function(err) {
                  if (err) {
                    console.log('Media: Problem deleting uploaded file.', err);
                  }
                });

                if (res.locals.SoAuth !== undefined) {
                  res.locals.SoAuth.encrypt({
                    success: true,
                    message: 'Uploaded',
                    rdata: hash
                  }).then(encrypted => {
                    res.json(encrypted);
                  });
                } else {
                  res.json({
                    success: true,
                    message: 'Uploaded',
                    rdata: hash
                  });
                }
              })
              .on('error', function(err) {
                next(err);
              })
            // and pipe it to gfs
              .pipe(writestream);
          }
        });
      } else {
        next(createError(406, 'Filesize exceed limit: ' + (maximumFilesize / 100 ** 5) + 'MB'));
      }
    } else {
      next(createError(406, 'Invalid media type, received: ' + params.type));
    }
  } else {
    next(createError(406, 'Insufficient data received'));
  }
}

