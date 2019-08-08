var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId,
    crypto = require('crypto'),
    validator = require('validator')

var helpers = require('../lib/helpers')

var notificationSchema = new Schema({

    //czy jest aktywne (czyli prog przekroczony)
    active: {type: Boolean, default: false},

    //jezeli > 0 to znaczy ze sprawdzac próg, jeżeli <= 0 nie brać pod uwage
    threshold: {type: Number, default: 0}
}) 

var settingsSchema = new Schema({
    save_log: {type: Boolean, default: true}
}, {_id: false})

var queueSchema = new Schema({
    ObjectId: ObjectId,
    created_at: { type: Date, default: Date.now },
    last_pushed: { type: Date },
    last_pulled: { type: Date },

    total_messages: { type: Number, default: 0 },
    total_bytes: { type: Number, default: 0 },

    messages_in_queue: { type: Number, default: 0 },
    bytes_in_queue: { type: Number, default: 0 },

    settings: settingsSchema,

    messages_in_queue_notification: notificationSchema,

    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    backend: { type: Schema.Types.ObjectId, ref: 'QueueBackend', required: true },

    name: {
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
    short_uuid: { type: String },
});

queueSchema.index({ name: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('Queue', queueSchema);