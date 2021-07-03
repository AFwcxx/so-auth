var createError = require('http-errors');
var path = require('path');
const mongo = require('../modules/mongodb');
const db = mongo.getClient();
const fs = require('fs');
const sha256 = require('crypto-js/sha256');

exports.uploadBase64 = uploadBase64;

// https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types/Common_types
var acceptedMedia = [
  'application/pdf',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.presentation',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'font/otf',
  'image/jpeg',
  'image/bmp',
  'image/gif',
  'image/png',
  'image/svg+xml',
  'image/tiff',
  'image/webp'
];

async function findOne(params) {
  let findData = await db.collection("fs.files").findOne(params);

  if (findData !== null) {
    return findData;
  }

  return false;
}

function uploadBase64(params, res, next) {
  let maximumFilesize = 10 ** 8; // 100 MB

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
            console.log('use exists');

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
            console.log('use new');

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
                    console.log('Problem deleting uploaded file.');
                    console.log(err);
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
        next(createError(406, 'Filesize exceed limit: ' + (maximumFilesize / 10 ** 6) + 'MB'));
      }
    } else {
      next(createError(406, 'Invalid media type'));
    }
  } else {
    next(createError(406, 'Insufficient data received'));
  }
}

