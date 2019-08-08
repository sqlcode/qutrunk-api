const queueWorker = require('./queue_worker')
const User = require('../models/user')
const Queue = require('../models/queue')
const UsageLog = require('../models/usage_log')
const UsageLogRealtime = require('../models/usage_log_realtime')
const QUEUE = '__queue_stats'

class queueStats extends queueWorker {

    constructor(bufferSize, standByTimeMs) {
        super(QUEUE, bufferSize, standByTimeMs)
    }

    async processBufferFn() {
        let payload = {}
        let usagePayload = {}
        let user = {}

        this.buffer.forEach(m => {
            let e = JSON.parse(m)

            if (['msg_push', 'msg_pull'].indexOf(e.type) >= 0 &&
                !payload[e.uuid]) {

                payload[e.uuid] = {
                    last_push: null,
                    bytes_push: 0,
                    last_pull: null,
                    bytes_pull: 0,
                    pushed: 0,
                    pulled: 0,
                }
            }

            //usage data
            let usageDate = new Date(e.ts)
            usageDate.setSeconds(0)
            usageDate.setMilliseconds(0)
            let usageKey = e.queue + usageDate.getTime().toString()
            if (['msg_push', 'msg_pull'].indexOf(e.type) >= 0 &&
                !usagePayload[usageKey]) {
                usagePayload[usageKey] = {
                    message_pushed: 0,
                    message_pulled: 0,
                    queue: e.queue,
                    date: usageDate
                }
            }
            //usage data

            if (['queue_create', 'queue_delete', 'msg_push'].indexOf(e.type) >= 0 &&
                !user[e.user_id]) {

                user[e.user_id] = {
                    bytes: 0,
                    messages: 0,
                    queue_create: 0,
                    queue_delete: 0
                }
            }

            let p = payload[e.uuid]

            switch (e.type) {
                case 'queue_create':
                    user[e.user_id].queue_create++
                    break;
                case 'queue_delete':
                    user[e.user_id].queue_delete++
                    break;
                case 'msg_push':
                    payload[e.uuid].last_push = new Date(e.ts)
                    payload[e.uuid].pushed += parseInt(e.count) || 0
                    payload[e.uuid].bytes_push += parseInt(e.bytes) || 0

                    user[e.user_id].messages += parseInt(e.count) || 0
                    user[e.user_id].bytes += parseInt(e.bytes) || 0

                    usagePayload[usageKey].message_pushed += parseInt(e.count) || 0
                    break;
                case 'msg_pull':
                    payload[e.uuid].last_pull = new Date(e.ts)
                    payload[e.uuid].pulled += parseInt(e.count) || 0
                    payload[e.uuid].bytes_pull += parseInt(e.bytes) || 0

                    usagePayload[usageKey].message_pulled += parseInt(e.count) || 0
                    break;
            }
        })

        for (var uuid in payload) {
            let p = payload[uuid]
            await this.updateStats(
                uuid, p.last_push, p.last_pull,
                p.pushed, p.pulled, p.bytes_pull, p.bytes_push
            )

        }

        for (var k in usagePayload) {
            let p = usagePayload[k]
            await this.updateUsage(
                p.queue, p.date,
                p.message_pushed, p.message_pulled
            )
        }

        for (var uid in user) {
            let u = user[uid]
            await this.updateQuota(
                uid, u.messages, u.queue_create,
                u.queue_delete, u.bytes
            )
        }
    }

    async updateQuota(userId, pushCount, queueCreate, queueDelete, bytesPushed) {

        User.updateOne({
            _id: userId
        }, {
            $inc: {
                'quota.bytes_left': -bytesPushed,
                'quota.messages_left': -pushCount,
                'quota.queues_left': (queueDelete - queueCreate),
            }
        }, (err, res) => {
            if (err) {
                console.log('Queue stats worker update quota error', err, res)
            }
        })
    }

    async updateUsage(queueId, date, pushCount, pullCount) {

        let modifier = {
            $set: {
                queue: queueId,
                date: date
            },
            $inc: {
                message_pushed: pushCount,
                message_pulled: pullCount
            }
        }

        let match = {
            queue: queueId,
            date: date
        }

        UsageLogRealtime.updateOne(match, modifier, { upsert: true }, (err, res) => {
            if (err) {
                console.log('Queue stats worker update usage log realtime error', err, res)
            }
        })

        date.setMinutes(0)

        UsageLog.updateOne(match, modifier, { upsert: true }, (err, res) => {
            if (err) {
                console.log('Queue stats worker update usage log error', err, res)
            }
        })
    }

    async updateStats(uuid, lastPushDate, lastPullDate, pushCount, pullCount, bytesPull, bytesPush) {

        let set = {}

        if (lastPullDate) {
            set.last_pulled = lastPullDate
        }

        if (lastPushDate) {
            set.last_pushed = lastPushDate
        }

        Queue.updateOne({ short_uuid: uuid }, {
            $set: set,
            $inc: {
                messages_in_queue: (pushCount - pullCount),
                bytes_in_queue: (bytesPush - bytesPull),
                total_messages: pushCount,
                total_bytes: bytesPush,
            }
        }, (err, res) => {
            if (err) {
                console.log('Queue stats worker update stats error', err, res)
            }
        })
    }

    async addPushed(queueShortUuid, userId, count, bytesTotal, queueId) {
        let msg = {
            type: 'msg_push',
            count: count,
            uuid: queueShortUuid,
            user_id: userId,
            queue: queueId,
            bytes: bytesTotal,
            ts: new Date()
        }

        await this.push(msg)
    }

    async addPulled(queueShortUuid, userId, count, bytesTotal, queueId) {
        let msg = {
            type: 'msg_pull',
            count: count,
            uuid: queueShortUuid,
            user_id: userId,
            queue: queueId,
            bytes: bytesTotal,
            ts: new Date()
        }

        await this.push(msg)
    }

    async addQueueCreation(userId) {
        let msg = {
            type: 'queue_create',
            user_id: userId,
            ts: new Date()
        }

        await this.push(msg)
    }
    async addQueueDeletion(userId) {
        let msg = {
            type: 'queue_delete',
            user_id: userId,
            ts: new Date()
        }

        await this.push(msg)
    }

}

module.exports = new queueStats