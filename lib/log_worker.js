const queueWorker = require('./queue_worker')
const MessageLog = require('../models/message_log')
const AccessToken = require('../models/access_token')
const QUEUE = '__log_queue'

class logWorker extends queueWorker {

	constructor(bufferSize, standByTimeMs){
		super(QUEUE, bufferSize, standByTimeMs)
	}

	async processBufferFn(){

		let payload = {
			access_token_usage: {}
		}

		for(var p in this.buffer){
			
			let m = JSON.parse(this.buffer[p])

			if(!payload.access_token_usage[m.token]){
				/* jezeli kolejnosc wiadomosci bedzie zachwiana
				wtedy moga występować bugi związane z aktualnością tej daty
				*/
				payload.access_token_usage[m.token] = new Date(m.ts)
			}

			switch(m.type){
				case 'log':
					MessageLog.findOneAndUpdate({_id: m.msg_uuid}, {$set:{
						_id: m.msg_uuid,
						value: m.data,
						pushed_at: new Date(m.ts),
						queue: m.queue,
						size: m.size,
						data: m.data,
						pushed_ip: m.ip,
						pushed_access_token: m.token,
					}, $setOnInsert:{created_at: new Date()}}, {upsert:true}, ()=>{})
				break
				case 'processed':
					MessageLog.findOneAndUpdate({_id: m.msg_uuid}, {$set:{
						processed_at: new Date(m.ts),
						pulled_ip: m.ip,
						pulled_access_token: m.token
					}, $setOnInsert:{created_at: new Date()}}, {upsert:true}, ()=>{})
				break
			}
		}

		for(var t in payload.access_token_usage){
			AccessToken.updateOne(
				{_id: t}, 
				{$set: {last_used: payload.access_token_usage[t]}}, 
				() => {}
			)
		}
	}

	async addLog(queueId, msgUuid, data, ip, token){
		let msg = {
			type: 'log',
			queue: queueId,
			msg_uuid: msgUuid,
			data: data,
			size: data.length,
			ip: ip,
			token: token,
			ts: new Date() 
		}
		
		await this.push(msg)
	}

	async setMessageProcessed(msgUuid, ip, token){
		let msg = {
			type: 'processed',
			msg_uuid: msgUuid,
			ip: ip,
			token: token,
			ts: new Date()
		}
		
		await this.push(msg)
	}
}

module.exports = new logWorker