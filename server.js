'use strict';
var crypto = require('crypto');
var connect = require('connect');
var Q = require('q');
var fetchComponents = require('./component-list');

var componentListEntity;
var entity;

var HTTP_PORT = process.env.PORT || 8011;
//interval for updating old repos
var UPDATE_OLD_REPOS_INTERVAL_IN_DAYS =  7;
//interval for fetching new repos
var UPDATE_NEW_REPOS_INTERVAL_IN_MINUTES = 15;

function getComponentListEntity(fetchNew) {
	var deferred = Q.defer();

	fetchComponents(fetchNew || false).then(function (list) {
		console.log('Finished fetching data from GitHub', '' + new Date());

		// TODO: Find a way for the promise not to return null so this isn't needed
		list = list.filter(function (el) {
			return el !== null && el !== undefined;
		});

		entity = {json: JSON.stringify(list)};
		var shasum = crypto.createHash('sha1');
		shasum.update(entity.json);
		entity.etag = shasum.digest('hex');
		deferred.resolve(entity);
		// update the entity
		componentListEntity = deferred.promise;
	}).fail(function (err) {
		console.log('fetchComponents error', err);
		if (entity) {
			deferred.resolve(asset);
		} else {
			deferred.reject(err);
		}
	});

	return deferred.promise;
}

function getComponentList(request, response, next) {
	componentListEntity.then(function (entity) {
		// allow CORS
		response.setHeader('ETag', entity.etag);
		response.setHeader('Access-Control-Allow-Origin', '*');
		response.setHeader('Content-Type', 'application/json');

		if (request.headers['if-none-match'] === entity.etag) {
			response.statusCode = 304;
			response.end();
			return;
		}

		response.statusCode = 200;
		response.end(new Buffer(entity.json));
	}).fail(function (err) {
		console.error('' + new Date(), 'Failed serving componentListEntity', err);
		next(err);
	});
}

// componentListEntity - promise {etag: '', json: ''}
// using a promise so that clients can connect and wait for the initial entity
componentListEntity = getComponentListEntity();

connect()
	.use(connect.errorHandler())
	.use(connect.timeout(60000))
	.use(connect.logger('dev'))
	.use(connect.compress())
	.use(getComponentList)
	.listen(HTTP_PORT);

//interval for getting old repository every week
setInterval(getComponentListEntity, UPDATE_OLD_REPOS_INTERVAL_IN_DAYS * 24 * 60 * 60 * 1000);

//interval for fetching new repos
setInterval(function() { getComponentListEntity(true); }, UPDATE_NEW_REPOS_INTERVAL_IN_MINUTES * 60 * 1000);

console.log('Server running on port ' + HTTP_PORT);
