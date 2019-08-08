const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator/check');

const QueueRepository = require('../../repository/queue')
const Queue = require('../../models/queue')

/**
 * @swagger
 * path: /api/restricted/queue
 * operations:
 *   -  httpMethod: POST
 *      summary: Dodaje kolejkę
 *      nickname: restricted
 */
router.route('/').post([
    check('name').optional()
], async (req, res, next) => {

    let q 

    if(req.body._id){
        q = await Queue.findOne({ user: req.decoded.id, _id: req.params.id })
    }else{
        try{
            q = await QueueRepository.create(req.body.name, req.decoded.id, req.body.description, req.body.backend_key)
        }catch(e){
            return res.status(500).json({
                status: false,
                error: e.errors
            })
        }
    }

    if(req.body.messages_in_queue_notification){
        q.messages_in_queue_notification_threshold = req.body.messages_in_queue_notification
        q.messages_in_queue_notification = {
            threshold: req.body.messages_in_queue_notification,
            active: false
        }
        await q.save()
    }


    res.json({
        status: true,
        data: {
            _id: q._id
        }
    })
})

/**
 * @swagger
 * path: /api/restricted/queue/show/{id}
 * operations:
 *   -  httpMethod: GET
 *      summary: Zwraca kolejkę
 *      nickname: restricted
 */
router.route('/show/:id').get(async (req, res, next) => {

    let q = await Queue.findOne({ user: req.decoded.id, _id: req.params.id })

    res.json({
        status: true,
        data: {
            _id: q._id,
            name: q.name,
            settings: q.settings || {}
        }
    })
})

/**
 * @swagger
 * path: /api/restricted/queue/list
 * operations:
 *   -  httpMethod: GET
 *      summary: Dodaje kolejkę
 *      nickname: restricted
 */
router.route('/list').get(async (req, res, next) => {

    let data = await Queue.find({ user: req.decoded.id }).populate('backend')

    return res.json({
        status: true,
        data: data.map(q => {
            return {
                _id: q._id,
                name: q.name,
                backend_key: q.backend.key,
                description: q.description,
                short_uuid: q.short_uuid,
                created_at: q.created_at,
                last_pushed: q.last_pushed,
                last_pulled: q.last_pulled,
                total_messages: q.total_messages,
                total_bytes: q.total_bytes,
                messages_in_queue: q.messages_in_queue,
                bytes_in_queue: q.bytes_in_queue,

                messages_in_queue_notification: q.messages_in_queue_notification && q.messages_in_queue_notification.threshold,
                messages_in_queue_notification_active: q.messages_in_queue_notification && q.messages_in_queue_notification.active
            }
        })
    })
})

router.route('/settings/:id').post(async(req, res, next) => {
    let q = await Queue.findOne({ user: req.decoded.id, _id: req.params.id })

    if(!q.settings){
        q.settings = {}
    }

    if(req.body.save_log !== undefined){
        q.settings.save_log = req.body.save_log
    }

    await q.save()

    return res.json({
        status: true
    })

})

/**
 * @swagger
 * path: /api/restricted/queue/delete/{name}
 * operations:
 *   -  httpMethod: GET
 *      summary: Dodaje kolejkę
 *      nickname: restricted
 */
router.route('/delete/:name').post(async (req, res, next) => {
    let error = await QueueRepository.delete(req.params.name, req.decoded.id)

    res.json({
        error: error,
        status: true
    })
})

/**
 * @swagger
 * path: /api/restricted/queue/purge/{id}
 * operations:
 *   -  httpMethod: GET
 *      summary: Dodaje kolejkę
 *      nickname: restricted
 */
router.route('/purge/:name').post(async (req, res, next) => {
    let error = await QueueRepository.purge(req.params.name, req.decoded.id)

    res.json({
        error: error,
        status: true
    })
})

module.exports = router