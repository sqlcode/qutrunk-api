//usage node rabbit_perf.js | grep TEST_OK && echo 'TEST OK'

const provider = require('../../lib/queue_provider')
const cluster = require('cluster');

async function getClient() {
    let client
    switch (process.env.BACKEND) {
        case "redis":
            var conn = await provider.create('redis', 'redis-1', { host: '127.0.0.1', port: 6379 })
            client = conn.getClient()
            break
        case "rabbitmq":
            var conn = await provider.create('rabbitmq', 'rabbitmq-1', { addr: 'amqp://localhost:5672' })
            client = conn.getClient()
            break;
        case "mongodb":
            var conn = await provider.create('mongodb', 'mongodb-1', { addr: 'mongodb://localhost:27017/qutrunk_queue_perf' })
            client = conn.getClient()
            break;
        default:
            throw new Error('Select backend: export BACKEND=`mongodb|rabbitmq`')
    }

    return client
}

const Q = 'perf'
const MSG_COUNT = 5625
const WORKER_COUNT = 4

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

let produce = async () => {

    let start = new Date()
    let i = 0
    let client = await getClient()
    await client.delete(Q)
    await client.create(Q)

    while (true) {
        i++
        let c = await client.push(Q, 'bar' + Math.random().toString())
        if (i % 1000 === 0) {
            process.stdout.write('.')
        }

        if (i === MSG_COUNT) {
            //event loop tick is required :O
            await sleep(100)

            let duration = (new Date()).getTime() - start.getTime()
            console.log(`Sent ${MSG_COUNT} messages in ${duration}ms, ${Math.round((MSG_COUNT/duration)*1000)} msg/sec`)

            return
        }
    }

}

let consume = async () => {

    let i = 0
    let client = await getClient()

    let start = new Date()
    while (true) {
        let msg = await client.pull(Q)

        await sleep(Math.round() * 100)

        if (i % 1000 === 0) {
            process.stdout.write('.')
        }

        if (!msg.length) {
            let dur = (new Date()).getTime() - start.getTime()
            console.log(`consumed ${i} messages in ${dur}ms, ${Math.round((i/dur)*1000)} msg/sec`)
            process.send(i)
            process.exit()
        }
        i++
    }

}

let main = async () => {
    console.log(`Master ${process.pid} is running`);
    await produce()
    console.log(`Producing completed`);


    // Fork workers.
    let sum = 0
    let m = 0
    for (let i = 0; i < WORKER_COUNT; i++) {
        let w = cluster.fork();
        w.on('message', (i) => {
            sum += i
            m++

            if (m < WORKER_COUNT) {
                return
            }
            if (sum === MSG_COUNT) {
                console.log('TEST_OK, sum is', sum)
                process.exit()
            } else {
                console.log(`TEST_NOT_OK, sum is ${sum} should be ${MSG_COUNT}`)
                process.exit(1)
            }
        })
    }
}

let mode = process.argv[2]
if (cluster.isMaster) {
    main()
} else {
    consume()
}