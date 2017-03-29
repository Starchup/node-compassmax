/* Module responsible for creating and parsing netstring frames */

/* Dependencies */
var sodium = require('libsodium-wrappers');
var base64 = require('base64-js');
var iconv = require('iconv-lite');

/* Module-global variables */

//Limit for huge array manipulation
var maxArgSize = 100000;

//Local ephemeral keypair
var keypair;

//Netstring+ format variables
var delim = ':';
var trailing = '\n';


/* Netstring methods */

/**
 * Parses the payload out of a netstring
 */
function parseNetstring(data) {
    var stringifiedData = data.toString('utf8');

    //Find header delimiter
    for (var i = 0; i < stringifiedData.length; i++) {
        if (stringifiedData[i] === delim) break;
    }
    var header = data.toString("utf8", 0, i + 1);
    var header_size = parseInt(header, 16);
    return data.slice(header.length, header.length + header_size);
}

/**
 * Creates a netstring from a payload
 */
function createNetstring(payload) {
    var length = payload.length;

    // Headers are in hexadecimal.
    var header_bytes = encode_utf8(length.toString(16) + delim);
    var bytes = concatBytes(header_bytes, payload, encode_utf8(trailing));
    return bytes;
}

function isEndOfNetstring(data) {
    var ns = data.toString('utf8');
    return ns[ns.length - 1] === trailing;
}



/* Crypto Methods */

/**
 * Parses remote ephemeral public key from netstring payload
 */
function remoteEphemeralKey(data) {
    var payload = parseNetstring(data);

    // Remote signing key.
    var publicA = payload.slice(0, sodium.crypto_sign_PUBLICKEYBYTES);

    // Signed remote ephemeral public key.
    var publicB = payload.slice(publicA.length, payload.length);

    // Retrieve the signed key, validating the signature in the process.
    var remoteEphemeralPublic = sodium.crypto_sign_open(publicB, publicA);

    return remoteEphemeralPublic;
}

/**
 * Checks the public server key from netstring payload
 */
function serverKeyMatches(data, serverKey) {
    var payload = parseNetstring(data);

    // Remote signing key.
    var publicA = toArrayBuffer(payload.slice(0, sodium.crypto_sign_PUBLICKEYBYTES));
    var key = base64.toByteArray(serverKey);

    return arraysEqual(publicA, key);
}

/**
 * Generates netstring with our half of the handshake
 */
function prepareHandshake(staticSigningPublic, staticSigningSecret, ephemeralPublic) {
    //Sign and concat
    var signedEphemeralKey = sodium.crypto_sign(ephemeralPublic, staticSigningSecret);
    var payload = concatBytes(staticSigningPublic, signedEphemeralKey);
    return createNetstring(payload);
}

//Encodes the message with our secret and the server's public key
function encode(message, publicKey, secretKey) {
    //Stringify, encode utf8, make nonce, encode and frame
    message = JSON.stringify(message);
    //Convert and deconvert iso-8859-1 to remove unsupported chars
    message = iconv.encode(message, 'iso-8859-1').toString().replace(/�/g, '?');
    message = encode_utf8(message);
    var nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
    var encoded = sodium.crypto_box_easy(message, nonce, publicKey, secretKey);
    encoded = concatBytes(nonce, encoded);
    return createNetstring(encoded);
}

function decode(data, publicKey, secretKey, toJSON) {
    //Default output as JSON to true
    if (toJSON !== false) toJSON = true;

    var payload = parseNetstring(data);
    var nonce = payload.slice(0, sodium.crypto_box_NONCEBYTES);
    var encodedMessage = payload.slice(nonce.length, payload.length);

    var decodedMessage = sodium.crypto_box_open_easy(encodedMessage, nonce, publicKey, secretKey);

    var string = decode_utf8(decodedMessage);
    return toJSON ? JSON.parse(string) : string;
}

function generateEphemeralKeys() {
    return sodium.crypto_box_keypair('uint8array');
}


/* Utility functions */

/** 
 * Return a new Uint8Array that is the concatenation
 * of the arguments.
 */
function concatBytes( /* variadic */ ) {
    var length = 0;
    for (i in arguments) {
        length += arguments[i].length;
    }

    var newArray = new Uint8Array(length);
    var offset = 0;
    for (i in arguments) {
        newArray.set(arguments[i], offset);
        offset += arguments[i].length;
    }
    return newArray;
}

function utf8_to_bytes(s) {
    var buf = new ArrayBuffer(s.length);
    var bufView = new Uint8Array(buf);
    for (var i = 0; i < s.length; i++) {
        bufView[i] = s.charCodeAt(i);
    }
    return bufView;
}

function bytes_to_utf8(b) {
    var string = '';
    //Chunk large arrays
    for (i = 0; i < b.length; i += maxArgSize) {
        string += String.fromCharCode.apply(null, b.slice(i, i + maxArgSize));
    }
    return string;
}

function encode_utf8(s) {
    // Encode to a utf8 string, then to a byte array.
    var utf8_str = unescape(encodeURIComponent(s))
    return utf8_to_bytes(utf8_str);
}

function decode_utf8(b) {
    // Get a utf8 string, then decode to native utf-16.
    var utf8_str = bytes_to_utf8(b);
    return utf8_str;
}

function arraysEqual(a1, a2) {
    if (a1.length != a2.length) return false;

    for (var i = 0; i < a1; i++) {
        if (a1[i] != a2[i])
            return false;
    }
    return true;
}

function toArrayBuffer(buf) {
    var ab = new ArrayBuffer(buf.length);
    var view = new Uint8Array(ab);
    for (var i = 0; i < buf.length; ++i) {
        view[i] = buf[i];
    }
    return view;
}


module.exports = {
    createNetstring: createNetstring,
    parseNetstring: parseNetstring,
    isEndOfNetstring: isEndOfNetstring,
    prepareHandshake: prepareHandshake,
    serverKeyMatches: serverKeyMatches,
    remoteEphemeralKey: remoteEphemeralKey,
    generateEphemeralKeys: generateEphemeralKeys,
    encode: encode,
    decode: decode,
};
