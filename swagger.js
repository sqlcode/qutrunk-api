var express = require('express');
var config = require('./config')
var app = express();
var auth = require('basic-auth')
var swagger = require('swagger-express');

module.exports = swagger.init(app, {
    apiVersion: '1.0',
    swaggerVersion: '1.0',
    swaggerURL: '/swagger',
    swaggerJSON: '/swagger/api-docs.json',
    swaggerUI: './public/swagger/',
    basePath: config.api_address,
    info: {
        title: 'swagger-stamps-api',
        description: 'Swagger + Express = {swagger-express}'
    },
    apis: [
        './routes/public.js',
        './routes/restricted.js',
    ],
    middleware: function(req, res) {
        var credentials = auth(req)
        
        if (!credentials || credentials.name !== config.swagger.login || credentials.pass !== config.swagger.password) {
            res.statusCode = 401
            res.setHeader('WWW-Authenticate', 'Basic realm="example"')
            res.end('Access denied')
        }
    }
})