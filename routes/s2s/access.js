"use strict";

const mongo = require('../../modules/mongodb');
const db = mongo.getClient();

var createError = require('http-errors');
var express = require('express');
var router = express.Router();


router.post("/findOne", function(req, res, next) {
  db.collection("access").findOne(res.locals.decrypted.params).then(findData => {
    if (findData) {
      res.locals.SoAuth.encrypt({
        success: true,
        message: 'OK',
        rdata: findData
      }).then(encrypted => {
        res.json(encrypted);
      });
    } else {
      next(createError(404, 'Not found'));
    }
  });
});



module.exports = router;

