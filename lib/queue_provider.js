let redis = require('./queue_backend/redis')
let mongodb = require('./queue_backend/mongodb')
let rabbitmq = require('./queue_backend/rabbitmq')


class connectionPoolEntry {
	constructor(provider, key, client){
		this.client = client
		this.key = key
		this.provider = provider
	}

	getClient(){
		this.lastUsage = new Date()
		return this.client
	}
}


class connectionPool {

    constructor() {
        this.pool = {}
        this.isAdding = {}
    }

    async create(provider, key, opts) {

    	if(this.pool[key]){
    		throw new Error(`Connection with key ${key} already exists!`)
    	}

        if(this.isAdding[key]){
            console.warn('Already adding backend connection')
            return
        }

        this.isAdding[key] = 1

        let conn
        try{
            switch (provider) {
                case "redis":
                    conn = new redis
                    await conn.connect(opts.host, opts.port)
                    break
                case "rabbitmq":
                    conn = new rabbitmq
                    let addr = opts.addr.split(',')
                    await conn.connect(addr)
                    break
                case "mongodb":
                    conn = new mongodb
                    await conn.connect(opts.addr)
                    break
                default:
                    throw new Error('Provider unknown')
                    break

            }
            
        }catch(e){
            delete this.isAdding[key]
            throw new Error(e)
        }

        console.log(`[Queue provider] started connection to ${key} (${provider})`)
        this.pool[key] = new connectionPoolEntry(provider, key, conn)

        delete this.isAdding[key]
        return this.pool[key]
    }

    get(key) {
    	return this.pool[key]
    }

    close(key){
        this.get(key).getClient().close()
        delete this.pool[key]
    }

}

module.exports = new connectionPool