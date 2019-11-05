'use strict';

// Store our access token as a constant.
let GAME_TOKEN;
let USER_ADDRESS;

// Track the list of game items which can be ascended.
let gameItems = [];
let checkoutItems = {};

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

// Refresh the recent user's inventory.
async function refreshInventory () {
	try {
		let inventoryResponse = await $.ajax({
			url: window.serverData.inventoryUri,
			headers: { 'Authorization': 'Bearer ' + GAME_TOKEN }
		});

		// Update the list of this player's assets that reside solely on the game database.
		let updatedListGame = $('<ul id="ownedListGame" style="list-style-type:circle"></ul>');
		let inventory = inventoryResponse.inventory;
		if (inventory.length > 0) {
			$('#ownedTitleGame').html('You own the following in-game assets:');
		}
		let updatedGameItems = [];
		for (let i = 0; i < inventory.length; i++) {
			let item = inventory[i];
			let itemId = item.itemId;
			let itemAmount = item.amount;

			// Try to retrieve metadata about each item.
			try {
				let itemMetadataResponse = await $.ajax({
					url: window.serverData.metadataUri + itemId
				});
				let itemMetadata = itemMetadataResponse.metadata;
				let itemName = itemMetadata.name;
				let itemImage = itemMetadata.image;
				let itemDescription = itemMetadata.description;

				// Update the actual list for display.
				updatedListGame.append('<li>' + itemAmount + ' x (' + itemId + ') ' + itemName + ': ' + itemDescription + '</li>');

				updatedGameItems.push({
					id: itemId,
					amount: itemAmount,
					name: itemName,
					description: itemDescription,
					image: itemImage
				});

			// If unable to retrieve an item's metadata, flag such an item.
			} catch (error) {
				updatedListGame.append('<li>' + itemAmount + ' x (' + itemId + ') - unable to retrieve metadata.</li>');
			}
		}

		// Update our list and remove the loading indicator.
		gameItems = updatedGameItems;
		$('#ownedListGame').html(updatedListGame.html());
		$('#gameServerSpinner').remove();

	// If we were unable to retrieve the server inventory, throw error.
	} catch (error) {
		showError('Unable to retrieve the server inventory.');
		$('#ownedListGame').html('Unable to retrieve the server inventory.');
	}

	// Update the list of this user's Enjin-owned items if they have a valid address.
	let connectionData = await $.post('/connect');
	if (connectionData.status === 'LINKED') {
		USER_ADDRESS = connectionData.address;
		let inventory = connectionData.inventory;
		$('#enjinMessage').html('Your Ethereum address is ' + USER_ADDRESS);
		if (inventory.length > 0) {
			$('#ownedTitleEnjin').html('You own the following Enjin ERC-1155 items:');
		}
		$('#linkingQR').empty();
		$('#mintButton').show();
		let updatedListEnjin = $('<ul id="ownedListEnjin" style="list-style-type:circle"></ul>');
		for (let i = 0; i < inventory.length; i++) {
			let item = inventory[i];
			let itemAmount = item.balance;
			let itemId = item['token_id'];
			let itemURI = item.itemURI;

			// Try to retrieve metadata about each item.
			try {
				let itemMetadataResponse = await $.get(itemURI);
				let itemName = itemMetadataResponse.name;
				let itemImage = itemMetadataResponse.image;
				let itemDescription = itemMetadataResponse.description;

				// Update the actual list for display.
				updatedListEnjin.append('<li>' + itemAmount + ' x (' + itemId + ') ' + itemName + ': ' + itemDescription + '</li>');

			// If unable to retrieve an item's metadata, flag such an item.
			} catch (error) {
				updatedListEnjin.append('<li>' + itemAmount + ' x (' + itemId + ') - unable to retrieve metadata.</li>');
			}
		}
		$('#ownedListEnjin').html(updatedListEnjin.html());
		$('#enjinSpinner').remove();

	// Otherwise, notify the user that they must link an Enjin address.
	} else if (connectionData.status === 'MUST_LINK') {
		let code = connectionData.code;
		$('#enjinMessage').html('You must link your Enjin wallet to ' + code);
		$('#linkingQR').html('<img src="' + connectionData.qr + '"></img>');
		$('#ownedTitleEnjin').html('You do not own any Enjin ERC-1155 items.');
		$('#ownedListEnjin').empty();
		$('#mintButton').hide();
		$('#enjinSpinner').remove();

	// Otherwise, display an error from the server.
	} else if (connectionData.status === 'ERROR') {
		let errorBox = $('#errorBox');
		errorBox.html(connectionData.message);
		errorBox.show();

	// Otherwise, display an error about an unknown status.
	} else {
		let errorBox = $('#errorBox');
		errorBox.html('Received unknown message status from the server.');
		errorBox.show();
	}
};

