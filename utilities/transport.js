/* Module Dependencies */
var net = require('net');
var base64 = require('base64-js');
var framer = require('./framer.js');
var Promise = require('bluebird');
var forceToArray = require('./tools').forceToArray;
var netstring = require('netstring-plus');

//Encoder class has no mutable state, safe to initialize once
var encoder = new netstring.Encoder();

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
 */

function makeRequest(config, params, batch) {
    var handshakeReceived = false;
    var ephemeralKeypair;
    var remoteEphemeralPublic;
    var receivedData;

    //convert keys to byteArrays
    var staticPublic = base64.toByteArray(config.staticPublic);
    var staticSecret = base64.toByteArray(config.staticSecret);

    var decoder = new netstring.Decoder();

    return new Promise(function(resolve, reject) {
        //Open a new connection - 1 connection per request
        var client = new net.Socket();
        client.connect(config.port, config.host, function() {
            //Prepare and immediately send handshake
            ephemeralKeypair = framer.generateEphemeralKeys();

            var handshake = framer.prepareHandshake(staticPublic, staticSecret, ephemeralKeypair.publicKey);
            handshake = encoder.encode(handshake);
            client.write(new Buffer(handshake));
        });

        //Handlers
        client.on('error', function(e) {
            //Log errors if any
            console.log(e);
            return reject(e);
        });

        client.on('close', function(wasError) {
            if (wasError) {
                console.log('Connection closed due to error.');
            }

            //null out client var
            client = null;
        });

        //When date received from server
        client.on('data', function(data) {
            if (!handshakeReceived) {

                decoder.pumpArray(data);
                if (decoder.state === 'complete') {

                    var decoderMessage = decoder.getLatestMessage();
                    remoteEphemeralPublic = framer.remoteEphemeralKey(decoderMessage);
                    if (!framer.serverKeyMatches(decoderMessage, config.key)) {
                        var eMsg = 'Signing key from server does not match expected public server key. Closing connection.';
                        if (config.identifier) eMsg += '  Identifier: ' + config.identifier;
                        client.destroy(eMsg);
                        return reject(eMsg);
                    }
                    handshakeReceived = true;
                }

                //Upon receiving their key, send our request
                params = forceToArray(params);
                message = framer.encode(params, remoteEphemeralPublic, ephemeralKeypair.privateKey);
                message = encoder.encode(message);
                client.write(new Buffer(message.buffer));
            } else {

                decoder.pumpArray(data);

                if (decoder.state === 'complete') {
                    //Parse server response and decode
                    var msg;
                    var err;

                    //Handle badly encoded responses
                    try {
                        msg = framer.decode(decoder.getLatestMessage(), remoteEphemeralPublic, ephemeralKeypair.privateKey, true, true);
                    } catch (e) {
                        client.destroy();
                        var eMsg = e.message || 'Unable to decode message';
                        err = new Error(eMsg);
                        err.params = batch ? params : params[0];
                        err.identifier = config.identifier;

                        return reject(err);
                    }
                    client.destroy();

                    var response = msg.map(function(m, i) {
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

                    if (batch) return resolve(response);
                    else {
                        if (response[0] instanceof Error) return reject(response[0]);
                        return resolve(response[0]);
                    }
                }
            }
        });
    });
}

module.exports.makeRequest = makeRequest;