/* Module Dependencies */
var net = require('net');
var base64 = require('base64-js');
var framer = require('framer.js');

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
                //Read the server's handshake
                remoteEphemeralPublic = framer.remoteEphemeralKey(data);
                handshakeReceived = true;

                //Upon receiving their key, send our request
                //Wrap params in array, as expected by server
                params = [params];
                message = framer.encode(params, remoteEphemeralPublic, ephemeralKeypair.privateKey);
                client.write(new Buffer(message.buffer));
            } else {
                //Parse server response and decode
                var msg = framer.decode(data, remoteEphemeralPublic, ephemeralKeypair.privateKey);
                client.destroy();

                if (msg[0].error) return reject(msg[0]);
                return resolve(msg[0]);
            }
        });
    });
}

module.exports.makeRequest = makeRequest;