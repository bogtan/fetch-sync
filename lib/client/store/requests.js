'use strict';

/* global MessageChannel:false */

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.registerSync = registerSync;
exports.cancelAllSyncs = cancelAllSyncs;
exports.cancelSync = cancelSync;
exports.openCommsChannel = openCommsChannel;

var _miniDefer = require('mini-defer');

var _miniDefer2 = _interopRequireDefault(_miniDefer);

var _serialiseResponse = require('serialise-response');

var _serialiseResponse2 = _interopRequireDefault(_serialiseResponse);

var _creators = require('./creators');

var _constants = require('../../constants');

var _actionTypes = require('../../actionTypes');

var _index = require('./index');

var _index2 = _interopRequireDefault(_index);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function registerSync(sync) {
  return function (dispatch, getState) {
    var _getState = getState();

    var syncs = _getState.syncs;

    var request = (0, _creators.requestRegisterSync)(sync);

    // We may have already added the sync when the register
    // operation was performed without the comms channel open
    if (!(sync.id in syncs)) {
      dispatch((0, _creators.addSync)(sync));
    }

    return postMessage(request).catch(sync.reject);
  };
}

function cancelAllSyncs() {
  return function (dispatch) {
    dispatch((0, _creators.removeAllSyncs)());
    return postMessage((0, _creators.requestCancelAllSyncs)());
  };
}

function cancelSync(sync) {
  return function (dispatch) {
    dispatch((0, _creators.removeSync)(sync));
    return postMessage((0, _creators.requestCancelSync)(sync));
  };
}

/**
 * Open a MessageChannel that will be used for receiving the results of fetch requests
 * made on behalf of fetchSync operations and other requests by the client.
 */
function openCommsChannel() {
  return function (dispatch, getState) {
    var _getState2 = getState();

    var serviceWorker = _getState2.serviceWorker;
    var commsChannel = _getState2.commsChannel;


    if (!serviceWorker) {
      return Promise.reject(new Error('No service worker'));
    }

    return new Promise(function (resolve, reject) {
      var messageChannel = new MessageChannel();
      var complete = false;

      serviceWorker.postMessage((0, _creators.requestOpenComms)(), [messageChannel.port2]);

      messageChannel.port1.onmessage = function (event) {
        complete = true;

        // First response is to confirm comms channel is
        // open and send all named syncs to the client
        if (commsChannel.status === _constants.CommsChannelStatus.CLOSED) {
          dispatch((0, _creators.setCommsOpen)(true));
          dispatch((0, _creators.addSyncs)(event.data.data || []));
        } else {
          dispatch(receiveFetchResponse(event));
        }

        resolve();
      };

      // Fail after two seconds
      setTimeout(function () {
        if (!complete) {
          dispatch((0, _creators.setCommsOpen)(false));
          reject(new Error('Connecting to Worker timed out. ' + 'See Initialisation documentation.'));
        }
      }, 2000);
    });
  };
}

/**
 * Send a message to the Service Worker. Each message is sent through a new
 * channel and wrapped in a Promise resolving with the first response.
 * @param {Object} data
 * @returns {Promise}
 */
function postMessage(data) {
  var _store$getState = _index2.default.getState();

  var serviceWorker = _store$getState.serviceWorker;

  var _defer = (0, _miniDefer2.default)();

  var promise = _defer.promise;
  var resolve = _defer.resolve;
  var reject = _defer.reject;

  var messageChannel = new MessageChannel();
  var complete = false;

  serviceWorker.postMessage(data, [messageChannel.port2]);

  messageChannel.port1.onmessage = function (event) {
    if (complete) {
      return;
    }

    complete = true;
    messageChannel.port1.close();
    messageChannel.port2.close();

    if (event.data.error) {
      reject(event.data.error);
      return;
    }

    resolve(event.data);
  };

  return promise;
}

function receiveFetchResponse(event) {
  return function (dispatch, getState) {
    var _getState3 = getState();

    var syncs = _getState3.syncs;

    var _JSON$parse = JSON.parse(event.data);

    var type = _JSON$parse.type;
    var data = _JSON$parse.data;

    var sync = syncs[data.id];

    if (sync) {
      switch (type) {
        case _actionTypes.Responses.SUCCESS:
          handleSyncSuccess(dispatch, sync, data);
          return;
        case _actionTypes.Responses.FAILURE:
          handleSyncFailure(dispatch, sync, data);
          return;
        default:
          throw new Error('Unknown response type \'' + type + '\'');
      }
    }
  };
}

function handleSyncSuccess(dispatch, sync, data) {
  var response = _serialiseResponse2.default.deserialise(data.response);

  sync.resolve(response);

  if (sync.name) {
    sync.response = response;
  } else {
    dispatch((0, _creators.removeSync)(sync));
  }
}

function handleSyncFailure(dispatch, sync, data) {
  sync.reject(data.error);

  if (sync.name) {
    sync.response = null;
  } else {
    dispatch((0, _creators.removeSync)(sync));
  }
}