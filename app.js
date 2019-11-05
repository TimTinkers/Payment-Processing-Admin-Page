'use strict';

// Retrieve and parse environment variables.
const result = require('dotenv').config();
if (result.error) {
	console.error(result.parsed);
}

// Imports.
const util = require('util');
const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const mysql = require('promise-mysql');
const requestPromise = require('request-promise');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const gameClient = jwksClient({
	jwksUri: process.env.GAME_JWKS_URI
});
const ethers = require('ethers');
const uuidv1 = require('uuid/v1');

// Express application setup.
let app = express();
app.use(express.static('static'));
app.set('view engine', 'ejs');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
	extended: true
}));
app.use(cookieParser());

// Middleware for enabling async routes with Express.
const asyncMiddleware = fn => (req, res, next) => {
	Promise.resolve(fn(req, res, next))
	.catch(next);
};

// Track particular state for operating this server.
let APPLICATION = process.env.APPLICATION;
let EXPRESS_PORT = process.env.EXPRESS_PORT;
let GAME_ADMIN_ACCESS_TOKEN;
let DATABASE_CONNECTION;
let PAYMENT_PROCESSOR;

// Launch the application and begin the server listening.
let server = app.listen(EXPRESS_PORT, async function () {
	console.log(util.format(process.env.SETUP_STARTING, APPLICATION, EXPRESS_PORT));

	// Retrieve game server administrator credentials.
	let gameAdminUsername = process.env.GAME_ADMIN_USERNAME;
	let gameAdminPassword = process.env.GAME_ADMIN_PASSWORD;

	// Verify that the game administrator credentials were actually provided.
	if (!gameAdminUsername || !gameAdminPassword) {
		console.error(process.env.INVALID_GAME_ADMIN_CREDENTIALS);
		server.close();
		return;
	}

	// Attempt to log into the game with the administrator.
	try {
		const gameLoginData = JSON.stringify({
			username: gameAdminUsername,
			password: gameAdminPassword
		});
		let gameLoginResponse = await requestPromise({
			method: 'POST',
			uri: process.env.GAME_LOGIN_URI,
			headers: {
				'Accept': 'application/json',
				'Content-Type': 'application/json',
				'Content-Length': gameLoginData.length
			},
			body: gameLoginData
		});
		gameLoginResponse = JSON.parse(gameLoginResponse);

		// Store the game administrator's access token for later.
		GAME_ADMIN_ACCESS_TOKEN = gameLoginResponse['access_token'];

		// Attempt to establish connection to the RDS instance.
		try {
			DATABASE_CONNECTION = await mysql.createConnection({
				host: process.env.DATABASE_HOST,
				user: process.env.DATABASE_USER,
				password: process.env.DATABASE_PASSWORD,
				port: process.env.DATABASE_PORT,
				database: process.env.DATABASE,
				timeout: process.env.TIMEOUT
			});

			// Attempt to establish connection to the payment processor contract.
			try {
				let firstPartyPrivateKey = process.env.FIRST_PARTY_PRIVATE_KEY;
				let contractAddress = process.env.PAYMENT_PROCESSOR_ADDRESS;
				let abi = process.env.PAYMENT_PROCESSOR_ABI;
				let provider = ethers.getDefaultProvider(process.env.NETWORK_SUFFIX);
				let wallet = new ethers.Wallet(firstPartyPrivateKey, provider);
				console.log(util.format(process.env.CONNECTING_TO_CONTRACT, contractAddress, process.env.NETWORK_SUFFIX));
				PAYMENT_PROCESSOR = new ethers.Contract(contractAddress, abi, wallet);

			// Catch any errors establishing connection to our payment processor.
			} catch (error) {
				console.error(util.format(process.env.CONTRACT_CONNECTION_ERROR, APPLICATION), error);
				server.close();
				return;
			}

		// Catch any errors when establishing connection to the RDS instance.
		} catch (error) {
			console.error(error);
			DATABASE_CONNECTION.end();
			server.close();
			return;
		}

	// Verify that we were actually able to log into the game.
	} catch (error) {
		console.error(util.format(process.env.GAME_SETUP_ERROR, APPLICATION), error);
		server.close();
		return;
	}

	// Setup completed.
	console.log(util.format(process.env.SETUP_COMPLETED, APPLICATION, EXPRESS_PORT));
});

// A helper function to verify the game's access token.
function getKey (header, callback) {
	gameClient.getSigningKey(header.kid, function (error, key) {
		if (error) {
			console.error(process.env.SIGNING_KEY_RETRIEVAL_ERROR, error);
		}
		let signingKey = key.publicKey || key.rsaPublicKey;
		callback(null, signingKey);
	});
};

