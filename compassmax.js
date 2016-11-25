/* Module Dependencies */
var transport = require('./utilities/transport');

/* Constructor */
var COMPASSMAX = function(config) {
    var self = this;

    //Check required fields
    var missingConfigFields = findMissingFields('config', config, ['staticPublic', 'staticSecret', 'host', 'port', 'key']);
    if (missingConfigFields) throw new Error(missingConfigFields);

    //Check that static keys are base64 strings
    var b64 = /^([A-Za-z0-9\+\/]{4})*([A-Za-z0-9\+\/]{4}|[A-Za-z0-9\+\/]{3}=|[A-Za-z0-9\+\/]{2}==)$/;
    checkType('config.staticPublic', config.staticPublic, 'String');
    checkType('config.staticSecret', config.staticSecret, 'String');
    checkType('config.key', config.key, 'String');
    if (!config.staticPublic.match(b64)) throw new Error('config.staticPublic must be base64 encoded');
    if (!config.staticSecret.match(b64)) throw new Error('config.staticSecret must be base64 encoded');
    if (!config.key.match(b64)) throw new Error('config.key must be base64 encoded');

    //Config
    self.CONFIG = config;


    //Customers methods
    self.Customers = {

        service: 'customers',

        findCustomers: function(searchTerms, requestId) {
            checkType('searchTerms', searchTerms, 'Object');

            var params = {
                service: this.service,
                method: 'findCustomers',
                args: [searchTerms],
                id: requestId || 1,
            };

            return transport.makeRequest(self.CONFIG, params);
        },

        createCustomer: function(profileData, requestId) {
            checkType('profileData', profileData, 'Object');
            var missingProfileFields = findMissingFields('profileData', profileData, ['firstName', 'lastName']);
            if (missingProfileFields) throw new Error(missingProfileFields);

            var params = {
                service: this.service,
                method: 'createCustomer',
                args: [profileData],
                id: requestId || 1,
            };
            return transport.makeRequest(self.CONFIG, params);
        },

        availablePickups: function(customerId, requestId) {
            if (!customerId) throw new Error('customerId required');
            var params = {
                service: this.service,
                method: 'availablePickups',
                args: [customerId],
                id: requestId || 1,
            };
            return transport.makeRequest(self.CONFIG, params);
        },

        schedulePickup: function(data, requestId) {
            checkType('data', data, 'Object');
            var missingDataFields = findMissingFields('data', data, ['customerId', 'routeNumber', 'date']);
            if (missingDataFields) throw new Error(missingDataFields);

            var params = {
                service: this.service,
                method: 'schedulePickup',
                args: [data.customerId, data.routeNumber, data.date, data.message],
                id: requestId || 1,
            };
            return transport.makeRequest(self.CONFIG, params);
        },

        getScheduledPickups: function(customerId, requestId) {
            if (!customerId) throw new Error('customerId required');
            var params = {
                service: this.service,
                method: 'getScheduledPickups',
                args: [customerId],
                id: requestId || 1,
            };
            return transport.makeRequest(self.CONFIG, params);
        },
    };

    //CustomerProfile methods
    self.CustomerProfile = {
        service: 'customerProfile',

        //Save customerProfile object
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
                if (!phone) return '';
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
            return transport.makeRequest(self.CONFIG, params);
        },

        getProfile: function(customerId, requestId) {
            if (!customerId) throw new Error('customerId required');

            var params = {
                service: this.service,
                method: 'getProfile',
                args: [customerId],
                id: requestId || 1,
            };
            return transport.makeRequest(self.CONFIG, params);
        },
    };


    //Tickets methods
    self.Tickets = {
        service: 'tickets',

        deliverRouteTickets: function(ticketIds, requestId) {
            checkType('ticketIds', ticketIds, 'Array');

            var params = {
                service: this.service,
                method: 'deliverRouteTickets',
                args: [ticketIds],
                id: requestId || 1,
            };
            return transport.makeRequest(self.CONFIG, params);
        },

        //Convenience wrapper for getting tickets by customer and date
        getTickets: function(customerId, startDate, endDate, requestId) {
            var transactionByTicketNumber = {};

            return self.Accounts.transactionHistory(customerId, startDate, endDate, requestId).then(function(res) {
                var serviceTransactions = res.data.filter(function(transaction) {
                    return transaction.ticketNum;
                });

                if (!serviceTransactions || !serviceTransactions.length) return;

                var ticketPromises = [];
                serviceTransactions.forEach(function(trans) {
                    transactionByTicketNumber[trans.ticketNum] = trans;
                    ticketPromises.push(self.Accounts.serviceTransactionDetail(trans.transactionId, requestId));
                });
                return Promise.all(ticketPromises);
            }).then(function(tickets) {
                if (!tickets || !tickets.length) return [];

                //Add transaction description to ticket
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
    };


    self.Accounts = {
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
            return transport.makeRequest(self.CONFIG, params).then(function(result) {
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
            return transport.makeRequest(self.CONFIG, params);
        },

        //Posts record of a payment and returns a transactionId
        postCCPayment: function(customerId, amount, cardNumber, expDate, authNumber, requestId) {
            if (!customerId) throw new Error('customerId required');
            if (!amount) throw new Error('amount required');
            if (!cardNumber) throw new Error('cardNumber required');
            if (!expDate) throw new Error('expDate required');
            if (!authNumber) throw new Error('authNumber required');

            var params = {
                service: this.service,
                method: 'postCCPayment',
                args: [customerId, amount, cardNumber, expDate, authNumber],
                id: requestId || 1,
            };
            return transport.makeRequest(self.CONFIG, params);
        },

        accountSummary: function(customerId) {
            if (!customerId) throw new Error('customerId required');

            var params = {
                service: this.service,
                method: 'accountSummary',
                args: [customerId],
                id: requestId || 1,
            };
            return transport.makeRequest(self.CONFIG, params);
        },
    };


    //System Information methods
    self.System = {
        service: 'system',

        services: function(requestId) {
            var params = {
                service: this.service,
                method: 'services',
                args: [],
                id: requestId || 1,
            };
            return transport.makeRequest(self.CONFIG, params);
        },

        rpcVersion: function(requestId) {
            var params = {
                service: this.service,
                method: 'rpcVersion',
                args: [],
                id: requestId || 1,
            };
            return transport.makeRequest(self.CONFIG, params);
        },
    };


    //Utility methods
    self.Util = {

        //Service-wide mandatory method
        methods: function(service, requestId) {
            checkType('service', service, 'String');

            var params = {
                service: service,
                method: 'methods',
                args: [],
                id: requestId || 1,
            };
            return transport.makeRequest(self.CONFIG, params);
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
            return transport.makeRequest(self.CONFIG, params);
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
            return transport.makeRequest(self.CONFIG, params);
        },
    };
}
module.exports = COMPASSMAX;



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
