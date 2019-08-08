const QueueStats = require('../lib/queue_stats_worker')

const config = require('../config');
const mongoose = require('mongoose');
mongoose.connect(config.mongo, { useNewUrlParser: true });
mongoose.Promise = global.Promise;


QueueStats.startWorker(parseInt(process.argv[2]) || 1000, 10000)
QueueStats.handleGracefulShutdown()