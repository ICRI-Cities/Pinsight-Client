import fixOrientation from 'fix-orientation';

import { Component } from 'react'

var socket = io.connect(); 
const TIMEOUT_SLEEP = 90000;
let data;
let sleepTimeout;

export default class DialoguePlayer extends Component {

	constructor(props) {
		super(props);

		this.state = {
			dialogues: null,
			cards: null,
			currentDialogueId:0,
			currentCardId: 0,
			debugging: true
		}

		socket.on("buttonpressed", function(d) {
			this.handleChange(d.answer, d.time);
		}.bind(this));

		socket.on("data", this.update.bind(this));
		socket.on("debug", () => {
			this.setState({
				debugging: true
			})
		});


	}


	logResponse(cardID, dialogueID, value, time) {
		let response = {card:cardID, dialogue:dialogueID, answer:value, timestamp: time};
		socket.emit('response', response);
	}

	startTimerForSleep() {
		if(sleepTimeout) clearTimeout(sleepTimeout);
		sleepTimeout = setTimeout(function () {

			this.update(data);
			this.notifyTimeout();

		}.bind(this), TIMEOUT_SLEEP);
	}

	notifyTimeout() {
		let timeout = true;
		console.log("emitting timeout info");
		socket.emit('timeout', timeout);
	}

	update(d) {

		this.startTimerForSleep();

		data  = d; 

		const dialoguesOnDevice = [];
		for(var i in data.devices.dialogues) {
			dialoguesOnDevice.push({
				id: i,
				order: data.devices.dialogues[i].order
			});
		}

		dialoguesOnDevice.sort(function(a,b) {
			return a.order > b.order;
		});

		const dialogues = dialoguesOnDevice.map((d) => { return data.dialogues[d.id] });
		const currentDialogue = dialogues[0];

		

		this.setState({
			dialogues,
			cards: data.cards,
			currentDialogueId:0,
			currentCardId: Object.keys(currentDialogue.cards)[0],
		});

		document.body.style.background = data.devices.color;

	}

	handleChange(answer, time) {

		this.startTimerForSleep();

		let card = this.state.cards[this.state.currentCardId];

		let chosenAnswer = card.answers[answer];
		let chosenAnswerLabel = chosenAnswer.label;
		let linkedCardIndex = chosenAnswer.link;

		let theOtherAnswerLink = card.answers[1-answer].link;

		var s = this.state;

		
		if(linkedCardIndex == -1) {
			if (chosenAnswerLabel == "" && theOtherAnswerLink != -1) {
				console.log ("Blank answer links to nothing in the middle of dialogue");
			}	
			else{
				console.log("Going to next dialogue");
				var nd = s.currentDialogueId+1;
				if(nd == s.dialogues.length) nd = 0;
				const currentDialogue = s.dialogues[nd];


				this.setState({
					currentDialogueId: nd,
					currentCardId: Object.keys(currentDialogue.cards)[0]
				});
			}
		} else {
			this.setState({
				currentCardId: linkedCardIndex
			});
		}
		

		// console.log( this.state.dialogues[this.state.currentDialogueId].id)
		this.logResponse(this.state.currentCardId, this.state.dialogues[this.state.currentDialogueId].id, answer, time);


	} 

	getImage(filename) {

		// get the right url of the image
		var img = new Image()
		img.onload = ()=>{
			fixOrientation(this.getBase64Image(img), {}, (fixed, image)=> {
				this.refs.img.src = fixed;
			});
		}
		img.src = "images/"+filename;
		
	}

	getBase64Image(img) {
		var canvas = document.createElement("canvas");
		canvas.width = img.width;
		canvas.height = img.height;

		var ctx = canvas.getContext("2d");
		ctx.drawImage(img, 0, 0);
		var dataURL = canvas.toDataURL("image/png");

		return dataURL
	}

	componentDidUpdate() {

		if(this.state.debugging) return;

		// reset all the text and hide it
		var i = 0;
		var domTitle = this.refs.title;
		var card = this.state.cards[this.state.currentCardId];
		var title =  card.title;
		this.refs.buttonLeft.classList.add('hidden');
		this.refs.buttonRight.classList.add('hidden');
		// don't change the text straight away, first hide it then change it
		setTimeout(()=> {
			this.refs.buttonRight.textContent = card.answers[1].label;						
			this.refs.buttonLeft.textContent = card.answers[0].label;
		}, 1000)
		clearInterval(this.interval);


		console.log(card)
		if(!card.isImage) {

			var words = document.querySelectorAll("h1 span");

			this.interval = setInterval(() => {
				words[i].classList.remove('hidden');
				i++;
				if(i == words.length) {
					this.complete();
				}
			}, 100);
			

		} else if (card.imageURL !=null) {
			setTimeout(()=>{
				this.refs.img.classList.remove('hidden')
				this.complete();
			},500);
		}
	}

	complete() {
		console.log("complete")
		clearInterval(this.interval);

		// show the buttons
		setTimeout(() =>{
			this.refs.buttonLeft.classList.remove('hidden');
			socket.emit('answerAppeared', {answer:0});
		},800);

		setTimeout(() =>{
			this.refs.buttonRight.classList.remove('hidden');
			socket.emit('answerAppeared', {answer:1});
		},1000);
		socket.emit('questionAppeared', {blink:true});
	}


	render() {

		let s = this.state; 
		if(s.dialogues == null) return (<div>Loading</div>);

		let currentDialogue = s.dialogues[s.currentDialogueId];
		let card = s.cards[s.currentCardId];


		let getContent = () => {
			
			if(this.state.debugging) {
				return (
						<div id="Dialogue-Content">
						<h1>debugging</h1>
						</div>
				)
			} else {

				if(!card.isImage) {
					return (
						<div id="Dialogue-Content">
						<h1 ref="title">
						{
							letters.map( (letter,i) =><span className="hidden" key={i + Math.random()}>{letter + " "}</span>)
						}
						</h1>
						</div>
						)
				} else {
					return <img src={this.getImage(card.imageFilename)} ref="img" className="hidden" height="500" />
				}
			}

		}
		var letters = card.title.split(" ");

		return (
			<div >
			{ getContent() }
			<div id="Dialogue-Answers" className="buttons">
			<button className="hidden" ref="buttonLeft" id="buttonLeft"  onClick={() => this.handleChange(0, new Date())}></button>
			<button className="hidden" ref="buttonRight" id="buttonRight"  onClick={() => this.handleChange(1, new Date())}></button>
			</div>
			</div>
			)
	}



}
