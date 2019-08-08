const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator/check');
const Queue = require('../../models/queue')
const MessageLog = require('../../models/message_log')

/**
 * @swagger
 * path: /api/place_owner/place
 * operations:
 *   -  httpMethod: GET
 *      summary: Zwraca listę zamówień w menu
 *      nickname: place_owner
 *      parameters:
 *        - {name: limit, paramType: form, required: true,dataType: string}
 *        - {name: offset, paramType: form, required: true,dataType: string}
 *        - {name: sort_col, paramType: form, required: true,dataType: string}
 *        - {name: sort_order, paramType: form, required: true,dataType: string}
 *        - {name: queue, paramType: form, required: true,dataType: string}
 *        - {name: from, paramType: form, required: true,dataType: string}
 *        - {name: to, paramType: form, required: true,dataType: string}
 */
router.route('/list').get(async (req,res) => {
	let limit = parseInt(req.query.limit) || 25
    let offset = parseInt(req.query.offset) || 0
    let queue = req.query.queue
    let user = req.decoded.id
    
    queue = queue 
    	&& await Queue.find({_id: queue, user: user},{_id:1,name:1, short_uuid:1})
    	|| await Queue.find({user: user},{_id:1, name:1, short_uuid:1})

    queueIds = queue.map(q => q._id)

    let from = req.query.from
    let to = req.query.to
    let q = {
    	queue: {$in: queueIds}
    }

    if(from){
        var fromD = (new Date)
        fromD.setTime(from)
        if(!q.pushed_at){ q.pushed_at = {}}
        q.pushed_at.$gte = fromD
    }

    if(to){
        var toD = (new Date)
        toD.setTime(parseInt(to) + 3600 * 24 * 1000)
        if(!q.pushed_at){ q.pushed_at = {}}
        q.pushed_at.$lte = toD
    }

    let data = await MessageLog.find(q).limit(limit).skip(offset).sort({pushed_at: -1})
    let count = await MessageLog.countDocuments(q)

    return res.json({
    	status: true,
    	data: data.map(l => {
    		let q = queue.filter(q => l.queue.toString() === q._id.toString()).pop()
    		return {
	    		_id: l._id,
	    		queue: l.queue,
	    		queue_name: q.name,
	    		queue_uuid: q.short_uuid,
	    		processed_at: l.processed_at,
	    		pushed_at: l.pushed_at,
                pushed_ip: l.pushed_ip,
                pulled_ip: l.pulled_ip
	    	}
    	}),
    	count: count
    })
})

router.route('/show/:id').get(async (req, res) => {

    //@todo potencjalnie bardzo niebezpieczne :-) trzeba dodać sprawdzenie czy log nalezy do usera
    let data = await MessageLog.findOne({_id: req.params.id})
        .populate('queue', 'name')
        .populate('pushed_access_token', 'name value')
        .populate('pulled_access_token', 'name value')

    return res.json({
        status: true,
        data: data
    })
})

module.exports = router