const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator/check');

const QueueBackendRepository = require('../../repository/queue_backend')
const QueueBackend = require('../../models/queue_backend')

/**
 * @swagger
 * path: /api/restricted/queue_backend
 * operations:
 *   -  httpMethod: POST
 *      summary: It adds queue backend
 *      nickname: restricted
 */
router.route('/').post([
    check('name').optional()
], async (req, res, next) => {

    let q
    try {
        q = await QueueBackendRepository.create(req.decoded.id, req.body.provider, req.body.key, req.body.connection)
    } catch (e) {
        return res.status(500).json({
            status: false,
            error: e.message || e.error.toString()
        })
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
 * path: /api/restricted/queue_backend/change_default
 * operations:
 *   -  httpMethod: POST
 *      summary: It adds queue backend
 *      nickname: restricted
 */
router.route('/change_default').post([
    check('id')
], async (req, res, next) => {

    try {
        await QueueBackendRepository.setDefault(req.body.id, req.decoded.id)
    } catch (e) {
        return res.status(500).json({
            status: false,
            error: e.message
        })
    }

    res.json({
        status: true
    })
})

/**
 * @swagger
 * path: /api/restricted/queue_backend/show/{id}
 * operations:
 *   -  httpMethod: GET
 *      summary: Zwraca kolejkę
 *      nickname: restricted
 */
router.route('/show/:id').get(async (req, res, next) => {

    let q = await QueueBackend.findOne({ user: req.decoded.id, _id: req.params.id })

    res.json({
        status: true,
        data: {
            _id: q._id,
            key: q.key,
            default: q.default,
            provider: q.provider
        }
    })
})

/**
 * @swagger
 * path: /api/restricted/queue_backend/list
 * operations:
 *   -  httpMethod: GET
 *      summary: Dodaje kolejkę
 *      nickname: restricted
 */
router.route('/list').get(async (req, res, next) => {

    let data = await QueueBackend.find({ user: req.decoded.id })

    return res.json({
        status: true,
        data: data.map(q => {
            return {
                _id: q._id,
                key: q.key,
                default: q.default,
                provider: q.provider,
                created_at: q.created_at
            }
        })
    })
})


/**
 * @swagger
 * path: /api/restricted/queue_backend/delete/{id}
 * operations:
 *   -  httpMethod: GET
 *      summary: Dodaje kolejkę
 *      nickname: restricted
 */
router.route('/delete/:id').post(async (req, res, next) => {
    try{
        await QueueBackendRepository.delete(req.params.id, req.decoded.id)        
    }catch(e){
        return res.status(500).json({
            status: false,
            error: e.message
        })
    }

    res.json({
        status: true
    })
})

module.exports = router