// A helper function to gate particular endpoints behind a valid game login.
function loginValidator (req, res, onValidLogin) {
	let gameToken = req.cookies.gameToken;
	if (gameToken === undefined || gameToken === 'undefined') {
		res.render('login', {
			error: 'null',
			applicationName: APPLICATION
		});

	// Otherwise, verify the correctness of the game's access token.
	} else {
		jwt.verify(gameToken, getKey, async function (error, decoded) {
			if (error) {
				res.render('login', {
					error: process.env.GAME_COULD_NOT_LOGIN_ERROR,
					applicationName: APPLICATION
				});

			// Retrieve the user's game profile.
			} else {
				try {
					let profileResponse = await requestPromise({
						method: 'GET',
						uri: process.env.GAME_PROFILE_URI,
						headers: {
							'Accept': 'application/json',
							'Content-Type': 'application/json',
							'Authorization': 'Bearer ' + gameToken
						}
					});
					profileResponse = JSON.parse(profileResponse);

					// Verify that the user is an admin.
					let isAdmin = profileResponse.isAdmin;
					if (isAdmin) {
						onValidLogin(gameToken, decoded);

					// Reject the user because they are not an admin.
					} else {
						res.render('login', {
							error: process.env.NOT_AN_ADMIN,
							applicationName: APPLICATION
						});
					}

				// If we are unable to retrieve the user's profile, log an error and notify them.
				} catch (error) {
					console.error(process.env.GAME_UNABLE_TO_RETRIEVE_PROFILE, error);
					res.render('login', {
						error: process.env.GAME_UNABLE_TO_RETRIEVE_PROFILE,
						applicationName: APPLICATION
					});
				}
			}
		});
	}
};

// Validate whether a user has logged in and handle appropriate routing.
app.get('/', asyncMiddleware(async (req, res, next) => {
	loginValidator(req, res, function (gameToken, decoded) {
		res.render('dashboard', {
			applicationName: APPLICATION,
			gameMetadataUri: process.env.GAME_METADATA_URI,
			gameProfileUri: process.env.GAME_PROFILE_URI
		});
	});
}));

// Handle visitors logging in through the web app.
app.post('/login', asyncMiddleware(async (req, res, next) => {
	let username = req.body.username;
	let password = req.body.password;

	// Return an appropriate error message if credentials are not provided.
	if (!username || !password) {
		res.render('login', {
			error: process.env.NO_LOGIN_DETAILS,
			applicationName: APPLICATION
		});
		return;
	}

	// Otherwise, attempt to log the user in.
	try {
		const userLoginData = JSON.stringify({
			username: username,
			password: password
		});
		let loginResponse = await requestPromise({
			method: 'POST',
			uri: process.env.GAME_LOGIN_URI,
			headers: {
				'Accept': 'application/json',
				'Content-Type': 'application/json',
				'Content-Length': userLoginData.length
			},
			body: userLoginData
		});
		loginResponse = JSON.parse(loginResponse);

		// If the access token is valid, stash it as a cookie and redirect the user.
		let accessToken = loginResponse['access_token'];
		res.cookie('gameToken', accessToken, { maxAge: 9000000000, httpOnly: false });
		res.redirect('/');

	// If we were unable to log the user in, notify them.
	} catch (error) {
		console.error(process.env.USER_UNABLE_TO_LOGIN, error);
		res.render('login', {
			error: process.env.USER_UNABLE_TO_LOGIN,
			applicationName: APPLICATION
		});
	}
}));

// Handle visitors logging out by removing their access token.
app.post('/logout', function (req, res) {
	res.clearCookie('gameToken');
	res.redirect('/');
});

// Return all of the freely-available state for the payment processor.
app.post('/get-state', asyncMiddleware(async (req, res, next) => {
	loginValidator(req, res, async function (gameToken, decoded) {
		try {
			let name = await PAYMENT_PROCESSOR.getName();
			let firstParty = await PAYMENT_PROCESSOR.getFirstParty();
			let secondParty = await PAYMENT_PROCESSOR.getSecondParty();
			let nextServiceId = await PAYMENT_PROCESSOR.getNextServiceId();
			let firstPartyPot = await PAYMENT_PROCESSOR.getFirstPartyPot();
			let secondPartyPot = await PAYMENT_PROCESSOR.getSecondPartyPot();

			// Return the state.
			res.send({
				status: 'SUCCESS',
				name: name,
				firstParty: firstParty,
				secondParty: secondParty,
				nextServiceId: parseInt(nextServiceId['_hex'], 16),
				firstPartyPot: parseInt(firstPartyPot['_hex'], 16),
				secondPartyPot: parseInt(secondPartyPot['_hex'], 16)
			});

		// If we are unable to retrieve state, log an error and notify the admin.
		} catch (error) {
			console.error(process.env.CONTRACT_UNABLE_TO_RETRIEVE_STATE, error);
			res.send({ status: 'ERROR', message: process.env.CONTRACT_UNABLE_TO_RETRIEVE_STATE });
		}
	});
}));

