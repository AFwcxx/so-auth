"use strict";

const env = process.env.NODE_ENV || 'development';
const config = require('../configs/default.json');

var express = require('express');
var router = express.Router();

router.get('*', function(req, res, next) {
  if (res.locals.token !== undefined) {
    console.log('');
    console.log('SoAuth-Fingerprint', res.locals.fingerprint);
    console.log('');
    res.render('verified', {
      title: config[env].title,
      base: config[env].base,
      prod: env !== 'development'
    });
  } else {
    res.render('auth', {
      title: config[env].title,
      base: config[env].base,
      prod: env !== 'development',
      reset: req.query.soauth !== undefined
    });
  }
});

module.exports = router;
