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
//Our parent block

let URL = '/api/v1/public'


let postReq = (url, data) => {
    return chai.request(server).post(URL + url).send(data)
}

let getReq = (url) => {
    return chai.request(server).get(URL + url)
}

const email = 'foobar123@gmail.com'

describe('Public', function() {
    before((done) => {
        fixtures(function() {
            done()
        })
    })

    it(`GET ${URL}/health`, async () => {
        let res = await getReq('/health')
        res.should.have.status(200);
        res.body.should.have.property('status');
    })
    it(`GET ${URL}/user/check_email - email not registered`, async ()=>{
        let res = await chai.request(server).get(URL+ '/user/check_email?email='+email)
        res.status.should.be.equal(200)
        res.body.email_registered.should.be.equal(false)
    })

    let userId
    it(`POST ${URL}/register/email`, async () => {
        let res = await postReq('/register/email', {
            email: email, password: '123456'
        })
    
        res.should.have.status(200);
        res.body.should.have.property('status');
        res.body.status.should.equal(true);
        res.body.should.have.property('user');
        res.body.user.should.have.property('id');
        userId = res.body.user.id
    })

    it(`POST ${URL}/login/email`, async () => {
        let res = await postReq('/login/email',{ 
            email: 'foobar123@gmail.com', password: '123456' 
        })
            
        res.should.have.status(200);
        res.body.should.have.property('status');
        res.body.should.have.property('access_token');
        res.body.status.should.equal(true);
        process.env.USER_ACCESS_TOKEN = res.body.access_token
    })

    it(`GET ${URL}/user/check_email - email registered`, async ()=>{
        let res = await chai.request(server).get(URL+ '/user/check_email?email='+email)
        res.status.should.be.equal(200)
        res.body.email_registered.should.be.equal(true)
    })

    it(`POST ${URL}/login/social/check_access_token/:provider`, async () => {
        let res = await chai.request(server)
            .post(URL + '/login/social/check_access_token/google')
            .send({ user_id: 'fb_id', access_token: '12386876456', type: 'user'})
        res.status.should.be.equal(200)
        res.body.user_exists.should.be.equal(false)
    }) 

    it(`POST ${URL}/login/social/google`, async () => {
        let res = await chai.request(server)
            .post(URL + '/login/social/google')
            .send({ social_id: 'google', access_token: '12386876456'})

        res.should.have.status(200);
        res.body.should.have.property('status');
        res.body.status.should.equal(true);
        res.body.should.have.property('user');
        res.body.user.should.have.property('id');
        res.body.message.should.be.equal('user_registered')

        res = await chai.request(server)
            .post(URL + '/login/social/google')
            .send({ social_id: 'google', access_token: '12386876456'})

        res.should.have.status(200);
        res.body.should.have.property('status');
        res.body.status.should.equal(true);
        res.body.should.have.property('user');
        res.body.user.should.have.property('id');
        res.body.message.should.be.equal('user_logged_in')
    })  

    it(`POST ${URL}/login/social/check_access_token/:provider`, async () => {
        let res = await chai.request(server)
            .post(URL + '/login/social/check_access_token/google')
            .send({ user_id: 'google', access_token: '12386876456'})

        res.status.should.be.equal(200)
        res.body.user_exists.should.be.equal(true)
    })   

    it(`POST ${URL}/user/remind_password - should not send email remind password`, async()=>{
        let res = await postReq('/user/remind_password',{ 
            email: 'not_exists@gmail.com'
        })
        res.status.should.be.equal(404)
        res.body.message.should.be.equal('user_not_found')
    })

    it(`POST ${URL}/user/remind_password - should send email remind password`, async()=>{
        let res = await postReq('/user/remind_password',{ 
            email: 'foobar123@gmail.com'
        })
        res.status.should.be.equal(200)
        res.body.message.should.be.equal('message_sent')
    })

    it(`POST ${URL}/user/reset_password - reset password with generated code`, async ()=> {
        let user = await User.findOne({ _id: userId })
        var code = UserRepository.generateRemindPasswordCode(user)
        
        let res = await postReq('/user/reset_password',{
            code: code,
            password: 'trololo'
        })

        res.should.have.status(200);
        res.body.message.indexOf('changed').should.be.greaterThan(0)

    })
})