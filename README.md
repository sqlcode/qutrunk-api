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

More examples in Golang, Node.js, Java, PHP in (docs)[https://github.com/spinache/qutrunk-api/wiki/6.-Example-HTTP-push-in-Go-Node.js-PHP-Java-curl]

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
# License
Unless otherwise noted, all Metabase source files are made available under the terms of the GNU Affero General Public License (AGPL).
See LICENSE.txt for details and exceptions.
Unless otherwise noted, all files © 2019 Qutrunk.
