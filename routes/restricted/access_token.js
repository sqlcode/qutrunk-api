const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator/check');

const AccessToken = require('../../models/access_token')
const Queue = require('../../models/queue')

/**
 * @swagger
 * path: /api/restricted/access_token
 * operations:
 *   -  httpMethod: POST
 *      summary: Dodaje kolejkę
 *      nickname: restricted
 */
router.route('/').post(async (req, res, next) => {

    let ac

    if(req.body._id){
        ac = await AccessToken.findOne({_id: req.body._id, user: req.decoded.id})
    }else{
        ac = new AccessToken
        ac.user = req.decoded.id
    }

    for(var p in req.body){
        ac[p] = req.body[p]
    }

    await ac.save()

    res.json({
        status: true,
        data: {
            _id: ac._id
        }
    })
})

/**
 * @swagger
 * path: /api/restricted/access_token/{id}
 * operations:
 *   -  httpMethod: GET
 *      summary: Zwraca token
 *      nickname: restricted
 */
router.route('/show/:id').get(async(req, res) => {

    let ac = await AccessToken.findOne({_id: req.params.id, user: req.decoded.id})

    res.json({
        status: true,
        data: {
            _id: ac._id,
            active: ac.active,
            name: ac.name,
            queues: ac.queues,
            access_push: ac.access_push,
            access_pull: ac.access_pull,
            access_create_queue: ac.access_create_queue
        }
    })
})


/**
 * @swagger
 * path: /api/restricted/access_token/list
 * operations:
 *   -  httpMethod: GET
 *      summary: Zwraca listę access tokenów
 *      nickname: restricted
 */
router.route('/list').get(async (req, res, next) => {

    let data = await AccessToken.find({ user: req.decoded.id }).populate('queues', 'name')
    let queues = await Queue.find({user: req.decoded.id}, {name:1})

    return res.json({
        status: true,
        queues: queues,
        data: data.map(q => {
            return {
                _id: q._id,
                name: q.name,
                value: q.value,
                created_at: q.created_at,
                last_used: q.last_used,
                access_push: q.access_push,
                access_pull: q.access_pull,
                access_create_queue: q.access_create_queue,
                active: q.active,
                queues: q.queues
            }
        })
    })
})

/**
 * @swagger
 * path: /api/restricted/access_token/{id}
 * operations:
 *   -  httpMethod: POST
 *      summary: Dodaje kolejkę
 *      nickname: restricted
 */
router.route('/delete/:id').post([
    check('id').isMongoId()
], async (req, res, next) => {

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(422).json({ status: false, errors: errors.array() });
    }

    let at = await AccessToken.findOne({ _id: req.params.id })

    await at.remove()

    return res.json({
        status: true
    })
})

module.exports = router