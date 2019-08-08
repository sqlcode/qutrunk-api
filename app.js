var express = require('express');
var path = require('path');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var config = require('./config');
var bb = require('express-busboy');
var timeout = require('connect-timeout')
var moment = require('moment')

var debug = require('debug')('qutrunk-api:server');
var morganBody = require('morgan-body');

let QueueRepository = require('./repository/queue')

var app = express();
var mongoose = require('mongoose');
mongoose.connect(config.mongo, {
    useCreateIndex: true,
    useNewUrlParser: true
});
mongoose.Promise = global.Promise;

app.use(timeout(config.server_timeout_sec + 's'))
// app.use(logger(config.debug ? 'dev': 'prod'));
app.use(cookieParser());

if (!process.env.TEST) {
    app.use(logger(function(tokens, req, res) {
        return [
            moment().format('DD-MM HH:mm:ss.SSS'),
            tokens.method(req, res),
            tokens.url(req, res),
            tokens.status(req, res),
            tokens.res(req, res, 'content-length'), '-',
            req.decoded && 'uid:' + req.decoded.id || 'public',
            'ip:' + (req.headers['x-forwarded-for'] || req.connection.remoteAddress),
            'res_t:' + tokens['response-time'](req, res), 'ms'
        ].join(' ')
    }));
}

app.use(express.static(path.join(__dirname, 'public')));

if (config.swagger) {
    app.use(require('./swagger'))
}

app.use((req, res, next) => {
    res.resp = (status, msg) => {
        res.status(status).json({
            status: status === 200,
            msg: msg
        })
    }
    next()
})

app.set('jwtSecret', config.secret)
var authUserCheck = require('./routes/middleware/auth_user.js')
var authCoreCheck = require('./routes/middleware/core.js')
// app.use(require('./routes/middleware/cors'))

if (config.debug && !process.env.TEST) {
    morganBody(app);
}

// app.use(function(req,res,next){
//   setTimeout(next, 1000)
// });

const passport = require('passport')
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser(function(user, cb) {
    cb(null, user);
});

passport.deserializeUser(function(obj, cb) {
    cb(null, obj);
});

app.use('/api/v1/core', authCoreCheck, require('./routes/core'));

app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: false }));

app.use('/api/v1/auth', require('./routes/passport'));
app.use('/api/v1/public', require('./routes/public'));

app.use('/api/v1/restricted', authUserCheck,
    require('./routes/restricted'));

app.use('/api/v1/restricted/queue', authUserCheck,
    require('./routes/restricted/queue'));

app.use('/api/v1/restricted/queue_backend', authUserCheck,
    require('./routes/restricted/queue_backend'));

app.use('/api/v1/restricted/log', authUserCheck,
    require('./routes/restricted/message_log'));

app.use('/api/v1/restricted/usage_log', authUserCheck,
    require('./routes/restricted/usage_log'));

app.use('/api/v1/restricted/access_token', authUserCheck,
    require('./routes/restricted/access_token'));

// catch 404 and forward to error handler
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// error handler
app.use(function(err, req, res, next) {
    // set locals, only providing error in development
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};

    if (config.debug) {
        // render the error page
        res.status(err.status || 500).json({ error: err.message, stack: JSON.stringify(err.stack, null, 2) })
    } else {
        res.status(500).json({ error: true })
    }
});

process.on('unhandledRejection', function(reason, p) {
    console.log("Unhandled Rejection:", reason.stack);
    // process.exit(1);
});

const server = app.listen(config.port, async () => {

    await QueueRepository.initQueueProvider()

    console.log('Mongo connection start')
    await mongoose.connect(config.mongo, {
        useCreateIndex: true,
        useNewUrlParser: true
    });
    console.log('Mongo connected')

    console.log('Server is ready')
    process.send && process.send('ready')
})

process.on('SIGINT', () => {
    console.info('SIGINT signal received. Stopping...')

    // Stops the server from accepting new connections and finishes existing connections.
    server.close(function(err) {
        // if error, log and exit with error (1 code)
        if (err) {
            console.error(err)
            process.exit(1)
        }

        // close your database connection and exit with success (0 code)
        // for example with mongoose
        mongoose.connection.close(function() {
            console.log('Mongoose connection disconnected')
            process.exit(0)
        })
    })
})

module.exports = app;