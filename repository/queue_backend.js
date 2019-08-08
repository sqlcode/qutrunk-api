let QueueBackend = require('../models/queue_backend')
let Queue = require('../models/queue')
let queueProvider = require('../lib/queue_provider')

let Joi = require('joi')

let validate = (obj, body) => {
    let schema = Joi.object().keys(obj).options({ stripUnknown: true })

    const result = Joi.validate(body, schema);

    if (result.error) {
        throw result
    }
}

module.exports = {
    async setDefault(id, userId){

		let backend = await QueueBackend.findOne({_id: id, user: userId})

        if(!backend){
            throw new Error('Backend does not exists')
        }

        let defaultBackend = await QueueBackend.findOne({user: userId, default: true})


        if(defaultBackend){
            if(!defaultBackend._id.equals(id)){
                defaultBackend.default = false
                await defaultBackend.save()
            }
        }

        backend.default = true
        await backend.save()
    },
    async delete(id, userId){

        let backend = await QueueBackend.findOne({_id: id, user: userId})
		let queues = await Queue.countDocuments({backend: backend._id})

		if(queues > 0){
			throw new Error('Cannot remove queue backend, there are queues that use it.')
		}

		await backend.remove()

	},
    async testConnection(provider, key, connection){
        try{
            await queueProvider.create(provider, key, connection)
            await queueProvider.close(key)
        }catch(e){
            throw new Error('Cannot connect to backend')
        }
    },
    async create(userId, provider, key, connOpts) {
    
        let connValid = {}
        switch (provider) {
            case 'rabbitmq':
                connValid.addr = Joi.string().regex(/amqps?\:\/\//).required()
                break
            case 'mongodb':
                connValid.addr = Joi.string().regex(/mongodb?\:\/\//).required()
                break
            case 'redis':
                connValid.host = Joi.string().required()
                connValid.port = Joi.number().min(1000).max(65255).required()
                break
        }

        validate({
            key: Joi.string().allow('').allow(null),
            user: Joi.string().length(24),
            connection: Joi.object().keys(connValid).required(),
        }, {provider, key, connection: connOpts})

    	let sameKeyExists = await QueueBackend.findOne({user: userId, key: key})

    	if(sameKeyExists){
    		throw new Error('Queue backend with same key already exists')
    	}

		let defaultExists = await QueueBackend.findOne({user: userId, default: true})

        await this.testConnection(provider, key, connOpts)

        let b = new QueueBackend
        b.user = userId
        b.default = defaultExists ? false : true
        b.provider = provider
        b.key = key
        b.connection = connOpts

        await b.save()

        return b
    }
}