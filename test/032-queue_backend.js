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
var QueueRepository = require('../repository/queue')

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

describe('Queue backend', function() {
    before((done) => {
        fixtures(async () => {

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

            res = await postReq('/restricted/user/quota', {
                ml: 10,
                ql: 5,
                mid: 2
            })
            res.status.should.be.equal(200)


            done()
        })
    })

    it('first backend should be listed as default', async () => {
        let res = await getReq('/restricted/queue_backend/list')

        let el = res.body.data.pop()

        el.key.should.be.equal('rabbit-0')
        el.provider.should.be.equal('rabbitmq')
        el.default.should.be.equal(true)
    })

    it('should try to add backend rabbitmq with invalid address string', async () => {
        let res = await postReq('/restricted/queue_backend/', {
            key: 'rabbit-invliad',
            provider: 'rabbitmq',
            connection: {
                addr: 'invalid'
            }
        })

        res.status.should.be.equal(500)
        res.body.error.indexOf('amqps').should.be.greaterThan(0)
    })

    it('should add non existent rabbitmq queue backend (invalid address)', async () => {
        let res = await postReq('/restricted/queue_backend/', {
            key: 'rabbit-1',
            provider: 'rabbitmq',
            connection: {
                addr: 'amqp://localhost:5214'
            }
        })

        res.body.error.should.be.equal('Cannot connect to backend')
        res.status.should.be.equal(500)
    })

    let rabbit1Id
    it('should add queue backend', async () => {
        let res = await postReq('/restricted/queue_backend/', {
            key: 'rabbit-1',
            provider: 'rabbitmq',
            connection: {
                addr: 'amqp://localhost:5672'
            }
        })

        res.body.data._id.should.not.be.equal(null)
        rabbit1Id = res.body.data._id

    })

    it('added queue should be listed', async () => {
        let res = await getReq('/restricted/queue_backend/list')

        let el = res.body.data.pop()

        el.key.should.be.equal('rabbit-1')
        el.provider.should.be.equal('rabbitmq')
        el.default.should.be.equal(false)
    })

    it('should try to add backend mongodb with invalid address string', async () => {
        let res = await postReq('/restricted/queue_backend/', {
            key: 'mongodb-invliad',
            provider: 'mongodb',
            connection: {
                addr: 'invalid'
            }
        })

        res.status.should.be.equal(500)
        res.body.error.indexOf('mongodb').should.be.greaterThan(0)
    })

    it('should add non existent mongodb queue backend (invalid address)', async () => {
        let res = await postReq('/restricted/queue_backend/', {
            key: 'mongodb-1',
            provider: 'mongodb',
            connection: {
                addr: 'mongodb://localhost:4335/qutrunk_test_backend'
            }
        })

        res.body.error.should.be.equal('Cannot connect to backend')
        res.status.should.be.equal(500)
    })

    it('should add another queue backend but is not default', async () => {
        let res = await postReq('/restricted/queue_backend/', {
            key: 'mongo-1',
            provider: 'mongodb',
            connection: {
                addr: 'mongodb://localhost:27017/qutrunk_test_backend'
            }
        })

        res.body.data._id.should.not.be.equal(null)

        res = await getReq('/restricted/queue_backend/list')

        let el = res.body.data.pop()

        el.key.should.be.equal('mongo-1')
        el.provider.should.be.equal('mongodb')
        el.default.should.be.equal(false)
    })

    it('should not add queue backend with same key', async () => {
        let res = await postReq('/restricted/queue_backend/', {
            key: 'rabbit-1',
            provider: 'rabbitmq',
            connection: {
                addr: 'amqp://localhost:5672'
            }
        })

        res.body.error.should.be.equal('Queue backend with same key already exists')

    })

    it('should change default backend', async () => {
        let res = await postReq('/restricted/queue_backend/change_default', {
            id: rabbit1Id
        })

        res.body.status.should.be.equal(true)

        res = await getReq('/restricted/queue_backend/list')

        res.body.data.filter(q => q.key === 'rabbit-1').pop().default.should.be.equal(true)
    })

    it('should create a queue with default backend, then try to remove it', async () => {
        let res = await getReq('/restricted/queue_backend/list')
        res.body.data.length.should.be.equal(3)

        res = await postReq('/restricted/queue', { name: 'testing' })

        res = await postReq('/restricted/queue_backend/delete/' + rabbit1Id)

        res.body.error.should.be.equal('Cannot remove queue backend, there are queues that use it.')

        res = await postReq('/restricted/queue/delete/testing')
        res.body.status.should.be.equal(true)

        res = await postReq('/restricted/queue_backend/delete/' + rabbit1Id)
        res.body.status.should.be.equal(true)

        res = await getReq('/restricted/queue_backend/list')

        res.body.data.length.should.be.equal(2)
    })

    let queue = 'tst_backend'
    it('should deny receiving a message because backend doesnt exist', async () => {
        let res = await getReq('/core/push/' + queue, { data: '123', backend_key: 'non-existent' })

        res.status.should.be.equal(401)
        res.body.status.should.be.equal(false)
    })

    it('should accept first message for queue with given backend key', async () => {
        let res = await getReq('/core/push/' + queue, { data: '123', backend_key: 'mongo-1' })

        res.status.should.be.equal(200)
        res.body.status.should.be.equal(true)
    })

    it('should check whether a queue was created with correct backend', async () => {
        let res = await getReq('/restricted/queue/list')
        res.body.data.pop().backend_key.should.be.equal('mongo-1')
    })

    it('should not add invalid backend redis with invalid port', async()=>{

        let res = await postReq('/restricted/queue_backend/', {
            key: 'redis-invalid',
            provider: 'redis',
            connection: {
                port: 'asd',
                host: 'localhost'
            }
        })

        res.status.should.be.equal(500)
        res.body.error.indexOf('port').should.be.greaterThan(0)
    })

    it('should not add non existent redis queue backend (invalid address)', async () => {
        let res = await postReq('/restricted/queue_backend/', {
            key: 'redis-invalid',
            provider: 'redis',
            connection: {
                port: '1234',
                host: 'localhost'
            }
        })
        
        res.body.error.should.be.equal('Cannot connect to backend')
        res.status.should.be.equal(500)
    })

    it('should add backend redis', async()=>{

        let res = await postReq('/restricted/queue_backend/', {
            key: 'redis-1',
            provider: 'redis',
            connection: {
                port: 6379,
                host: '127.0.0.1'
            }
        })

        res.status.should.be.equal(200)
    })

})