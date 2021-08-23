"use strict";

var createError = require('http-errors');
var express = require('express');
var router = express.Router();

var accessModel = require('../../models/access');
var mediaModel = require('../../models/media');

// Simple check
router.all("*", function(req, res, next) {
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
        next(createError(401, 'Invalid permission'));
      }
    });
  } else {
    next();
  }
});

router.post("/upload", function(req, res, next) {
  // Check data received
  if (
    typeof res.locals.decrypted === 'object' 
    && res.locals.decrypted.name !== undefined 
    && res.locals.decrypted.size !== undefined
    && res.locals.decrypted.type !== undefined
    && res.locals.decrypted.file !== undefined
  ) {
    mediaModel.uploadBase64({
      owner: res.locals.access,
      name: res.locals.decrypted.name,
      size: res.locals.decrypted.size,
      type: res.locals.decrypted.type,
      file: res.locals.decrypted.file,
    }, res, next);
  } else {
    next(createError(406, 'Invalid data'));
  }
});

module.exports = router;
