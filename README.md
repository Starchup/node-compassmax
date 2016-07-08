# node-compassmax
Compassmax POS Wrapper in NodeJS, fully promisified

#### Initialization

`var compassmax = require('node-compassmax');`  
`var pos = new compassmax({ staticPublicKey: your_static_public_key, staticSecretKey: your_static_secret_key, host: host_url, port: host_port });`


#### Basic use

Configure a new instance of compassmax with your static signing keys and the url and port number of the Compassmax customer you are connecting to.

You can then query any of the Compassmax endpoints.
Such as `pos.Customer.createCustomer(profile, [requestId]);`
