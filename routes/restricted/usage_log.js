const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator/check');
const Queue = require('../../models/queue')
const UsageLog = require('../../models/usage_log')
const UsageLogRealtime = require('../../models/usage_log_realtime')
const moment = require('moment')

router.route('/last_5d').get(async (req,res) => {
    let user = req.decoded.id
    let day = moment().startOf('hour').subtract(5, 'day')
    let queues = await Queue.find({user: user}, {_id:1})
    
    let result = await UsageLog.aggregate([
        {$match: {
            queue: {$in: queues.map(q => q._id)},
            date: {$gte: day.toDate()}
        }},
        {$group: {
            _id: "$date",
            message_pulled: {$sum: "$message_pulled"},
            message_pushed: {$sum: "$message_pushed"},
        }},
        {$sort: {_id: 1}}
    ]).exec()

    return res.json({
        status: true,
        data: result
    })
})

router.route('/last_12h_queue').get(async (req,res) => {
    let user = req.decoded.id
    let queues = await Queue.find({user: user}, {_id:1, name:1})
    
    let result = await UsageLogRealtime.aggregate([
        {$match: {
            queue: {$in: queues.map(q => q._id)},
        }},
        {$group: {
            _id: {date:"$date", queue: "$queue"},
            messages: {$sum:{$add: ["$message_pushed"]}},
        }},
        {$sort: {'_id.date': 1}}
    ]).exec()

    result.map(r => {
        let q = queues.filter(q => r._id.queue.equals(q._id)).pop()
        r._id.queue = q.name || q.short_uuid
        return r
    })

    return res.json({
        status: true,
        data: result
    })
})

router.route('/last_24h_queue').get(async (req,res) => {
    let user = req.decoded.id
    let day = moment().startOf('hour').subtract(1, 'day')
    let queueIds = req.query.queues.split(',') || []
    let queues = await Queue.find({user: user, _id: {$in: queueIds}}, {_id:1, name:1})
    
    let result = await UsageLog.aggregate([
        {$match: {
            queue: {$in: queues.map(q => q._id)},
            date: {$gte: day.toDate()}
        }},
        {$group: {
            _id: {date:"$date", queue: "$queue"},
            messages: {$sum:{$add: ["$message_pulled", "$message_pushed"]}},
        }},
        {$sort: {'_id.date': 1}}
    ]).exec()

    return res.json({
        status: true,
        data: result
    })
})

router.route('/last_5d_queue').get(async (req,res) => {
    let user = req.decoded.id
    let day = moment().startOf('hour').subtract(5, 'day')
    let queues = await Queue.find({user: user}, {_id:1, name:1})
    
    let result = await UsageLog.aggregate([
        {$match: {
            queue: {$in: queues.map(q => q._id)},
            date: {$gte: day.toDate()}
        }},
        {$group: {
            _id: {date:"$date", queue: "$queue"},
            messages: {$sum:{$add: ["$message_pulled", "$message_pushed"]}},
        }},
        {$sort: {_id: 1}}
    ]).exec()

    result.map(r => {
        let q = queues.filter(q => r._id.queue.equals(q._id)).pop()
        r._id.queue = q.name || q.short_uuid
        return r
    })

    return res.json({
        status: true,
        data: result
    })
})

router.route('/today').get(async (req,res) => {
    let user = req.decoded.id
    let today = moment().startOf('day')
    let queues = await Queue.find({user: user}, {_id:1})
    
    let result = await UsageLog.aggregate([
        {$match: {
            queue: {$in: queues.map(q => q._id)},
            date: {$gte: today.toDate()}
        }},
        {$group: {
            _id: 'today',
            message_pulled: {$sum: "$message_pulled"},
            message_pushed: {$sum: "$message_pushed"},
        }},
        {$sort: {_id: 1}}
    ]).exec()

    result = result.pop() || {}

    let resultInQueue = await Queue.aggregate([
        {$match: {
            _id: {$in: queues.map(q => q._id)},
        }},
        {$group: {
            _id: 'today',
            count: {$sum: "$messages_in_queue"},
        }},
        {$sort: {_id: 1}}
    ]).exec()

    resultInQueue = resultInQueue.pop() || {}

    return res.json({
        status: true,
        data: {
            message_pulled: result.message_pulled || 0,
            message_pushed: result.message_pushed || 0,
            in_queue: resultInQueue.count || 0
        }
    })
})

module.exports = router