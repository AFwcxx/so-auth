// https://github.com/aheckmann/gridfs-stream

var path = require('path');
var express = require('express');
const { ObjectId } = require('mongodb');
const mongo = require('../modules/mongodb');
const fs = require('fs');
var router = express.Router();
var accessModel = require('../models/access');

// Simple check
router.post("*", function(req, res, next) {
  if (
    res.locals.decrypted !== undefined 
    && res.locals.SoAuth !== undefined
  ) {
    // get the current soauth user data
    accessModel.findOne({ _id: res.locals.auth._id }).then(result => {
      if (result) {
        res.locals.access = result;
        next();
      } else {
        res.status(401).json({ message: 'Invalid access' });
      }
    });
  } else {
    next();
  }
});

router.post("/upload", function(req, res, next) {
  let response = {
    success: false,
    message: 'Insufficient data received'
  };

  // https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types/Common_types
  let acceptedMedia = [
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

  let maximumFilesize = 10 ** 8; // 100 MB

  // Check data received
  if (
    typeof res.locals.decrypted === 'object' 
    && res.locals.decrypted.name !== undefined 
    && res.locals.decrypted.size !== undefined
    && res.locals.decrypted.type !== undefined
    && res.locals.decrypted.file !== undefined
  ) {

    // Check media type
    if (acceptedMedia.includes(res.locals.decrypted.type)) {

      // Check size
      if (res.locals.decrypted.size <= maximumFilesize) {
        let gfs = mongo.getGfs();
        let objectid = new ObjectId();

        let writestream = gfs.createWriteStream({ 
          _id: objectid,
          filename: res.locals.decrypted.name,
          mode: 'w',
          content_type: res.locals.decrypted.type,
          metadata: {
            owner: res.locals.access
          }
        });


        // Convert the base64 to buffer and save the media temporarily
        let data_url = res.locals.decrypted.file;
        let matches = data_url.match(/^data:.+\/(.+);base64,(.*)$/);
        let ext = matches[1];
        let base64_data = matches[2];
        let bitmap = new Buffer(base64_data, 'base64');

        let filepath = path.join(__dirname, '../private/uploads/' + objectid + '.' + ext);
        fs.writeFileSync(filepath, bitmap);

        // open a stream to the temporary file created by Express...
        fs.createReadStream(filepath)
          .on('end', function() {
            fs.unlink(filepath, function(err) {
              if (err) {
                response.message = err.message;
                res.status(406).json(response);
              }
            });

            response.success = true;
            response.message = 'Uploaded';
            response.rdata = objectid;

            res.locals.SoAuth.encrypt(response).then(encrypted => {
              res.json(encrypted);
            });
          })
          .on('error', function(err) {
            next(err);
          })
        // and pipe it to gfs
          .pipe(writestream);
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
});

module.exports = router;
