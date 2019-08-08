const express = require('express');
const router = express.Router();
const User = require('../models/user')

const QueueRepository = require('../repository/queue')

const crypto = require('crypto');
const { check, validationResult } = require('express-validator/check');
var bodyParser = require('body-parser');

const client = require('../lib/statsd')

async function processPost(request, response) {
    var queryData = "";

    return new Promise((resolve, reject)=>{
        if (request.method == 'POST') {
            request.on('data', function(data) {
                queryData += data;
                if (queryData.length > 1e7) { //10MB
                    queryData = "";
                    response.writeHead(413, { 'Content-Type': 'text/plain' }).end();
                    request.connection.destroy();
                }
            });

            request.on('end', function() {
                resolve(queryData);
            });

        } else {
            response.writeHead(405, { 'Content-Type': 'text/plain' });
            response.end();
            resolve(null)
        }
    })
}

function statsd(path) {

    return function expressStatsd(req, res, next) {
        var startTime = new Date().getTime();

        // Function called on response finish that sends stats to statsd
        function sendStats() {
            let key = `http_core,method=${req.method},type=${path},status=${res.statusCode}`

            if (req.__queue) {
                key += `,queue=${req.__queue}`
            }

            if (req.__token) {
                key += `,token=${req.__token}`
            }

            // Status Code
            // var statusCode = res.statusCode || 'unknown_status';
            // client.increment(key + 'status_code.' + statusCode);

            // Response Time
            var duration = new Date().getTime() - startTime;
            client.timing(key, duration);

            cleanup();
        }

        // Function to clean up the listeners we've added
        function cleanup() {
            res.removeListener('finish', sendStats);
            res.removeListener('error', cleanup);
            res.removeListener('close', cleanup);
        }

        // Add response listeners
        res.once('finish', sendStats);
        res.once('error', cleanup);
        res.once('close', cleanup);

        if (next) {
            next();
        }
    };
}


/**
 * @swagger
 * resourcePath: /core
 */

let pushMessage = async (req, res) => {


    let data
    if (req.method === 'POST') {
        data = await processPost(req, res)
    } else {
        data = req.query.data
    }

    if (req.query.multiple !== undefined && data.substr(0, 1) === '[') {
        data = JSON.parse(data)
    }

    let valid = await QueueRepository.prePushAction(
        req.token, req.params.queue, data, req.query.backend_key
    )

    if(valid.status !== 200){
        return res.resp(valid.status, valid.msg)
    }

    let qres = await QueueRepository.push(req.params.queue, req.user_id, data, {
        ip: req.realIp,
        token: req.token._id
    })

    let resp = {
        status: true,
        data: qres
    }

    let jsonp = req.query.jsonp
    if (jsonp) {
        return res.jsonp(jsonp + '(' + JSON.stringify(resp) + ')')
    } else {
        return res.json(resp)
    }
}

let pullMessage = async (req, res) => {

    let valid = await QueueRepository.prePullAction(req.token, req.params.queue)

    if(valid.status !== 200){
        return res.resp(valid.status, valid.msg)
    }    

    let qres = await QueueRepository.pull(
        req.params.queue, req.user_id, req.query.count, {
            ip: req.realIp,
            token: req.token._id
        })

    let resp = {
        status: true,
        data: qres
    }

    let jsonp = req.query.jsonp
    if (jsonp) {
        return res.jsonp(jsonp + '(' + JSON.stringify(resp) + ')')
    } else {
        return res.json(resp)
    }
}

/**
 * @swagger
 * path: /api/v1/core/push/{queue}
 * operations:
 *   -  httpMethod: POST / GET
 *      summary: Pushes message to queue
 *      nickname: core
 *      parameters:
 *        - {name: queue, paramType: path, required: true,dataType: string}
 *        - {name: data, paramType: body, required: true,dataType: string}
 *        - {name: jsonp, paramType: body, required: true,dataType: string}
 */
router.route('/push/:queue').post(statsd('push'), pushMessage).get(statsd('push'), pushMessage)

/**
 * @swagger
 * path: /api/v1/core/pull/{queue}
 * operations:
 *   -  httpMethod: GET
 *      summary: Pushes message to queue
 *      nickname: core
 *      parameters:
 *        - {name: queue, paramType: path, required: true,dataType: string}
 *        - {name: jsonp, paramType: query, required: true,dataType: string}
 *        - {name: count, paramType: query, required: true,dataType: number}
 */
router.route('/pull/:queue').get(statsd('pull'), pullMessage)

module.exports = router