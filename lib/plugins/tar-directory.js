var debug = require('debug')('MongoFiles-Plugin-TarDir'),
	File = require('./../file'),
	fs = require('fs-extra'),
	MongoFiles = require('./../mongo-files'),
	path = require('path'),
	tar = require('tar');

/**
 * @param {MongoFiles} mongoFilesObj
 * @constructor
 */
function TarDir(mongoFilesObj) {
	mongoFilesObj.on(MongoFiles.prototype.EVENT_STREAM_WRITE, this.streamWrite.bind(this));
	mongoFilesObj.on(MongoFiles.prototype.EVENT_STREAM_READ, this.streamRead.bind(this));

	this.mongoFilesObj = mongoFilesObj;
}

TarDir.prototype.PLUGIN_NAMESPACE = 'tar';

/**
 *
 * @param {String} id
 * @param {[]} streams
 * @param {{}} metaData
 * @param {{}} options
 */
TarDir.prototype.streamWrite = function(id, streams, metaData, options) {
	if(File.prototype.isDirectory(streams[0].path)) {
		var packStream = tar.Pack({ noProprietary: true });
		streams.splice((streams.length-1), 0, packStream);

		if(options.plugin === undefined) {
			options.plugin = {};
		}
		if(options.plugin[this.PLUGIN_NAMESPACE] === undefined) {
			options.plugin[this.PLUGIN_NAMESPACE] = {};
		}
		options.plugin[this.PLUGIN_NAMESPACE]['tarred'] = true;
	}
};

/**
 * Stream Read
 *
 * When the stream is read, see if this is a tar file, then extract if it is.
 * *NOTE:* This is terminating, cannot chain anything after this because this results in multiple files.
 *
 * @param {File} file Incomplete file, file doesn't exist at location yet, just the stream where it will go.
 * @param {[]} streams
 * @param {{}} options
 */
TarDir.prototype.streamRead = function (file, streams, options) {
	if(file.getPluginVar(this.PLUGIN_NAMESPACE, 'tarred')) {
		var lastStream = streams[streams.length-1];
		fs.removeSync(lastStream.path);
		streams[streams.length-1] = tar.Extract({path: lastStream.path});
	}
};

module.exports = TarDir;