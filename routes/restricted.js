const express = require('express');
const moment = require('moment');
const router = express.Router();

const UserRepository = require('../repository/user')
const User = require('../models/user')

const AccessToken = require('../models/access_token')
const Queue = require('../models/queue')
const MessageLog = require('../models/message_log')

const _ = require('lodash')
const config = require('../config')
const fs = require('fs')
const crypto = require('crypto');
const helpers = require('../lib/helpers')
const request = require('request')
const mailer = require('../lib/mailer')

//@todo delete this below
var Chance = require('chance')
var chance = new Chance()

const { check, validationResult } = require('express-validator/check');


let getFileUrl = (token) => {
    if (!token) {
        return null
    }
    return config.address + '/api/public/file/' + token
}

let doRequest = async (value) => {
    return new Promise((resolve, reject) => {
        request(value, (error, response, data) => {
            if (error) reject(error)
            else resolve(data)
        })
    })
}

let asyncRequest = async (value) => {
    return new Promise((resolve, reject) => {
        request(value, (error, response, data) => {
            if (error) reject(error)
            else resolve({ response, data })
        })
    })
}

/**
 * @swagger
 * resourcePath: /restricted
 * description: ścieżki tylko do użytku przez aplikację mobilną
 */

/**
 * @swagger
 * path: /api/restricted/user/password
 * operations:
 *   -  httpMethod: POST
 *      summary: Zmienia hasło usera (tylko dla zarejestrowanych przez email)
 *      nickname: restricted
 *      parameters:
 *        - {name: new_password, paramType: form, required: true,dataType: string}
 */
router.route('/user/password').post(async (req, res, next) => {
    let r = await UserRepository.changePassword(req.decoded.id, req.body.new_password)
    if (!r) {
        return res.json({ status: false, message: err })
    }
    return res.json({ status: true, message: 'user.password_changed' })
})


router.route('/logout').get(function(req, res, next) {
    res.cookie('x-access-token', null)
    res.json({ status: true })
})

/**
 * @swagger
 * path: /api/restricted/status
 * operations:
 *   -  httpMethod: GET
 *      summary: Zwraca status usera
 *      nickname: restricted
 */
router.route('/status').get(async (req, res, next) => {

    let u = req.decoded.id

    let user = await User.findOne({_id: req.decoded.id})

    res.json({
        status: true,
        user: {
            name: user.name || user.email
        }
    })
})

router.route('/user/counters').get(async (req, res, next) => {

    let u = req.decoded.id

    let token = await AccessToken.countDocuments({user: u})
    let queue = await Queue.countDocuments({user: u})
    let user = await User.findOne({_id: u})

    res.json({
        status: true,
        counters: {
            token: token,
            queue: queue,
            quota: user.quota
        },
    })
})

/**
 * @swagger
 * path: /api/restricted/user/profile
 * operations:
 *   -  httpMethod: GET
 *      summary: Zwraca profil usera
 *      nickname: restricted
 */
router.route('/user/profile').get(async (req, res, next) => {

    let u = req.decoded.id

    let user = await User.findOne({_id: req.decoded.id})

    res.json({
        status: true,
        user: {
            github_id: user.github_id,
            google_id: user.google_id,
            bitbucket_id: user.bitbucket_id,
            name: user.name || user.email,
            email: user.email
        }
    })
})


/**
 * @swagger
 * path: /api/restricted/user/quota
 * operations:
 *   -  httpMethod: GET
 *      summary: Zwraca quote
 *      nickname: restricted
 */
/**
 * @swagger
 * path: /api/restricted/user/quota
 * operations:
 *   -  httpMethod: POST
 *      summary: Doładowuje quote
 *      nickname: restricted
 *      parameters:
 *        - {name: ml, paramType: form, required: true,dataType: string, description: messages left}
 *        - {name: ql, paramType: form, required: true,dataType: string, description: queues left}
 *        - {name: mid, paramType: form, required: true,dataType: string, description: max idle days}
 *        - {name: bl, paramType: form, required: true,dataType: string, descritpion: bytes left}
 */
router.route('/user/quota').get(async (req, res, next) => {
    let u = req.decoded.id
    let user = await User.findOne({ _id: u })

    res.json({
        status: true,
        data: user.quota
    })
}).post(async (req, res, next) => {
    let u = req.decoded.id
    let user = await User.findOne({ _id: u })

    let b = req.body
    await UserRepository.addQuota(user, b.ml, b.ql, b.mid, b.bl, req.body.set_q)

    res.json({
        status: true
    })
})

/**
 * @swagger
 * path: /api/restricted/user/quota
 * operations:
 *   -  httpMethod: GET
 *      summary: Zwraca quote
 *      nickname: restricted
 */
router.route('/queue/:id/log').get(async (req, res, next) => {
    let u = req.decoded.id
    let q = await Queue.findOne({ user: req.decoded.id, _id: req.params.id })
    let user = await User.findOne({ _id: u })

    let data = await MessageLog.find({ queue: q._id })

    res.json({
        status: true,
        data: data
    })
})

/**
 * @swagger
 * path: /api/restricted/user/email
 * operations:
 *   -  httpMethod: POST
 *      summary: Zmienia email użytkownika
 *      nickname: restricted
 *      parameters:
 *        - {name: email, paramType: form, required: true,dataType: string}
 */
router.route('/user/email').post([
    check('email').isEmail()
], async function(req, res, next) {

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(422).json({ status: false, errors: errors.array() });
    }

    var u = req.decoded.user

    var exists = await User.findOne({ email: req.body.email })

    if (exists && exists._id !== u._id) {
        return res.status(400).json({
            status: false,
            error: 'email_already_taken'
        })
    }

    u.email = req.body.email

    try {
        await helpers.save(u)
    } catch (e) {
        res.status(400).json({
            status: false,
            error: e.message,
        })
    }

    res.json({
        status: true,
        message: 'email_changed'
    })

})

module.exports = router;