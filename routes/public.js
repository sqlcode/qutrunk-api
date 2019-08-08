const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const UserRepository = require('../repository/user.js')
const User = require('../models/user.js')
const config = require('../config')
const _ = require('lodash')
const fs = require('fs')
const crypto = require('crypto')
const mailer = require('../lib/mailer')
const helpers = require('../lib/helpers')
const { check, validationResult } = require('express-validator/check');

var login = function(user, req, res) {
    var u = {
        id: user.id
    }

    var token = jwt.sign(u, req.app.get('jwtSecret'), {
        expiresIn: 3600 * 24 * 365 * 10
    });

    res.cookie('x-access-token', token)
    req.decoded = u

    return {
        status: true,
        message: 'user.login.success',
        token: token,
        user: u
    }
}

/**
 * @swagger
 * resourcePath: /public
 * description: ścieżki dostępne publicznie
 */

/**
 * @swagger
 * path: /api/v1/public/health
 * operations:
 *   -  httpMethod: GET
 *      summary: Returns a list of static content types
 *      nickname: public
 */
router.route('/health').get(function(req, res, next) {
    res.json({ status: true })
})

/**
 * @swagger
 * path: /api/v1/public/grpc/proto/queue
 * operations:
 *   -  httpMethod: GET
 *      summary: Returns a list of static content types
 *      nickname: public
 */
router.route('/grpc/proto/queue.proto').get(async function(req, res, next) {
    let file = await new Promise(resolve => {
        fs.readFile('proto/simple_queue.proto', (err, res) => {
            resolve(res)
        })
    })

    res.set('Content-Type', 'text/plain')
    res.send(file.toString())
    res.end()
})

/**
 * @swagger
 * path: /api/v1/public/common
 * operations:
 *   -  httpMethod: GET
 *      summary: Zwraca dane potrzebne aplikacjom do działania
 *      nickname: public
 */
router.route('/common').get(function(req, res, next) {
    res.json({ 
        status: true,
        data: {
            google_id: config.google_app_id
        }
     })
})

/**
 * @swagger
 * path: /api/v1/public/user/check_email
 * operations:
 *   -  httpMethod: GET
 *      summary: Sprawdza czy podany adres email jest już zarejestrowany
 *      nickname: public
 *      parameters:
 *         - {name: email, paramType: query, required: true,dataType: string}
 */
router.route('/user/check_email').get([
    check('email').isEmail()
],async function(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(422).json({ status: false, errors: errors.array() });
    }

    const user = await User.findOne({email: req.query.email})

    res.json({
        status:true,
        email_registered: !!user,
    })
})

/**
 * @swagger
 * path: /api/v1/public/user/remind_password
 * operations:
 *   -  httpMethod: POST
 *      summary: Sends a remind password email
 *      nickname: public
 *      parameters:
 *         - {name: email, paramType: form, required: true,dataType: string}
 */
router.route('/user/remind_password').post(async function(req, res, next) {
    var user
    try {
        user = await User.findOne({ email: req.body.email })
    } catch (e) {
        user = null
    }

    if (!user) {
        return res.status(404).json({
            status: false,
            message: 'user_not_found'
        })
    }

    if (user.isSocial()) {
        return res.status(400).json({
            status: false,
            message: 'user_is_social_user'
        })
    }

    let data = {
        link: config.panel_address + "/#/auth/reset/"+UserRepository.generateRemindPasswordCode(user)
    }

    let msg = await mailer.template('email/password_reset.html')

    try{
        let info = await mailer.send(config.smtp.sender, user.email, "Qutrunk.com password reset request", msg, data)
    }catch(e){
        res.status(500).json({
            status: false,
            message: 'message_not_sent_try_again',
            error: e.message
        })
    }

    res.status(200).json({
        status: true,
        message: 'message_sent'
    })

})

/**
 * @swagger
 * path: /api/v1/public/user/reset_password
 * operations:
 *   -  httpMethod: POST
 *      summary: Resets user password (only logged in by email)
 *      nickname: public
 *      parameters:
 *         - {name: code, paramType: form, required: true,dataType: string}
 *         - {name: password, paramType: form, required: true,dataType: string}
 */
router.route('/user/reset_password').post(async function(req, res, next) {
    var code = req.body.code

    var user = await UserRepository.getUserFromRemindPasswordCode(code)

    if (!user) {
        return res.status(400).json({
            status: false,
            message: 'invalid_code'
        })
    }

    user.password = req.body.password

    var err
    try {
        await helpers.save(user)
    } catch (e) {
        return res.json({
            status: false,
            message: e.message
        })
    }

    return res.json({
        status: true,
        message: 'password_changed'
    })
})

/**
 * @swagger
 * path: /api/v1/public/register/email
 * operations:
 *    - httpMethod: POST
 *      summary: Registers a user with email
 *      notes: It returns a JSON object containing a 'status' property 
 *        which indicates whether the operation succeded. A message property 
 *        ontains a description of a success or failure
 *      
 *      nickname: public
 *      parameters:
 *         - {name: email, paramType: form, required: true,dataType: string}
 *         - {name: password, paramType: form, required: true,dataType: string}
 */
