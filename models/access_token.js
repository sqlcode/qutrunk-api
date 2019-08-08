var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId,
    crypto = require('crypto'),
    validator = require('validator')

var helpers = require('../lib/helpers')

var tokenSchema = new Schema({
    ObjectId: ObjectId,
    created_at: { type: Date, default: Date.now },
    last_used: { type: Date },
    active: {type: Boolean, default:true, required:true},
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    name: {type:String, required: false},
    value: {type: String, required: true, unique: true},
    access_push: {type: Boolean, default: false},
    access_pull: {type: Boolean, default: false},
    access_create_queue: {type: Boolean, default: false},

    queues: [{ type: Schema.Types.ObjectId, ref: 'Queue' }]
});

tokenSchema.methods.canAccessQueue = function(queueId){
    return this.queues.length === 0 || this.queues.filter(q => q.equals(queueId)).length
}

tokenSchema.pre('validate', function(next){
    if(!this.value){
        this.value = helpers.randomToken(12)
    }
    next()
})


tokenSchema.index({value: 1}, { unique: true});

module.exports = mongoose.model('AccessToken', tokenSchema);