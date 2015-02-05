var crypto = require('crypto'),
	fs = require('fs-extra'),
	fstream = require('fstream'),
	File = require('./../lib/file'),
	Gzip = require('./../lib/plugins/gzip'),
	MongoFiles = require('./../lib/mongo-files'),
	MongoClient = require('mongodb').MongoClient,
	tar = require('tar'),
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
	getMongoClient('mongodb://localhost:27017/'+testCollectionName)
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
};

exports.testAttach = function (test) {
	var storagePath = path.join(__dirname, 'storage');

	var mongoFiles = new MongoFiles(mongoCollection, storagePath);
	var gZip = new Gzip(mongoFiles);

	test.done();
};

exports.testWrite = function (test) {
	test.expect(5);

	var storagePath = path.join(__dirname, 'storage');
	var srcPath = path.join(__dirname, 'files', 'hello.txt');

	var mongoFiles = new MongoFiles(mongoCollection, storagePath);
	var gZip = new Gzip(mongoFiles);

	var myFile = new File('hello-zip', srcPath, {hello: "world"});
	mongoFiles.write(myFile)
		.then(function (writeResults) {
			test.ok(writeResults);
			test.equal(true, myFile.getPluginVar(gZip.PLUGIN_NAMESPACE, 'gzipped'));

			var fileStats = fs.statSync(path.join(storagePath, myFile.id));
			test.ok(fileStats);
			test.ok(fileStats.size > 0);
			return writeResults;
		}.bind(this))
		.then(function(writeResults) {
			return compareHash(path.join(storagePath, myFile.id), '5b7c694f603fd34b4620ce841735bfa8cfca23e9', test);
		})
		.then(function(compareResults) {
			test.done();
		});
};

exports.testRead = function (test) {
	test.expect(5);

	var storagePath = path.join(__dirname, 'storage');
	var srcPath = path.join(__dirname, 'files', 'hello.txt');
	var dstPath = path.join(__dirname, 'files', 'hello-downloaded.txt');

	var mongoFiles = new MongoFiles(mongoCollection, storagePath);
	var gZip = new Gzip(mongoFiles);

	var myFile = new File('hello-zipped', srcPath, {hello: "world"});
	mongoFiles.write(myFile)
		.then(function (writeResults) {
			test.ok(writeResults);
			test.equal(true, myFile.getPluginVar(gZip.PLUGIN_NAMESPACE, 'gzipped'));
			test.ok(fs.statSync(path.join(storagePath, myFile.id)));
		}.bind(this))
		.then(function () {
			//Initial Read, will be in cache when this is done.
			return mongoFiles.read(myFile.id, dstPath);
		}.bind(this))
		.then(function (readFile) {
			//Ensure file got there, then remove it.
			test.ok(fs.statSync(dstPath));
			return dstPath;
		}.bind(this))
		.then(function(dstPath) {
			return compareHash(path.join(storagePath, myFile.id), '5b7c694f603fd34b4620ce841735bfa8cfca23e9', test);
		}.bind(this))
		.then(function(results) {
			fs.removeSync(dstPath);
			test.done();
		}.bind(this));
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

/**
 *
 * @param filePath
 * @param expectedHash
 * @param test
 * @returns {Promise}
 */
function compareHash(filePath, expectedHash, test) {
	return new Promise(function(resolve) {
		//Hash our result, make sure it's what we want.
		var shaSum = crypto.createHash('sha1');
		var hashStream = fs.ReadStream(filePath);
		hashStream.on('data', function(d) {
			shaSum.update(d);
		}.bind(this));
		hashStream.on('end', function() {
			var digest = shaSum.digest('hex');
			test.equal(digest,expectedHash);
			resolve(filePath);
		}.bind(this));
	});
}