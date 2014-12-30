var fs = require('fs-extra'),
	ErrorInvalidPath = require('./../lib/error/invalid-path'),
	File = require('./../lib/file'),
	MongoDb = require('mongodb'),
	MongoFiles = require('./../lib/mongo-files'),
	MongoClient = require('mongodb').MongoClient,
	path = require('path');

exports.testInvalidCreate = function(test) {
	test.throws(function() {
		var file = new File('hello', './here');
	},
	ErrorInvalidPath);
	test.done();
};

exports.testSetPath = function(test) {
	var file = new File('hello', path.join(__dirname, 'files', 'hello.txt'));
	test.done();
};

exports.testResetReadStream = function(test) {
	var file = new File('hello', path.join(__dirname, 'files', 'hello.txt'));
	var readStream = file.readStream;
	file.path = path.join(__dirname, 'files', 'hello.txt');
	test.done();
};

exports.testInvalidSetPath = function(test) {
	test.throws(function() {
			var file = new File('hello', './here');
			file.path = './nope.txt';
		},
		ErrorInvalidPath);
	test.done();
};