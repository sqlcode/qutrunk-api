process.env.NODE_ENV = 'test';

let mongoose = require("mongoose");

//Require the dev-dependencies
let chai = require('chai');
let chaiHttp = require('chai-http');
let server = require('../app');
let should = chai.should();
let qs = require('querystring')

var User = require('../models/user')
var Log = require('../models/message_log')
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

let getReq = (url,data) => {
    if(!data){
        data = {}
    }

    data.access_token = url.indexOf('/core') === 0 ? ACCESS_TOKEN : USER_ACCESS_TOKEN
    return chai.request(server).get(URL + url+'?'+qs.stringify(data))
}


function sleep(ms) {
    if(ms <= 0){
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
    await QueueStats.startWorker(1,0)
    await LogWorker.startWorker(1,0)
}

describe('Queue', function() {
    before((done) => {
        fixtures(async () => {

            await QueueStats.purgeQueue()
            await LogWorker.purgeQueue()

            let res = await chai.request(server).post('/api/v1/public/login/email').send({ 
                email: 'foobar0@gmail.com', password: 'foobar' 
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

            res = await postReq('/restricted/queue', {name: 'test_settings'})
            res = await getReq('/restricted/queue/list')
            queue = res.body.data[0].name
            queueId = res.body.data[0]._id

            res = await postReq('/restricted/user/quota', {
                ml: 10,
                ql: 5,
                mid: 2
            })
            res.status.should.be.equal(200)

            done()
        })
    })

    it(`should push one message and save log message`, async ()=>{

        let res = await postReq('/core/push/'+queue, '123')

        res.status.should.be.equal(200)
        res.body.status.should.be.equal(true)
        let uuid = res.body.data[0].uuid
        await flw()

        res = await getReq('/restricted/log/list', {queue: queueId})
        res.body.data.length.should.be.equal(1)

    })

    it('should disable saving log messages for queue', async ()=>{

        let res = await postReq('/restricted/queue/settings/'+queueId, {save_log: false})
        res.body.status.should.be.equal(true)

        res = await postReq('/core/push/'+queue, '123')

        res.status.should.be.equal(200)
        res.body.status.should.be.equal(true)
        let uuid = res.body.data[0].uuid
        await flw()

        res = await getReq('/restricted/log/list', {queue: queueId})
        res.body.data.length.should.be.equal(1)

    })

    it('should pull 2 messages from queue and still should be only one log', async()=>{
        let res = await getReq('/core/pull/'+queue)
        res.body.data.length.should.be.equal(1)
        
        res = await getReq('/core/pull/'+queue)
        res.body.data.length.should.be.equal(1)

        res = await getReq('/core/pull/'+queue)
        res.body.data.length.should.be.equal(0)

        await flw()

        let count = await Log.countDocuments()
        count.should.be.equal(1)
        
        res = await getReq('/restricted/log/list', {queue: queueId})
        res.body.data.length.should.be.equal(1)
    })

    it('should enable saving log messages for queue', async ()=>{

        let res = await postReq('/restricted/queue/settings/'+queueId, {save_log: true})
        res.body.status.should.be.equal(true)

        res = await postReq('/core/push/'+queue, '123')

        res.status.should.be.equal(200)
        res.body.status.should.be.equal(true)
        let uuid = res.body.data[0].uuid
        await flw()

        res = await getReq('/restricted/log/list', {queue: queueId})
        res.body.data.length.should.be.equal(2)

    })
})