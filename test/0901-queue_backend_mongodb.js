process.env.NODE_ENV = 'test';

let chai = require('chai');
let should = chai.should();

let queueProvider = require('../lib/queue_provider')
const Q = 'foo'
let client
describe('Mongo - backend queue', ()=>{

	beforeEach(async ()=>{
		if(client && client.connected){
			await client.purge(Q)
		}
	})

	it('Should make a connection', async ()=>{
		let conn = await queueProvider.create('mongodb','mongodb-1', {addr:'mongodb://localhost:27017/qutrunk_queue_test'})
		client = conn.getClient()
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