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

    getProfile: function(customerId, requestId) {
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

    //Convenience wrapper for getting tickets by customer and date
    getTickets: function(customerId, startDate, endDate, requestId) {
        var transactionByTicketNumber = {};

        return Accounts.transactionHistory(customerId, startDate, endDate, requestId).then(function(res) {
            var serviceTransactions = res.data.filter(function(transaction) {
                return transaction.ticketNum;
            });

            if (!serviceTransactions || !serviceTransactions.length) return;

            var ticketPromises = [];
            serviceTransactions.forEach(function(trans) {
                transactionByTicketNumber[trans.ticketNum] = trans;
                ticketPromises.push(Accounts.serviceTransactionDetail(trans.transactionId, requestId));
            });
            return Promise.all(ticketPromises);
        }).then(function(tickets) {
            if (!tickets || !tickets.length) return [];

            //Add transaction description and created date to ticket
            tickets.forEach(function(ticket) {
                if (!ticket.data) return;
                if (transactionByTicketNumber[ticket.data.ticketNum]) {
                    ticket.data.description = transactionByTicketNumber[ticket.data.ticketNum].description;
                    ticket.data.createdDate = transactionByTicketNumber[ticket.data.ticketNum].date;
                }
            });
            return tickets;
        });
    },
}

var Accounts = {
    service: 'accounts',

    transactionHistory: function(customerId, startDate, endDate, requestId) {
        if (!customerId) throw new Error('customerId required');
        if (!startDate) startDate = null;
        if (!endDate) endDate = null;

        var params = {
            service: this.service,
            method: 'transactionHistory',
            args: [customerId, startDate, endDate],
            id: requestId || 1,
        };
        return transport.makeRequest(CONFIG, params).then(function(result) {
            //Format response from arrays to objects
            var formattedData = result.data.map(function(transaction) {
                return {
                    transactionId: transaction[0],
                    amount: transaction[1],
                    date: transaction[2],
                    description: transaction[3],
                    ticketNum: transaction[4]
                };
            });
            result.data = formattedData;
            return result;
        });
    },

    serviceTransactionDetail: function(transactionId, requestId) {
        if (!transactionId) throw new Error('transactionId required');

        var params = {
            service: this.service,
            method: 'serviceTransactionDetail',
            args: [transactionId],
            id: requestId || 1,
        };
        return transport.makeRequest(CONFIG, params);
    }
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
COMPASSMAX.prototype.Accounts = Accounts;
COMPASSMAX.prototype.System = System;
COMPASSMAX.prototype.Util = Util;