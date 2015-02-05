var debug = require('debug')('MongoFiles-Plugin-Gzip'),
	File = require('./../file'),
	MongoFiles = require('./../mongo-files'),
	zlib = require('zlib');

/**
 * @param {MongoFiles} mongoFilesObj
 * @constructor
 */
function Gzip(mongoFilesObj) {
	mongoFilesObj.on(MongoFiles.prototype.EVENT_STREAM_WRITE, this.streamWrite.bind(this));
	mongoFilesObj.on(MongoFiles.prototype.EVENT_STREAM_READ, this.streamRead.bind(this));

	this.mongoFilesObj = mongoFilesObj;
}

Gzip.prototype.PLUGIN_NAMESPACE = 'gzip';

/**
 * Stream Write
 *
 * Packs a stream pointing to a folder into a tar file.
 *
 * @param {String} id
 * @param {[]} streams
 * @param {{}} metaData
 * @param {{}} options
 */
Gzip.prototype.streamWrite = function (id, streams, metaData, options) {
	debug('Adding GZIP to streams');
	var gzipStream = zlib.createGzip();
	streams.splice((streams.length - 1), 0, gzipStream);

	if (options.plugin === undefined) {
		options.plugin = {};
	}
	if (options.plugin[this.PLUGIN_NAMESPACE] === undefined) {
		options.plugin[this.PLUGIN_NAMESPACE] = {};
	}
	options.plugin[this.PLUGIN_NAMESPACE]['gzipped'] = true;
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
Gzip.prototype.streamRead = function (file, streams, options) {
	if (file.getPluginVar(this.PLUGIN_NAMESPACE, 'gzipped')) {
		debug('Adding GUNZIP to streams');
		var gUnzipStream = zlib.createGunzip();
		streams.splice(1,0,gUnzipStream);
	}
};

module.exports = Gzip;