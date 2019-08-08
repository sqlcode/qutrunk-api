process.env.NODE_ENV = 'test';

let mongoose = require("mongoose");

//Require the dev-dependencies
let chai = require('chai');
let chaiHttp = require('chai-http');
let server = require('../app');
let should = chai.should();
let qs = require('querystring')

var User = require('../models/user')
var Queue = require('../models/queue')
var MessageLog = require('../models/message_log')
var UserRepository = require('../repository/user')
var MessageLogRepository = require('../repository/message_log')

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

const EMAIL = 'foobar0@gmail.com'
describe('Core - Quota', function() {
    before((done) => {
        fixtures(async () => {

            await QueueStats.purgeQueue()
            await LogWorker.purgeQueue()

            let res = await chai.request(server).post('/api/v1/public/login/email').send({
                email: EMAIL,
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
                ml: 10,
                ql: 5,
                mid: 2
            })
            res.status.should.be.equal(200)

            await User.updateOne({email: EMAIL},{$set: {
                'quota.max_messages_in_queue': 25,
                'quota.max_log_count': 15
            }})

            res = await getReq('/restricted/user/quota')

            res.body.data.max_messages_in_queue.should.be.equal(25)

            done()
        })
    })

    after(async () => {
        await flw()
    })    

    it('should check quota and exhaust messages left', async()=>{
        let res = await getReq('/restricted/user/quota')
        
        let i = res.body.data.messages_left
        while(i){
            let res = await postReq('/core/push/' + queue, '123')
            res.status.should.be.equal(200)
            i--
        }

        await flw()

        res = await postReq('/core/push/' + queue, '123')
        res.status.should.be.equal(507)
        res.body.msg.should.be.equal('Message quota exceeded')
        
        res = await getReq('/restricted/user/quota')
        res.body.data.messages_left.should.be.equal(0)
    })

    it('should check quota and exhaust queue_left', async ()=>{
        await postReq('/restricted/user/quota', {ml: 10})
        let res = await getReq('/restricted/user/quota')

        let i = res.body.data.queues_left
        while(i){
            let q = (queue+(Math.random().toString().substr(3,5)))
            let res = await postReq('/core/push/' + q, '123')
            res.status.should.be.equal(200)
            i--
        }

        await flw()

        res = await postReq('/core/push/' + (queue+(Math.random().toString().substr(3,5))), '123')
        res.status.should.be.equal(507)
        res.body.msg.should.be.equal('Queue creation quota exceeded')
        
        res = await getReq('/restricted/user/quota')
        res.body.data.queues_left.should.be.equal(0)
    })

    it('should check quota and exhaust bytes_left', async ()=>{
        await postReq('/restricted/user/quota', {ml: 1000})
        let res = await getReq('/restricted/user/quota')

        let i = res.body.data.bytes_left
        let sum = 0
        let x = 0
        while(true){
            x++
            let l = Math.round(1000*Math.random())
            sum += l

            let res = await postReq('/core/push/' + queue, Buffer.alloc(l).fill('1').toString())
           
            await flw()

            if(res.status === 507){
                break
            }

            //just for security
            if(x === 25){
                break
            }
        }

        res = await getReq('/restricted/user/quota')
        res.body.data.bytes_left.should.be.below(0)
        sum.should.be.greaterThan(i)

        res = await postReq('/core/push/' + queue, '123')
        res.status.should.be.equal(507)
        res.body.msg.should.be.equal('Message quota exceeded')
        
    })

    it('should check if max_msg_size is applied', async ()=>{
        await postReq('/restricted/user/quota', {bl: 1000})
        let res = await getReq('/restricted/user/quota')
        
        let l = res.body.data.max_msg_size + 1
        
        res = await postReq('/core/push/' + queue, Buffer.alloc(l).fill('1').toString() )

        res.status.should.be.equal(413)         

        res = await postReq('/core/push/' + queue,Buffer.alloc(l-1).fill('1').toString())

        res.status.should.be.equal(200)           
    })

    it('should check if max_messages_in_queue quota is taken under consideration', async()=>{
        let arr = new Array(25)
        arr.fill(0)
        let res = await postReq('/core/push/' + queue+'?multiple', JSON.stringify(arr))

        await flw()

        res.status.should.be.equal(200)

        res = await postReq('/core/push/' + queue+'?multiple', JSON.stringify(arr))

        await flw()

        res.status.should.be.equal(507)
        res.body.msg.should.be.equal('Too many messages in queue')
    })

    it('should check if message logs are removed after it exceeds quota', async()=>{
        await flw()
        let q = await Queue.findOne({name: queue})
        let count = await MessageLog.countDocuments({queue: q._id})
        count.should.be.greaterThan(20)

        let user = await User.findOne({_id: q.user})
        await MessageLogRepository.clearMessageLogForUser(user, 1000)

        count = await MessageLog.countDocuments({queue: q._id})
        count.should.be.equal(15)
        
    })

})

