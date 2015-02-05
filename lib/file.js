var fs = require('fs'),
	fstream = require('fstream'),
	ErrorInvalidInput = require('./error/invalid-input'),
	ErrorInvalidPath = require('./error/invalid-path');

/**
 * File
 * @param {string} id
 * @param {string} filePath
 * @param {{}} [meta={}]
 * @param {Date} dateCreated
 * @param {{}} [pluginVars={}]
 * @constructor
 *
 * @todo File needs more properties that plugins can read, ensure these get saved to mongo on save. directory, compressed info.
 */
function File(id, filePath, meta, dateCreated, pluginVars) {
	if (meta === undefined) {
		meta = {};
	}
	if (pluginVars === undefined) {
		pluginVars = {};
	}
	this.id = id;

	if (filePath) {
		this.path = filePath;
	}
	this.meta = meta;

	this.dateCreated = dateCreated;

	this.readStream = null;

	this.pluginVars = pluginVars;
}

/**
 * Define path
 * I wanted to try getters/setters
 * Set needs to reset our readStream
 */
Object.defineProperty(File.prototype, 'path', {
	get: function () {
		return path;
	},
	set: function (newPath) {
		this.readStream = null;
		path = newPath;
		//throw new ErrorInvalidInput('The path lead to a valid file, not a directory or missing.');
		return this;
	}
});

Object.defineProperty(File.prototype, 'readStream', {
	get: function () {
		if (readStream === null) {
			if (!this.isDirectory(this.path)) {
				if (this.path === null || this.path === undefined) {
					throw new ErrorInvalidInput('This file must have a path or a readStream');
				}
				readStream = fstream.Reader({path: this.path, follow: true});
			}
			else {
				readStream = fstream.Reader({path: this.path, type: "Directory", follow: true});
			}
		}
		return readStream;
	},
	set: function (newReadStream) {
		readStream = newReadStream;
		return this;
	}
});

File.prototype.getPluginVar = function (pluginNamespace, key) {
	return this.pluginVars[pluginNamespace][key];
};

File.prototype.setPluginVar = function (pluginNamespace, key, value) {
	if (this.pluginVars[pluginNamespace] === undefined) {
		this.pluginVars[pluginNamespace] = {};
	}
	this.pluginVars[pluginNamespace][key] = value;
};

/**
 * Returns Is Directory
 *
 * Returns if the path is a directory or not.
 * @todo Make this async if needed.
 *
 * @param path
 * @returns boolean
 */
File.prototype.isDirectory = function (path) {
	try {
		var stats = fs.statSync(path);
		return stats.isDirectory();
	} catch (exception) {
		throw new ErrorInvalidPath('Path: ' + path + ' is not a readable file');
	}
};

module.exports = File;