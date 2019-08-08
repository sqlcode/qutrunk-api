let grpc = require("grpc");
var protoLoader = require("@grpc/proto-loader");

let QueueRepository = require('../repository/queue')
let AccessToken = require('../models/access_token')
let User = require('../models/user')

const statsd = require('../lib/statsd')

function sleep(ms) {
    if (ms <= 0) {
        return
    }
    return new Promise(resolve => setTimeout(resolve, ms));
}

class Subscriber {
    constructor(call) {
        this.call = call
        this.stopped = false
        this.timeSleptWithoutBreak = 0
    }

    async setup() {
        let q = this.call.request.queue

        this.accessToken = await AccessToken.findOne({ value: this.call.request.access_token })

        if (!this.accessToken) {
            return 'token_not_found'
        }

        this.queue = await QueueRepository.findQueue(q, this.accessToken.user)

        if (!this.queue) {
            return 'queue_not_found'
        }

        this.call.on('error', e => {
            console.log('server error', e)
            this.stopped = true
        })

        return true
    }

    getSleepTime() {
        let i = 100

        this.timeSleptWithoutBreak++

        if (this.timeSleptWithoutBreak >= 10) {
            return 1000
        } else {
            return this.timeSleptWithoutBreak * i
        }
    }

    resetSleepTime() {
        this.timeSleptWithoutBreak = 0
    }

    stop() {
        this.stopped = true
        this.call.end()
    }

    async start() {
        while (true) {

            if (this.stopped) {
                break
            }

            let msg = await QueueRepository.pull(this.queue.name, this.accessToken.user, 1, {
                token: this.accessToken._id,
                ip: this.call.getPeer()
            })

            if(msg === 'queue_not_found'){
                console.error('[grpc] Queue not found')
                return
            }

            if (msg.length === 0) {
                await sleep(this.getSleepTime())
            } else {
                this.resetSleepTime()
                this.call.write(msg.pop())
            }
        }
    }
}

let subscribers = []

module.exports = {
    async startGrpcServer(addr) {
        const server = new grpc.Server();
        let proto = grpc.loadPackageDefinition(
            protoLoader.loadSync("./proto/simple_queue.proto", {
                keepCase: true,
                longs: String,
                enums: String,
                defaults: true,
                oneofs: true
            })
        );

        async function subscribe(call) {

            let s = new Subscriber(call)
            let success = await s.setup()

            if (success !== true) {
                console.log('no subscriber', success)
                return
            }

            subscribers.push(s)

            s.start()

            return s
        }

        async function pull(call, cb) {
            let q = call.request.queue

            let now = new Date().getTime()
            let statsdKey = `grpc_server,type=pull,queue=${q},access_token=${call.request.access_token}`

            let valid = await QueueRepository.prePullAction(call.request.access_token, q)

            if (valid.status !== 200) {
                statsd.timing(statsdKey + `,status=${valid.status}`, new Date().getTime() - now)
                return cb(null, { status: valid.status, description: valid.msg })
            }

            let qres = await QueueRepository.pull(q, valid.accessToken.user, 1, {
                token: valid.accessToken._id,
                ip: call.getPeer()
            })

            statsd.timing(statsdKey + `,status=200`, new Date().getTime() - now)

            if(qres === 'queue_not_found'){
                return cb(null, { status: 404, description: 'queue_not_found'})
            }

            return cb(null, { status: 200, description: 'ok', message: qres.pop() })
        }

        async function push(call, cb) {

            let now = new Date().getTime()
            let statsdKey = `grpc_server,type=push,queue=${call.request.queue},access_token=${call.request.access_token}`

            let valid = await QueueRepository.prePushAction(call.request.access_token, call.request.queue, call.request.message.data)

            if (valid.status !== 200) {
                statsd.timing(statsdKey + `,status=${valid.status}`, new Date().getTime() - now)
                return cb(null, { status: valid.status, description: valid.msg })
            }

            let qres = await QueueRepository.push(valid.queue.name, valid.accessToken.user, call.request.message.data, {
                token: valid.accessToken._id,
                ip: call.getPeer()
            })

            statsd.timing(statsdKey + `,status=200`, new Date().getTime() - now)
            return cb(null, { status: 200, description: 'ok', message_uuid: qres.pop().uuid })
        }

        server.addService(proto.qutrunk.Queue.service, { subscribe, push, pull });

        server.bind(addr || "0.0.0.0:5001", grpc.ServerCredentials.createInsecure());
        console.log(`Grpc server running on ${addr}`)

        server.start();
    }
}