// Return all of the services in the contract below the given service index.
app.post('/get-services', asyncMiddleware(async (req, res, next) => {
	loginValidator(req, res, async function (gameToken, decoded) {
		try {
			let nextServiceId = req.body.nextServiceId;
			let services = [];
			for (let i = 0; i < nextServiceId; i++) {
				let serviceName = await PAYMENT_PROCESSOR.getServiceName(i);
				let serviceCost = await PAYMENT_PROCESSOR.getServiceCost(i);
				let serviceEnabled = await PAYMENT_PROCESSOR.getServiceEnabled(i);
				services.push({
					name: serviceName,
					cost: parseInt(serviceCost['_hex'], 16),
					enabled: serviceEnabled
				});
			}

			// Return the state.
			res.send({
				status: 'SUCCESS',
				services: services
			});

		// If we are unable to retrieve state, log an error and notify the admin.
		} catch (error) {
			console.error(process.env.CONTRACT_UNABLE_TO_RETRIEVE_SERVICES, error);
			res.send({ status: 'ERROR', message: process.env.CONTRACT_UNABLE_TO_RETRIEVE_SERVICES });
		}
	});
}));

// Add a new service to the payment processor for consumption.
app.post('/add-service', asyncMiddleware(async (req, res, next) => {
	loginValidator(req, res, async function (gameToken, decoded) {
		try {
			let serviceName = req.body.serviceName;
			let serviceCost = req.body.serviceCost;

			let transaction = await PAYMENT_PROCESSOR.addService(serviceName, serviceCost);
			await transaction.wait();

			// Return the state.
			res.send({ status: 'SUCCESS' });

		// If we are unable to retrieve state, log an error and notify the admin.
		} catch (error) {
			console.error(process.env.CONTRACT_UNABLE_TO_ADD_SERVICE, error);
			res.send({ status: 'ERROR', message: process.env.CONTRACT_UNABLE_TO_ADD_SERVICE });
		}
	});
}));

// Update a service on the payment processor for consumption.
app.post('/update-service', asyncMiddleware(async (req, res, next) => {
	loginValidator(req, res, async function (gameToken, decoded) {
		try {
			let serviceId = req.body.serviceId;
			let serviceName = req.body.serviceName;
			let serviceCost = req.body.serviceCost;
			let serviceEnabled = req.body.serviceEnabled;

			let transaction = await PAYMENT_PROCESSOR.updateService(serviceId, serviceName, serviceCost, serviceEnabled);
			await transaction.wait();

			// Return the state.
			res.send({ status: 'SUCCESS' });

		// If we are unable to retrieve state, log an error and notify the admin.
		} catch (error) {
			console.error(process.env.CONTRACT_UNABLE_TO_UPDATE_SERVICE, error);
			res.send({ status: 'ERROR', message: process.env.CONTRACT_UNABLE_TO_UPDATE_SERVICE });
		}
	});
}));

// TODO: refactor the contract to include an order-id mapping keyed to purchase type.
// Look up the purchase history registered to a single user's address.
app.post('/lookup-address', asyncMiddleware(async (req, res, next) => {
	loginValidator(req, res, async function (gameToken, decoded) {
		try {
			let purchaseAddress = req.body.purchaseAddress;
			let transaction = await PAYMENT_PROCESSOR.getPurchases(purchaseAddress);

			// Look up the order status of each pending purchase.
			let sql = util.format(process.env.GET_PENDING_ETHER_PURCHASES, process.env.DATABASE);
			let rows = await DATABASE_CONNECTION.query(sql);

			// Return the state.
			res.send({ status: 'SUCCESS', transaction: transaction, orderDetails: rows[0] });

		// If we are unable to retrieve state, log an error and notify the admin.
		} catch (error) {
			console.error(process.env.CONTRACT_UNABLE_TO_LOOKUP_ADDRESS, error);
			res.send({ status: 'ERROR', message: process.env.CONTRACT_UNABLE_TO_LOOKUP_ADDRESS });
		}
	});
}));
