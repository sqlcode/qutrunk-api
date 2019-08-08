var config = require('../../config')

module.exports = function(req, res, next) {

	if(config.debug){
		res.header("Access-Control-Allow-Origin", 'http://localhost:8080');
	    res.header("Access-Control-Allow-Methods", "GET,POST,DELETE")
	    res.header("Access-Control-Allow-Headers", "Content-Type, Access-Control-Allow-Headers, Authorization, X-Requested-With,Origin, Access-Control-Allow-Origin, x-access-token, Accept, x-pass")
	    res.header("Access-Control-Allow-Credentials", "true")
	}


	if(req.method.toLowerCase() === 'options'){
		res.send()
		return
	}

    next();
}