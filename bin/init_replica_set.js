var MongoClient = require('mongodb').MongoClient;
let config = require('../config.js')

const mongoose = require('mongoose');
mongoose.connect(config.mongo, { useNewUrlParser: true }, (err) => {
    console.log(err)
    mongoose.connection.db.admin().command({ replSetInitiate: {} }, function(err, info) {
        console.log(err, info);
        process.exit()
    })
});
