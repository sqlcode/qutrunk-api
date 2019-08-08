let server = require('./proto/server')
const config = require('./config');
const mongoose = require('mongoose');
mongoose.connect(config.mongo, { useNewUrlParser: true });
mongoose.Promise = global.Promise;

server.startGrpcServer(config.grpc_server.addr)