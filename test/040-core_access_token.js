process.env.NODE_ENV = 'test';

let mongoose = require("mongoose");

//Require the dev-dependencies
let chai = require('chai');
let chaiHttp = require('chai-http');
let server = require('../app');
let should = chai.should();
let qs = require('querystring')

var User = require('../models/user')
var UserRepository = require('../repository/user')

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

    if(typeof data === 'string'){
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

let testStart

describe('Core - Access tokens', function() {
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
                active: true
            })
            res = await getReq('/restricted/access_token/list')
            ACCESS_TOKEN = res.body.data[0].value
            access_token_id = res.body.data[0]._id

            res = await postReq('/restricted/queue', { name: 'foo_queue' })
            res = await getReq('/restricted/queue/list')
            queue = res.body.data[0].name

            res = await postReq('/restricted/user/quota', {
                ml: 10,
                ql: 5,
                mid: 2
            })
            res.status.should.be.equal(200)

            done()
        })
    })

    after(async () => {
        await flw()
    })

    it(`should check if access_token can publish to queue`, async () => {
        testStart = new Date()

        let res = await postReq('/core/push/' + queue, '123')
        res.status.should.be.equal(401)

        res = await postReq('/restricted/access_token', {
            _id: access_token_id,
            access_push: true
        })

        res = await postReq('/core/push/' + queue, '123')
        res.status.should.be.equal(200)
    })

    let queue2 = 'queue_2'
    it(`should check if access_token can create queue on first push`, async () => {
        let res = await postReq('/core/push/' + queue2, '123')
        res.status.should.be.equal(401)

        res = await postReq('/restricted/access_token', {
            _id: access_token_id,
            access_create_queue: true
        })
        res.status.should.be.equal(200)

        res = await postReq('/core/push/' + queue2, '123')
        res.status.should.be.equal(200)
    })

    it(`should check if access_token can can pull from queue`, async () => {
        let res = await getReq('/core/pull/' + queue2)
        res.status.should.be.equal(401)

        res = await postReq('/restricted/access_token', {
            _id: access_token_id,
            access_pull: true
        })

        res = await getReq('/core/pull/' + queue2)
        res.status.should.be.equal(200)
        res.body.data[0].data.should.be.equal('123')

    })

    it(`should push complex json to queue`, async () => {
        let res = await postReq('/core/push/' + queue2, JSON.stringify(complexJson))
        res.status.should.be.equal(200)

        res = await getReq('/core/pull/' + queue2)
        res.status.should.be.equal(200)

        let identical = res.body.data[0].data.length === JSON.stringify(complexJson).length
        identical.should.be.equal(true)
    })

    it(`should check access_token last usage date`, async () => {
        await flw()
        let res = await getReq('/restricted/access_token/list')

        //czy czas rozpoczecia testu jest mniejszy od daty ostatniego uzycia tokenu
        let t = new Date(res.body.data[0].last_used)
        let diff = t.getTime() - testStart.getTime()

        diff.should.be.lessThan(2000)
    })

    it(`should add one queue to access and check if token can push/pull`, async () => {
        let queues = await getReq('/restricted/queue/list')
        queues = queues.body.data

        let res = await postReq('/restricted/access_token', {
            _id: access_token_id,
            queues: [queues[0]._id]
        })

        res.status.should.be.equal(200)

        res = await postReq('/core/push/' + queues[0].name, '123')
        res.status.should.be.equal(200)
        res = await postReq('/core/push/' + queues[1].name, '123')
        res.status.should.be.equal(401)
    })

    it(`should add second queue to access and check if token can push/pull`, async () => {
        let queues = await getReq('/restricted/queue/list')
        queues = queues.body.data

        let res = await postReq('/restricted/access_token', {
            _id: access_token_id,
            queues: [queues[0]._id, queues[1]._id]
        })

        res.status.should.be.equal(200)

        res = await postReq('/core/push/' + queues[0].name, '123')
        res.status.should.be.equal(200)
        res = await postReq('/core/push/' + queues[1].name, '123')
        res.status.should.be.equal(200)
    })

    it(`should check if pulling from queue is available`, async () => {
        let queues = await getReq('/restricted/queue/list')
        queues = queues.body.data

        let res = await postReq('/restricted/access_token', {
            _id: access_token_id,
            queues: [queues[0]._id]
        })

        res.status.should.be.equal(200)

        res = await getReq('/core/pull/' + queues[0].name)
        res.status.should.be.equal(200)
        res = await getReq('/core/pull/' + queues[1].name)
        res.status.should.be.equal(401)
    })

    it(`should check if pulling from another queue is available`, async () => {
        let queues = await getReq('/restricted/queue/list')
        queues = queues.body.data

        let res = await postReq('/restricted/access_token', {
            _id: access_token_id,
            queues: [queues[0]._id, queues[1]._id]
        })

        res.status.should.be.equal(200)

        res = await getReq('/core/pull/' + queues[0].name)
        res.status.should.be.equal(200)
        res = await getReq('/core/pull/' + queues[1].name)
        res.status.should.be.equal(200)
    })

    it(`should deny pushing to queue after deactivating token`, async()=>{
        let res = await postReq('/restricted/access_token', {
            _id: access_token_id,
            active: false
        })

        res = await postReq('/core/push/' + queue2, '123')
        res.status.should.be.equal(401)
    })

    it(`should deny pulling from queue after deactivating token`, async()=>{
        res = await getReq('/core/pull/' + queue2)
        res.status.should.be.equal(401)
    })

})




let complexJson = {
    "id": "0001",
    "type": "donut",
    "name": "Cake",
    "ppu": 0.55,
    "batters": {
        "batter": [
            { "id": "1001", "type": "Regular" },
            { "id": "1002", "type": "Chocolate" },
            { "id": "1003", "type": "Blueberry" },
            { "id": "1004", "type": "Devil's Food" }
        ]
    },
    "topping": [
        { "id": "5001", "type": "None" },
        { "id": "5002", "type": "Glazed" },
        { "id": "5005", "type": "Sugar" },
        { "id": "5007", "type": "Powdered Sugar" },
        { "id": "5006", "type": "Chocolate with Sprinkles" },
        { "id": "5003", "type": "Chocolate" },
        { "id": "5004", "type": "Maple" }
    ]
}