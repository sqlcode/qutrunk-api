# Qutrunk
Qutrunk is a managed queue-as-a-service. Using the simple REST API, you push and pull messages without worrying about queue reliability. Qutrunk supports multiple backends as well as access control using access tokens and statistics, all via the web interface. [Read more about architecture in docs](https://github.com/spinache/qutrunk-api/wiki)

# Features
* 5 minutes setup
* PUSH and PULL messages with simple GET & POST
* Manage queues from web GUI
* Create queue with first message
* Multiple backends (currently MongoDB, RabbitMQ, Redis)
* Multiple ingestion/digestion protocols (currently HTTP(S), gRPC)
* Queue usage statistics and aditing (message log)
* Access tokens with access control for pushing/pulling/creating queues
* StatsD metric export

# Example usage
You can simply push message with single command
```sh
curl --request POST \
  --url 'https://app.qutrunk.com/api/v1/core/push/{QUEUE_NAME}?access_token=ACCESS_TOKEN' \
  --data 'hello world'
```
and pull it with another
```sh
curl --request GET --url 'https://app.qutrunk.com/api/v1/core/pull/{QUEUE_NAME}?access_token={ACCESS_TOKEN}'
```

More examples in Golang, Node.js, Java, PHP in [docs](https://github.com/spinache/qutrunk-api/wiki/6.-Example-HTTP-push-in-Go-Node.js-PHP-Java-curl)

# Supported protocols for ingest/digest of messages
- [x] HTTP(S)
- [x] gRPC

Soon:
- [ ] Websockets
- [ ] AMQP

Missing your favourite protocol? File an issue to let us know.

# Supported backends
- [x] MongoDB
- [x] RabbitMQ
- [x] Redis

Soon:
- [ ] PostgreSQL
- [ ] MariaDB

No having your preferred backend? File an issue to let us know or write your own integration and create a pull request.

# Installation & configuration
To install Qutrunk just simply clone the repository and install all required dependencies:
```sh
git clone git@github.com:spinache/qutrunk-api.git
cd qutrunk-api;
npm install;
cp config.js.dist config.js;
```
For in-depth configuration please refer to [documentation](https://github.com/spinache/qutrunk-api/wiki)
# Running
We recommend starting at least two Node.js processes that listen to HTTP requests.
You can setup a reverse proxy like Nginx in front of those processes that will also handle SSL handshakes. For more details refer to [docs](https://github.com/spinache/qutrunk-api/wiki).
```
pm2 start --name=app_3001 app.js -- --port=3001
pm2 start --name=app_3002 app.js -- --port=3002
```

# Hosted version
You can use our hosted version of Qutrunk: https://qutrunk.com/

It comes with small quota of about 25 000 messages per month but its suitable for any pet/small project.

If you need a higher quota, please contact us: contact@qutrunk.com

# Motivation
Qutrunk was created as an internal tool to integrate tens of internal services where any of them needed a queue. We needed to track usages and access across all of them and interact with queues using HTTP. Another reason was IoT, where we used Qutrunk as a queue provider with HTTP interface we can use on Raspberry, ESP8266 known as NodeMCU and other small development boards.

[A blog post about using Qutrunk in IoT with example code in C](https://medium.com/@posinsk/message-queue-for-iot-in-2-minutes-42200f3c7a5f)

After all, we didn't find any similar tool that could use multiple backends that are managed from the GUI. Of course Qutrunk is not meant to be a competitor for projects like Kafka or RabbitMQ, its is more like overlay interface that provides additional features to queues.

Currently we have a single deployment on 3-node cluster (each has 1 vCPU, 2gb RAM, 20 GB HDD) with MongoDB as replica and RabbitMQ with replication. It processes over 1 500 000 messages per day (about 17 msg/s) providing queue service for couple of our other internal projects.

Contact: contact@quturnk.com

This project is created and maintained by [Code Fibers](https://codefibershq.com)

# License
Unless otherwise noted, all Metabase source files are made available under the terms of the GNU Affero General Public License (AGPL).
See LICENSE.txt for details and exceptions.
Unless otherwise noted, all files © 2019 Qutrunk.
