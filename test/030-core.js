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

describe('Core', function() {
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

            res = await postReq('/restricted/queue', {name: 'foo_queue'})
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

    it(`should push one message POST and receive it back using GET`, async ()=>{

        let res = await postReq('/core/push/'+queue, '123')

        res.status.should.be.equal(200)
        res.body.status.should.be.equal(true)
        let uuid = res.body.data[0].uuid
        await flw()

        let ts = new Date()
        res = await getReq('/restricted/queue/list')
        res.body.data[0].total_messages.should.be.equal(1)
        res.body.data[0].messages_in_queue.should.be.equal(1)
        res.body.data[0].total_bytes.should.be.equal(3)
        res.body.data[0].bytes_in_queue.should.be.equal(3)

        res = await getReq('/core/pull/'+queue)
        res.status.should.be.equal(200)
        res.body.data[0].data.should.be.equal('123')
        res.body.data[0].uuid.should.be.equal(uuid)
        
        let received = (new Date(res.body.data[0].ts)).getTime()
        let diff = received - ts.getTime()
        diff.should.be.lessThan(1000)

        await flw()

        res = await getReq('/restricted/queue/list')
        res.body.data[0].total_messages.should.be.equal(1)
        res.body.data[0].messages_in_queue.should.be.equal(0)
        res.body.data[0].total_bytes.should.be.equal(3)
        res.body.data[0].bytes_in_queue.should.be.equal(0)

    })
    it(`should check if quota is updated`, async ()=>{
        await flw()
        let res = await getReq('/restricted/user/quota')
        
        res.body.data.messages_left.should.be.equal(9)
        res.body.data.queues_left.should.be.equal(4)
        res.body.data.bytes_left.should.be.equal(1997)
    })

    it(`should push one message and receive it back using GET`, async ()=>{

        let res = await getReq('/core/push/'+queue, {data: '123'})

        res.status.should.be.equal(200)
        res.body.status.should.be.equal(true)

        res = await getReq('/core/pull/'+queue)
        res.status.should.be.equal(200)
        res.body.data[0].data.should.be.equal('123')
    })

    it(`should check if quota is updated #2`, async ()=>{
        await flw()
        let res = await getReq('/restricted/user/quota')
        
        res.body.data.messages_left.should.be.equal(8)
        res.body.data.queues_left.should.be.equal(4)
        res.body.data.bytes_left.should.be.equal(1994)
    })

    it(`POST ${URL}/core/push/{queue} - multiple messages using POST`, async ()=>{

        let res = await postReq('/core/push/'+queue+'?multiple', JSON.stringify(['fooM', 'barM']))

        res.status.should.be.equal(200)
        res.body.status.should.be.equal(true)

        res = await getReq('/core/pull/'+queue)
        res.body.data[0].data.should.be.equal('fooM')

        res = await getReq('/core/pull/'+queue)
        res.body.data[0].data.should.be.equal('barM')
    }) 

    it(`should check if quota is updated #3`, async ()=>{
        await flw()
        let res = await getReq('/restricted/user/quota')
        
        res.body.data.messages_left.should.be.equal(6)
        res.body.data.queues_left.should.be.equal(4)
        res.body.data.bytes_left.should.be.equal(1986)
    })

    it(`POST ${URL}/core/push/{queue} - multiple messages using GET`, async ()=>{

        let res = await getReq('/core/push/'+queue, {
            data: ['fooGET', 'barGET']
        })

        res.status.should.be.equal(200)
        res.body.status.should.be.equal(true)

        res = await getReq('/core/pull/'+queue)
        res.body.data[0].data.should.be.equal('fooGET')

        res = await getReq('/core/pull/'+queue)
        res.body.data[0].data.should.be.equal('barGET')
    })

        it(`should check if quota is updated #4`, async ()=>{
        await flw()
        let res = await getReq('/restricted/user/quota')
        
        res.body.data.messages_left.should.be.equal(4)
        res.body.data.queues_left.should.be.equal(4)
        res.body.data.bytes_left.should.be.equal(1974)
    })

    it(`Should send some messages and purge a queue`, async ()=>{
        let res
        await getReq('/core/push/'+queue, {data: '123'})
        await getReq('/core/push/'+queue, {data: '456'})

        await flw()
        
        res = await getReq('/restricted/queue/list')
        res.body.data[0].name.should.be.equal('foo_queue')
        
        res.body.data[0].total_messages.should.be.equal(8)
        res.body.data[0].messages_in_queue.should.be.equal(2)

        res = await postReq('/restricted/queue/purge/'+queue)
        res.status.should.be.equal(200)

        res = await getReq('/restricted/queue/list')
        res.body.data[0].total_messages.should.be.equal(8)
        res.body.data[0].messages_in_queue.should.be.equal(0)
    })

    it(`Should send some messages and delete a queue`, async ()=>{

        res = await getReq('/restricted/queue/list')
        res.body.data[0].name.should.be.equal('foo_queue')

        res = await postReq('/restricted/queue/delete/'+queue)
        res.status.should.be.equal(200)
        
        res = await getReq('/restricted/queue/list')
        res.body.data.length.should.be.equal(0)
    })

    it(`should check if quota is updated #5`, async ()=>{
        await flw()
        let res = await getReq('/restricted/user/quota')
        
        res.body.data.messages_left.should.be.equal(2)
        res.body.data.queues_left.should.be.equal(5)
        res.body.data.bytes_left.should.be.equal(1968)
    })

    let qt = 'test_queue_create'
    it(`Should create a queue with first message`, async()=>{
        let res = await getReq('/core/push/'+qt, {data: 'test_msg'})
        res.status.should.be.equal(200)
        res.body.data[0].uuid.should.not.be.empty
    })

    it(`Should pull a message from previously created queue`, async()=>{
        let res = await getReq('/core/pull/'+qt)
        res.body.data[0].data.should.be.equal('test_msg')
    })

    it(`should check if quota is updated #6`, async ()=>{
        await flw()
        let res = await getReq('/restricted/user/quota')
        
        res.body.data.messages_left.should.be.equal(1)
        res.body.data.queues_left.should.be.equal(4)
        res.body.data.bytes_left.should.be.equal(1960)
    })

    it(`Should push 5 messages and pull 5 messages in one request`, async()=>{
        let q = 'test_queue_2'
        await getReq('/core/push/'+q, {data: '1'})
        await getReq('/core/push/'+q, {data: '2'})
        await getReq('/core/push/'+q, {data: '3'})
        await getReq('/core/push/'+q, {data: '4'})
        await getReq('/core/push/'+q, {data: '5'})

        let res = await getReq('/core/pull/'+q, {count:10})
        res.body.data.length.should.be.equal(5)

        let s = 0
        res.body.data.forEach(n => s = s + parseInt(n.data))
        s.should.be.equal(15)
    })

    it(`Should push 6 messages and pull 2x3 messages in one request`, async()=>{
        let q = 'test_queue_2'
        await getReq('/core/push/'+q, {data: '1'})
        await getReq('/core/push/'+q, {data: '2'})
        await getReq('/core/push/'+q, {data: '3'})
        await getReq('/core/push/'+q, {data: '4'})
        await getReq('/core/push/'+q, {data: '5'})
        await getReq('/core/push/'+q, {data: '6'})

        let s = 0
        let res = await getReq('/core/pull/'+q, {count:3})
        res.body.data.length.should.be.equal(3)
        res.body.data.forEach(n => s = s + parseInt(n.data))

        res = await getReq('/core/pull/'+q, {count:3})
        res.body.data.length.should.be.equal(3)
        res.body.data.forEach(n => s = s + parseInt(n.data))

        s.should.be.equal(21)
    })

    it('should push and pull message with JSONP', async () => {
        let res = await getReq('/core/push/test', {data: '1', jsonp:'callback'})
        res.body.substr(0,9).should.be.equal('callback(')
        let jres = JSON.parse(res.body.substr(9).slice(0,-1))

        jres.data[0].should.have.property('uuid')
        let uuid = jres.data[0].uuid

        res = await getReq('/core/pull/test', {jsonp: 'callback'})
        res.body.substr(0,9).should.be.equal('callback(')

        jres = JSON.parse(res.body.substr(9).slice(0,-1))

        jres.data[0].uuid.should.be.equal(uuid)
        jres.data[0].data.should.be.equal('1')
    })

    it('should check if max size message is denied', async () => {
        let res = await postReq('/core/push/'+queue, Buffer.alloc(1025).fill('1').toString())
        res.status.should.be.equal(413)
    })

    it('should check if max size message in list is denied', async () => {
        let res = await postReq('/core/push/'+queue+'?multiple', JSON.stringify([
                Buffer.alloc(10).fill('1').toString(),
                Buffer.alloc(1025).fill('1').toString()
            ]))
        res.status.should.be.equal(413)
    })

    let messageLogId
    it('should check restricted api for message logs', async () => {
        await flw()
        let res = await getReq('/restricted/log/list', {limit:5})

        res.body.count.should.be.equal(13)
        res.body.data.length.should.be.equal(5)
        messageLogId = res.body.data[0]._id
    })

    it('should fetch one log value from restricted api', async() => {
        let res = await getReq('/restricted/log/show/'+messageLogId)

        res.status.should.be.equal(200)
        res.body.data.data.should.be.equal('1')
        res.body.data.queue.name.should.be.equal('test')

        res.body.data.processed_at.should.not.be.equal(null)
        res.body.data.pulled_ip.should.not.be.equal(null)
        res.body.data.pulled_access_token.should.not.be.equal(null)
        res.body.data.pushed_ip.should.not.be.equal(null)
        res.body.data.pushed_access_token.should.not.be.equal(null)

    })
})