"use strict";

var express = require('express');
var router = express.Router();

router.get('*', function(req, res, next) {
  if (res.locals.token !== undefined) {
    res.render('verified', {
      title: 'Secured Communication'
    });
  } else {
    res.render('auth', {
      title: 'So-Auth',
      reset: req.query.soauth !== undefined
    });
  }
});

module.exports = router;
