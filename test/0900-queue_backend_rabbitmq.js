process.env.NODE_ENV = 'test';

let chai = require('chai');
let should = chai.should();

const queueProvider = require('../lib/queue_provider')

let client
const Q = 'foo'
describe('Rabbitmq - backend queue', ()=>{

	beforeEach(async ()=>{
		if(client){
			await client.create(Q)
			await client.purge(Q)
		}
	})

	it('Should make a connection where one node does not exist', async ()=>{
		client = await queueProvider.create('rabbitmq', 'rabbitmq-1',{addr:'amqp://localhost:5672,amqp://localhost:3333'})
		client = client.getClient()
	})

	it('Should reconnect', async ()=>{
		await client.reconnect()
	})

	it('Should publish and get a message', async ()=>{
		await client.push(Q, 'bar')
		let msg = await client.pull(Q)
		msg[0].should.be.equal('bar')
	})

	it('Should publish 1000 messages and all should be evenly distributed', async ()=>{
		for(var i = 0 ; i <= 1000 ; i++){
			await client.push(Q, 'bar'+i)
		}

		let msg1 = client.pull(Q,500)
		let msg2 = client.pull(Q,500)
		let msg3 = client.pull(Q,500)
		let msg4 = client.pull(Q,500)
		let msg5 = client.pull(Q,500)

		let res = await Promise.all([msg1, msg2, msg3, msg4, msg5])

		for(var i = 0 ; i <= 100 ; i++){
			res[0][i].should.be.equal('bar'+i*5)
			res[1][i].should.be.equal('bar'+(i*5+1))
			res[2][i].should.be.equal('bar'+(i*5+2))
			res[3][i].should.be.equal('bar'+(i*5+3))
			res[4][i].should.be.equal('bar'+(i*5+4))
		}

	})

	it('Should consume a message twice before ACKing', async ()=>{
		await client.push(Q, 'bar')
		await client.push(Q, 'bar2')

		let msg = await client.pullNoAck(Q)
		msg2 = await client.pullNoAck(Q)
		msg.content.toString().should.be.equal('bar')
		msg2.content.toString().should.be.equal('bar2')

		await client.channel.ack(msg)
		await client.channel.ack(msg2)

		msg = await client.pullNoAck(Q)
		msg.should.be.equal(false)
	})

	it('Should publish & consume multiple messages', async ()=>{
		await client.push(Q, 'bar')
		await client.push(Q, 'baz')
		await client.push(Q, 'baz2')
		await client.push(Q, 'baz3')

		let msg = await client.pull(Q)
		msg[0].should.be.equal('bar')

		msg = await client.pull(Q)
		msg[0].should.be.equal('baz')

		msg = await client.pull(Q)
		msg[0].should.be.equal('baz2')

		msg = await client.pull(Q)
		msg[0].should.be.equal('baz3')
	})

	it('Should delete a queue', async()=>{
		await client.delete(Q)
	})

})