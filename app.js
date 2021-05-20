var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var mustacheExpress = require('mustache-express');

var soAuth = require('./middlewares/so-auth');

var s2sRouter = require('./routes/s2s');
var indexRouter = require('./routes/index');
var secretRouter = require('./routes/secret');
var mediaRouter = require('./routes/media');

var app = express();

// view engine setup
app.engine('html', mustacheExpress());
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'html');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/s2s', s2sRouter);

const hostId = 'localhost:3000';
app.use(soAuth({
  hostId: hostId,
  handler: require('./models/access')
}));

app.all('/', indexRouter);
app.all('/secret', secretRouter);
app.all('/media/*', mediaRouter);

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
