var nodemailer = require('nodemailer')
var config = require('../config')
var handlebars = require('handlebars')
var fs = require('fs')
var transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: {
        user: config.smtp.user,
        pass: config.smtp.password
    },
    tls: {
        // do not fail on invalid certs
        rejectUnauthorized: false
    }
})

module.exports = {
    async template(file){
        return new Promise((resolve, reject)=>{
            fs.readFile(file, (err,res)=> {
                if(err){
                    return reject(err)
                }

                return resolve(res.toString())
            })
        })
    },
    async send(from, to, subject, template, context) {
        var template = handlebars.compile(template)
        var compiled = template(context)

        var mailOptions = {
            from: from, // sender address
            to: to, // list of receivers
            subject: subject, // Subject line
            html: compiled, // plaintext body
        };
        
        if (process.env.NODE_ENV === 'test') {
            return
        }

        if (!config.smtp.user) {
            throw new Error('no smtp user setting')
        }

        // send mail with defined transport object
        return new Promise((resolve, reject) => {
            transporter.sendMail(mailOptions, (err, info) => {
                if (err) {
                    return reject(err)
                }
                resolve(info)
            });
        })
    }
}