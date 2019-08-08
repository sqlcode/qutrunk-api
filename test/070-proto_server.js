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

let grpcClient = require('../proto/client')
let protoServer = require('../proto/server')
let protoClient = new grpcClient

describe('Core', function() {
    before((done) => {
        fixtures(async () => {

            await protoServer.startGrpcServer()

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

            res = await postReq('/restricted/queue', { name: 'proto_queue' })
            res = await getReq('/restricted/queue/list')
            queue = res.body.data[0].name

            res = await postReq('/restricted/user/quota', {
                ml: 10000,
                ql: 50,
                mid: 2
            })
            res.status.should.be.equal(200)

            done()
        })
    })

    it(`should download .proto file definition`, async ()=>{
        let res = await getReq('/public/grpc/proto/queue.proto')

        res.text.length.should.be.greaterThan(100)
        res.text.indexOf('service Queue').should.be.greaterThan(0)
    })

    it(`should send one message over proto`, async () => {
        let res = await protoClient.push(
            queue,
            ACCESS_TOKEN,
            "proto test"
        )

        res.status.should.be.equal(200)
        res.message_uuid.should.not.be.empty

        await flw()
        res = await getReq('/restricted/queue/list')
        res.body.data[0].total_messages.should.be.equal(1)
        res.body.data[0].messages_in_queue.should.be.equal(1)
        res.body.data[0].total_bytes.should.be.equal(10)
        res.body.data[0].bytes_in_queue.should.be.equal(10)
    })

    it(`should pull one message from non existing queue`, async ()=>{
        let res = await protoClient.pull(
            'non_existent',
            ACCESS_TOKEN,
        )

        res.status.should.be.equal(404)
        res.description.should.be.equal('queue_not_found')
    })

    it(`should pull one message over proto`, async () => {
        let res = await protoClient.pull(
            queue,
            ACCESS_TOKEN,
        )

        res.status.should.be.equal(200)
        res.message.data.should.be.equal('proto test')

        await flw()

        res = await getReq('/restricted/queue/list')
        res.body.data[0].total_messages.should.be.equal(1)
        res.body.data[0].messages_in_queue.should.be.equal(0)
        res.body.data[0].total_bytes.should.be.equal(10)
        res.body.data[0].bytes_in_queue.should.be.equal(0)
    })

    it(`should send multiple messages over proto`, async () => {
        let res = await protoClient.push(queue, ACCESS_TOKEN, "proto test1")
        res.status.should.be.equal(200)
        res.message_uuid.should.not.be.empty

        res = await protoClient.push(queue, ACCESS_TOKEN, "proto test2")
        res.status.should.be.equal(200)
        res.message_uuid.should.not.be.empty

        res = await protoClient.push(queue, ACCESS_TOKEN, "proto test3")
        res.status.should.be.equal(200)
        res.message_uuid.should.not.be.empty

        await flw()

        res = await getReq('/restricted/queue/list')
        res.body.data[0].total_messages.should.be.equal(4)
        res.body.data[0].messages_in_queue.should.be.equal(3)
        res.body.data[0].total_bytes.should.be.equal(43)
        res.body.data[0].bytes_in_queue.should.be.equal(33)
    })

    it(`should receive multiple messages over proto`, async () => {
        let res = await protoClient.pull(queue, ACCESS_TOKEN)
        res.status.should.be.equal(200)
        res.message.data.should.be.equal('proto test1')

        res = await protoClient.pull(queue, ACCESS_TOKEN)
        res.status.should.be.equal(200)
        res.message.data.should.be.equal('proto test2')

        res = await protoClient.pull(queue, ACCESS_TOKEN)
        res.status.should.be.equal(200)
        res.message.data.should.be.equal('proto test3')

        await flw()

        res = await getReq('/restricted/queue/list')
        res.body.data[0].total_messages.should.be.equal(4)
        res.body.data[0].messages_in_queue.should.be.equal(0)
        res.body.data[0].total_bytes.should.be.equal(43)
        res.body.data[0].bytes_in_queue.should.be.equal(0)
    })

    it(`should receive push some messages and receive them over proto`, async () => {
        let res = await protoClient.push(queue, ACCESS_TOKEN, "proto test1")
        res.status.should.be.equal(200)
        res.message_uuid.should.not.be.empty

        res = await protoClient.push(queue, ACCESS_TOKEN, "proto test2")
        res.status.should.be.equal(200)
        res.message_uuid.should.not.be.empty

        res = await protoClient.pull(queue, ACCESS_TOKEN)
        res.status.should.be.equal(200)
        res.message.data.should.be.equal('proto test1')

        res = await protoClient.pull(queue, ACCESS_TOKEN)
        res.status.should.be.equal(200)
        res.message.data.should.be.equal('proto test2')

        res = await protoClient.push(queue, ACCESS_TOKEN, "proto test3")
        res.status.should.be.equal(200)
        res.message_uuid.should.not.be.empty

        res = await protoClient.pull(queue, ACCESS_TOKEN)
        res.status.should.be.equal(200)
        res.message.data.should.be.equal('proto test3')

    })

    let q = 'new_queue'
    let c = "proto test create"
    it(`should send one message and create queue`, async () => {
        let res = await protoClient.push(q, ACCESS_TOKEN, c)
        res.status.should.be.equal(200)
        res.message_uuid.should.not.be.empty
    })

    it(`should pull one message from previously created queue`, async () => {
        let res = await protoClient.pull(q, ACCESS_TOKEN, )
        res.status.should.be.equal(200)
        res.message.data.should.be.equal(c)
    })

    let SUB_CB = () => {}
    it(`should start global subscription call`, () => {
        let call = protoClient.subscribe(queue, ACCESS_TOKEN, (msg) => {
            SUB_CB(msg)
        })
        call.on('error', e => {})

    })

    it(`should send a message and then read it back in a single subscribe operation`, (done) => {

        SUB_CB = (msg) => {
            msg.data.should.be.equal('proto test stream')
            done()
        }

        protoClient.push(queue, ACCESS_TOKEN, "proto test stream").then(r => {
            r.status.should.be.equal(200)
            r.message_uuid.should.not.be.empty
        }).catch(() => {})

    })

    it(`should send some messages and then read them back in a single subscribe operation`, (done) => {
        let alpha = 'abcdefgh'
        let buff = []

        SUB_CB = (msg) => {
            buff.push(msg.data)

            if (buff.length === alpha.length) {
                buff.sort().join('').should.be.equal(alpha)
                done()
            }
        }

        alpha.split('').forEach(l => {
            protoClient.push(queue, ACCESS_TOKEN, l).then(r => {
                r.status.should.be.equal(200)
                r.message_uuid.should.not.be.empty
            })
        })

    })

    it(`should send some messages and then read them back in a single subscribe operation - 10x more`, (done) => {
        let alpha = 100
        let i = 0

        SUB_CB = (msg) => {
            i = +parseInt(msg.data)

            if (i === alpha) {
                i.should.be.equal(alpha)
                done()
            }
        }

        for (var a = 0; a <= alpha; a++) {
            protoClient.push(queue, ACCESS_TOKEN, a).then(r => {
                r.status.should.be.equal(200)
                r.message_uuid.should.not.be.empty
            })
        }

    })

    it(`should handle multiple clients pushing simultaneously on queue that does not exists (only one queue should be created)`, done => {
        let alpha = 20
        let q = 'proto_multi_create'
        let p = []
        for (var a = 0; a <= alpha; a++) {
            p.push(protoClient.push(q, ACCESS_TOKEN, a))
        }
        Promise.all(p).then(async (res) => {
            res = await getReq('/restricted/queue/list')

            let d = res.body.data.filter(q => q.name === 'proto_multi_create')
            d.length.should.be.equal(1)
            done()
        })
    })

    it(`should create 3 producers and 5 clients, subscribe them under one queue and read messages simultaneously`, done => {
        let alpha = 10
        let q = 'proto_queue_multi'
        let p = []

        let producers = [new grpcClient, new grpcClient, new grpcClient]
        for (var a = 0; a < alpha; a++) {
            for (var b = 0; b < producers.length; b++) {
                p.push(producers[b].push(q, ACCESS_TOKEN, a))
            }
        }

        Promise.all(p).then(async (res) => {
            let i = 0
            let sum = 0
            let cons = [0, 0, 0, 0, 0]

            for (var w = 0; w < cons.length; w++) {
                let c = new grpcClient
                let _w = w
                c.subscribe(q, ACCESS_TOKEN, msg => {
                    sum++
                    cons[_w]++

                    if (sum === (producers.length * alpha)) {
                        sum.should.be.equal(producers.length * alpha)

                        for (var l = 0; l < cons.length; l++) {
                            cons[l].should.be.greaterThan(0)
                        }

                        done()
                    }
                })
            }
        })
    })


    it(`should create 2 producers and 2 clients, read messages with gaps`, done => {
        let alpha = 2
        let passes = 3;
        let passesCount = 0;
        let q = 'proto_queue_multi_2'
        let p = []

        let createPass = () => {
            for (var a = 0; a < alpha; a++) {
                for (var b = 0; b < producers.length; b++) {
                    p.push(producers[b].push(q, ACCESS_TOKEN, a))
                }
            }
            passes--
            passesCount++
        }

        let producers = [new grpcClient, new grpcClient]

        createPass()
        Promise.all(p).then(async (res) => {
            let i = 0
            let sum = 0
            let cons = [0, 0, 0, 0]

            for (var w = 0; w < cons.length; w++) {
                let c = new grpcClient
                let _w = w
                c.subscribe(q, ACCESS_TOKEN, async msg => {
                    sum++
                    cons[_w]++

                    if (passes === 0 && (sum === (producers.length * alpha * passesCount))) {
                        sum.should.be.equal(producers.length * alpha * passesCount)

                        for (var l = 0; l < cons.length; l++) {
                            cons[l].should.be.greaterThan(0)
                        }
                        done()
                    }

                    if (sum % (producers.length * alpha) === 0) {
                        await sleep(500)
                        createPass()
                    }

                })
            }
        })
    })

})