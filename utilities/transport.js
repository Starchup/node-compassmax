/* Module Dependencies */
var net = require('net');
var base64 = require('base64-js');
var framer = require('./framer.js');
var Promise = require('bluebird');

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

function makeRequest(config, params) {
    var handshakeReceived = false;
    var ephemeralKeypair;
    var remoteEphemeralPublic;

    //convert keys to byteArrays
    var staticPublic = base64.toByteArray(config.staticPublic);
    var staticSecret = base64.toByteArray(config.staticSecret);


    return new Promise(function(resolve, reject) {
        //Open a new connection - 1 connection per request
        var client = new net.Socket();
        client.connect(config.port, config.host, function() {
            //Prepare and immediately send handshake
            ephemeralKeypair = framer.generateEphemeralKeys();

            var handshake = framer.prepareHandshake(staticPublic, staticSecret, ephemeralKeypair.publicKey);
            handshake = framer.toUint8(new Buffer(handshake));

            client.write(handshake);
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
                
                //Prevent crashing on unreadable key
                try {
                    //Read the server's handshake
                    remoteEphemeralPublic = framer.remoteEphemeralKey(data);                    
                }
                catch(e) {
                    var cMsg = 'Unreadable handshake';
                    if(config.identifier) cMsg += ' for identifier ' + config.identifier;
                    console.log(cMsg);
                    return reject(e);
                }

                if (!framer.serverKeyMatches(data, config.key)) {
                    var eMsg = 'Signing key from server does not match expected public server key. Closing connection.';
                    if (config.identifier) eMsg += '  Identifier: ' + config.identifier;
                    client.destroy(eMsg);
                    return reject(eMsg);
                }
                handshakeReceived = true;

                //Upon receiving their key, send our request
                //Wrap params in array, as expected by server
                params = [params];
                var message = framer.encode(params, remoteEphemeralPublic, ephemeralKeypair.privateKey);
                var messageToSend = framer.toUint8(new Buffer(message.buffer));
                client.write(messageToSend);
            } else {
                //Parse server response and decode
                var msg = framer.decode(data, remoteEphemeralPublic, ephemeralKeypair.privateKey);
                client.destroy();

                if (msg[0].error) {
                    //Format error object
                    var err = new Error(msg[0].error.message);
                    err.code = msg[0].error.code;
                    err.data = msg[0].data;
                    err.warnings = msg[0].warnings;
                    err.params = params[0];
                    err.identifier = config.identifier;

                    return reject(err);
                }

                return resolve(msg[0]);
            }
        });
    });
}

module.exports.makeRequest = makeRequest;