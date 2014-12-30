var fs = require('fs'),
	ErrorInvalidInput = require('./error/invalid-input'),
	ErrorInvalidPath = require('./error/invalid-path');

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

	this.path = filePath;

	this.meta = meta;

	this.dateCreated = dateCreated;

	this.readStream = null;
}

/**
 * Define path
 * I wanted to try getters/setters
 * Set needs to reset our readStream
 */
Object.defineProperty(File.prototype, 'path', {
	get: function() {
		return path;
	},
	set: function(newPath) {
		if (!this._isDirectory(newPath)) {
			this.readStream = null;
			path = newPath;
		}
		else {
			throw new ErrorInvalidInput('The path lead to a valid file, not a directory or missing.');
		}
		return this;
	}
});

Object.defineProperty(File.prototype, 'readStream', {
	get: function() {
		if (readStream === null) {
			if (this.path === null || this.path === undefined) {
				throw new ErrorInvalidInput('This file must have a path or a readStream');
			}
			readStream = fs.createReadStream(this.path);
		}
		return readStream;
	},
	set: function(newReadStream) {
		readStream = newReadStream;
	}
});

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
	try {
		var stats = fs.statSync(path);
		return stats.isDirectory();
	} catch(exception) {
		throw new ErrorInvalidPath('Path: ' + path + ' is not a readable file');
	}
};

module.exports = File;