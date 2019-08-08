const User = require('../models/user')
const helpers = require('../lib/helpers')
const config = require('../config')
const mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId
const request = require('request')

const crypto = require('crypto')

function doRequest(url) {
    return new Promise(function(resolve, reject) {
        request.get(url, function(error, res, body) {
            if (!error && res.statusCode == 200) {
                resolve(body);
            } else {
                reject(body);
            }
        });
    });
}

const M = 1000000;
const PLANS = {
    free: {
        messages: 0.1 * M,
        queues: 50,
        max_idle: 3
    },
    p1: {
        messages: 1 * M,
        queues: 150,
        max_idle: 7
    },
    p2: {
        messages: 5 * M,
        queues: 300,
        max_idle: 14
    }
}

module.exports = {
    getQuotaPlans: async () => {
        return PLANS
    },
    checkGplusToken: async (token, userId) => {
        if (process.env.TEST) {
            return true
        }

        var res
        try {
            res = await doRequest({ url: 'https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=' + token })
        } catch (e) {
            console.error(e.message)
            return e
        }
        var b = JSON.parse(res)

        console.log('checking access token Google+', res, userId, b.sub === userId)
        return b.sub === userId || res
    },
    checkFbToken: async (token, userId) => {
        if (process.env.TEST) {
            return true
        }

        var res
        try {
            res = await doRequest({ url: 'https://graph.facebook.com/me?access_token=' + token })
        } catch (e) {
            console.error(e.message)
            return e
        }
        var b = JSON.parse(res)
        console.log('checking access token FB', res, userId, b.id === userId)
        return b.id === userId || res
    },
    generateRemindPasswordCode: function(user) {
        var tsExpiry = (new Date).getTime() + (3600 * 24 * 1000)
        return module.exports.generateCode(user._id, tsExpiry)
    },
    generateCode: function(t1, t2, t3) {
        var token = t3 || "672a0675e18e3d558c93e1a2c31ad6c1"
        return [t1, t2].join('_') + '_' + helpers.sha256([t1, t2, t3].join(''))
    },
    getUserFromRemindPasswordCode: async function(code) {
        var parts = code.split('_')
        try {
            var user = await User.findOne({ _id: parts[0] })
        } catch (e) {
            //invalid object id
            return false
        }
        var tsExpiry = parseInt(parts[1])

        if (!user) {
            //user not found
            return false
        }

        var now = (new Date()).getTime()
        if (now > tsExpiry) {
            //code expired
            return false
        }

        if (code !== module.exports.generateCode(user._id, tsExpiry)) {
            //code is invalid
            return false
        }

        return user
    },
    changePassword: async function(userId, newPassword) {
        let u = await User.findOne({ _id: userId })
        if (!u) {
            return cb('repository.user.not_exists')
        }

        u.password = newPassword

        return await u.save()
    },
    addQuota: async (user, ml, ql, mid, bl) => {
        if (!user.quota) {
            user.quota = {}
        }

        if (ml > 0) {
            user.quota.messages_left += ml
        }

        if (bl > 0) {
            user.quota.bytes_left += bl
        }

        if (ql > 0) {
            user.quota.queues_left += ql
        }

        if (mid > 0) {
            user.quota.max_idle_days = mid
        }

        await user.save()
    },
    register: async (email, password) => {
        let u = await User.findOne({ email: email })
        if (u) {
            return 'user_exists'
        }

        u = new User
        u.password = password
        u.email = email

        u.quota.setFreeQuota()

        return await u.save()
    }
}