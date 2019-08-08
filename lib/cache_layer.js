let AccessToken = require('../models/access_token')
let Queue = require('../models/queue')

class CacheLayer {

    constructor() {
        this.cache = {}
        this.watchers = {}
    }

    async getAccessTokenByValue(value){
    	await this.initCache(AccessToken, 'ac')

    	for (var i in this.cache.ac) {
            if (this.cache.ac[i].value === value) {
                return this.cache.ac[i]
            }
        }
    }

    async getQueueByNameAndUserId(name, userId) {
        await this.initCache(Queue, 'queue')

        for (var i in this.cache.queue) {
            if (this.cache.queue[i].user.toString() === userId.toString() &&
                this.cache.queue[i].name === name) {
                return this.cache.queue[i]
            }
        }
    }

    async initCache(entity, name) {
        if (!this.watchers[name]) {

            let res = await entity.find()

            this.cache[name] = {}
            for (var i in res) {
                this.cache[name][res[i]._id] = res[i]
            }

            await this.startChangeStream(entity, name)
        }
    }

    startChangeStream(entity, name) {
        this.watchers[name] = entity.watch([]).on('change', async data => {
            let p = await entity.findOne({ _id: data.documentKey._id })

            switch (data.operationType) {
                case 'update':
                case 'insert':
                    this.cache[name][p._id] = p
                    break
                case 'delete':
                    delete this.cache[name][data.documentKey._id]

            }
        })
    }

}

const cl = new CacheLayer

module.exports = cl