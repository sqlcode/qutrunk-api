const Queue = require('../models/queue')
const queueBackend = require('../lib/queue_backend/rabbitmq')
const queueProviderDb = require('../lib/queue_provider_db')
const crypto = require('crypto')

var mongoose = require('mongoose');
const QueueStats = require('../lib/queue_stats_worker')
const LogWorker = require('../lib/log_worker')

const AccessToken = require('../models/access_token')
const QueueBackend = require('../models/queue_backend')
const User = require('../models/user')

const client = new queueBackend
const queueProvider = new queueProviderDb

function randomObjectId() {
    var id = crypto.randomBytes(12).toString('hex');
    return mongoose.Types.ObjectId(id);
}

module.exports = {
    async initQueueProvider() {
        // await client.connect()
        await queueProvider.loadAndInitializeBackends()
    },
    async raiseNotificationForMessagesInQueue(cb) {

        let q = await Queue.aggregate([{
                $match: {
                    'messages_in_queue_notification.threshold': { $gt: 0 },
                    'messages_in_queue_notification.active': false
                }
            },
            {
                $project: {
                    name: '$name',
                    messages_in_queue: '$messages_in_queue',
                    alarm: { $lte: ['$messages_in_queue_notification.threshold', '$messages_in_queue'] }

                }
            },
            { $match: { alarm: true } }
        ]).exec()

        let ids = q.map(q => q._id)
        q = await Queue.find({ _id: { $in: ids } })

        for (var p in q) {
            q[p].messages_in_queue_notification.active = true
            cb && await cb(queue)
            await q[p].save()
        }

    },
    async stepDownNotificationForMessagesInQueue(cb) {

        let q = await Queue.aggregate([{
                $match: {
                    'messages_in_queue_notification.threshold': { $gt: 0 },
                    'messages_in_queue_notification.active': true,
                }
            },
            {
                $project: {
                    name: '$name',
                    messages_in_queue: '$messages_in_queue',
                    alarm: { $gte: ['$messages_in_queue_notification.threshold', '$messages_in_queue'] }

                }
            },
            { $match: { alarm: true } }
        ]).exec()

        let ids = q.map(q => q._id)
        q = await Queue.find({ _id: { $in: ids } })

        for (var p in q) {
            q[p].messages_in_queue_notification.active = false
            cb && await cb(queue)
            await q[p].save()
        }

    },
    async findQueue(queue, userId) {
        return await Queue.findOne({
            name: queue,
            user: userId
        })
    },
    async getQueue(queue, userId, backendKey) {
        //@todo local cache
        let q = await this.findQueue(queue, userId)

        if (q) {
            return q
        }

        return await this.create(queue, userId, null, backendKey)
    },
    async create(name, userId, description, backendKey) {
        let res

        let backend
        if(!backendKey){
            backend = await QueueBackend.findOne({user: userId, default: true})
        }else{
            backend = await QueueBackend.findOne({user: userId, key: backendKey})
        }

        if(!backend){
            throw new Error('Backend does not exist')
        }

        try {

            res = await Queue.findOneAndUpdate({ name: name, user: userId }, {
                $set: {
                    user: userId,
                    name: name,
                    backend: backend,
                    description: description,
                    short_uuid: [userId, name].join('_'),
                    'settings.save_log': true
                }
            }, { upsert: true })
        } catch (e) {
        }

        let queue = await Queue.findOne({ name: name, user: userId })

        let client = await queueProvider.getClientForQueue(queue)
        await client.create(queue.short_uuid)
        // await client.initQueueAndExchange(queue.short_uuid)
        QueueStats.addQueueCreation(userId)

        return queue
    },
    async prePullAction(accessTokenValue, queueNameUuid) {

        let accessToken = accessTokenValue
        if (typeof accessTokenValue === 'string') {
            accessToken = await AccessToken.findOne({ value: accessTokenValue })

            if (!accessToken) {
                return { status: 404, msg: 'Token not found' }
            }
        }

        if (!accessToken.active) {
            return { status: 401, msg: 'Token not active' }
        }

        if (!accessToken.access_pull) {
            return { status: 401, msg: 'Token not authorized to pull' }
        }

        let queue = await this.findQueue(queueNameUuid, accessToken.user)

        if (queue && !accessToken.canAccessQueue(queue._id)) {
            return { status: 401, msg: 'Token not authorized to pull from this certain queue' }
        }

        return { status: 200, queue: queue, accessToken: accessToken }

    },
    async prePushAction(accessTokenValue, queueNameUuid, data, backendKey) {

        let accessToken = accessTokenValue
        if (typeof accessTokenValue === 'string') {
            accessToken = await AccessToken.findOne({ value: accessTokenValue })

            if (!accessToken) {
                return { status: 404, msg: 'Token not found' }
            }
        }

        if (!accessToken.active) {
            return { status: 401, msg: 'Token not active' }
        }

        if (!data) {
            return { status: 400, msg: 'Data missing' }
        }

        if (!accessToken.access_push) {
            return { status: 401, msg: 'Token not authorized to push' }
        }

        let queue = await this.findQueue(queueNameUuid, accessToken.user)

        if (queue && !accessToken.canAccessQueue(queue._id)) {
            return { status: 401, msg: 'Token not authorized to push to this certain queue' }
        }

        let user = await User.findOne({ _id: accessToken.user })
        let quota = user.quota

        if (queue && queue.messages_in_queue > quota.max_messages_in_queue) {
            return { status: 507, msg: 'Too many messages in queue' }
        }

        if (!quota.canPush()) {
            return { status: 507, msg: 'Message quota exceeded' }
        }

        let dataLength = false
        if (data instanceof Array) {
            dataLength = data.filter(el => el.length > quota.max_msg_size).length > 0
        } else {
            dataLength = data.length > quota.max_msg_size
        }

        if (dataLength) {
            return { status: 413, msg: 'Payload too large' }
        }

        if (!accessToken.access_create_queue) {
            if (!queue) {
                return { status: 401, msg: 'Token not authorized to create queue' }
            }
        }

        if (!queue && !quota.canCreateQueue()) {
            return { status: 507, msg: 'Queue creation quota exceeded' }
        }

        if (!queue) {
            try{
                queue = await this.getQueue(queueNameUuid, user._id, backendKey)
            }catch(e){
                return {status: 401, msg: e.message}
            }
        }

        return {
            status: 200,
            queue: queue,
            accessToken: accessToken
        }
    },
    async push(queue, userId, msg, details) {
        let q = await this.getQueue(queue, userId)

        if (!(msg instanceof Array)) {
            msg = [msg]
        }

        let i = 1

        let ids = []
        let bytesTotal = 0
        for (var idx in msg) {

            let d = msg[idx]

            if (typeof d !== 'string') {
                d = JSON.stringify(msg[idx])
            }

            i++
            let payload = {
                uuid: randomObjectId(),
                data: d,
                ts: new Date()
            }

            ids.push({
                uuid: payload.uuid
            })

            bytesTotal += payload.data.length

            if(q.settings && q.settings.save_log){
                await LogWorker.addLog(q._id, payload.uuid, payload.data, details.ip, details.token)
            }

            let client = await queueProvider.getClientForQueue(q)
            await client.push(q.short_uuid, payload)
            // await client.push(q.short_uuid, payload)
        }

        QueueStats.addPushed(q.short_uuid, q.user, msg.length, bytesTotal, q._id)
        return ids
    },
    async pull(queue, userId, count, details) {
        count = parseInt(count) || 1
        let q = await this.findQueue(queue, userId)
        if (!q) {
            return 'queue_not_found'
        }

        let client = await queueProvider.getClientForQueue(q)
        let r = await client.pull(q.short_uuid, count)
        // let r = await client.pull(q.short_uuid, count)
        r = r.map(JSON.parse)

        let bytesTotal = 0
        for (var i in r) {
            bytesTotal += r[i].data.length

            if(q.settings && q.settings.save_log){
                LogWorker.setMessageProcessed(r[i].uuid, details.ip, details.token)
            }
        }

        if (r.length > 0) {
            QueueStats.addPulled(q.short_uuid, q.user, r.length, bytesTotal, q._id)
        }

        return r
    },
    async purge(queue, userId) {
        let q = await this.findQueue(queue, userId)
        if (!q) {
            return 'queue_not_found'
        }

        q.messages_in_queue = 0
        await q.save()

        let client = await queueProvider.getClientForQueue(q)
        await client.purge(q.short_uuid)
        // await client.purge(q.short_uuid)
    },
    async delete(queue, userId) {
        let q = await this.findQueue(queue, userId)
        if (!q) {
            return 'queue_not_found'
        }

        await q.remove()
        let client = await queueProvider.getClientForQueue(q)
        await client.delete(q.short_uuid)
        // await client.delete(q.short_uuid)
        QueueStats.addQueueDeletion(userId)
    },
}