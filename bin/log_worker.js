const Log = require('../lib/log_worker')

const config = require('../config');
const mongoose = require('mongoose');
mongoose.connect(config.mongo, { useNewUrlParser: true });
mongoose.Promise = global.Promise;


Log.startWorker(parseInt(process.argv[2]) || 1000, 10000)
Log.handleGracefulShutdown()