router.route('/register/email').post([
    check('email').isEmail(),
    check('password').isLength({min: 6})
],async (req, res, next)=> {

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(422).json({ status: false, errors: errors.array() });
    }

    let user = await UserRepository.register(
        req.body.email, req.body.password
    )

    if (user && user._id) {
        return res.json({
            status: true,
            message: 'user_registered',
            user: {
                id: user._id
            }
        })
    } else {
        return res.json({
            status: false,
            message: user
        })
    }
})

/**
 * @swagger
 * path: /api/v1/public/login/email
 * operations:
 *   -  httpMethod: POST
 *      summary: Login user using email
 *      notes: It returns a JSON object containing a 'status' property 
 *        which indicates whether the operation succeded. A message property 
 *        ontains a description of a success or failure. In addition there is a 
 *        access_token property which holds a token that should be sent
 *        with every request to restricted part of an API. The token should be 
 *        sent as a 'x-access-token' header or 'token' GET parameter. 
 *        The device_id property is needed to recognize whether a user changed his device, 
 *        and apply new push notification subscription for his new device.
 *      nickname: public
 *      parameters:
 *        - {name: email, paramType: form, required: true,dataType: string}
 *        - {name: password, paramType: form, required: true,dataType: string}
 *        - {name: redirect, paramType: form, required: true,dataType: string}
 */
router.route('/login/email').all([
    check('email').isEmail(),
    check('password').isLength({min: 6})
],async (req, res, next)=> {

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(422).json({ status: false, errors: errors.array() });
    }

    let email = req.body.email || req.query.email
    let password = req.body.password ||req.query.password

    let user = await User.findOne({ email: email })
    if (!user) {
        return res.json({ status: false, message: 'user_not_found' })
    }

    if (!user.checkPassword(password)) {
        return res.json({ status: false, message: 'password_invalid' })
    }

    user.last_login = new Date()
    user.save()

    var u = login(user, req, res)

    if(req.query.redirect){
        return res.redirect(config.panel_address)
    }

    return res.json({
        status: true,
        message: 'user logged in',
        user: u.user,
        access_token: u.token
    })
})


let socialLoginHandler = async(req, res, type) => {
    var tokenValid
    switch(type){
        case "fb":
            tokenValid = await UserRepository.checkFbToken(req.body.access_token, req.body.user_id)
        break;
        case "google":
            tokenValid = await UserRepository.checkGplusToken(req.body.access_token, req.body.user_id)
        break;
        break;
    }

    if (!tokenValid && !process.env.TEST) {
        return res.status(403).json({
            status: false,
            message: 'invalid_access_token',
            social_api_response: tokenValid
        })
    }

    let registered = false
    switch(type){
        case "google":
        var u = await User.findOne({google_id: req.body.social_id})
        if(!u){
            u = new User
            u.email = req.body.email
            u.google_id = req.body.social_id
            u.google_access_token = req.body.access_token
            await u.save()
            registered = true
        }
        break
    }

    var u = login(u, req, res)

    if(registered){
        return res.json({
            status: true,
            registered: true,
            message: 'user_registered',
            user: {
                id: u.user,
            },
            access_token: u.token
        })
    }else{
        return res.json({
            status: true,
            registered: false,
            message: 'user_logged_in',
            user: u.user,
            access_token: u.token
        })
    }
}

/**
 * @swagger
 * path: /api/v1/public/login/social/check_access_token/{provider}
 * operations:
 *   -  httpMethod: POST
 *      summary: Metoda służy do sprawdzania czy podany token jest poprawny oraz czy user o podanym id istnieje w bazie
 *      nickname: public
 *      parameters:
 *        - {name: provider, paramType: form, required: true,dataType: string, description: gplus / fb}
 *        - {name: user_id, paramType: form, required: true,dataType: string}
 *        - {name: access_token, paramType: form, required: true,dataType: string}
 */
router.route('/login/social/check_access_token/:provider').post(async (req, res, next)=>{
    var tokenValid = false
    var user = false
    switch(req.params.provider){
        case "google":
            tokenValid = await UserRepository.checkGplusToken(req.body.access_token, req.body.user_id)
            user = await User.findOne({google_id: req.body.user_id})
        break;
    }

    let token
    if(tokenValid && user){
        token = login(user, req, res)
        res.cookie('x-access-token', token.token)
    }

    return res.status(200).json({
        status: true,
        token_valid: tokenValid,
        user_exists: !!user,
        token: token && token.token
    })
})

/**
 * @swagger
 * path: /api/v1/public/login/social/{provider}
 * operations:
 *   -  httpMethod: POST
 *      summary: Login user using social network - gplus / fb / twitter
 *      notes: It returns a JSON object containing a 'status' property 
 *        which indicates whether the operation succeded. A message property 
 *        ontains a description of a success or failure. In addition there is a 
 *        access_token property which holds a token that should be sent
 *        with every request to restricted part of an API. The token should be 
 *        sent as a 'x-access-token' header or 'token' GET parameter.
 *      nickname: public
 *      parameters:
 *        - {name: provider, paramType: form, required: true,dataType: string, description: gplus / fb}
 *        - {name: social_id, paramType: form, required: true,dataType: string}
 *        - {name: access_token, paramType: form, required: true,dataType: string}
 *        - {name: email, paramType: form, required: true,dataType: string}
 *        - {name: name, paramType: form, required: true,dataType: string}
 */
router.route('/login/social/:provider').post(function(req, res, next) {
    socialLoginHandler(req, res, req.params.provider)
})

module.exports = router;
