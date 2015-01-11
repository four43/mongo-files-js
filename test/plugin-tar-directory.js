var fs = require('fs-extra'),
	fstream = require('fstream'),
	File = require('./../lib/file'),
	MongoDb = require('mongodb'),
	MongoFiles = require('./../lib/mongo-files'),
	MongoClient = require('mongodb').MongoClient,
	tar = require('tar'),
	TarDir = require('./../lib/plugins/tar-directory'),
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
};

exports.testAttach = function (test) {
	var storagePath = path.join(__dirname, 'storage');

	var mongoFiles = new MongoFiles(mongoCollection, storagePath);
	var tarDir = new TarDir(mongoFiles);

	test.done();
};

exports.sanityCheck = function(test) {
	var srcPath = path.join(__dirname, 'files', 'group');
	var storagePath = path.join(__dirname, 'files', 'sanity.tar');

	var reader = fstream.Reader(srcPath);
	var packStream = tar.Pack({ noProprietary: true });
	var writer = fs.createWriteStream(storagePath);
	reader.pipe(packStream).pipe(writer)
		.on('finish', function() {
			test.done();
		});
};

exports.testWrite = function (test) {
	test.expect(4);

	var storagePath = path.join(__dirname, 'storage');
	var srcPath = path.join(__dirname, 'files', 'group');

	var mongoFiles = new MongoFiles(mongoCollection, storagePath);
	var tarDir = new TarDir(mongoFiles);

	var myFile = new File('group-folder', srcPath, {hello: "world"});
	mongoFiles.write(myFile)
		.then(function (writeResults) {
			test.ok(writeResults);
			test.equal(true, myFile.getPluginVar(tarDir.PLUGIN_NAMESPACE, 'tarred'));

			var fileStats = fs.statSync(path.join(storagePath, myFile.id));
			test.ok(fileStats);
			test.ok(fileStats.size > 0);
			test.done();
		}.bind(this));
};

exports.testRead = function (test) {
	test.expect(4);

	var storagePath = path.join(__dirname, 'storage');
	var srcPath = path.join(__dirname, 'files', 'group');
	var dstPath = path.join(__dirname, 'files', 'group-downloaded');

	var mongoFiles = new MongoFiles(mongoCollection, storagePath);
	var tarDir = new TarDir(mongoFiles);

	var myFile = new File('group-folder', srcPath, {hello: "world"});
	mongoFiles.write(myFile)
		.then(function (writeResults) {
			test.ok(writeResults);
			test.equal(true, myFile.getPluginVar(tarDir.PLUGIN_NAMESPACE, 'tarred'));
			test.ok(fs.statSync(path.join(storagePath, myFile.id)));
		}.bind(this))
		.then(function () {
			//Initial Read, will be in cache when this is done.
			return mongoFiles.read(myFile.id, dstPath);
		}.bind(this))
		.then(function (readFile) {
			//Ensure file got there, then remove it.
			test.ok(fs.statSync(dstPath));
			//@todo Look for individual files.
			fs.removeSync(dstPath);
			test.done();
		});
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