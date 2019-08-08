process.env.NODE_ENV = 'test';

let chai = require('chai');
let should = chai.should();

let queueProvider = require('../lib/queue_provider')
let queueProviderDb = require('../lib/queue_provider_db')
let QueueBackendRepository = require('../repository/queue_backend')
let QueueRepository = require('../repository/queue')

let Queue = require('../models/queue')

const Q = 'foo'
let client
var config = require('../config');

var fixtures = require('../lib/fixtures')

var mongoose = require('mongoose');
mongoose.connect(config.mongo, {
    useCreateIndex: true,
    useNewUrlParser: true
});
mongoose.Promise = global.Promise;

let userId = new mongoose.Types.ObjectId()


//this test can be run only after 090* tests have run previously ;-) 
describe('Queue provider & queue provider DB', () => {

    before((done) => {
        fixtures(async () => {
            done()
        })
    })

    it('Should take existing connections to all backends and push & pull message', async () => {

        var backends = ['redis-1', 'mongodb-1', 'rabbitmq-1']

        for (var i = 0; i < backends.length; i++) {

            let client = queueProvider.get(backends[i]).getClient()
            let data = Math.random().toString()

            await client.create('test')
            await client.purge('test')
            await client.push('test', data)
            let msg = await client.pull('test')

            msg.pop().should.be.equal(data)
        }

    })

    it('should close rabbitmq client', async()=>{
        await queueProvider.close('rabbitmq-1')
    })

    it('should close mongodb client', async()=>{
        await queueProvider.close('mongodb-1')
    })

    it('should close redis client', async()=>{
        await queueProvider.close('redis-1')
    })

    let provider
    it('should load all backends from db', async () => {
        provider = new queueProviderDb()
        await provider.loadAndInitializeBackends()

        provider.backends.length.should.be.equal(4)
    })

    it('should return queue client', async () => {
        let q = await Queue.findOne()

        let c = await provider.getClientForQueue(q)

        c.should.not.be.equal(null)
    })

    it('should create a backend and queue, then create connection to backend', async () => {
        await QueueBackendRepository.create(userId, 'rabbitmq', 'rabbit-test', {addr: 'amqp://localhost:5672'})

    })

    it('should push message to newly created queue', async()=>{
        await QueueRepository.create(Q, userId, null, 'rabbit-test')
        await QueueRepository.push(Q, userId, 'data1', {})

    })

    it('should pull message from newly created queue', async()=>{
        let msg = await QueueRepository.pull(Q, userId, 1, {})
        msg.pop().data.should.be.equal('data1')
    })

    it('should push message and purge queue', async()=>{
        await QueueRepository.push(Q, userId, 'data1', {})
        await QueueRepository.purge(Q, userId, 'data1', {})
        let msg = await QueueRepository.pull(Q, userId, 1, {})
        msg.length.should.be.equal(0)
    })

    it('should pulling from queue should return no message', async()=>{
        await QueueRepository.delete(Q, userId, 'data1', {})
        let msg = await QueueRepository.pull(Q, userId, 1, {})
        msg.should.be.equal('queue_not_found')
    })

})