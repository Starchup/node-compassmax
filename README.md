# node-compassmax
Compassmax POS Wrapper in NodeJS, fully promisified

### Initialization

`var compassmax = require('node-compassmax');`  
`var pos = new compassmax({ staticPublicKey: your_static_public_key, staticSecretKey: your_static_secret_key, host: host_url, port: host_port });`


### Basic use

Configure a new instance of compassmax with your static signing keys and the url and port number of the Compassmax customer you are connecting to.

You can then query any of the Compassmax endpoints.
Such as `pos.Customer.createCustomer(profileData, [requestId]);`


### Formatting

Upon a success, each method returns an object with the following structure:

```
{
  data: The data returned by the server,
  warnings: Any warnings returned by the server,
  id: The requestId parameter, if passed
}
```

When an error occurs, an error object with the following properties will be returned:

```
{
  message: Human-readable error message,
  code: Internal server error code,
  data: Any data returned by the server,
  warnings: Any warnings returned by the server,
  params: The parameters sent to the server for the called method,
  id: the requestId parameter, if passed
}
```

### Currently supported services and methods

#### System

Server Information
					
* `System.services([requestId])`       Returns list of available services on the server
* `System.rpcVersion([requestId])`     Returns object describing the version of the protocol this server speaks.

#### Util
			
Utility wrapper for methods available for every service		

* `Util.methods(service, [requestId])` Returns list of available methods for a service
* `Util.describeMethod(service, method, [requestId])` Returns information about method
* `Util.version(service, [requestId])` Returns object describing the version of the service
* `Util.batch(data)` Takes an array of information about other methods to call and makes an RPC batch call.  Errors are not thrown and may be returned along with valid responses.

#### Accounts

* `Accounts.transactionHistory(customerId, startDate, endDate, [requestId])` Returns list of transactions for customer
* `Accounts.serviceTransactionDetail(transactionId, [requestId])` \* Returns object describing a transaction
* `Accounts.postCCPayment(customerId, amount, cardNumber, expDate, authNumber, [requestId])` \* Posts record of third party credit card payment
* `Accounts.accountSummary(customerId, [requestId]) \* Returns account summary for customer


#### Customers

* `Customers.createCustomer(profileData, [requestId])` \* Returns id of created customer
* `Customers.availablePickups(customerId, [requestId])` \* Returns list of pickups available to that customer
* `Customers.schedulePickup(data, [requestId])` \* Returns `true`

#### CustomerProfile

* `CustomerProfile.getProfile(customerId, [requestId])` Returns profile object for customer
* `CustomerProfile.updateProfile(customerId, profileData, [requestId])` Updates profile for customer

#### Tickets

* `Tickets.getTickets(customerId, startDate, endDate, [requestId])` Returns list of service tickets for customer
* `Tickets.deliverRouteTickets(ticketIds, [requestId])` \* Marks tickets as delivered

#### Routes

* `Routes.callins(routeNumber, startDate, endDate, [requestId])` \* Returns list of call-in tickets for given route
* `Routes.listRoutes([requestId])` \* Returns list of routes
* `Routes.listRouteStops(routeId, [requestId])` \* Returns list of route stops
* `Routes.getRouteInfo(routeId, [requestId])` \* Returns more information on a given route
* `Routes.listReadyTickets(routeId, [requestId])` \* Returns a list of ticket ids currently racked to route location
* `Routes.listTruckTickets(routeId, [requestId])` \* Returns a list of ticket ids currently racked to truck

\* Method supports `Util.batch` calling.

