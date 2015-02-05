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
		dbFilePathHolder:  '.MongoDbManagedFiles',
		partialFileSuffix: '.part'
	};
	this.options = MongoFiles._merge(defaults, options);

	this.mongoCollection = mongoCollection;
	this.dbFilePath = filePath;

	EventEmitter.call(this);
}

util.inherits(MongoFiles, EventEmitter);

MongoFiles.prototype.EVENT_FIND = 'find';
MongoFiles.prototype.EVENT_READ = 'read';
MongoFiles.prototype.EVENT_READ_DONE = 'read_done';

MongoFiles.prototype.EVENT_STREAM_READ = 'stream_read';
MongoFiles.prototype.EVENT_STREAM_WRITE = 'stream_write';

MongoFiles.prototype.EVENT_WRITE = 'write'; //Called before writing
MongoFiles.prototype.EVENT_WRITE_DONE = 'write_done'; //Called after writing


/**
 * Read File
 *
 * Reads a file from the database, copies to the location provided. Will copy from cache if allowed.
 *
 * @param {string} id
 * @param {string} destinationPath - A path to copy the resulting file to.
 * @param {Object} [options={}]
 * @return {Promise} A promise that resolves to a new File, that wil have a path to a file that will be "fast"
 */
MongoFiles.prototype.read = function (id, destinationPath, options) {
	if (options === undefined) {
		options = {};
	}
	var defaultOptions = {
		cacheAllowed:      false,
		partialFileSuffix: this.options.partialFileSuffix
	};
	options = MongoFiles._merge(defaultOptions, options);

	//Emit 'read' event
	var readEventPromises = [];
	var results = {file: null}; //Object so we can pass by reference
	this.emit(this.EVENT_READ, readEventPromises, id, destinationPath, options, results);

	return Promise.all(readEventPromises)
		.then(function (readEventResults) {
			if (results.file instanceof File) {
				//Our middleware returned a file, just return that.
				return results.file;
			}
			else {
				return this._setup()
					.then(function (setupResults) {
						//Read from stream
						return this.readStream(id, destinationPath + options.partialFileSuffix, options);
					}.bind(this))
					.then(function (file) {
						//Move .part version of the file into place.
						var filePath = file.path;
						var dstFilePath = filePath.substr(0, (filePath.length - options.partialFileSuffix.length));
						return new Promise(function (resolve, reject) {
							fs.move(filePath, dstFilePath, function (err) {
								if (err) {
									reject(err);
								}
								file.path = dstFilePath;
								resolve(file);
							})
						}.bind(this));
					}.bind(this))
					.then(function (file) {
						//Emit 'read done' event
						var readPromises = [];
						this.emit(this.EVENT_READ_DONE, readPromises, file, destinationPath, options, results);

						return Promise.all(readPromises)
							.then(function (readResults) {
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
 * @param {String} destPath
 * @param {{}} [options]
 * @returns {Promise} resolves to File
 */
MongoFiles.prototype.readStream = function (id, destPath, options) {
	return this._setup()
		.then(function (setupResults) {
			//@todo Skip looking for a mongo file if cache returned doc.
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
				var srcStream = fs.createReadStream(path.join(this.dbFilePath, mongoDoc.path));
				var destStream = fs.createWriteStream(destPath);

				var newFile = _mapToFile(mongoDoc, destStream);

				var streams = [srcStream, destStream];
				this.emit(this.EVENT_STREAM_READ, newFile, streams, options);

				try {
					var finalStream = streams[0];
					for (var i = 1; i < streams.length; i++) {
						finalStream = finalStream.pipe(streams[i]);
					}
					finalStream.on('end', function () {
						resolve(newFile);
					}.bind(this));
					finalStream.on('finish', function () {
						resolve(newFile);
					}.bind(this));
				}
				catch (error) {
					console.error(error);
				}
			}.bind(this));
		}.bind(this))
};

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

	var defaultOptions = {
		cacheAllowed:      false,
		partialFileSuffix: this.options.partialFileSuffix
	};
	options = MongoFiles._merge(defaultOptions, options);

	//Emit 'write' event
	var writeEventPromises = [];
	this.emit(this.EVENT_WRITE, writeEventPromises, file, options);

	return Promise.all(writeEventPromises)
		.then(this._setup.bind(this))
		.then(function (setupResults) {
			//Setup Done, Directory Check next
			debug('Setup done, ready to write.');
			if (this.pluginVars !== {}) {
				options.plugin = file.pluginVars;
			}
			return this.writeStream(file.id, file.readStream, file.meta, options);
		}.bind(this))
		.then(function (mongoDoc) {
			file.dateCreated = mongoDoc.dateCreated;

			//Emit 'write done' event
			var writePromises = [];
			this.emit(this.EVENT_WRITE_DONE, writePromises, file, options, mongoDoc);
			return Promise.all(writePromises)
				.then(function (promiseResults) {
					return file;
				});
		}.bind(this));
};

/**
 * Write File (Stream)
 *
 * Writes a file to storage, takes in a stream.
 * @param {string} id
 * @param {ReadStream} readStream
 * @param {{}} metaData
 * @param {{}} [options={}]
 * @return Promise - Returns the result of the MongoDB writeop.
 */
MongoFiles.prototype.writeStream = function (id, readStream, metaData, options) {
	if (options === undefined) {
		options = {};
	}

	return this._setup()
		.then(function (setupResults) {
			return new Promise(function (resolve, reject) {
				//Write to the db path + id
				var outputPath = path.join(this.dbFilePath, id);
				var outputStream = fs.createWriteStream(outputPath);

				var streams = [readStream, outputStream];
				this.emit(this.EVENT_STREAM_WRITE, id, streams, metaData, options);

				var finalStream = streams[0];
				for (var i = 1; i < streams.length; i++) {
					finalStream = finalStream.pipe(streams[i]);
				}
				finalStream.on('finish', function () {
					resolve(finalStream);
				}.bind(this));
			}.bind(this));
		}.bind(this))
		.then(function (writtenStream) {
			//Write to MongoDb
			return new Promise(function (resolve, reject) {
				var finalPath = writtenStream.path;
				var relPath = path.relative(this.dbFilePath, finalPath);

				var newDoc = {
					_id:         id,
					path:        relPath,
					meta:        metaData,
					dateCreated: new Date()
				};
				if (options.plugin) {
					newDoc.plugin = options.plugin;
				}
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
 * Find
 *
 * Returns objects that matched where criteria sorted by sort criteria.
 *
 * @param {{}} where
 * @param {{}} [sort={}]
 * @returns {Promise} Resolves to Files[]
 */
MongoFiles.prototype.find = function (where, sort) {
	if (where === null) {
		where = {};
	}

	//Emit 'read' event
	var findEventPromises = [];
	var results = {docs: null}; //Object so we can pass by reference
	this.emit(this.EVENT_FIND, findEventPromises, where, sort, results);

	return Promise.all(findEventPromises)
		.then(function (findEventResults) {
			if (results.docs instanceof Array) {
				//Our middleware returned a file, just return that.
				return results.docs;
			}
			else {
				return new Promise(function (resolve, reject) {
					var cursor = this.mongoCollection.find(where);
					if (sort !== undefined && sort !== null) {
						cursor.sort(sort);
					}

					var docs = [];
					cursor.forEach(function (doc) {
							if (doc !== null) {
								docs.push(_mapToFile(doc));
							}
						},
						function (err) {
							if(err) {
								return reject(err);
							}
							return resolve(docs);
						});
				}.bind(this));
			}
		}.bind(this));
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

/**
 * Map To File
 *
 * Maps a Mongo Doc to a file.
 *
 * @param {{}} mongoDoc
 * @param {stream} [stream]
 * @returns {File}
 * @private
 */
function _mapToFile(mongoDoc, stream) {
	var path;
	if(stream) {
		path = stream.path;
	}
	return new File(mongoDoc._id, path, mongoDoc.meta, mongoDoc.dateCreated, mongoDoc.plugin);
}

module.exports = MongoFiles;