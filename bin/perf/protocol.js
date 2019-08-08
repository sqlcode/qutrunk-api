const cluster = require('cluster');
const qs = require('querystring')

const config = require('../../config');
const mongoose = require('mongoose');
mongoose.connect(config.mongo, { useNewUrlParser: true });
mongoose.Promise = global.Promise;

var QueueStats = require('../../lib/queue_stats_worker')
var LogWorker = require('../../lib/log_worker')

let grpc = new(require('../../proto/client'))
process.env.TEST = true

let workerFinished = () => {
    return QueueStats.sleeping && LogWorker.sleeping
}

const Q = 'perf_workers'
const MSG_COUNT = parseInt(process.argv[2]) || 1025
const WORKER_COUNT = parseInt(process.argv[3]) || 4
const PRODUCE_TIMEOUT = parseInt(process.argv[4]) || 0
const ACCESS_TOKEN = process.argv[5] || 'test_access_token1'
const SETUP_ENV = true //process.argv[3] === undefined
const WORKER_MSG_INTERVAL = process.argv[6] || 1000
const GRPC = process.env.MODE === 'grpc'
const BACKEND = process.env.BACKEND

switch (BACKEND) {
    case 'rabbitmq':
        console.log('Using backend RABBITMQ')
        config.stats_queue = {
            provider: 'rabbitmq',
            connection: {
                addr: 'amqp://localhost:5672'
            }
        }
        break
    case 'mongodb':
        console.log('Using backend MONGODB')
        config.stats_queue = {
            provider: 'mongodb',
            connection: {
                addr: 'mongodb://localhost:27017/qutrunk_protocol'
            }
        }
        break
    case 'redis':
        console.log('Using backend REDIS')
        config.stats_queue = {
            provider: 'redis',
            connection: {
                host: '127.0.0.1',
                port: 6379
            }
        }
        break
}

let flw = async () => {
    QueueStats.startWorker(WORKER_MSG_INTERVAL, 1000)
    LogWorker.startWorker(WORKER_MSG_INTERVAL, 1000)
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

let produceReq = async (data) => {
    if (GRPC) {
        let res = await grpc.push(Q, ACCESS_TOKEN, data)
        res.statusCode = res.status
        return res
    } else {
        let q = {
            access_token: ACCESS_TOKEN,
            data: data
        }
        let u = 'http://localhost:3000/api/v1/core/push/' + Q + '?'
        let res = await doRequest(u + qs.stringify(q))
        return res.res
    }
}

let consumeReq = async () => {
    if (GRPC) {
        let res = await grpc.pull(Q, ACCESS_TOKEN)
        return res.message && res.message.data || null
    } else {
        let u = 'http://localhost:3000/api/v1/core/pull/' + Q + '?'
        let q = {
            access_token: ACCESS_TOKEN
        }
        let res = await doRequest(u + qs.stringify(q))
        let d = JSON.parse(res.body).data
        return d.length && d.pop().data
    }
}

let produce = async () => {

    let sizeAll = 0
    for (var i = 0; i < MSG_COUNT; i++) {
        let size = Math.round((Math.random() * 1024)) || 10
        sizeAll += size
        let data = Buffer(size).fill('a').toString()
        let res = await produceReq(data)

        if (res.statusCode !== 200) {
            console.error('Perf webserver error', body)
        }

        if (i % 1000 === 0) {
            process.stdout.write('.')
        }

        if (PRODUCE_TIMEOUT > 0) {
            await sleep(PRODUCE_TIMEOUT)
        }

    }

    console.log(`Publishing complete`)
    return sizeAll
}

let consume = async () => {

    let i = 0
    let size = 0
    while (true) {
        let res = await consumeReq()

        if (!res) {
            console.log(`Consumed ${i} messages`)
            process.send({
                count: i,
                size: size
            })
            return
        } else {
            size += res.length
        }
        i++
        if (i % 1000 === 0) {
            process.stdout.write('.')
        }
    }

}

const request = require('request')

function doRequest(url) {
    return new Promise(function(resolve, reject) {
        request.get(url, function(error, res, body) {
            resolve({ error, res, body });
        });
    });
}

let main = async () => {
    console.log(`Master ${process.pid} is running`);

    if (SETUP_ENV) {
        const app = require('../../app')
        const fixtures = require('../../lib/fixtures')
        await fixtures()
    }

    if (GRPC) {
        require('../../grpc_server')
    }

    console.log(`Starting workers`)
    flw()

    let sizeAll = await produce()

    console.log(`Starting consumers for ${sizeAll} bytes`)

    // Fork workers.
    let sum = 0
    let size = 0
    let cw = 0
    for (let i = 0; i < WORKER_COUNT; i++) {
        let w = cluster.fork();
        w.on('message', async (m) => {
            cw++
            sum += m.count
            size += m.size

            if (cw < WORKER_COUNT) {
                return
            }

            console.log('finishing workers work')
            while (!workerFinished()) {
                await sleep(1000)
            }
            console.log('workers work finished')

            if (sum === MSG_COUNT && size === sizeAll) {
                console.log(`TEST_OK, sum is ${sum} and size ${size}`)
                process.exit()
            } else {
                console.log('TEST_NOT_OK, sum is', sum)
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