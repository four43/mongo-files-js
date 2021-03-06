var crypto = require('crypto'),
	fs = require('fs-extra'),
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
			fs.removeSync(storagePath);
			test.done();
		});
};

exports.testWrite = function (test) {
	test.expect(5);

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
			return writeResults;
		}.bind(this))
		.then(function(writeResults) {
			return compareHash(path.join(storagePath, myFile.id), 'cb69ccd9a599141da11b4228728c83ce4a3e745d', test);
		})
		.then(function(compareResults) {
			test.done();
		});
};

exports.testRead = function (test) {
	test.expect(8);

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
			return dstPath;
		}.bind(this))
		.then(function(dstPath) {
			var hashChecks = [];
			var expectedHashes = ['4c41332c5980e7514518fcddd48be69f0fdd590b', '0ed1fc3688464e0eba7b74cf5fe8265138103594'];
			var filePaths = fs.readdirSync(dstPath);
			for(var i in filePaths) {
				var filePath = path.join(dstPath, filePaths[i]);
				test.ok(fs.statSync(filePath));
				hashChecks.push(compareHash(filePath, expectedHashes[i], test));
			}
			return Promise.all(hashChecks);
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