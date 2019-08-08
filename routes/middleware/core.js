
var AccessToken = require('../../models/access_token')
var User = require('../../models/user')

var return401 = function(res, msg) {
    return res.status(401).send({
        success: false,
        message: msg
    });
}

module.exports = async (req, res, next) => {

    var token = req.query.access_token || req.headers['x-access-token']|| req.headers['access_token'];
    req.realIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress
    
    if (token) {        
        let t = await AccessToken.findOne({value: token})

        if(!t){
            return return401(res, 'token_invalid')
        }
        
        req.user_id = t.user

        let u = await User.findOne({_id: t.user}, {'quota': 1})
        req.quota = u.quota
        req.token = t

        next()

    } else {
		return401(res, 'token_missing')
    }

}