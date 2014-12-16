/**
 * Abstract Error
 *
 * General error, all errors are children of this.
 * @param message
 * @param statusCode
 * @constructor
 */
function AbstractError(message, statusCode) {
	Error.call(this, message, statusCode);
	Error.captureStackTrace(this, AbstractError);

	this.message = message || this.message
}
AbstractError.prototype = Object.create(Error.prototype);

AbstractError.prototype.setMessage = function (message) {
	return message || "There has been an error with the Mongo Files system."
};

module.exports = AbstractError;