const amqp = require('amqplib');
const helpers = require('../helpers.js')

function sleep(ms) {
	if(ms <= 0){
		return
	}
  	return new Promise(resolve => setTimeout(resolve, ms));
}


class client {

	constructor(){
		this.connected = false
		this.connecting = false
		this.addresses = []
	}

	async connect(connStr) {

		while(this.connecting){
			await sleep(100)
		}

		if(this.connected){
			return true
		}

		this.connecting = true

		let addr
		if(connStr !== undefined){
			if(typeof connStr === 'string'){
				addr = connStr
				this.addresses = [connStr]
			}else{
				addr = connStr[0]
				this.addresses = connStr
			}
		}else{
			addr = this.addresses[Math.floor(Math.random()*this.addresses.length)]
		}

		try{
			this.conn = await amqp.connect(addr + "?heartbeat=10")
		}catch(e){
			this.connecting = false
			console.log(e.stack)
			throw new Error(e)
		}
		
		if(!this.conn){
			return false
		}

	 	this.channel = await this.conn.createChannel();
	 	this.publishChannel = await this.conn.createChannel();
	 	this.channel.prefetch(1)
	 	this.connected = true
		this.connecting = false

	 	this.conn.on('error', err => {
	 		this.connected = false
	 		console.error('[AMQP] conn error', err)
	 	})

	 	this.conn.on('close', ()=>{
	 		this.connected = false
	 		console.error('[AMQP] conn close')
	 	})

	 	return true
	}

	async reconnect(){
		await this.close()
		while(true){
			try{
				await this.connect()
			}catch(e){
				await sleep(250)
				continue
			}

			break
		}
	}

	async close(){
		if(!this.connected){
			return
		}

		await this.publishChannel.close()
		await this.channel.close()
		await this.conn.close()

		this.connected = false
	}

	async delete(queue){
		if(!this.connected){
			await this.connect()
		}

		await this.channel.deleteQueue(queue)
	}

	async purge(queue){
		if(!this.connected){
			await this.connect()
		}

		await this.channel.purgeQueue(queue)
	}

	async push(queue, msg) {
		if(!this.connected){
			await this.connect()
		}

		if(typeof msg === 'object'){
			msg = JSON.stringify(msg)
		}

		try{
			await this.publishChannel.sendToQueue(queue, new Buffer(msg), {
				persistent: true, exclusive: true
			});
		}catch(e){
			console.error('[AMQP] push error', e)
		}

		return true
	}

	async pull(queue, count) {

		if(!this.connected){
			await this.connect()
		}

		count = count || 1
		let data = []

		while(count > 0){
			count--
			let m = await this.channel.get(queue, {noAck: true})

			if(m){
				data.push(m.content.toString())
			}else{
				break
			}
		}

		return data
	}

	async pullNoAck(queue) {
		if(!this.connected){
			await this.connect()
		}

		return await this.channel.get(queue, {noAck: false})
	}

	async initQueueAndExchange(queue){

		if(!this.connected){
			await this.connect()
		}

		await this.channel.assertQueue(queue, {
			arguments: {
				"x-queue-mode": "lazy",
			},
			exclusive: false,
			durable:true, 
			autoDelete: false
		});
	}

	async create(queue){
		return await this.initQueueAndExchange(queue)
	}

}

module.exports = client