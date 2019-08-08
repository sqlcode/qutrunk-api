process.env.NODE_ENV = 'test';

let mongoose = require("mongoose");

//Require the dev-dependencies
let chai = require('chai');
let chaiHttp = require('chai-http');
let server = require('../app');
let should = chai.should();
let qs = require('querystring')
let moment = require('moment')

var User = require('../models/user')
var UserRepository = require('../repository/user')
var QueueRepository = require('../repository/queue')

var QueueStats = require('../lib/queue_stats_worker')
var LogWorker = require('../lib/log_worker')

var fixtures = require('../lib/fixtures')
chai.use(chaiHttp);

let URL = '/api/v1'

let ACCESS_TOKEN
let access_token_id
let USER_ACCESS_TOKEN
let HEADER = 'x-access-token'

let postReq = (url, data) => {
    let access_token = url.indexOf('/core') === 0 ? ACCESS_TOKEN : USER_ACCESS_TOKEN

    let req = chai.request(server).post(URL + url).set(HEADER, access_token)

    if (typeof data === 'string') {
        req.set('Content-Type', 'text/plain')
    }

    return req.send(data)
}

let getReq = (url, data) => {
    if (!data) {
        data = {}
    }

    data.access_token = url.indexOf('/core') === 0 ? ACCESS_TOKEN : USER_ACCESS_TOKEN
    return chai.request(server).get(URL + url + '?' + qs.stringify(data))
}


function sleep(ms) {
    if (ms <= 0) {
        return
    }
    return new Promise(resolve => setTimeout(resolve, ms));
}

QueueStats.setOnStandBy(() => {
    QueueStats.cancelWorker()
})

LogWorker.setOnStandBy(() => {
    LogWorker.cancelWorker()
})

let flw = async () => {
    await sleep(100)
    await QueueStats.startWorker(1, 0)
    await LogWorker.startWorker(1, 0)
}

let getQ = async () => {
    let res = await getReq('/restricted/queue/list')
    return res.body.data[0]
}

