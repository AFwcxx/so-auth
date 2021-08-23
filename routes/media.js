"use strict";

// https://github.com/aheckmann/gridfs-stream

var express = require('express');
var router = express.Router();
var accessModel = require('../models/access');
var mediaModel = require('../models/media');

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
    res.status(406).json(response);
  }
});

module.exports = router;
