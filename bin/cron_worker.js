const config = require('../config')

const mongoose = require('mongoose');
mongoose.connect(config.mongo, { useNewUrlParser: true });
mongoose.Promise = global.Promise;

const QueueRepository = require('../repository/queue')
const MessageLogRepository = require('../repository/message_log')
const User = require('../models/user')
const Mailer = require('../lib/mailer')
const Cron = require('cron').CronJob

function sleep(ms) {
    if (ms <= 0) {
        return
    }
    return new Promise(resolve => setTimeout(resolve, ms));
}

let job = new Cron('0 * * * * *', async ()=> {

    console.log('------------  Cleaning up message log -------------')
    let u = await User.find()

    for (var i in u) {
        console.log(`Clean message log for user ${u[i]._id}`)
        await MessageLogRepository.clearMessageLogForUser(u[i], 1000)
    }
    console.log('------------  Completed cleaning up message log -------------')
})
job.start()

/*
while (true) {
    await sleep(10 * 1000)


    QueueRepository.raiseNotificationForMessagesInQueue(queue => {
        let user = await User.findOne({_id: queue.user})
        let data = {
            queue: ''
        }

        let msg = await mailer.template('email/messages_in_queue_alert.html')
        let info = await mailer.send(config.smtp.sender, user.email, "[ALERT] Messages in queue: "(+ queue.name || queue.short_uuid), msg, data)
    })

    QueueRepository.stepDownNotificationForMessagesInQueue(queue => {
        let user = await User.findOne({_id: queue.user})
        let data = {
            queue: ''
        }

        let msg = await mailer.template('email/messages_in_queue_alert_stepdown.html')
        let info = await mailer.send(config.smtp.sender, user.email, "[OK] Messages in queue: "(+ queue.name || queue.short_uuid), msg, data)
    })

}

*/