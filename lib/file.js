var fs = require('fs'),
	InvalidInputError = require('./error/invalid-input');

/**
 * File
 * @param {string} id
 * @param {string} filePath
 * @param {{}} [meta={}]
 * @param {Date} dateCreated
 * @constructor
 */
function File(id, filePath, meta, dateCreated) {
	if (meta === undefined) {
		meta = {};
	}
	this.id = id;

	this._path = filePath;

	this.meta = meta;

	this.dateCreated = dateCreated;

	this.readStream = null;
}

/**
 * Set Path
 * @param path
 * @returns {File}
 */
File.prototype.setPath = function (path) {
	if (!this._isDirectory(path)) {
		this.readStream = null;
		this._path = path;
	}
	else {
		throw new InvalidInputError('This file must have a path or a readStream');
	}
	return this;
};

/**
 * Get Path
 * @returns {string}
 */
File.prototype.getPath = function () {
	return this._path;
};

/**
 * Get ReadStream
 * @returns {ReadStream}
 */
File.prototype.getReadStream = function () {
	if (this.readStream === null) {
		if (this._path === null || this._path === undefined) {
			throw new InvalidInputError('This file must have a path or a readStream');
		}
		this.readStream = fs.createReadStream(this._path);
	}
	return this.readStream;
};

/**
 * Returns Is Directory
 *
 * Returns if the path is a directory or not.
 * @todo Make this async if needed.
 *
 * @param path
 * @returns boolean
 * @private
 */
File.prototype._isDirectory = function (path) {
	var stats = fs.statSync(path);
	return stats.isDirectory();
};

module.exports = File;