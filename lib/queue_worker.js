let queueProvider = require('../lib/queue_provider')
let config = require('../config')

const Queue = require('../models/queue')
const User = require('../models/user')
const statsd = require('../lib/statsd')

function sleep(ms) {
    if (ms <= 0) {
        return
    }
    return new Promise(resolve => setTimeout(resolve, ms));
}

class QueueWorker {

    constructor(queue, bufferSize, standByTimeMs, processBufferFn) {
        this.buffer = []
        this.stopped = false
        this.onStandBy = null
        this.sleeping = false
        this.initialized = false

        this.processBuffer = processBufferFn
        this.bufferSize = bufferSize
        this.queue = queue
        this.standByTimeMs = standByTimeMs || 1000

        if (!this.processBufferFn) {
            throw new Error('Child class should define `processBufferFn`')
        }

    }

    async init() {
        if (this.initialized) {
            return
        }

        let provider = 'mongodb'
        let conn = {addr: config.mongo}

        if(config.stats_queue){
        	provider = config.stats_queue.provider
        	conn = config.stats_queue.connection
        }
        
        let c = await queueProvider.create(provider, '__qutrunk'+ this.queue, conn)
        this.client = c.getClient()
        await this.client.create(this.queue)
        this.initialized = true
    }

    statsdInc(name, value) {
        statsd.increment('worker,type=' + name + ',queue=' + this.queue, value)
    }

    statsdTiming(name, ms) {
        statsd.timing('worker,type=' + name + ',queue=' + this.queue, ms)
    }


    async startWorker(bufferSize, standByTimeMs) {
        this.stopped = false

        await this.init()

        bufferSize = bufferSize || this.bufferSize
        standByTimeMs = standByTimeMs === 'undefined' ? this.standByTimeMs : standByTimeMs
        this.standByTimeMs = standByTimeMs

        while (!this.stopped) {

            let msg = await this.client.pull(this.queue)

            if (msg && msg.length > 0) {
                this.statsdInc('buffer_pull', 1)
                this.buffer.push(msg.pop())
            } else {
                this.sleeping = true

                await this.flushBuffer()

                if (this.onStandBy) {
                    this.onStandBy()
                }
                await sleep(standByTimeMs)
                this.sleeping = false
            }

            if (this.buffer.length === bufferSize) {
                await this.flushBuffer()
            }
        }

        if (this.stopCb) {
            this.stopCb()
        }
    }

    async cancelWorker(cb) {
        this.stopped = true
        if (cb) {
            this.stopCb = cb
        }
    }

    log(msg) {
        if (process.env.TEST) {
            return
        }

        console.log(msg)
    }

    setOnStandBy(fn) {
        this.onStandBy = fn
    }

    handleGracefulShutdown() {
        process.on('SIGINT', async () => {
            await this.flushBuffer()
            this.log('Stopping worker... (might take up to ' + this.standByTimeMs + ' ms)')
            this.cancelWorker(() => {
                this.log('Killing process.')
                process.exit()
            })
        })
    }

    async flushBuffer() {
        this.log('Flushing buffer, count: ' + this.buffer.length)
        let ts = new Date()
        if (this.buffer.length === 0) {
            return
        }

        await this.processBufferFn()


        this.buffer = []
        let dur = (new Date).getTime() - ts.getTime()
        this.statsdTiming('buffer_flush', dur)
        this.log('Flushing took: ' + dur + 'ms')
    }

    async purgeQueue() {
        await this.init()
        await this.client.purge(this.queue)
    }

    async push(msg) {
        await this.init()
        await this.client.push(this.queue, msg)
    }

}

module.exports = QueueWorker