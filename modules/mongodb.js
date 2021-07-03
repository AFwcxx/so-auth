const MongoClient = require('mongodb').MongoClient;
const mongoConfig = require('../configs/mongodb.json');
const mongo = require('mongodb');

exports.getClient = getClient;
exports.getGfs = getGfs;
exports.connect = connectServer;
exports.disconnect = disconnect;

var dbConnected = false;
var dbGfsConnected = false;
var dbDatabase = false;

function getClient() {
  if (dbConnected === false) {
    throw new Error('MongoDB disconnected');
  }
  return dbConnected.db(dbDatabase);
}

function getGfs() {
  if (dbGfsConnected === false) {
    throw new Error('MongoDB GFS disconnected');
  }
  return dbGfsConnected;
}

async function connectServer(env) {
  try {
    if (mongoConfig.server === undefined || mongoConfig.server === '') {
      throw new Error("MongoDB Error: No database defined in config.");
    }

    env = env.toLowerCase();
    let acceptedEnv = ['development', 'production'];
    if (!acceptedEnv.includes(env)) {
      throw new Error('MongoDB Error: Invalid environment value.');
    }

    let url = "";
    let username = mongoConfig.server[env].username;
    let password = mongoConfig.server[env].password;
    let hostname = mongoConfig.server[env].hostname;
    let database = mongoConfig.server[env].database;
    let port = mongoConfig.server[env].port;

    if (username === "" && password === "") {
      url = "mongodb://"+hostname+":"+port+'/'+database;
    } else {
      url = "mongodb://"+username+":"+password+"@"+hostname+":"+port+'/'+database;
    }

    dbConnected = await connectDb(url);
    dbDatabase = database;

    try {
      await setupCollections();
      dbGfsConnected = createGfs();
    } catch (err) {
      console.log(err.message);
    }

    return dbConnected;
  } catch(e) {
    throw e;
  }
}

function connectDb(url) {
  return new Promise((resolve, reject) => {
    MongoClient.connect(url, { 
      useNewUrlParser: true, 
      useUnifiedTopology: true, 
      authSource:'admin' 
    }, function (err, db) {
      if (err) {
        reject(err);
      }
      resolve(db);
    });
  });
}

function disconnect() {
  if (dbConnected) {
    dbConnected.close();
    dbGfsConnected = false;
  }
}

function setupCollections() {
  return new Promise(resolve => {
    let db = getClient();

    if (mongoConfig.collections.length > 0) {
      console.log('MongoDB Info: Configuring collections.');

      let promises = [];
      mongoConfig.collections.forEach((v, i) => {
        promises.push(db.createCollection(v));
      });

      Promise.all(promises).then(res => {
        resolve(res);
      }).catch(e => {
        console.log(e.message);
        resolve(false);
      });
    } else {
      resolve(mongoConfig.collections);
    }
  });
}

function createGfs() {
  return new mongo.GridFSBucket(getClient());
}
