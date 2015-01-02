var fs = require('fs-extra'),
	File = require('./../lib/file'),
	MongoDb = require('mongodb'),
	MongoFiles = require('./../lib/mongo-files'),
	MongoClient = require('mongodb').MongoClient,
	Cache = require('./../lib/plugins/file-cache'),
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
})

exports.setUp = function (setUpDone) {
	getMongoClient('mongodb://localhost:27017/mongo-files-test')
		.then(function (mongoDbHandleTmp) {
			mongoDbHandle = mongoDbHandleTmp;
			mongoCollection = mongoDbHandle.collection('test-files');
			setUpDone();
		}.bind(this));
};

exports.tearDown = function (tearDownDone) {
	fs.removeSync(path.join(__dirname, 'tmp'));
	mongoCollection.deleteMany({}, {}, function (err) {
		mongoDbHandle.close();
		tearDownDone();
	});
};

exports.testAttach = function (test) {
	test.expect(1);

	var tmpPath = path.join(__dirname, 'tmp');
	var cacheDir = path.join(__dirname, 'cache');

	var mongoFiles = new MongoFiles(mongoCollection, tmpPath);
	var mongoFilesCache = new Cache(cacheDir, mongoFiles);

	test.ok(File.prototype._isDirectory(cacheDir));
	test.done();
};

exports.testRead = function (test) {
	test.expect(3);

	var tmpPath = path.join(__dirname, 'tmp');
	var cacheDir = path.join(__dirname, 'cache');
	var srcPath = path.join(__dirname, 'files', 'hello.txt');
	var dstPath = path.join(__dirname, 'files', 'hello-downloaded.txt');

	var mongoFiles = new MongoFiles(mongoCollection, tmpPath);
	var mongoFilesCache = new Cache(cacheDir, mongoFiles);

	var myFile = new File('test-file-a', srcPath, {hello: "world"});
	mongoFiles.write(myFile)
		.then(function (writeResults) {
			test.ok(writeResults);
		}.bind(this))
		.then(function () {
			//Initial Read, will be in cache when this is done.
			return mongoFiles.read(myFile.id, dstPath, {cacheAllowed: true});
		}.bind(this))
		.then(function (readFile) {
			test.ok(fs.statSync(dstPath));
			fs.removeSync(dstPath);
		})
		.then(function() {
			mongoFiles.dbFilePath = null;
			return mongoFiles.read(myFile.id, dstPath, {cacheAllowed: true});
		})
		.then(function (readFile) {
			test.equal(path.join(cacheDir, 'test-file-a'), myFile.path);
			fs.removeSync(cacheDir);
			test.done();
		})
};

function getMongoClient(dsn) {
	return new Promise(function (resolve, reject) {
		MongoClient.connect(dsn, function (err, db) {
			if (err) {
				reject(err);
			}
			console.log("Connected correctly to server");
			resolve(db);
		});
	});
}