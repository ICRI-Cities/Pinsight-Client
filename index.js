// load environmental variables in .env file
require('dotenv').config();

// remove log file at every start to save space
const fs = require('fs');
fs.stat('status.log', function(err) { 
	if (!err) { 
		fs.unlinkSync('status.log');
	} 
});

// make sure the folder images exists
if (!fs.existsSync('./public/images')){
	fs.mkdirSync('./public/images');
}


const download = require('download');
const winston = require('winston');
const logger = new winston.Logger({
	transports: [
	new (winston.transports.Console)(),
	new (winston.transports.File)({ filename: 'status.log' })
	]
});

const deviceId = process.env.DEVICE_ID || 1;
const isOnline = require('is-online');


const BTN_PINS = [5, 6];
const LED_PINS = [13, 19];
const FIREBASECONFIG = {
	apiKey: "AIzaSyA7UKA-SJUE5zeNSuC6ghzZAwpiMhIZpaA",
	authDomain: " pinsight-cf45d.firebaseapp.com",
	databaseURL: "https://pinsight-cf45d.firebaseio.com/"
};

const express = require('express');
const cors = require('cors');
const app = express();
const server = require('http').Server(app);
const firebase = require("firebase");
const io = require('socket.io')(server);
const dns = require('dns');
const mongojs = require('mongojs');
const mongoDbUrl = '127.0.0.1:27017/pinsight';
const collections = ['cards','devices', 'dialogues', 'responses'];
const mongoDB = mongojs(mongoDbUrl, collections);

var lastPressed = [0,0];
var socket;
var firebaseDB;

var content = {};
var responseCount = 0;

app.use(express.static('public'));
// allow for CORS 
app.use(cors({origin: '*'}))

logger.info("deviceId " + deviceId);




try {	

	var GPIO = require('onoff').Gpio;
	//Button 1 on GPIO 3 = physical pin 5
	//Button 2 on GPIO 4 = physical pin 7	
	var buttonLeft = new GPIO(BTN_PINS[0], 'in', 'both');
	var buttonRight = new GPIO(BTN_PINS[1], 'in', 'both');
	var ledLeft = new GPIO(LED_PINS[0], 'out');
	var ledRight = new GPIO(LED_PINS[1], 'out');
	ledLeft.write(0);
	ledRight.write(0);

	function onButtonPressed(err, state, value) {

		if(state == 0) {
			var millis = new Date(); 
			if(millis - lastPressed[value] > 600) { 
				lastPressed[value] = millis;
				io.emit('buttonpressed', {answer:value, time:millis});
				logger.info('Button ' + value + ' has pressed');
			}
		} else {
			
		}			 
		

	}    
	
	// pass the callback function as the first argument to watch()
	buttonLeft.watch(function(err,state) {onButtonPressed(err,state,0)});
	buttonRight.watch(function(err,state) {onButtonPressed(err,state,1)});    

} catch(e) {
	logger.info('Couldn\'t insantiate GPIO. Probably you are not on a Raspberry PI?')
}



server.listen(9000, function () {

	logger.info('App listening on port 9000');

	setSocketConnection();

	loadDataFromMongodb(function() {

		isConnectedToInternet(function(isConnected) {
			if(isConnected) {
				onInternetChecked(true);
			} else {
				emitData();
			}
		});

		// keep on checking internet connection
		setInterval(function() {
			isConnectedToInternet(onInternetChecked);
		}.bind(this), 10000);
		
	});

}.bind(this));


function setSocketConnection() {

	// when the client connects to the local server
	io.on('connection', function(s) {

		logger.info("on socket connection");
		checkContentBeforeEmitting();

		s.on('response', function(msg) {
			logger.info("received response " + JSON.stringify(msg.answer));	
			updateResponseLog(msg.card, msg.dialogue, msg.answer, msg.timestamp);	
		});

		s.on('timeout', function(msg) {
			logger.info("deviced timeout, dialogue reset");
			shutdownLeds();
		});

		s.on('questionAppeared', blinkLeds.bind(this));

		s.on('answerAppeared', function(msg) {
			lightUpLed(msg.answer);
		}.bind(this));


	});

}

function checkContentBeforeEmitting() {
	if(content["dialogues"] != null && content["devices"] != null && content["cards"] != null) {
		emitData();
	} 
}


