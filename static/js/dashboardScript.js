'use strict';

// Store our access token as a constant.
let GAME_TOKEN;
let USER_ADDRESS;

// A helper function to show an error message on the page.
function showError (errorMessage) {
	let errorBox = $('#errorBox');
	errorBox.html(errorMessage);
	errorBox.show();
};

// A helper function to show a status message on the page.
function showStatusMessage (statusMessage) {
	let messageBox = $('#messageBox');
	messageBox.html(statusMessage);
	messageBox.show();
};

// A function that Periodically refreshes payment statuses.
let refreshPayments = async function () {
	console.log('Payment status refreshed.');

	// Try to retrieve payment processor information.
	try {
		let processorResponse = await $.post('/get-state');

		// Get all of the processor fields.
		if (processorResponse.status === 'SUCCESS') {
			let name = processorResponse.name;
			let firstParty = processorResponse.firstParty;
			let secondParty = processorResponse.secondParty;
			let nextServiceId = processorResponse.nextServiceId;
			let firstPartyPot = processorResponse.firstPartyPot;
			let secondPartyPot = processorResponse.secondPartyPot;

			// Display the fields to the user.
			let updatedProcessorList = $('<ul id="profileInformation" style="list-style-type:circle"></ul>');
			updatedProcessorList.append('<li>Processor name: ' + name + '</li>');
			updatedProcessorList.append('<li>First party: ' + firstParty + '</li>');
			updatedProcessorList.append('<li>Second party: ' + secondParty + '</li>');
			updatedProcessorList.append('<li>Next service ID: ' + nextServiceId + '</li>');
			updatedProcessorList.append('<li>First party pot: ' + firstPartyPot + '</li>');
			updatedProcessorList.append('<li>Second party pot: ' + secondPartyPot + '</li>');

			// Update our list and remove the loading indicator.
			$('#processorInformation').html(updatedProcessorList.html());
			$('#processorSpinner').remove();

			// Retrieve and display all services.
			let serviceResponse = await $.post('/get-services', { nextServiceId: nextServiceId });
			if (serviceResponse.status === 'SUCCESS') {
				let updatedServicesList = $('<ul id="serviceInformation" style="list-style-type:circle"></ul>');
				let services = serviceResponse.services;

				// Notify the admin if there are no services on this processor.
				if (services.length < 1) {
					updatedServicesList.append('<li>There are no services available.</li>');

				// Parse and display services to the user.
				} else {
					for (let i = 0; i < services.length; i++) {
						let service = services[i];
						let serviceName = service.name;
						let serviceCost = service.cost;
						let serviceEnabled = service.enabled;
						updatedServicesList.append('<li>Service ' + i + ': ' + serviceName + ' ' + serviceCost + ' ' + serviceEnabled + '</li>');
					}
				}

				// Update our list and remove the loading indicator.
				$('#serviceInformation').html(updatedServicesList.html());
				$('#serviceSpinner').remove();

			// Handle an error from the processor.
			} else if (serviceResponse.status === 'ERROR') {
				showError(serviceResponse.message);

			// Handle an unknown error from retrieving the processor's services.
			} else {
				showError('Received an unknown error from retrieving processor services.');
			}

		// Handle an error from the processor.
		} else if (processorResponse.status === 'ERROR') {
			showError(processorResponse.message);

		// Handle an unknown error from retrieving the processor's state.
		} else {
			showError('Received an unknown error from retrieving processor state.');
		}

	// If unable to retrieve the user profile information, show an error.
	} catch (error) {
		showError('Unable to retrieve payment processor state.');
	}
};

// A function which asynchronously sets up the page.
let setup = async function (config) {
	console.log('Setting up page given configuration ...');

	// Get the user's access token and identity.
	GAME_TOKEN = Cookies.get('gameToken');

	// Try to retrieve the user's profile information.
	try {
		let profileResponse = await $.ajax({
			url: window.serverData.profileUri,
			headers: { 'Authorization': 'Bearer ' + GAME_TOKEN }
		});

		// Get all of the profile fields.
		let username = profileResponse.username;
		let email = profileResponse.email;
		USER_ADDRESS = profileResponse.lastAddress;

		// Display the fields to the user.
		let updatedProfileList = $('<ul id="profileInformation" style="list-style-type:circle"></ul>');
		updatedProfileList.append('<li>Your username: ' + username + '</li>');
		updatedProfileList.append('<li>Your email: ' + email + '</li>');
		updatedProfileList.append('<li>Your address: ' + USER_ADDRESS + '</li>');

		// Update our list and remove the loading indicator.
		$('#profileInformation').html(updatedProfileList.html());
		$('#profileSpinner').remove();

	// If unable to retrieve the user profile information, show an error.
	} catch (error) {
		showError('Unable to retrieve user profile.');
	}

	// Assign functionality to the service creation button.
	$('#addService').click(async function () {
		let serviceName = $('#serviceName').val();
		let serviceCost = $('#serviceCost').val();
		let addServiceResponse = await $.post('/add-service', { serviceName: serviceName, serviceCost: serviceCost });

		// Refresh our display if the service addition succeeded.
		if (addServiceResponse.status === 'SUCCESS') {
			showStatusMessage('Successfully added service.');
			await refreshPayments();

		// Handle an error from the processor.
		} else if (addServiceResponse.status === 'ERROR') {
			showError(addServiceResponse.message);

		// Handle an unknown error from retrieving the processor's services.
		} else {
			showError('Received an unknown error from adding a service to the processor.');
		}
	});

	// Assign functionality to the service update button.
	$('#updateService').click(async function () {
		let serviceId = $('#updateServiceId').val();
		let serviceName = $('#updateServiceName').val();
		let serviceCost = $('#updateServiceCost').val();
		let serviceEnabled = $('#updateServiceEnabled').val();
		let updateServiceResponse = await $.post('/update-service', { serviceId: serviceId, serviceName: serviceName, serviceCost: serviceCost, serviceEnabled: serviceEnabled });

		// Refresh our display if the service update succeeded.
		if (updateServiceResponse.status === 'SUCCESS') {
			showStatusMessage('Successfully updated service.');
			await refreshPayments();

		// Handle an error from the processor.
		} else if (updateServiceResponse.status === 'ERROR') {
			showError(updateServiceResponse.message);

		// Handle an unknown error from retrieving the processor's services.
		} else {
			showError('Received an unknown error from updating a service on the processor.');
		}
	});

	// Assign functionality to the address lookup button.
	$('#addressLookup').click(async function () {
		let purchaseAddress = $('#purchaseAddress').val();
		let addressLookupResponse = await $.post('/lookup-address', { purchaseAddress: purchaseAddress });

		// Refresh our display if the address lookup succeeded.
		if (addressLookupResponse.status === 'SUCCESS') {
			$('#addressLookupOutput').html(JSON.stringify(addressLookupResponse));

		// Handle an error from the processor.
		} else if (addressLookupResponse.status === 'ERROR') {
			showError(addressLookupResponse.message);

		// Handle an unknown error from retrieving the processor's services.
		} else {
			showError('Received an unknown error from looking up an address on the processor.');
		}
	});

	// Assign functionality to the example logout button.
	$('#logoutButton').click(async function () {
		$.post('/logout', function (data) {
			window.location.replace('/');
		});
	});

	// Periodically refresh the processed payment data.
	let updateStatus = async function () {
		await refreshPayments();
	};
	await updateStatus();
	setInterval(updateStatus, 30000);
};

// Parse the configuration file and pass to setup.
$.getJSON('js/config.json', function (config) {
	setup(config);
});
