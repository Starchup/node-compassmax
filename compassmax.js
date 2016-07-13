/* Module Dependencies */
var transport = require('./utilities/transport.js');

var CONFIG = {
    staticPublic: null,
    staticSecret: null,
    host: null,
    port: null,
};

/* Constructor */
var COMPASSMAX = function(config) {
    //Check required fields
    var missingConfigFields = findMissingFields('config', config, ['staticPublic', 'staticSecret', 'host', 'port']);
    if (missingConfigFields) throw new Error(missingConfigFields);

    //Check that static keys are base64 strings
    var b64 = /^([A-Za-z0-9\+\/]{4})*([A-Za-z0-9\+\/]{4}|[A-Za-z0-9\+\/]{3}=|[A-Za-z0-9\+\/]{2}==)$/;
    checkType('config.staticPublic', config.staticPublic, 'String');
    checkType('config.staticSecret', config.staticSecret, 'String');
    if (!config.staticPublic.match(b64)) throw new Error('config.staticPublic must be base64 encoded');
    if (!config.staticSecret.match(b64)) throw new Error('config.staticSecret must be base64 encoded');

    //Config
    CONFIG.staticPublic = config.staticPublic;
    CONFIG.staticSecret = config.staticSecret;
    CONFIG.host = config.host;
    CONFIG.port = config.port;
}
module.exports = COMPASSMAX;

//Customers methods
var Customers = {
    service: 'customers',

    findCustomers: function(searchTerms, requestId) {
        checkType('searchTerms', searchTerms, 'Object');

        var params = {
            service: this.service,
            method: 'findCustomers',
            args: [searchTerms],
            id: requestId || 1,
        };

        return transport.makeRequest(CONFIG, params);
    },

    createCustomer: function(profileData, requestId) {
        checkType('profileData', profileData, 'Object');
        var missingProfileFields = missingFields('profileData', profileData, ['phone', 'firstName', 'lastName']);
        if (missingProfileFields) throw new Error(missingProfileFields);

        var params = {
            service: this.service,
            method: 'createCustomer',
            args: [profileData],
            id: requestId || 1,
        };
        return transport.makeRequest(CONFIG, params);
    },

    availablePickups: function(customerId, requestId) {
        if (!customerId) throw new Error('customerId required');
        var params = {
            service: this.service,
            method: 'availablePickups',
            args: [customerId],
            id: requestId || 1,
        };
        return transport.makeRequest(CONFIG, params);
    },

    schedulePickup: function(data, requestId) {
        checkType('data', data, 'Object');
        var missingDataFields = missingFields('data', data, ['customerId', 'routeNumber', 'date']);
        if (missingDataFields) throw new Error(missingDataFields);

        var params = {
            service: this.service,
            method: 'schedulePickup',
            args: [data.customerId, data.routeNumber, data.date, data.message],
            id: requestId || 1,
        };
        return transport.makeRequest(CONFIG, params);
    },

    getScheduledPickups: function(customerId, requestId) {
        if (!customerId) throw new Error('customerId required');
        var params = {
            service: this.service,
            method: 'getScheduledPickups',
            args: [customerId],
            id: requestId || 1,
        };
        return transport.makeRequest(CONFIG, params);
    },
};

//CustomerProfile methods
var CustomerProfile = {
    service: 'customerProfile',

    //Private - Save customerProfile object
    profile: function(customerId, phone, email, address1, address2, city, state, zip, firstName, lastName, starchPref, returnPref, instructions, username) {
        this.customerId = customerId;
        this.phone = deformatPhone(phone);
        this.email = email;
        this.address1 = address1;
        this.address2 = address2;
        this.city = city;
        this.state = state;
        this.zip = zip;
        this.firstName = firstName;
        this.lastName = lastName;
        this.starchPref = starchPref;
        this.returnPref = returnPref;
        this.instructions = instructions;
        this.username = username;

        function deformatPhone(phone) {
            return phone.replace(/[()-\s]/g, '');
        }
    },


    updateProfile: function(customerId, profileData, requestId) {
        if (!customerId) throw new Error('customerId required');
        checkType('profileData', profileData, 'Object');

        var params = {
            service: this.service,
            method: 'updateProfile',
            args: [customerId, profileData],
            id: requestId || 1,
        };
        return transport.makeRequest(CONFIG, params);
    },

    getProfile: function(customerId) {
        if (!customerId) throw new Error('customerId required');

        var params = {
            service: this.service,
            method: 'getProfile',
            args: [customerId],
            id: requestId || 1,
        };
        return transport.makeRequest(CONFIG, params);
    },
};


//Tickets methods
var Tickets = {
    service: 'tickets',

    deliverRouteTickets: function(ticketIds, requestId) {
        checkType('ticketIds', ticketIds, 'Array');

        var params = {
            service: this.service,
            method: 'deliverRouteTickets',
            args: [ticketIds],
            id: requestId || 1,
        };
        return transport.makeRequest(CONFIG, params);
    },
}


//System Information methods
var System = {
    service: 'system',

    services: function(requestId) {
        var params = {
            service: this.service,
            method: 'services',
            args: [],
            id: requestId || 1,
        };
        return transport.makeRequest(CONFIG, params);
    },

    rpcVersion: function(requestId) {
        var params = {
            service: this.service,
            method: 'rpcVersion',
            args: [],
            id: requestId || 1,
        };
        return transport.makeRequest(CONFIG, params);
    },
};


//Utility methods
var Util = {

    //Service-wide mandatory method
    methods: function(service, requestId) {
        checkType('service', service, 'String');

        var params = {
            service: service,
            method: 'methods',
            args: [],
            id: requestId || 1,
        };
        return transport.makeRequest(CONFIG, params);
    },

    //Service-wide mandatory method
    describeMethod: function(service, method, requestId) {
        checkType('service', service, 'String');
        checkType('method', method, 'String');

        var params = {
            service: service,
            method: 'describeMethod',
            args: [method],
            id: requestId || 1,
        };
        return transport.makeRequest(CONFIG, params);
    },

    //Service-wide mandatory method
    version: function(service, requestId) {
        checkType('service', service, 'String');

        var params = {
            service: service,
            method: 'version',
            args: [],
            id: requestId || 1,
        };
        return transport.makeRequest(CONFIG, params);
    },
};



/* Validation functons */
function findMissingFields(name, object, requiredFields) {
    var missingFields = [];
    requiredFields.forEach(function(field) {
        if (object[field] === null || object[field] === undefined) {
            missingFields.push(field);
        }
    });

    if (missingFields.length) {
        return 'Argument \'' + name + '\' is missing the following fields: ' + missingFields.join(', ');
    } else return null;
}

function checkType(name, value, type) {
    if (getType(value) !== type) {
        throw new Error('argument \'' + name + '\' must be type ' + type);
    }
}

function getType(value) {
    var longType = Object.prototype.toString.call(value);
    return longType.slice(8, -1);
}


/* Endpoints */
COMPASSMAX.prototype.Customers = Customers;
COMPASSMAX.prototype.CustomerProfile = CustomerProfile;
COMPASSMAX.prototype.Tickets = Tickets;
COMPASSMAX.prototype.System = System;
COMPASSMAX.prototype.Util = Util;