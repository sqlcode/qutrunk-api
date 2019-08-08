const cluster = require('cluster');
const qs = require('querystring')

const config = require('../../config');
const mongoose = require('mongoose');
mongoose.connect(config.mongo, { useNewUrlParser: true });
mongoose.Promise = global.Promise;

var QueueStats = require('../../lib/queue_stats_worker')
var LogWorker = require('../../lib/log_worker')

let workerFinished = () => {
    return QueueStats.sleeping && LogWorker.sleeping
}

const Q = 'workload_workers'
const PRODUCE_TIMEOUT = parseInt(process.argv[2]) || 100
const ACCESS_TOKEN = process.argv[3] || 'test_access_token1'
const WORKER_MSG_INTERVAL = process.argv[4] || 1000

let flw = async () => {
    QueueStats.startWorker(WORKER_MSG_INTERVAL, 1000)
    LogWorker.startWorker(WORKER_MSG_INTERVAL, 1000)
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

let produce = async () => {

    let sizeAll = 0
    while(true){
        let u = 'http://localhost:3000/api/v1/core/push/' + Q + '?'
        let size = Math.round((Math.random() * 1024)) || 10
        sizeAll += size
        let q = {
            access_token: ACCESS_TOKEN,
            data: Buffer(size).fill('a').toString()
        }
        await doRequest(u + qs.stringify(q))

        u = 'http://localhost:3000/api/v1/core/pull/' + Q + '?'
        q = {
            access_token: ACCESS_TOKEN
        }
        await doRequest(u + qs.stringify(q))

        if(PRODUCE_TIMEOUT > 0){
            await sleep(PRODUCE_TIMEOUT)
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
	flw()

    await produce()

    
}

main()
