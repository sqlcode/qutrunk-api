const RedisSMQ = require("rsmq");

class client {

    constructor(queuePrefix) {
        this.queuePrefix = queuePrefix || 'qutrunk_'
    }

    async connect(host, port) {

        this.conn = new RedisSMQ({ host: host, port: port })

        let connected = await new Promise((resolve, reject) => {
            let noconnection = false
            setTimeout(() => {
                noconnection = true
                reject(false)
            }, 1500)
            this.conn.redis.send_command('ping', (err, res) => {
                if (noconnection) {
                    return
                }
                if (err) {
                    return reject(false)
                }
                if (res === "PONG") {
                    resolve(true)
                }
            })
        })

        if (!connected) {
            throw new Error('Cannot connect to Redis')
        }

        this.connected = true

        return true
    }

    async purge(queue) {
        let self = this

        let queues = await this.listQueues()

        if (queues.indexOf(queue) < 0) {
            return true
        }

        return new Promise((resolve, reject) => {
            this.conn.deleteQueue({ qname: queue }, async function(err, resp) {
                if (err) {
                    reject(err)
                    return
                }

                await self.create(queue)
                resolve(true)
            })
        })
    }

    async close() {
        await this.conn.quit()
    }

    async delete(queue) {
        let self = this

        let queues = await this.listQueues()

        if (queues.indexOf(queue) < 0) {
            return true
        }

        return new Promise((resolve, reject) => {
            this.conn.deleteQueue({ qname: queue }, async function(err, resp) {
                if (err) {
                    reject(err)
                    return
                }

                resolve(true)
            })
        })
    }

    async listQueues() {
        return new Promise((resolve, reject) => {
            this.conn.listQueues(function(err, queues) {
                if (err) {
                    reject(err)
                    return
                }

                resolve(queues)
            });
        })
    }

    async create(queue) {
        let queues = await this.listQueues()

        if (queues.indexOf(queue) >= 0) {
            return true
        }

        return new Promise((resolve, reject) => {
            this.conn.createQueue({ qname: queue }, function(err, resp) {
                if (err) {
                    reject(err)
                    return
                }

                if (resp === 1) {
                    resolve(true)
                }
            });
        })
    }

    async push(queue, msg) {

        if (typeof msg === 'object') {
            msg = JSON.stringify(msg)
        }

        return new Promise((resolve, reject) => {
            this.conn.sendMessage({ qname: queue, message: msg }, function(err, resp) {
                if (err) {
                    reject(err)
                    return
                }

                resolve(resp);
            });
        })

    }

    async _pull(queue) {
        return new Promise((resolve, reject) => {
            this.conn.popMessage({ qname: queue }, function(err, resp) {
                if (err) {
                    reject(err)
                    return
                }

                if (resp.id) {
                    resolve(resp)
                } else {
                    resolve()
                }
            });
        })
    }

    async pull(queue, count) {
        count = count || 1
        let data = []
        while (count > 0) {
            count--

            let m = await this._pull(queue)

            if (m) {
                data.push(m.message)
            } else {
                break
            }
        }

        return data
    }

}

module.exports = client