var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId,
    crypto = require('crypto'),
    validator = require('validator')

var helpers = require('../lib/helpers')

var hashPassword = function(p) {
    if (!p) {
        return ''
    }

    return crypto.createHmac('sha256', '')
        .update(p)
        .digest('hex').toString();
}

var quotaSchema = new Schema({
    messages_left: { type: Number, default: 0 },
    queues_left: { type: Number, default: 0 },
    max_idle_days: { type: Number, default: 0 },

    //liczba dni przez ile trzymane są logi wiadomości
    //po wyciągnięciu z kolejki
    max_log_time_days: { type: Number, default: 2 },

    //max. liczba wiadomości w logu
    max_log_count: { type: Number, default: 25 * 1000 },

    //max liczba wiadomosci w jednej kolejce
    max_messages_in_queue: { type: Number, default: 25 * 1000 },

    //max. rozmiar wiadomości w bajtach
    max_msg_size: { type: Number, default: 1024 },

    bytes_left: { type: Number, default: 2000 },
}, { _id: false })

quotaSchema.methods.canPush = function() {
    return this.messages_left > 0 && this.bytes_left > 0
}

quotaSchema.methods.canCreateQueue = function() {
    return this.queues_left > 0
}

quotaSchema.methods.setFreeQuota = function() {
    this.messages_left = 25*1000
    this.queues_left = 25
    this.max_idle_days = 1
    this.max_log_time_days = 2
    this.max_msg_size = 256 * 1024
    this.bytes_left = 25 * 1000 * 50 * 1024

}

//USER SCHEMA
var userSchema = new Schema({
    ObjectId: ObjectId,
    short_uuid: { type: String },
    created_at: { type: Date, default: Date.now },
    last_login: { type: Date },
    name: { type: String },

    google_id: { type: String, unique: true, sparse: true },
    google_access_token: String,

    github_id: { type: String, unique: true, sparse: true },
    github_access_token: String,

    bitbucket_id: { type: String, unique: true, sparse: true },
    bitbucket_access_token: String,

    quota: { type: quotaSchema, default: quotaSchema },

    email: {
        type: String,
        unique: true,
        sparse: true,
        required: function() {
            return !this.isSocial()
        },
        validate: {
            validator: function(v) {
                return validator.isEmail(v)
            },
            message: 'model.user.email_invalid'
        }
    },
    password: {
        type: String,
        minlength: [6, 'model.user.password_too_short'],
        required: function() {
            return !this.isSocial()
        }
    }
});

userSchema.pre('save', function(next) {
    if (!this.isModified('password')) {
        return next();
    } else {
        this.password = hashPassword(this.password)
        next()
    }

})

userSchema.pre('validate', function(next) {
    if (!this.short_uuid) {
        this.short_uuid = helpers.randomToken(6)
    }
    next()
})

userSchema.methods.isSocial = function() {
    return this.github_id || this.google_id || this.bitbucket_id
}

userSchema.methods.checkPassword = function(p) {
    return this.password === hashPassword(p)
}

userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ short_uuid: 1 }, { unique: true });

module.exports = mongoose.model('User', userSchema);