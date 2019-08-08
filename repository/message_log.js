const Queue = require('../models/queue')
const MessageLog = require('../models/message_log')
const moment = require('moment')

module.exports = {
    async clearMessageLogForUser(user, limit) {
        let queues = await Queue.find({ user: user._id }, { _id: 1 })

        if (queues.length === 0) {
            return
        }

        let d = moment().subtract(user.quota.max_log_time_days, 'day').toDate()
        let messages = await MessageLog.find({
            queue: { $in: queues.map(q => q._id) },
            processed_at: { $lt: d },
        }, { _id: 1 }).limit(limit || 100)

        let result = await MessageLog.deleteMany({ _id: { $in: messages.map(m => m._id) } })
        console.log(`removed ${messages.length} messages (time constraint)`)

        let c = await MessageLog.countDocuments({ queue: { $in: queues.map(q => q._id) } })
        if (user.quota.max_log_count < c) {
        	let limit2 = c - user.quota.max_log_count

        	limit = limit < limit2 ? limit : limit2

            messages = await MessageLog.find({
                queue: { $in: queues.map(q => q._id) },
            }, { _id: 1 }).limit(limit).sort({ pushed_at: 1 })

            result = await MessageLog.deleteMany({ _id: { $in: messages.map(m => m._id) } })
            console.log(`removed ${messages.length} messages (count constraint)`)
        }
    }
}