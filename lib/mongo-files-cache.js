var File = require('./file'),
	fs = require('fs-extra'),
	path = require('path'),
	MongoFiles = require('./mongo-files');
/**
 * @param directory
 * @param {MongoFiles} mongoFilesObj
 * @constructor
 */
function MongoFilesCache(directory, mongoFilesObj) {
	mongoFilesObj.on(MongoFiles.prototype.EVENT_READ, this.read.bind(this));
	mongoFilesObj.on(MongoFiles.prototype.EVENT_READ_DONE, this.readDone.bind(this));
	mongoFilesObj.on(MongoFiles.prototype.EVENT_WRITE_DONE, this.write.bind(this));

	this.mongoFilesObj = mongoFilesObj;

	fs.ensureDirSync(directory);
	this.directory = directory;
}

/**
 * Read From Cache
 *
 * Put response in the file.
 * If this callback is asyncronous, add the promise to the readEventPromises.
 * @param {[]} readEventPromises
 * @param {File} fileId
 * @param {String} destinationPath
 * @param {{}} options
 * @param {{}}results
 */
MongoFilesCache.prototype.read = function (readEventPromises, fileId, destinationPath, options, results) {
	if (options.cacheAllowed) {
		//Cache is allowed. Do we have it in our cache?
		try {
			var fileStats = fs.statSync(this.getPath(fileId));
			var fileMetaData = fs.readJsonSync(this.getPath(fileId) + '.meta');
			results.file = this.mapJsonToFile(fileMetaData);
			return true;
		}
		catch (err) {
			if (err.errno !== 34) {
				//errno 34 is a regular not found, if there was another error, log it and file the file.
				console.error(err);
			}
			return false;
		}
	}
};

/**
 * Read Done
 *
 * The once the read is done we have the complete file, save it to the cache.
 *
 * @param {[]} readEventPromises
 * @param {File} file
 * @param {String} destinationPath
 * @param {{}} options
 * @param {{}} results
 * @returns {boolean}
 */
MongoFilesCache.prototype.readDone = function (readEventPromises, file, destinationPath, options, results) {
	if (options.cacheAllowed) {
		//Cache is allowed, save it to the cache.
		var metaDataPromise = new Promise(function (resolve, reject) {
			var fileMetaData = this.mapFileToJson(file);
			var jsonPath = path.join(this.getPath(file.id) + '.meta');
			fs.writeJSONFile(jsonPath, fileMetaData, function (err) {
				if (err) {
					reject(err);
				}
				resolve(jsonPath);
			});
		}.bind(this));
		readEventPromises.push(metaDataPromise);

		var filePromise = new Promise(function (resolve, reject) {
			//Write to the db path + id
			var outputPath = this.getPath(file.id);
			var outputStream = fs.createWriteStream(outputPath);

			var finalStream = file.readStream.pipe(outputStream);
			finalStream.on('finish', function () {
				resolve(finalStream);
			}.bind(this));
		}.bind(this));
		readEventPromises.push(filePromise);
	}
};

/**
 * Write File to Cache
 *
 * Write a file to the cache once it has been written to the primary storage.
 *
 * @param writeEventPromises
 * @param file
 * @param options
 * @param mongoResult
 */
MongoFilesCache.prototype.write = function (writeEventPromises, file, options, mongoResult) {
	console.log('here');
};

MongoFilesCache.prototype.getPath = function (id) {
	return path.join(this.directory, id);
};


/**
 * Map a File to Json
 * @param {File} file
 * @return {{}}
 */
MongoFilesCache.prototype.mapFileToJson = function (file) {
	return {
		id: file.id,
		dateCreated: file.dateCreated,
		meta: file.meta,
		path: this.getPath(file.id)
	}
};

/**
 * Map a JSON to File
 * @param {{}} json
 * @return {File}
 */
MongoFilesCache.prototype.mapJsonToFile = function (json) {
	return new File(json.id, json.path, json.meta, json.dateCreated);
};

module.exports = MongoFilesCache;