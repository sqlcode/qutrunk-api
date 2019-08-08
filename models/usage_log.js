var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId,
    crypto = require('crypto'),
    validator = require('validator')

var helpers = require('../lib/helpers')

var usageLog = new Schema({
    ObjectId: ObjectId,
    date: { type: Date, default: Date.now },
    queue: { type: Schema.Types.ObjectId, ref: 'Queue', required: true },

    message_pushed: {type: Number},
    message_pulled: {type: Number},
});

usageLog.index({date: 1});
usageLog.index({queue: 1});

module.exports = mongoose.model('UsageLog', usageLog);