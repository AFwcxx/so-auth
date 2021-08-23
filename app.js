"use strict";

const env = process.env.NODE_ENV || 'development';
const config = require('./configs/default.json');

var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var helmet = require('helmet');
var publicIp = require('public-ip');
var useragent = require('express-useragent');
var mustacheExpress = require('mustache-express');

var soAuth = require('./middlewares/so-auth');

// APIs
var secretRouter = require('./routes/api/secret');
var mediaRouter = require('./routes/api/media');

// S2S
var s2sIndexRouter = require('./routes/s2s/index');
var s2sAccessRouter = require('./routes/s2s/access');

// Views
var indexRouter = require('./routes/index');

var app = express();

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
app.use(soAuth({
  secret: secret,
  handler: require('./models/access')
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
