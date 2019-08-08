let grpc = require("grpc");
var protoLoader = require("@grpc/proto-loader");

/*
test client
*/

var proto = grpc.loadPackageDefinition(
    protoLoader.loadSync("./proto/simple_queue.proto", {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true
    })
);

const REMOTE_SERVER = "0.0.0.0:5001";

let username;


class grpcClient{
    constructor(address, secure){
        this.client = new proto.qutrunk.Queue(
            address || REMOTE_SERVER,
            secure ? grpc.credentials.createSsl() : grpc.credentials.createInsecure()
        );
        
    }

    close(){
        grpc.closeClient(this.client)
    }

    subscribe(queue, accessToken, onData) {
        let call = this.client.subscribe({ queue: queue, access_token: accessToken });
        call.on("data", onData);
        // call.on('end', function() {
        //     // The server has finished sending
        // });
        // call.on('error', function(e) {
        //     // An error has occurred and the stream has been closed.
        // });
        // call.on('status', function(status) {
        //     // process status
        // });
        return call
    }

    pull(queue, accessToken) {
        return new Promise((resolve, reject) => {
            this.client.pull({ queue: queue, access_token: accessToken }, (err, res) => {
                if (err) {
                    return reject(err)
                }
                resolve(res)
            })
        })
    }

    push(queue, accessToken, data) {
        return new Promise((resolve, reject) => {
            this.client.push({ queue: queue, access_token: accessToken, message: { data: data } }, function(err, response) {
                if (err) {
                    return reject(err)
                }
                resolve(response)
            })
        })
    }
}

module.exports = grpcClient