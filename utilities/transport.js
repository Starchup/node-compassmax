/* Module Dependencies */
var net = require('net');
var base64 = require('base64-js');
var framer = require('./framer.js');
var Promise = require('bluebird');
var forceToArray = require('./tools').forceToArray;
var netstring = require('netstring-plus');

//Encoder class has no mutable state, safe to initialize once
var encoder = new netstring.Encoder();

var Transport = function(config) {
    var self = this;

    //Client status information
    var client = null;
    var clientStatus = 'closed';
    var defaultRequestId = 0;

    var config = config;
    var ephemeralKeypair;
    var remoteEphemeralPublic;

    var staticPublic = base64.toByteArray(config.staticPublic);
    var staticSecret = base64.toByteArray(config.staticSecret);

    var decoder = new netstring.Decoder();

    //Connection requires session-unique id
    function incrementRequestId() {
        defaultRequestId++;
    };

    function openConnection() {
        return new Promise(function(resolve, reject) {
            client = new net.Socket();

            //Default connection-wide handlers

            //Handles connection errors
            client.on('error', function(e) {
                if (clientStatus !== 'open') return reject(e);
            });

            //Close notifier
            client.on('close', function(e) {
                if (e) console.error('Connection closed due to error.');
                client = null;
            });

            try {
                client.connect(config.port, config.host, function(err) {
                    if (err) return reject(err);

                    defaultRequestId = 0;
                    return resolve();
                });
            } catch (e) {
                return reject(e);
            }

        });
    };

    function sendHandshake() {
        return new Promise(function(resolve, reject) {
            ephemeralKeypair = framer.generateEphemeralKeys();
            var handshake = framer.prepareHandshake(staticPublic, staticSecret, ephemeralKeypair.publicKey);
            handshake = encoder.encode(handshake);
            client.write(new Buffer(handshake), function() {
                clientStatus = 'pending';
                return resolve();
            });
        });
    };

    function receiveHandshake(data) {
        var decoderMessage = decoder.getLatestMessage();
        remoteEphemeralPublic = framer.remoteEphemeralKey(decoderMessage);
        if (!framer.serverKeyMatches(decoderMessage, config.key)) {
            var eMsg = 'Signing key from server does not match expected public server key. Closing connection.';
            if (config.identifier) eMsg += '  Identifier: ' + config.identifier;
            client.destroy(eMsg);
            self.closeConnection();
            throw new Error(eMsg);
        }
        clientStatus = 'open';
    };

    function sendMessage(params) {
        //Upon receiving their key, send our request
        params = forceToArray(params);
        var message = framer.encode(params, remoteEphemeralPublic, ephemeralKeypair.privateKey);
        message = encoder.encode(message);
        client.write(new Buffer(message.buffer));
    };

    //Runs data through netstring+ decoder and decodes and returns a message if complete
    function receiveData(data, params, batch) {
        return new Promise(function(resolve, reject) {
            decoder.pumpArray(data);

            //First request to not yet open connection will be a handshake
            if (clientStatus !== 'open') {
                if (decoder.state === 'complete') {
                    receiveHandshake(data);
                    //Upon receiving their key, send our request
                    sendMessage(params);
                }
            } else {
                if (decoder.state === 'complete') {
                    //Parse server response and decode
                    var msg;
                    var err;

                    //Handle possible badly encoded responses
                    try {
                        msg = framer.decode(decoder.getLatestMessage(), remoteEphemeralPublic, ephemeralKeypair.privateKey, true, true);
                    } catch (e) {
                        var eMsg = e.message || 'Unable to decode message';
                        err = new Error(eMsg);
                        if (e.stack) err.stack = e.stack;
                        err.params = batch ? params : params[0];
                        err.identifier = config.identifier;
                        return reject(err);
                    }

                    //Hold responseIds for req/res comparison
                    var responseIds = {};

                    //Map error responses to Error objects
                    var response = msg.map(function(m, i) {
                        responseIds[m.id] = true;
                        if (m.error) {
                            //Format error object
                            var e = new Error(m.error.message);
                            e.code = m.error.code;
                            e.data = m.data;
                            e.warnings = m.warnings;
                            e.params = params[i];
                            e.identifier = config.identifier;
                            return e;
                        }
                        return m;
                    });

                    //Verify that the ids sent in the request match the ids sent in the response
                    var match = params.length === response.length && params.every(p => {
                        return responseIds[p.id] === true;
                    });
                    if (!match) {
                        return reject(new Error('ID mismatch between request and response. Req: ' + JSON.stringify(params) + '. Res: ' + JSON.stringify(msg)));
                    }

                    if (batch) return resolve(response);
                    else {
                        if (response[0] instanceof Error) return reject(response[0]);
                        return resolve(response[0]);
                    }
                }
            }
        });
    };

    /**
     * Closes conneciton
     * Expose so it can be called from main exposed POS object
     */
    self.closeConnection = function() {
        if (client) client.destroy();
        client = null;
        clientStatus = 'closed';
        defaultRequestId = 0;
        decoder.messages = [];
    };


    /**
     * Formats and makes a TCP request
     *
     * param{config}                   (Required) config for connection.
     *
     *          param{host}             String.  Url to connect to.
     *          param{port}             String.  Port to connect to.
     *          param{staticPublic}     String.  Public signing key.
     *          param{staticSecret}     String.  Secret signing key.

     * param{params}                    (Required) data to send on request. Must be a singular object.
     *
     *          param{service}          String.  Name of service to call.
     *          param{method}           String.  Method of above service to call.
     *          param{args}             Array.   Arguments to pass to above method.
     *          param{id}               Int.     Identifier for request.
     *
     * param{batch}                     (Optional) Boolean.  Whether call is a batch call, or single.
     */
    self.makeRequest = function(config, params, batch) {
        return new Promise(function(resolve, reject) {
            //Apply default connection-unique ids
            params = forceToArray(params);
            params.forEach(function(p) {
                if (!p.id) {
                    incrementRequestId();
                    p.id = defaultRequestId;
                }
            });

            var initialProm;
            var alreadyOpen = false;
            //If there is no open connection, open one
            if (!client || clientStatus !== 'open') {
                initialProm = openConnection();

            } else {
                alreadyOpen = true;
                initialProm = Promise.resolve();
            }

            initialProm.then(function() {
                //Handlers
                function onDataWrapper(data) {
                    receiveData(data, params, batch).then(function(res) {
                        client.removeListener('data', onDataWrapper);
                        client.removeListener('error', onError);
                        return resolve(res);
                    }).catch(function(e) {
                        client.removeListener('data', onDataWrapper);
                        client.removeListener('error', onError);
                        return reject(e);
                    });
                }
                client.on('data', onDataWrapper);


                var onError = function(e) {
                    //Log errors if any
                    console.error(e);
                    client.removeListener('error', onError);
                    client.removeListener('data', onDataWrapper);
                    return reject(e);
                }
                client.on('error', onError);

                //Send a handshake request if we have not yet
                if (alreadyOpen) sendMessage(params);
                else sendHandshake().catch(reject);
            }).catch(reject);
        });
    };
}
module.exports = Transport;