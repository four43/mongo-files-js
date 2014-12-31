var debug = require('debug')('MongoFiles'),
	EventEmitter = require('events').EventEmitter,
	File = require('./file'),
	fs = require('fs-extra'),
	path = require('path'),
	util = require('util');
require('when/es6-shim/Promise');

/**
 * Mongo Files
 *
 * A file manager that provides search capabilities and meta data storage via MongoDb
 * @param {Collection} mongoCollection
 * @param {string} filePath - The path to the file storage
 * @param {object} [options={}]
 * @constructor
 */
function MongoFiles(mongoCollection, filePath, options) {
	if (options === undefined) {
		options = {};
	}
	var defaults = {
		dbFilePathHolder: '.MongoDbManagedFiles',
		cache: null
	};
	this.options = MongoFiles._merge(defaults, options);

	this.mongoCollection = mongoCollection;
	this.dbFilePath = filePath;

	EventEmitter.call(this);
}

util.inherits(MongoFiles, EventEmitter);

MongoFiles.prototype.EVENT_WRITE = 'write'; //Called before writing
MongoFiles.prototype.EVENT_WRITE_DONE = 'write_done'; //Called after writing
MongoFiles.prototype.EVENT_READ = 'read';
MongoFiles.prototype.EVENT_READ_DONE = 'read_done';

/**
 * Write File
 *
 * Writes a file to the storage folder as well as the database.
 * **Note:** Acts as a wrapper to writeStream
 *
 * @param {File} file
 * @param {Object} [options={}]
 * @returns Promise
 */
MongoFiles.prototype.write = function (file, options) {
	if (options === undefined) {
		options = {};
	}
	this.emit(this.EVENT_WRITE, file, options);

	return this._setup()
		.then(function (setupResults) {
			//Setup Done, Directory Check next
			debug('Setup done, ready to write.');
			return this.writeStream(file.id, file.readStream, file.meta, options);
		}.bind(this))
		.then(function (mongoDoc) {
			file.dateCreated = mongoDoc.dateCreated;
			var writePromises = [];
			this.emit(this.EVENT_WRITE_DONE, writePromises, file, options, mongoDoc);
			return Promise.all(writePromises)
		}.bind(this))
		.then(function (callbackResponses) {
			return file;
		});
};

/**
 * Write File (Stream)
 *
 * Writes a file to storage, takes in a stream.
 * @param {string} id
 * @param {ReadStream} readStream
 * @param {{}} metaData
 * @param options
 * @return Promise - Returns the result of the MongoDB writeop.
 */
MongoFiles.prototype.writeStream = function (id, readStream, metaData, options) {
	return this._setup()
		.then(function (setupResults) {
			return new Promise(function (resolve, reject) {
				//Write to the db path + id
				var outputPath = path.join(this.dbFilePath, id);
				var outputStream = fs.createWriteStream(outputPath);

				var finalStream = readStream.pipe(outputStream);
				finalStream.on('finish', function () {
					resolve(finalStream);
				}.bind(this));
			}.bind(this));
		}.bind(this))
		.then(function (writtenStream) {
			//Write to MongoDb
			return new Promise(function (resolve, reject) {
				var finalPath = writtenStream.path;

				var newDoc = {
					_id: id,
					path: finalPath,
					meta: metaData,
					dateCreated: new Date()
				};
				this.mongoCollection.updateOne({'_id': id}, newDoc, {
					upsert: true
				}, function (err, result) {
					if (err) {
						reject(err);
					}
					resolve(newDoc);
				});
			}.bind(this));
		}.bind(this));
};

/**
 * Read File
 *
 * Reads a file from the database, copies to the location provided. Will copy from cache if allowed.
 *
 * @param {string} id
 * @param {string} destPath - A path to copy the resulting file to.
 * @param {Object} [options={}]
 * @return {Promise} A promise that resolves to a new File
 */
MongoFiles.prototype.read = function (id, destPath, options) {
	if (options === undefined) {
		options = {};
	}
	var defaultOptions = {
		cacheAllowed: false
	};
	options = MongoFiles._merge(defaultOptions, options);

	var readEventPromises = [];
	var results = {file: null};

	this.emit(this.EVENT_READ, readEventPromises, id, destPath, options, results);

	return Promise.all(readEventPromises)
		.then(function (readEventResults) {
			if (results.file instanceof File) {
				return results.file;
			}
			else {
				return this._setup()
					.then(function (setupResults) {
						//Read from stream
						var destStream = fs.createWriteStream(destPath);
						return this.readStream(id, destStream, options);
					}.bind(this))
					.then(function (file) {
						var readPromises = [];
						this.emit(this.EVENT_READ_DONE, readPromises, file, destPath, options, results);
						return Promise.all(readPromises)
							.then(function () {
								return file;
							})
					}.bind(this))
					.then(function (file) {
						return file;
					}.bind(this));
			}
		}.bind(this));
};

/**
 * Read Stream
 *
 * Fetches a file by id and reads to the destStream. Resolves when the copy is complete.
 * @param {String} id
 * @param {String} destStream
 * @param {{}} [options]
 * @returns {Promise} resolves to File
 */
MongoFiles.prototype.readStream = function (id, destStream, options) {
	return this._setup()
		.then(function (setupResults) {
			return new Promise(function (resolve, reject) {
				this.mongoCollection.findOne({_id: id}, function (err, doc) {
					if (err) {
						reject(err);
					}
					resolve(doc);
				}.bind(this))
			}.bind(this))
		}.bind(this))
		.then(function (mongoDoc) {
			return new Promise(function (resolve, reject) {
				var srcStream = fs.createReadStream(mongoDoc.path);
				var finalStream = srcStream.pipe(destStream);
				finalStream.on('finish', function () {
					var newFile = new File(mongoDoc._id, finalStream.path, mongoDoc.meta, mongoDoc.dateCreated);
					resolve(newFile);
				}.bind(this));
			}.bind(this));
		})
};

/**
 * Setup
 *
 * Setup the db and file system.
 *
 * @returns {*}
 * @private
 * @returns Promise
 */
MongoFiles.prototype._setup = function () {
	var setupTasks = [];

	var dbFilesDirResult = this._setupDbFilesDirectory(path.join(this.dbFilePath, this.options.dbFilePathHolder));
	setupTasks.push(dbFilesDirResult);

	return Promise.all(setupTasks);
};

/**
 * Setup DB Files Directory
 *
 * Setup the directory where the files should be stored.
 *
 * @param {string} placeholderFilePath
 * @returns Promise
 * @private
 */
MongoFiles.prototype._setupDbFilesDirectory = function (placeholderFilePath) {
	return new Promise(function (resolve, reject) {
		fs.ensureFile(placeholderFilePath, function (err) {
			if (err) {
				reject(err);
			}
			resolve(placeholderFilePath);
		});
	});
};

/**
 * Merge
 *
 * Just a simple little object merge. Overrides objectA with objectB
 *
 * @param {Object} objectA - Starting object
 * @param {Object} objectB - Object who's keys override objectA's
 * @returns {{}}
 * @private
 */
MongoFiles._merge = function (objectA, objectB) {
	for (var attrName in objectB) {
		if (objectA.hasOwnProperty(attrName) && objectA[attrName] instanceof Object && objectB.hasOwnProperty(attrName) && objectB[attrName] instanceof Object) {
			objectA[attrName] = MongoFiles._merge(objectA[attrName], objectB[attrName]);
		}
		else {
			objectA[attrName] = objectB[attrName];
		}
	}
	return objectA;
};

module.exports = MongoFiles;