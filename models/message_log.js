var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId,
    crypto = require('crypto'),
    validator = require('validator')

var helpers = require('../lib/helpers')

var messageLog = new Schema({
    ObjectId: ObjectId,
    created_at: { type: Date, default: Date.now },
    pushed_at: { type: Date, required: true},
    processed_at: { type: Date},
    queue: { type: Schema.Types.ObjectId, ref: 'Queue', required: true },
    data: { type: String},
    size: {type: Number},
    
    pushed_ip: {type: String},
    pushed_access_token: {type: Schema.Types.ObjectId, ref: 'AccessToken'},

    pulled_ip: {type: String},
    pulled_access_token: {type: Schema.Types.ObjectId, ref: 'AccessToken'},
});


messageLog.index({pushed_at: 1});
messageLog.index({processed_at: 1});
messageLog.index({queue: 1});

module.exports = mongoose.model('MessageLog', messageLog);