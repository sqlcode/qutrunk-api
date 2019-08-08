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
})