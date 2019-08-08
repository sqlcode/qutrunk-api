var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId,
    crypto = require('crypto'),
    validator = require('validator')

var helpers = require('../lib/helpers')

var connectionSchema = new Schema({

    addr: {type: String},
    host: {type: String},
    port: {type: String}

}, {_id: false}) 

var schema = new Schema({
    ObjectId: ObjectId,
    created_at: { type: Date, default: Date.now },
    provider: {type: String, enum: ['rabbitmq', 'mongodb', 'redis'], required: true},
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    default: {type: Boolean},
    key: {
        required: true,
        type: String,
        set: (v) => {
            return v.toLowerCase()
        },
        validate: {
            validator: function(v) {
                return /^[a-z0-9\-\_]+$/.test(v);
            },
            message: props => `Queue name can contain only letters, numbers and "-", "_" characters`
        },
    },
    description: { type: String, max: 2000},

    connection: connectionSchema
});

schema.index({ key: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('QueueBackend', schema);