var File = require('./../lib/file'),
	fs = require('fs-extra'),
	MongoDb = require('mongodb'),
	MongoFiles = require('./../lib/mongo-files'),
	MongoClient = require('mongodb').MongoClient,
	path = require('path');
require('when/es6-shim/Promise');

var mongoDbHandle;
/**
 * @type Collection
 */
var mongoCollection;
var testCollectionName = 'mongo-files-test';

process.on('uncaughtException', function (err) {
	console.error(err);
});

exports.setUp = function (setUpDone) {
	getMongoClient('mongodb://localhost:27017/mongo-files-test')
		.then(function (mongoDbHandleTmp) {
			mongoDbHandle = mongoDbHandleTmp;
			mongoCollection = mongoDbHandle.collection('test-files');
			setUpDone();
		}.bind(this));
};

exports.tearDown = function (tearDownDone) {
	fs.removeSync(path.join(__dirname, 'storage'));
	mongoCollection.deleteMany({}, {}, function (err) {
		mongoDbHandle.close();
		tearDownDone();
	});
	//tearDownDone();
};

exports.testSetup = function (test) {
	test.expect(1);
	var tmpPath = path.join(__dirname, 'storage');
	var mongoFiles = new MongoFiles(mongoCollection, tmpPath);
	mongoFiles._setup()
		.then(function (setupResults) {
			test.ok(fs.existsSync(setupResults[0]));
			test.done();
		});
};

exports.testWrite = function (test) {
	test.expect(3);

	var fileId = 'test-file-a';
	var storagePath = path.join(__dirname, 'storage');
	var mongoFiles = new MongoFiles(mongoCollection, storagePath);
	var myFile = new File('test-file-a', path.join(__dirname, 'files', 'hello.txt'));
	mongoFiles.write(myFile)
		.then(function (writeResults) {
			test.ok(writeResults);
		}.bind(this))
		.then(function () {
			mongoCollection.findOne({_id: fileId}, function (err, doc) {
				test.equal(null, err);
				test.ok(doc);
				test.done();
			});
		}.bind(this));
};

exports.testRead = function (test) {
	test.expect(1);

	var storagePath = path.join(__dirname, 'storage');
	var srcDirectory = path.join(__dirname, 'files', 'hello.txt');
	var dstPath = path.join(__dirname, 'files', 'hello-downloaded.txt');

	var mongoFiles = new MongoFiles(mongoCollection, storagePath);
	var myFile = new File('test-file-a', srcDirectory, {hello: "world"});
	mongoFiles.write(myFile)
		.then(function (writeResults) {
			test.ok(writeResults);
		}.bind(this))
		.then(function () {
			return mongoFiles.read(myFile.id, dstPath);
		}.bind(this))
		.then(function (readFile) {
			fs.removeSync(dstPath);
			test.done();
		})
};

function getMongoClient(dsn) {
	return new Promise(function (resolve, reject) {
		MongoClient.connect(dsn, function (err, db) {
			if (err) {
				reject(err);
			}
			resolve(db);
		});
	});
}