var crypto = require('crypto');

var fs = require('fs')
// var request = require('request')

module.exports = {
    save: async function(e) {
        var invalid = e.validateSync()
        if (invalid) {
            throw new Error(invalid)
        } else {
            return await e.save()
        }
    },
    randomToken: function(b) {
        return crypto.randomBytes(b || 64).toString('hex').replace(/i|l|o|0/g,'').substr(0, b || 10);
    },
    sha256: function(s) {
        return crypto.createHash('sha256')
            .update(s)
            .digest('hex');
    },
    md5: function(s) {
        return crypto
            .createHash('sha1')
            .update(s)
            .digest('hex')
    },
    base64encode: function(s) {
        return new Buffer(s).toString('base64')
    }
}