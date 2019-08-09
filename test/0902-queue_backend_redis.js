process.env.NODE_ENV = 'test';

let chai = require('chai');
let should = chai.should();

let queueProvider = require('../lib/queue_provider')
const Q = 'foo'
let client
describe('Redis - backend queue', ()=>{

	beforeEach(async ()=>{
		if(client && client.connected){
			await client.purge(Q)
		}
	})

	it('Should make a connection', async ()=>{
		let conn = await queueProvider.create('redis','redis-1', {host: '127.0.0.1', port: 6379})
		client = conn.getClient()

		await client.create(Q)
	})

	it('Should publish and get a message', async ()=>{
		await client.push(Q, 'bar1')

		let msg = await client.pull(Q)
		msg[0].should.be.equal('bar1')
	})

	it('Should publish 10 messages and all should be evenly distributed', async ()=>{
		var cnt = 100
		for(var i = 0 ; i < cnt ; i++){
			await client.push(Q, 'bar'+i)
		}

		let msg = await client.pull(Q,cnt)

		for(var i = 0 ; i < cnt ; i++){
			msg[i].should.be.equal('bar'+i)
		}


	})
	
	it('Should purge a queue', async()=>{
		await client.push(Q, 'test')
		await client.purge(Q)
		let msg = await client.pull(Q)
		msg.length.should.be.equal(0)
	})

	it('Should delete a queue', async()=>{
		await client.delete(Q)
	})

})