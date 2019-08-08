process.env.NODE_ENV = 'test';

let mongoose = require("mongoose");

//Require the dev-dependencies
let chai = require('chai');
let chaiHttp = require('chai-http');
let server = require('../app');
let should = chai.should();

var User = require('../models/user')
var UserRepository = require('../repository/user')

var fixtures = require('../lib/fixtures')
chai.use(chaiHttp);

let URL = '/api/v1/restricted'

let ACCESS_TOKEN
let HEADER = 'x-access-token'

let postReq = (url, data) => {
    return chai.request(server).post(URL + url).set(HEADER, ACCESS_TOKEN).send(data)
}

let getReq = (url) => {
    return chai.request(server).get(URL + url).set(HEADER, ACCESS_TOKEN)
}

describe('Restricted', function() {
    before((done) => {
        fixtures(async () => {
            let res = await chai.request(server).post('/api/v1/public/login/email').send({ 
                email: 'foobar0@gmail.com', password: 'foobar' 
            })
            ACCESS_TOKEN = res.body.access_token
            done()
        })
    })

    it(`POST ${URL}/user/password`, async () => {
        let res = await postReq('/user/password',
            { new_password: '654321' })
        res.should.have.status(200);
        res.body.should.have.property('status');
        res.body.message.should.be.equal('user.password_changed')
        res.body.status.should.equal(true);
    })

    it(`GET ${URL}/status`, async ()=>{
        let res = await getReq('/status')
        res.status.should.be.equal(200)
        res.body.user.should.have.property('name')
        res.body.user.name.should.be.equal('foobar0@gmail.com')
    })

    // read, add, remove, read access tokens
    it(`GET ${URL}/access_token/list`, async ()=>{
        let res = await getReq('/access_token/list')
        res.status.should.be.equal(200)
        res.body.data.length.should.be.equal(0)
    })

    let atId
    it(`POST ${URL}/access_token`, async ()=>{
        let res = await postReq('/access_token',{
            active: true
        })
        res.status.should.be.equal(200)
        atId = res.body.data._id
        atId.should.not.be.equal(null)

        res = await getReq('/access_token/list')
        res.status.should.be.equal(200)
        res.body.data.length.should.be.equal(1)
        res.body.data[0].should.have.property('value')
        res.body.data[0]._id.should.be.equal(atId)
    })

    it(`GET ${URL}/access_token/show/:id`, async ()=>{
        let res = await getReq('/access_token/show/'+atId)

        res.status.should.be.equal(200)

        res.body.data.active.should.be.equal(true)
        res.body.data.access_push.should.be.equal(false)
        res.body.data.access_pull.should.be.equal(false)
        res.body.data.access_create_queue.should.be.equal(false)
    })

    it(`POST ${URL}/access_token - edit`, async ()=>{
        let res = await postReq('/access_token',{
            _id: atId,
            active: false,
            name: 'api',
            access_push: true,
            access_pull: true,
            access_create_queue: true
        })
        res.status.should.be.equal(200)

        res = await getReq('/access_token/show/'+atId)

        res.status.should.be.equal(200)
        res.body.data.active.should.be.equal(false)
        res.body.data.name.should.be.equal('api')
        res.body.data.access_push.should.be.equal(true)
        res.body.data.access_pull.should.be.equal(true)
        res.body.data.access_create_queue.should.be.equal(true)
    })

    it(`POST ${URL}/access_token/delete`, async ()=>{
        let res = await postReq('/access_token/delete/'+atId)
        res.status.should.be.equal(200)

        res = await getReq('/access_token/list')
        res.status.should.be.equal(200)
        res.body.data.length.should.be.equal(0)
    })
    // read, add, remove, read access tokens

    let queueId
    it(`GET ${URL}/queue/list`, async ()=>{
        let res = await getReq('/queue/list')
        res.status.should.be.equal(200)
        res.body.data.length.should.be.equal(0)
    })
    it(`POST ${URL}/queue`, async ()=>{
        let res = await postReq('/queue', {
            name: 'foo_queue',
            description: 'description'
        })
        res.status.should.be.equal(200)
        queueId = res.body.data._id
        queueId.should.not.be.equal(null)

        res = await getReq('/queue/list')
        res.status.should.be.equal(200)
        res.body.data.length.should.be.equal(1)
        res.body.data[0].should.have.property('name')
        res.body.data[0].should.have.property('short_uuid')
        res.body.data[0].should.have.property('description')
        res.body.data[0].description.should.be.equal('description')
        res.body.data[0]._id.should.be.equal(queueId)
    })

    it(`POST ${URL}/user/quota`, async()=>{
        let res = await postReq('/user/quota', {
            ml: 10,
            ql: 5,
            mid: 2
        })
        res.status.should.be.equal(200)
        res.body.status.should.be.equal(true)
    })

    it(`GET ${URL}/user/quota`, async()=>{
        let res = await getReq('/user/quota')
        res.status.should.be.equal(200)
        
        res.body.status.should.be.equal(true)
        res.body.data.messages_left.should.equal(10)
        res.body.data.queues_left.should.equal(5)
        res.body.data.max_idle_days.should.equal(2)
    })

    it(`POST ${URL}/user/quota - power up`, async()=>{
        let res = await postReq('/user/quota', {
            ml: 1,
            ql: 1,
            mid: 3
        })
        res.status.should.be.equal(200)
        res.body.status.should.be.equal(true)
    })

    it(`GET ${URL}/user/quota`, async()=>{
        let res = await getReq('/user/quota')
        res.status.should.be.equal(200)

        res.body.status.should.be.equal(true)
        res.body.data.messages_left.should.equal(11)
        res.body.data.queues_left.should.equal(6)
        res.body.data.max_idle_days.should.equal(3)
    })

})