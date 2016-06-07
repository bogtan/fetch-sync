'use strict';

/* global fetch:false, Request:false */

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol ? "symbol" : typeof obj; };

exports.default = fetchSync;

var _serialiseRequest = require('serialise-request');

var _serialiseRequest2 = _interopRequireDefault(_serialiseRequest);

var _createSync = require('./createSync');

var _createSync2 = _interopRequireDefault(_createSync);

var _store = require('./store');

var _store2 = _interopRequireDefault(_store);

var _requests = require('./store/requests');

var _creators = require('./store/creators');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

var hasStartedInit = false;
var hasBackgroundSyncSupport = true;

function environmentHasSupport() {
  var notSupported = [];

  if (!('serviceWorker' in navigator)) {
    notSupported.push('Service Workers');
  }

  if (!('SyncManager' in window)) {
    notSupported.push('Background Sync');
  }

  if (notSupported.length) {
    console.warn('fetchSync: environment does not support ' + notSupported.join(', ') + '.\n      Requests will be forwarded to `fetch`.');
  }

  return !notSupported.length;
}

function createSyncOperation(name, request) {
  var options = arguments.length <= 2 || arguments[2] === undefined ? {} : arguments[2];

  if (typeof request !== 'string' && !(request instanceof Request)) {
    throw new Error('Expecting URL to be a string or Request');
  } else if ((typeof options === 'undefined' ? 'undefined' : _typeof(options)) !== 'object') {
    throw new Error('Expecting options to be an object');
  }

  var realRequest = request instanceof Request ? request : new Request(request, options);

  return (0, _serialiseRequest2.default)(realRequest).then(function (serialisedRequest) {
    return (0, _createSync2.default)(name, serialisedRequest, options);
  }).then(function (sync) {
    return _store2.default.dispatch((0, _requests.registerSync)(sync)).then(function () {
      return sync.promise;
    });
  });
}

function resolveSyncArgs(request, options, extra) {
  var realName = undefined;
  var realRequest = request;
  var realOptions = {};

  if ((typeof options === 'undefined' ? 'undefined' : _typeof(options)) === 'object' && !(options instanceof Request)) {
    realOptions = options;
  }

  if (typeof request === 'string' && (typeof options === 'string' || options instanceof Request)) {
    realRequest = options;
    realName = request;

    if ((typeof extra === 'undefined' ? 'undefined' : _typeof(extra)) === 'object') {
      realOptions = extra;
    }
  }

  return [realName, realRequest, realOptions];
}

// ---
// Public
// ---

/**
 * Create a 'sync' operation.
 * @param {String|Request} request
 * @param {Object|String} [options]
 * @param {Object} [extra]
 * @returns {Promise}
 */
function fetchSync(request, options, extra) {
  var args = resolveSyncArgs(request, options, extra);

  if (!hasBackgroundSyncSupport) {
    return fetch(args[1], args[2]);
  }

  return createSyncOperation.apply(undefined, _toConsumableArray(args));
}

/**
 * Initialise fetchSync.
 * @param {Object} options
 */
fetchSync.init = function fetchSync_init(options) {
  if (hasStartedInit) {
    throw new Error('fetchSync.init() called multiple times');
  } else if (options && !options.workerUrl) {
    throw new Error('Expecting `workerUrl` in options object');
  }

  if (!environmentHasSupport()) {
    hasBackgroundSyncSupport = false;
    return Promise.reject(new Error('Environment not supported'));
  }

  var _store$getState = _store2.default.getState();

  var commsChannel = _store$getState.commsChannel;


  hasStartedInit = true;

  navigator.serviceWorker.register(options.workerUrl, options.workerOptions).then(function (registration) {
    if (options.forceUpdate) {
      registration.update();
    }
    return _store2.default.dispatch((0, _creators.setServiceWorker)(navigator.serviceWorker.controller));
  }).then(function () {
    return _store2.default.dispatch((0, _requests.openCommsChannel)());
  }).catch(function (err) {
    console.warn('fetchSync: failed to register the Service Worker');
    throw err;
  });

  return commsChannel.promise;
};

/**
 * Get a sync.
 * @param {String} name
 * @returns {Object|Boolean}
 */
fetchSync.get = function fetchSync_get(name) {
  var _store$getState2 = _store2.default.getState();

  var syncs = _store$getState2.syncs;

  var ids = Object.keys(syncs);

  for (var i = 0; i < ids.length; i++) {
    var sync = syncs[ids[i]];
    if (sync.name === name) {
      return sync.promise;
    }
  }

  return false;
};

/**
 * Get all named syncs.
 * @returns {Array}
 */
fetchSync.getAll = function fetchSync_getNames() {
  var _store$getState3 = _store2.default.getState();

  var syncs = _store$getState3.syncs;

  return Object.keys(syncs).filter(function (sync) {
    return !!sync.name;
  });
};

/**
 * Cancel a sync.
 * @param {Object|String} sync
 * @returns {Promise}
 */
fetchSync.cancel = function fetchSync_cancel(sync) {
  return fetchSync.get((typeof sync === 'undefined' ? 'undefined' : _typeof(sync)) === 'object' ? sync.name : sync).then(function (sync) {
    return sync.cancel();
  });
};

/**
 * Cancel all syncs.
 * @returns {Promise}
 */
fetchSync.cancelAll = function fetchSync_cancelAll() {
  return _store2.default.dispatch((0, _requests.cancelAllSyncs)());
};

Object.keys(fetchSync).forEach(function (methodName) {
  if (['init', 'register'].indexOf(methodName) === -1) {
    (function () {
      var method = fetchSync[methodName];
      Object.defineProperty(fetchSync, methodName, {
        enumerable: true,
        value: function value() {
          for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
            args[_key] = arguments[_key];
          }

          if (!hasStartedInit) {
            throw new Error('Initialise fetchSync first by calling fetchSync.init(<options>)');
          }

          var _store$getState4 = _store2.default.getState();

          var commsChannel = _store$getState4.commsChannel;

          return commsChannel.promise.then(function () {
            return method.apply(undefined, args);
          });
        }
      });
    })();
  }
});
module.exports = exports['default'];