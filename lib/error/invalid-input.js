var InvalidInputError = require('./abstract-error');
/**
 * Invalid Input Error
 *
 * Invalid user input, thrown when a user provides an invalid set of arguments.
 * @param message
 * @constructor
 */
InvalidInputError.prototype.setMessage = function (message) {
	return message || "There was an issue with one or more of the inputs provided."
};

module.exports = InvalidInputError;