describe('Core - Queue counters', function() {
    before((done) => {
        fixtures(async () => {

            await QueueStats.purgeQueue()
            await LogWorker.purgeQueue()

            let res = await chai.request(server).post('/api/v1/public/login/email').send({
                email: 'foobar0@gmail.com',
                password: 'foobar'
            })
            USER_ACCESS_TOKEN = res.body.access_token

            res = await postReq('/restricted/access_token', {
                active: true,
                access_push: true,
                access_create_queue: true,
                access_pull: true
            })
            res = await getReq('/restricted/access_token/list')
            ACCESS_TOKEN = res.body.data[0].value
            access_token_id = res.body.data[0]._id

            res = await postReq('/restricted/queue', { name: 'foo_queue' })
            res = await getReq('/restricted/queue/list')
            queue = res.body.data[0].name

            res = await postReq('/restricted/user/quota', {
                ml: 100,
                ql: 50,
                mid: 2
            })
            res.status.should.be.equal(200)

            done()
        })
    })

    after(async () => {
        await flw()
    })

    it('should check if messages in queue is updated (increment)', async () => {
        let res = await postReq('/core/push/' + queue, '123')
        res.status.should.be.equal(200)
        await flw()

        res = await getReq('/restricted/queue/list')
        let q = await getQ()
        q.total_messages.should.be.equal(1)
        q.messages_in_queue.should.be.equal(1)
        q.total_bytes.should.be.equal(3)
        q.bytes_in_queue.should.be.equal(3)
    })

    it('should check if messages in queue is updated (decrement)', async () => {
        let res = await getReq('/core/pull/' + queue)
        res.status.should.be.equal(200)
        await flw()

        res = await getReq('/restricted/queue/list')
        let q = await getQ()
        q.total_messages.should.be.equal(1)
        q.messages_in_queue.should.be.equal(0)
        q.total_bytes.should.be.equal(3)
        q.bytes_in_queue.should.be.equal(0)
    })

    it('should check if messages in queue is updated (not below zero)', async () => {
        let res = await getReq('/core/pull/' + queue)
        res = await getReq('/core/pull/' + queue)
        res = await getReq('/core/pull/' + queue)
        res = await getReq('/core/pull/' + queue)
        res.status.should.be.equal(200)
        await flw()

        res = await getReq('/restricted/queue/list')
        let q = await getQ()
        q.total_messages.should.be.equal(1)
        q.messages_in_queue.should.be.equal(0)
        q.total_bytes.should.be.equal(3)
        q.bytes_in_queue.should.be.equal(0)
    })

    it('should check usage log - 5d', async () => {
        let res = await postReq('/core/push/' + queue, '123')
        res = await getReq('/core/pull/' + queue)
        await flw()

        res = await getReq('/restricted/usage_log/last_5d')

        let now = moment().startOf('hour')

        let d = new Date(res.body.data[0]._id)
        d.getTime().should.be.equal(now.unix() * 1000)
        res.body.data[0].message_pulled.should.be.equal(2)
        res.body.data[0].message_pushed.should.be.equal(2)
    })

    it('should check usage log - today', async () => {
        let res = await getReq('/restricted/usage_log/today')
        res.body.data.message_pulled.should.be.equal(2)
        res.body.data.message_pushed.should.be.equal(2)
        res.body.data.in_queue.should.be.equal(0)
    })

    it('should check usage log - 12h (realtime)', async () => {
        let res = await getReq('/restricted/usage_log/last_12h_queue')
        res.body.data.length.should.be.below(3)
        res.body.data[0].messages.should.be.below(3)
        let q = await getQ()
        res.body.data[0]._id.queue.should.be.equal(q.name)
    })

    it('should return proper messages_in_queue when pulling with counter', async () => {
        let q = 'test_counter'
        await getReq('/core/push/' + q, { data: ['1', '2', 3, 4, 5] })
        let p1 = await getReq('/core/pull/' + q, { count: 100 })
        await getReq('/core/push/' + q, { data: ['1', '2'] })
        let p2 = await getReq('/core/pull/' + q, { count: 10 })

        p1.body.data.length.should.be.equal(5)
        p2.body.data.length.should.be.equal(2)

        await flw()

        let res = await getReq('/restricted/queue/list')
        let queue = res.body.data.filter(q => q.name === 'test_counter').pop()
        queue.messages_in_queue.should.be.equal(0)
    })

    it(`should raise an alarm for messages in queue`, async () => {
        let q = 'test_notification'
        let res = await postReq('/restricted/queue', { name: q, messages_in_queue_notification: 10 })

        await getReq('/core/push/' + q, { data: ['1', '2', 3, 4, 5] })
        await flw()

        res = await getReq('/restricted/queue/list')
        let queue = res.body.data.filter(_q => _q.name === q).pop()
        queue.messages_in_queue_notification_active.should.be.equal(false)

        await getReq('/core/push/' + q, { data: ['1', '2', 3, 4, 5, 6, 7, 8] })
        await flw()
        await QueueRepository.raiseNotificationForMessagesInQueue()

        res = await getReq('/restricted/queue/list')
        queue = res.body.data.filter(_q => _q.name === q).pop()
        queue.messages_in_queue_notification_active.should.be.equal(true)

    })

    it('should step down the alarm after messages are processed', async () => {
        let q = 'test_notification'

        res = await getReq('/restricted/queue/list')
        queue = res.body.data.filter(_q => _q.name === q).pop()
        queue.messages_in_queue_notification_active.should.be.equal(true)

        await getReq('/core/pull/' + q, { count: 1000 })
        await flw()
        await QueueRepository.stepDownNotificationForMessagesInQueue()

        res = await getReq('/restricted/queue/list')
        queue = res.body.data.filter(_q => _q.name === q).pop()
        queue.messages_in_queue_notification_active.should.be.equal(false)

    })

    it(`should purge queue`, async () => {
        await postReq('/core/push/purge_test', '123')

        await flw()
        let res = await getReq('/restricted/queue/list')

        res.body.data
            .filter(q => q.name === 'purge_test').pop().messages_in_queue.should.be.equal(1)

        await postReq('/restricted/queue/purge/purge_test')
        res = await getReq('/restricted/queue/list')

        res.body.data
            .filter(q => q.name === 'purge_test').pop().messages_in_queue.should.be.equal(0)

    })

    it(`should delete queue`, async () => {
        let res = await getReq('/restricted/queue/list')

        res.body.data
            .filter(q => q.name === 'purge_test').length.should.be.equal(1)

        await postReq('/restricted/queue/delete/purge_test')
        res = await getReq('/restricted/queue/list')

        res.body.data
            .filter(q => q.name === 'purge_test').length.should.be.equal(0)

    })

})