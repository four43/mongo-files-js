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
 * @param {String} destPath
 * @param {{}} options
 * @param {{}}results
 */
MongoFilesCache.prototype.read = function (readEventPromises, fileId, destPath, options, results) {
	if (options.cacheAllowed) {
		//Cache is allowed. Do we have it in our cache?
		try {
			var fileStats = fs.statSync(this.getPath(fileId));

			var fileMetaData = fs.readJsonSync(this.getPath(fileId)+'.meta');
			results.file = this.mapJsonToFile(fileMetaData);
			return true;
		}
		catch (err) {
			if (err.errno !== 34) {
				//errno 34 is a regular not found, if there was another error, log it and file the file.
				console.error(err);
			}
			//File not found.
			options.cacheAllowed = false;
			var savePromise = this.mongoFilesObj.read(fileId, this.getPath(fileId), options)
				.then(function (file) {
					var fileMetaData = this.mapFileToJson(file);
					var jsonPath = path.join(this.getPath(file.id) + '.meta');
					fs.writeJSONFileSync(jsonPath, fileMetaData);
					results.file = file;
					return file;
				}.bind(this));
		}
	}
};

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