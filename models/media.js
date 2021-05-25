// https://github.com/aheckmann/gridfs-stream

var path = require('path');
const { ObjectId } = require('mongodb');
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
  let response = {
    success: false,
    message: 'Insufficient data received'
  };

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
        let objectid = new ObjectId();

        //Find extension of file
        let baseImage = params.file;
        let ext = baseImage.substring(baseImage.indexOf("/")+1, baseImage.indexOf(";base64"));
        let fileType = baseImage.substring("data:".length,baseImage.indexOf("/"));
        //Forming regex to extract base64 data of file.
        let regex = new RegExp(`^data:${fileType}\/${ext};base64,`, 'gi');
        //Extract base64 data.
        let base64_data = baseImage.replace(regex, "");
        let hash = sha256(base64_data).toString();

        // Check if same file has already been uploaded, and just return the result
        findOne({ 'metadata.hash': hash }).then(result => {
          if (result) {
            response.success = true;
            response.message = 'Uploaded';
            response.rdata = result._id;

            if (res.locals.SoAuth !== undefined) {
              res.locals.SoAuth.encrypt(response).then(encrypted => {
                res.json(encrypted);
              });
            } else {
              res.json(response);
            }
          } else {
            let bitmap = new Buffer(base64_data, 'base64');

            let filepath = path.join(__dirname, '../private/uploads/' + objectid + '.' + ext);
            fs.writeFileSync(filepath, bitmap);

            let writestream = gfs.createWriteStream({ 
              _id: objectid,
              filename: params.name,
              mode: 'w',
              content_type: params.type,
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

                response.success = true;
                response.message = 'Uploaded';
                response.rdata = objectid;

                if (res.locals.SoAuth !== undefined) {
                  res.locals.SoAuth.encrypt(response).then(encrypted => {
                    res.json(encrypted);
                  });
                } else {
                  res.json(response);
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
        response.message = 'Filesize exceed limit: ' + (maximumFilesize / 10 ** 6) + 'MB';
        res.status(406).json(response);
      }
    } else {
      response.message = 'Invalid media type';
      res.status(406).json(response);
    }
  } else {
    res.status(406).json(response);
  }
}