// A function which asynchronously sets up the page.
let setup = async function (config) {
	console.log('Setting up page given configuration ...');

	// Assigning delegate to modal event handler.
	$('#mintingCheckoutContent').on('input', '.input', function (changedEvent) {
		let itemValue = parseInt($(this).val());
		let itemId = $(this).attr('itemId');
		checkoutItems[itemId] = itemValue;
	});

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
		let kills = profileResponse.Kills;
		let deaths = profileResponse.Deaths;
		let assists = profileResponse.Assists;
		let accuracy = profileResponse.Accuracy;
		let wins = profileResponse.Wins;
		let losses = profileResponse.Losses;

		// Display the fields to the user.
		let updatedProfileList = $('<ul id="profileInformation" style="list-style-type:circle"></ul>');
		updatedProfileList.append('<li>Your username: ' + username + '</li>');
		updatedProfileList.append('<li>Your email: ' + email + '</li>');
		updatedProfileList.append('<li>Your kills: ' + kills + '</li>');
		updatedProfileList.append('<li>Your deaths: ' + deaths + '</li>');
		updatedProfileList.append('<li>Your assists: ' + assists + '</li>');
		updatedProfileList.append('<li>Your accuracy: ' + accuracy + '</li>');
		updatedProfileList.append('<li>Your wins: ' + wins + '</li>');
		updatedProfileList.append('<li>Your losses: ' + losses + '</li>');

		// Update our list and remove the loading indicator.
		$('#profileInformation').html(updatedProfileList.html());
		$('#profileSpinner').remove();

	// If unable to retrieve the user profile information, show an error.
	} catch (error) {
		showError('Unable to retrieve user profile.');
	}

	// Assign functionality to the item minting button.
	$('#mintButton').click(async function () {
		$('#mintingCheckoutContent').empty();
		checkoutItems = {};

		// Only show the option to mint items which can be ascended.
		try {
			let screeningResponse = await $.post(window.serverData.screeningUri, {
				unscreenedItems: gameItems
			});

			// Handle the response from item screening.
			if (screeningResponse.status === 'SCREENED') {
				let screenedItems = screeningResponse.screenedItems;

				// Populate the minting checkout modal with potential options.
				if (screenedItems.length > 0) {
					let updatedModalContent = $('<ul id="checkoutList" style="list-style-type:circle"></ul>');
					for (let i = 0; i < screenedItems.length; i++) {
						let item = screenedItems[i];
						let itemAmount = item.amount;
						let itemId = item.id;
						let itemName = item.name;

						updatedModalContent.append('<li>(' + itemId + ') ' + itemName + '\t\t<input id="amount-' + itemId + '" class="input" itemId="' + itemId + '" type="number" value="0" min="0" max="' + itemAmount + '" step="1" style="float: right"/></li>');
					}
					$('#mintingCheckoutContent').html(updatedModalContent.html());
				} else {
					$('#mintingCheckoutContent').html('You have no items which can be ascended to Enjin at this time.');
				}

			// If there was a screening error, notify the user.
			} else if (screeningResponse.status === 'ERROR') {
				let errorBox = $('#errorBox');
				errorBox.html(screeningResponse.message);
				errorBox.show();

			// Otherwise, display an error about an unknown status.
			} else {
				let errorBox = $('#errorBox');
				errorBox.html('Received unknown message status from the server.');
				errorBox.show();
			}

		// If unable to screen a user's mintable item inventory, show an error.
		} catch (error) {
			showError('Unable to verify mintability at this time.');
		}
	});

	// Assign functionality to the modal's PayPal checkout button.
	paypal.Buttons({
		createOrder: async function () {
			let data = await $.post('/checkout', {
				requestedServices: [
					{
						id: 'ASCENSION',
						checkoutItems: checkoutItems
					}
				],
				paymentMethod: 'PAYPAL'
			});
			return data.orderID;
		},

		// Capture the funds from the transaction and validate approval with server.
		onApprove: async function (data) {
			let status = await $.post('/approve', data);
			if (status === 'OK') {
				console.log('Transaction completed successfully.');
				showStatusMessage('Your purchase was received and is now pending!');
			} else {
				console.error(status, 'Transaction failed.');
			}
		}
	}).render('#paypal-button-container');

	// Assign functionality to the example logout button.
	$('#logoutButton').click(async function () {
		$.post('/logout', function (data) {
			window.location.replace('/');
		});
	});

	// Periodically refresh the user's inventory.
	let updateStatus = async function () {
		await refreshInventory();
	};
	await updateStatus();
	setInterval(updateStatus, 30000);
};

// Parse the configuration file and pass to setup.
$.getJSON('js/config.json', function (config) {
	setup(config);
});
