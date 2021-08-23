"use strict";

var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var helmet = require('helmet');
var mustacheExpress = require('mustache-express');
var useragent = require('express-useragent');
var publicIp = require('public-ip');

var soAuth = require('./middlewares/so-auth');

var s2sRouter = require('./routes/s2s');
var indexRouter = require('./routes/index');
var secretRouter = require('./routes/secret');
var mediaRouter = require('./routes/media');

var app = express();

app.use(helmet({
  contentSecurityPolicy: false
}));
app.use(express.json({limit: '100mb', extended: true}))
app.use(express.urlencoded({limit: '100mb', extended: true}))

// view engine setup
app.engine('html', mustacheExpress());
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'html');

app.use(logger('dev'));
app.use(cookieParser());

// For API
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header('Access-Control-Allow-Methods', "*");
  res.header("Access-Control-Allow-Headers", "*");
  if ('OPTIONS' == req.method) {
    res.sendStatus(200);
  }
  else {
    next();
  }
});

// user agent and ip address
app.use(useragent.express());
app.use(function (req, res, next) {
  let v4 = '', v6 = '';
  (async () => {
    v4 = await publicIp.v4();

    // if v6 is enabled
    // v6 = await publicIp.v6();

    req.clientIp = v4 + ' ' + v6;
    next();
  })();
});

app.use(express.static(path.join(__dirname, 'public')));

app.use('/s2s', s2sRouter);

// Add delay for negotiation to prevent brute force
app.all('/soauth', function(req, res, next) {
  let second = 2;
  setTimeout(() => {
    next();
  }, second * 1000);
});

const secret = require('./configs/so-auth.json').passphrase;
app.use(soAuth({
  secret: secret,
  handler: require('./models/access')
}));

app.use('/', indexRouter);
app.use('/secret', secretRouter);
app.use('/media', mediaRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
