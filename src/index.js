'use strict';

// Simple demo of Triangular Arbitrage
// Materials used:
// https://medium.com/the-ocean-trade/algorithmic-trading-101-lesson-3-introduction-to-arbitrage-strategies-76e546b99691
// https://pdfs.semanticscholar.org/2bce/16146e617c0f3e1aa036a5dde122d99ecd3f.pdf

const WebSocket = require('ws');	// Simple to use, blazing fast and thoroughly tested WebSocket client and server for Node.js

const PAIR_0 = 'ZRX/ETH';	// Name of the first pair
const PAIR_1 = 'ZRX/BTC';	// Name of the second pair
const PAIR_2 = 'ETH/BTC';	// Name of the third pair
const TRANSACTION_COST = 0.001;	// Cost of transaction - for Binance it is 0.1%
const TRIPLE_COST = (1.0-TRANSACTION_COST)*(1.0-TRANSACTION_COST)*(1.0-TRANSACTION_COST); // Cost of three transactions

var websocket;
var buySell = [0, 0, 0];	// Should use ask or bid price
var streamNames = ['', '', '']; // Names of streams used in exchange socket connection
var asks = [0, 0, 0];	// Cached values of best ask prices (buy) in order book (ask prices on first position in order book)
var bids = [0, 0, 0];	// Cached values of best bid prices (sell) in order book (bid prices on first position in order book)
var forwardOrder, reverseOrder;	// Strings with execution order;

function setPairsData(array) {
	let i, len, c, coin, base;
	let tokens = ['', '', ''];	// Order of tokens trade
	let forwardOrderTxt = ['', '', ''];
	let reverseOrderTxt = ['', '', ''];

	c = array[0].split('/');
	coin = c[0];
	base = c[1];
	tokens[0] = base;
    tokens[1] = coin;
    streamNames[0] = (coin+base).toLowerCase() + '@depth5'; // Name of pair stream 
    buySell[0] = 0;

    forwardOrderTxt[0] = array[0] + '  ' + 'buy  '+coin+' for '+base+' (use ask price)';
    reverseOrderTxt[0] = array[0] + '  ' + 'sell '+coin+' to  '+base+' (use bid price)';

	for (i=1, len=array.length; i<len; i++) {
		c = array[i].split('/');
		coin = c[0];
		base = c[1];
		streamNames[i] = (coin+base).toLowerCase() + '@depth5'; // Name of pair stream 

		if (base == tokens[1]) {
        	buySell[i] = 0;
        	tokens[2] = coin;
        	forwardOrderTxt[i] = array[i] + '  ' + 'buy  '+coin+' for '+base+' (use ask price)';
        	reverseOrderTxt[i] = array[i] + '  ' + 'sell '+coin+' to  '+base+' (use bid price)';
      	}
      	else if (coin == tokens[1]) {
        	buySell[i] = 1;
        	tokens[2] = base;
        	forwardOrderTxt[i] = array[i] + '  ' + 'sell '+coin+' to  '+base+' (use bid price)';
        	reverseOrderTxt[i] = array[i] + '  ' + 'buy  '+coin+' for '+base+' (use ask price)';
      	}
      	else if (base == tokens[0]) {
        	buySell[i] = 1;
        	tokens[2] = coin;
        	forwardOrderTxt[i] = array[i] + '  ' + 'sell '+coin+' to  '+base+' (use bid price)';
        	reverseOrderTxt[i] = array[i] + '  ' + 'buy  '+coin+' for '+base+' (use ask price)';
      	}
      	else if (coin == tokens[0]) {
        	buySell[i] = 0;
        	tokens[2] = base;
        	forwardOrderTxt[i] = array[i] + '  ' + 'buy  '+coin+' for '+base+' (use ask price)';
        	reverseOrderTxt[i] = array[i] + '  ' + 'sell '+coin+' to  '+base+' (use bid price)';
      	}
    }

    forwardOrder = tokens[0] + ' > ' + tokens[1] + ' > ' + tokens[2];
    reverseOrder = tokens[0] + ' > ' + tokens[2] + ' > ' + tokens[1];

    console.log("\nTrade order: " + forwardOrder);

    for (i=0; i<3; i++) {
    	console.log((i+1)+'. '+forwardOrderTxt[i]);
    }

    console.log("\nReverse trade order: " + reverseOrder);

    for (i=2; i>=0; i--) {
    	console.log((3-i)+'. '+reverseOrderTxt[i]);
    }
}

function startSocket() {
	console.log("\nStarting web socket connection with exchange.\nWaitng for order book.");
	websocket = new WebSocket('wss://stream.binance.com:9443/stream?streams='+streamNames[0]+'/'+streamNames[1]+'/'+streamNames[2]);

	websocket.on('open', () => {
		console.log("\nConnected");	// Notification about server connection
	});

	websocket.on('message', (data) => {
		processData(data);	// Data with ask/bid prices for one pair received
	});
}

function processData(data) {
	const parsedData = JSON.parse(data);	// Converting json text message received from server to object

	let streamName = parsedData.stream;		// Name of stream. It is name of the pair that ask/bid data stream contains
	let i, idx = -1;

	// We search for index of the pair, that should be upadata
	for (i=0; i<3; i++) {
		if (streamNames[i]==streamName) {
			idx = i;
			break;
		}
	}

	if (idx == -1) return;	// Index not found. We do not have pair for this data

	asks[idx] = Number(parsedData.data.asks[0][0]);	// Getting best ask price in order book
	bids[idx] = Number(parsedData.data.bids[0][0]);	// Getting best bid proce in order book

	if (asks[0]==0 || asks[1]==0 || asks[2]==0) return; // We do not have data for all pairs yet

	// Calculate transaction multiplier in two execution orders
    let mForward = TRIPLE_COST;	// multiplier for forward order trade execution
    let mReverse = TRIPLE_COST;	// multiplier for reverse order trade execution

    // Loop all three pairs and buy/sell tokens
    for (i=0; i<3; i++) {
      if (buySell[i]==0) {
        mForward *= 1.0 / asks[i];	// Selling for forward order
        mReverse *= bids[i];		// Buying for reverse order
      }
      else {
        mForward *= bids[i];		// Buying for forward order
        mReverse *= 1.0 / asks[i];	// Selling for reverse order
      }
    }

    if (mForward > mReverse) {
    	console.log(forwardOrder+" Multiplier: "+mForward);
    }
    else {
    	console.log(reverseOrder+" Multiplier: "+mReverse);
    }
}


console.log("\n ------ TRIPLE ARBITRAGE DEMO ------");
setPairsData([PAIR_0, PAIR_1, PAIR_2]);
startSocket();