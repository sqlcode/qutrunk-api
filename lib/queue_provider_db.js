let queueProvider = require('./queue_provider')
let QueueBackend = require('../models/queue_backend')

class queueDbProvider {

    constructor() {
        this.backends = []
    }

    async loadAndInitializeBackends() {
        let backends = await QueueBackend.find({})

        for (var i in backends) {
            await this.addBackend(backends[i])
        }
    }

    async addBackend(b) {
        await queueProvider.create(b.provider, b._id, b.connection)
        this.backends.push(b)
    }

    async getBackendClient(keyOrId) {
        let b = this.backends
        	.filter(b => b._id.toString() === keyOrId || b.key === keyOrId).pop()

        if (b) {
            return await queueProvider.get(b._id).getClient()
        }

        b = await QueueBackend.findOne({
            $or: [
                { _id: keyOrId },
                { key: keyOrId }
            ]
        })

        if (!b) {
            throw new Error('Queue backend not found!')
        }

        await this.addBackend(b)

        return this.getBackendClient(keyOrId)
    }

    async getClientForQueue(queue) {
    	return this.getBackendClient(queue.backend.toString())
    }

}

module.exports = queueDbProvider