function updateMongoDBWithFirebase() {

	logger.info("content has changed on the server! download data from firebase and update mongodb");

	function retrieve (url, key) {  
		return new Promise((resolve, reject) => {
			firebaseDB.ref(url).once('value', (s)=> {
				var data = s.val();
				logger.info(key + " updated")
				mongoDB[key].remove({});
				mongoDB[key].save(data);
				content[key] = data;
				resolve();
			})
		})
	}

	function downloadIfNeeded(name, url) {
		return new Promise((resolve, reject) => {
			console.log("checking",url)
			
			fs.stat('./public/images/'+name, (err)=> { 
				if (err) { 
					download(url)
					.then(data=>{
						fs.writeFileSync('./public/images/'+name, data);
					},
					(error)=> {

					})

				} 
			}); 

		})
	}

	function checkImages () {
		return new Promise((resolve, reject) => {
			console.log("checking images")
			const dialogues  = content.devices.dialogues;
			var promises = [];
			for(var i in dialogues) {
				const cards = content.dialogues[i].cards;
				for(var k in cards) {
					var card = content.cards[k];
					
					if(card.imageURL) {
						promises.push(downloadIfNeeded(card.imageFilename, card.imageURL));
					}
				}
			}
			
			Promise.all(promises)
			.then(() => resolve())
			.catch((err) => console.log(err))

		})
	}

	Promise.all([  
		retrieve('/dialogues', 'dialogues'),
		retrieve('/cards', 'cards'),
		retrieve('/devices/'+deviceId, 'devices'),
		checkImages()
		])
	.then(() => emitData())
	.catch((err) => console.log(err))
}




function emitData() {
	logger.info("emitting data");
	// logger.info("emitting data: " + JSON.stringify(content, null, 2));
	io.emit('data', content);
}



function onInternetChecked(isConnected) {

	if(isConnected) {

		if(firebaseDB == null) {				
			//start firebase connection
			firebase.initializeApp(FIREBASECONFIG);
			firebaseDB = firebase.database();

			// check for updates
			firebaseDB.ref('/devices/'+deviceId+'/lastUpdated').on('value', function(s) { 
				var lastUpdatedOnFirebase = s.val();
				console.log(lastUpdatedOnFirebase)
				if(content.devices == null || content.devices.lastUpdated != lastUpdatedOnFirebase){
					updateMongoDBWithFirebase();
				} else {
					logger.info("no need to update content");
				}

			});

		}
		
		saveResponseToFirebase();


	} 
}

function loadDataFromMongodb(callback) {
	
	mongoDB.cards.find({}, function(err, records){
		
		content["cards"] = records[0];
		
		mongoDB.dialogues.find({}, function(err, records){

			content["dialogues"] = records[0];
			// logger.info("getting dialogues from mongodb: " + JSON.stringify(content[1], null, 2));
			
			mongoDB.devices.find({}, function(err, records){
				
				content["devices"] = records[0];			
				logger.info("data retrieved from mongodb");
				callback();

			});

		});


	});

}




function updateResponseLog(card, dialogue, answer, timestamp) {
	mongoDB.responses.save({deviceId:deviceId, cardId:card, dialogueId:dialogue, value:answer, time:timestamp},
		function(err, saved) {
			if( err || !saved ) logger.info("Response not saved");
			else {
				logger.info("Response saved to mongodb");

			}
		});
}


function saveResponseToFirebase() {

	mongoDB.responses.find({}, function(err, records){
		
		var recordsObject = {};

		records.forEach(function(r) {
			recordsObject[r._id] = r;
		})


		if (err) logger.info(err);
		else {
			if (responseCount < records.length) {
				logger.info("saving responses to firebase");
				firebaseDB.ref('responses/').update(recordsObject);
				responseCount = records.length;
			} else {
				// logger.info("no need to upload responses");
			}

		}
	});
}


function isConnectedToInternet(callback) {
	logger.info("checking  internet...")
	isOnline().then(online => {
		if (!online) {
			logger.info("not connected :(")
			callback(false);
		} else {
			logger.info("connected!")
			callback(true);
		}
	});
}

function shutdownLeds() {
	logger.info("shut leds");
	if (GPIO) {
		ledLeft.write(0);
		ledRight.write(0);
	}
}


function lightUpLed(whichLed) {
	// logger.info("lighting up led: " + whichLed);
	if (GPIO) {
		(whichLed == 0) ? (ledLeft.write(1)) : (ledRight.write(1));
		setTimeout(function() {
			ledLeft.write(0);
			ledRight.write(0);
			// logger.info("blinks - down");
			setTimeout(function() {
				ledLeft.write(1);
				ledRight.write(1);				
				// console.log("blinks - up");
			}.bind(this), 250);
		}.bind(this), 300);
	}		
}

function blinkLeds() {
	
}


