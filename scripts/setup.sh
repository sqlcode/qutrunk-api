sudo apt-get install nginx libcurl4 erlang curl unzip;
sudo add-apt-repository ppa:certbot/certbot
sudo apt-get update
sudo apt-get install python-certbot-nginx
sudo certbot --nginx -d qutrunk.com -d api.qutrunk.com

wget https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-ubuntu1804-4.0.4.tgz;
tar -xzvf mongodb-linux-x86_64-ubuntu1804-4.0.4.tgz;
rm mongodb-linux-x86_64-ubuntu1804-4.0.4.tgz;
mv mongodb-linux-x86_64-ubuntu1804-4.0.4 mongodb;
mkdir mongodb_data;

echo 'export PATH=~/mongodb/bin:$PATH' >> .bashrc;

wget https://nodejs.org/dist/v10.14.2/node-v10.14.2-linux-x64.tar.xz;
tar xf node-v10.14.2-linux-x64.tar.xz;
rm node-v10.14.2-linux-x64.tar.xz;
mv node-v10.14.2-linux-x64 nodejs;

echo 'export PATH=~/nodejs/bin:$PATH' >> .bashrc;
chmod 400 mongo.key;

#-----------------------

npm install -g pm2;

wget https://github.com/rabbitmq/rabbitmq-server/releases/download/v3.7.9/rabbitmq-server-generic-unix-3.7.9.tar.xz;
tar xf rabbitmq-server-generic-unix-3.7.9.tar.xz;
mv rabbitmq_server-3.7.9 rabbitmq_server;
rm rabbitmq-server-generic-unix-3.7.9.tar.xz;
mkdir /var/lib/rabbitmq;

# rabbitmq_server/sbin/rabbitmq-plugins enable rabbitmq_management