var async = require('async')
var mongoose = require('mongoose');
var moment = require('moment')
var config = require('../config')
var helpers = require('./helpers')
var tasks = []
mongoose.connect(config.mongo, { useNewUrlParser: true });

mongoose.Promise = global.Promise;

var UserRepository = require('../repository/user')
var QueueBackendRepository = require('../repository/queue_backend')

var Chance = require('chance')
var chance = new Chance()

var User = require('../models/user')
var AccessToken = require('../models/access_token')
var Queue = require('../models/queue')
var MessageLog = require('../models/message_log')
var UsageLog = require('../models/usage_log')
var QueueBackend = require('../models/queue_backend')

process.env.TEST = 1

async function run(done) {
    await User.deleteMany({})
    await Queue.deleteMany({})
    await AccessToken.deleteMany({})
    await MessageLog.deleteMany({})
    await UsageLog.deleteMany({})
    await QueueBackend.deleteMany({})

    console.log('Loading fixtures')

    await addUsers()

    console.log('Fixtures loaded')
    done && done()
}

async function addBackends(user) {
    return await QueueBackendRepository.create(user._id, 'rabbitmq', 'rabbit-0', {addr: 'amqp://localhost:5672'})
}

async function addUsers() {
    let u = new User()
    u.email = 'foobar0@gmail.com'
    u.password = 'foobar'

    u = await u.save()

    await addBackends(u)

    for(var i = 1; i<= 3; i++){
    	let u = new User()
    	u.email = 'foobar'+i+'@gmail.com'
    	u.password = 'foobar'

        u.quota = {
            bytes_left: 1024*1024*1024,
            messages_left: 1024*1024,
            queues_left: 1024
        }
        
    	u = await u.save()

        let backend = await addBackends(u)

        let at = new AccessToken()
        at.user = u
        at.access_push = true
        at.access_pull = true
        at.access_create_queue = true
        at.value = 'test_access_token'+i
        await at.save()

        let q = new Queue
        q.user = u
        q.backend = backend._id
        q.name = 'test_'+i

        await q.save()

        await generateUsageLog(q)

        q = new Queue
        q.user = u
        q.backend = backend._id
        q.name = 'test_'+i+'_2'

        await q.save()

        await generateUsageLog(q, 0.5)
    }
}

async function generateUsageLog(q, m){
    let _m = m || 1
    let t = moment().add(1, 'hour').startOf('hour')

    for(var i = 0 ; i <= 24*10; i++){
        t.subtract(1,'hour')
        let ul = new UsageLog()
        ul.date = t.toDate()
        ul.queue = q._id

        let m = 1000 * _m

        if(t.hour() > 6 && t.hour() < 21){
            m = m + (t.hour() * 10)
        }

        if(t.hour() > 2 && t.hour() < 5){
            continue
        }
        
        ul.message_pushed = Math.round(Math.random() * 100) + m
        ul.message_pulled = Math.round(Math.random() * 100) + m

        await ul.save()
    }
}

process.on('unhandledRejection', function(reason, p) {
  console.log("Unhandled Rejection:", reason.stack);
  // process.exit(1);
});


module.exports = run