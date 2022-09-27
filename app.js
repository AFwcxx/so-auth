"use strict";

const env = process.env.NODE_ENV || 'development';
const config = require('./configs/default.json');
const frontendReplace = require('./configs/so-auth.json').frontendReplace;

const fs = require('fs');
const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const helmet = require('helmet');
const publicIp = require('public-ip');
const useragent = require('express-useragent');
const mustacheExpress = require('mustache-express');

const soAuth = require('./middlewares/so-auth');

// APIs
const secretRouter = require('./routes/api/secret');
const mediaRouter = require('./routes/api/media');

// S2S
const s2sIndexRouter = require('./routes/s2s/index');
const s2sAccessRouter = require('./routes/s2s/access');

// Views
const indexRouter = require('./routes/index');

const app = express();

app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(express.json({ limit: config[env].network.requestLimit, extended: true }));
app.use(express.urlencoded({ limit: config[env].network.requestLimit, extended: true }));

// view engine setup
app.engine('html', mustacheExpress(null, null, [ '{|', '|}' ])); 
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'html');

app.use(logger('dev'));
app.use(cookieParser());
app.use(useragent.express());

// Overwrite the SoAuth pubkey on the front end config
const frontEndList = [
  '/javascripts/auth.js',
  '/private/javascripts/verified.js'
];

app.use(frontEndList, function(req, res) {
  let lePath = req.originalUrl.split('?')[0];

  if (!lePath.includes('private')) {
    lePath = '/public' + lePath;
  }

  fs.readFile(path.join(__dirname, lePath), 'utf8', function (err, data) {
    if (err) {
      res.sendStatus(404);
    } else {
      // Replace soauth pubkey
      data = data.replace('<wallet-soauth-pubkey>', frontendReplace);

      res.type('.js');
      res.send(data);
    }
  });
});

app.use(express.static(path.join(__dirname, 'public')));

app.use(function (req, res, next) {
  (async () => {
    let v4 = '';
    let v6 = '';

    if (config[env].network.ipv4) {
      v4 = await publicIp.v4();
    }
    if (config[env].network.ipv6) {
      v6 = await publicIp.v6();
    }

    req.clientIp = v4 + ' ' + v6;
    next();
  })();
});

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header('Access-Control-Allow-Methods', "*");
  res.header("Access-Control-Allow-Headers", "*");
  if ('OPTIONS' === req.method) {
    res.sendStatus(200);
  } else {
    next();
  }
});

const secret = require('./configs/so-auth.json').passphrase;
const servingHostIds = require('./configs/so-auth.json').servingHostIds;
app.use(soAuth({
  secret: secret,
  handler: require('./models/access'),
  servingHostIds: servingHostIds,
  user: false
}));

// APIs
app.use('/api/secret', secretRouter);
app.use('/api/media', mediaRouter);

// S2S
app.use('/s2s/*', s2sIndexRouter);
app.use('/s2s/access', s2sAccessRouter);

// Views
app.use('/', indexRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  res.status(err.status || 500);

  if (
    req.path.includes('api') 
    || req.path.includes('s2s')
    || req.path.includes('wingold')
  ) {
    res.json({
      success: false,
      message: err.message
    });
  } else {
    res.render('error', {
      error: env === 'development' ? err : {},
      message: err.message,
      title: config[env].title
    });
  }
});

module.exports = app;
