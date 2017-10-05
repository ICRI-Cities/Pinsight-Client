

/*-----------------------------------------------------------------------------------------------------
*	Below are all functioins to query logs of the Olympic Park deployment from the firebase, not related to the Pin client. 
*	To generate logs, call the method generateLogFilesCsv().
--------------------------------------------------------------------------------------------------------*/
var contentToWrite;
var allDialogues;

function generateLogFilesCsv() {
	allDialogues;

	console.log("===== started =====");

	setTimeout(function() {
		writeToCsv(contentToWrite);
	}.bind(this), 30000);

	// getAggregatedLogsPerTimeslot();
	// getAggregatedLogsForWholeTime();
	getAllLogsForChosenDialogues();
}

function getAllLogsForChosenDialogues() {
	contentToWrite = "DialogueId, TimeStamp, CardId, Title, ResponseValue\n";
	var dialoguesToLookFor = ['-Kpa5SHdoTFP-mstQEBL', '-KpeJ00OKOU3t2GMEroI', '-Kpe5I7ECXXq9cBL9EDq', '-KpeJR-U6x6Vo3M1aEy4'];
	for (var i = 0; i < dialoguesToLookFor.length; i++) {
		getResponsesByDialogueID(dialoguesToLookFor[i]);
	}
}


function getAggregatedLogsForWholeTime() {
	contentToWrite = "TimeSlot,Device,DialogueId,CardId,Title,AnswerL,Lclick,AnswerR,Rclick\n";

	firebaseDB.ref("dialogues").once('value', function(snapshot){
		allDialogues = snapshot.val();

		// console.log("===== started =====");

		// setTimeout(function() {
			// 	writeToCsv(contentToWrite);
			// }.bind(this), 30000);

			var timeSlots = ['2017-06-18T11:00', '2017-06-18T12:00', '2017-06-18T13:00', '2017-06-18T14:00', '2017-06-18T15:00', '2017-06-18T16:00', '2017-06-18T17:00'];

			getAllResponsesPerCard(timeSlots[0], timeSlots[timeSlots.length-1]);
		});	
}

function getAggregatedLogsPerTimeslot() {
	contentToWrite = "TimeSlot,Device,DialogueId,CardId,Title,AnswerL,Lclick,AnswerR,Rclick\n";

	firebaseDB.ref("dialogues").once('value', function(snapshot){
		allDialogues = snapshot.val();

		// console.log("===== started =====");

		// setTimeout(function() {
			// 	writeToCsv(contentToWrite);
			// }.bind(this), 30000);

			var timeSlots = ['2017-06-18T11:00', '2017-06-18T12:00', '2017-06-18T13:00', '2017-06-18T14:00', '2017-06-18T15:00', '2017-06-18T16:00', '2017-06-18T17:00'];

			for (var i = 0; i < 6; i++) {
				getAllResponsesPerCard(timeSlots[i], timeSlots[i+1]);
			}
		});	
}

function findDialogueId(cardid){
	for(var diaKey in allDialogues){
		let aDialogue = allDialogues[diaKey];

		let cards = aDialogue.cards;

		for (var i = 0; i < Object.keys(cards).length; i++) {
			if(cardid == Object.keys(cards)[i]) {
				return diaKey;
			}
		}			
	}

}

function getResponsesByDialogueID(dialogueId) {
	var ref = firebaseDB.ref("responses");
	var table = {};
	var query = ref.orderByChild("dialogueId").equalTo(dialogueId);
	query.once('value', function(snapshot) {
		snapshot.forEach(function(childSnapshot) {
			var childKey = childSnapshot.key;
			let oneResponse = childSnapshot.val();	
			// console.log("one response: ", oneResponse);	
			firebaseDB.ref("cards").orderByKey().equalTo(oneResponse.cardId).once('value', function(snapshot) {

				let aCard = snapshot.val();

				let aCardValue;
				let cardid;
				for(var k in aCard){
					cardid = k;
					aCardValue = aCard[k];
				}
				let title = aCardValue['title'];


				contentToWrite+=dialogueId + ',';
				contentToWrite+=oneResponse.pi_timestamp + ',';
				contentToWrite+=escapeCsvString(cardid) + ',';
				contentToWrite+=escapeCsvString(title)+',';
				contentToWrite+=oneResponse.value + "\n";
			});	
		});
	});

}

function getAllResponsesPerCard(startTime, endTime) {
	var ref = firebaseDB.ref("responses");
	var table = {};
	var query = ref.orderByChild("pi_timestamp").startAt(startTime).endAt(endTime);
	query.once('value', function(snapshot) {
		snapshot.forEach(function(childSnapshot) {
			var childKey = childSnapshot.key;
			let oneResponse = childSnapshot.val();

			if(table.hasOwnProperty(oneResponse.cardId)){
				let answers = table[oneResponse.cardId]["answers"];
				if (oneResponse.value == 0) {
					answers[0]++;
				} else if (oneResponse.value == 1) {
					answers[1]++;
				}
				table[oneResponse.cardId] = {"answers": answers, "device": oneResponse.deviceId}; 
			}else {

				let answers = [0, 0];
				if (oneResponse.value == 0) {
					answers[0]++;
				} else if (oneResponse.value == 1) {
					answers[1]++;
				}
				table[oneResponse.cardId] = {"answers": answers, "device": oneResponse.deviceId}; 
			}   
		});

		console.log("table length of ", startTime, " is: ", Object.keys(table).length);

		fillColumns(table, startTime);
	});
}

function escapeCsvString(str) {
	return '"' + str.replace('"', '\"').replace('\n', ' ') + '"';
}

function fillColumns(result, startTime){

	for (var key in result) {
		let j = result[key];

		let query = firebaseDB.ref("cards").orderByKey().equalTo(key);
		query.once('value', function(snapshot) {

			let aCard = snapshot.val();

			let aCardValue;
			let cardid;
			for(var k in aCard){
				cardid = k;
				aCardValue = aCard[k];
			}
			let diaId = findDialogueId(cardid);

			let title = aCardValue['title'];
			let answer = aCardValue['answers'];
			let answerL = answer[0];
			let answerR = answer[1];

			contentToWrite+=startTime + ',';
			contentToWrite+=j['device'] + ',';
			contentToWrite+=escapeCsvString(diaId) + ',';
			contentToWrite+=escapeCsvString(cardid) + ',';
			contentToWrite+=escapeCsvString(title)+',';
			contentToWrite+=escapeCsvString(answerL['label'])+',';
			contentToWrite+=j['answers'][0]+',';
			contentToWrite+=escapeCsvString(answerR['label'])+',';
			contentToWrite+=j['answers'][1]+"\n";
		});
	}
}

function writeToCsv(content){
	var fs = require('fs');
	fs.writeFile("Responses.csv", content, function(err) {

		if(err) return console.log(err);
		console.log("============The record was saved!========");
	}); 
}


/*-----------------------------------------------------------------------------------------------------
*	Above are all functioins to generate log files for the Olympic Park deployment from the firebase, not related to the Pin client. 
*	To generate logs, call the method generateLogFilesCsv().
--------------------------------------------------------------------------------------------------------*/


