var jwt = require('jsonwebtoken');
var mongoose = require('mongoose')
var User = require('../../models/user.js')

var return401 = function(res, msg) {
    return res.status(401).send({
        success: false,
        message: msg
    });
}

module.exports = function(req, res, next) {

    if (req.method.toLowerCase() === 'options') {
        return next()
    }

    var token = req.query.access_token 
    || req.headers['x-access-token'] 
    || req.cookies['x-access-token'];

    // decode token
    if (token) {

        // verifies secret and checks exp
        jwt.verify(token, req.app.get('jwtSecret'), function(err, decoded) {
            if (err) {
                return return401(res, 'Failed to authenticate token.');
            } else {
                // if everything is good, save to request for use in other routes
                req.decoded = decoded;
                req.decoded.id = mongoose.Types.ObjectId(req.decoded.id)
                User.findOne({ _id: req.decoded.id }, function(err, doc) {
                	if(!doc){
                        return res.status(404).send({
                            success: false,
                            message: 'user_not_found'
                        });
                	}
                    req.decoded.user = doc
                    next();
                })
            }
        });

    } else {

        // if there is no token
        // return an error
		return401(res, 'No token provided.')
    }

}