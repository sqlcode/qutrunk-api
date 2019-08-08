const mongodb = require('mongodb').MongoClient;

class client {

	constructor(queuePrefix){
		this.queuePrefix = queuePrefix || 'qutrunk_'
	}

    async connect(connString) {
     	this.conn = await mongodb.connect(connString, {useNewUrlParser: true})
     	this.db = this.conn.db()
     	this.session = this.conn.startSession()
     	this.connected = true

     	return true
    }

    async close(){
        await this.conn.close()
    }

    async purge(queue) {
    	await this.db.collection(this.queuePrefix+queue).deleteMany({})
    	await this.db.collection(this.queuePrefix+queue+'_meta').deleteMany({})
    }

    async delete(queue) {
        try{
            await this.db.collection(this.queuePrefix+queue).drop({})
            await this.db.collection(this.queuePrefix+queue+'_meta').drop({})
        }catch(e){
            
        }
    }

    async create(queue) {
        await this.db.collection(this.queuePrefix+queue+'_meta').createIndex({ts:1})
    }

    async push(queue, msg) {

    	if(typeof msg === 'object'){
			msg = JSON.stringify(msg)
		}

		let ts = new Date()
		let inserted = await this.db.collection(this.queuePrefix+queue).insertOne({data: msg})

		await this.db.collection(this.queuePrefix+queue+'_meta').insertOne({
			element_id: inserted.insertedId,
			ts: inserted.insertedId.getTimestamp()
		})

		return inserted.insertedId

    }

    async _pull(queue){

    	let pick = await this.db.collection(this.queuePrefix+queue+'_meta')
    		.findOneAndDelete({}, {}, {sort:{ts: -1}})

    	let element
    	if(pick && pick.value){
    		element = await this.db.collection(this.queuePrefix+queue).findOneAndDelete({
    			_id: pick.value.element_id
    		})
    	}

    	return element && element.value && element.value.data
    }

    async pull(queue, count) {
    	count = count || 1
    	let data = []
    	while(count > 0){
    		count--

    		let m = await this._pull(queue)

    		if(m){
    			data.push(m)
    		}else{
    			break
    		}
    	}

    	return data
    }

}

module.exports = client