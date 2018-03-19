/**
 * swatk6/packet
 * @version v1.1.1
 * @author Andras Kemeny
 * 
 * A packet class for layer-agnostic communications.
 * 
 * LICENSE: MIT
 * (c) Andras Kemeny, subpardaemon@gmail.com
 */

/**
 * 
 * @param {(String|Object|swatk6_packet}} [inData]
 * @constructor
 * @returns {swatk6_packet}
 */
function swatk6_packet(inData) {
    this.command = 'NOPE';
    this.target = null;
    this.origin = null;
    this.payload = null;
    this.status = null;
    this.options = {
	reply: false,
	destroyafter: false,
	donotreconnect: false,
	blockui: swatk6_packet.defaultBlocksUI,
	type: 'RQ',
	requestack: swatk6_packet.defaultRequestAck,
	layer: null
    };
    this.sessionid = null;
    this.seqid = null;
    this.seqserial = 0;
    this.states = [];
    this._commdata = {
	sendstate: 'queue',
	sendwhen: 0,
	timesout: 0,
	retrycount: 0,
	//set by the transfer manager
	timeout: 0,
	replytimeout: 0,
	retries: 0,
	retrywait: 0,
	lastsent: 0,
	responselink: null,
	suspended: false,
	failed: false,
	completed: false,
	aborted: false,
	replied: false
    };
    if (typeof inData!=='undefined') {
	this.setup(inData,true);
    }
    if (this.seqid === null) {
	this.seqid = swatk6_packet.makeSeqId(this);
    }
}
/**
 * Set up the current instance by the inData given.
 * 
 * inData is either:
 * - something that is not an <Object> or is a <Buffer>; then it's assumed it's a fresh-from transit serialized data, and swatk6_packet.coderDecoder will be called with it to yield an object
 * - an <Object> that holds the properties allowed in the values of swatk6_packet.paramnames, and also _states and _commdata;
 * - an <Object> that holds shortened keys described in swatk6_packet.paramnames and swatk6_packet.optnames.
 * 
 * @param {(String|Buffer|Object|swatk6_packet}} inData
 * @param {Boolean} isInitial
 * @throws {Error} if deserialization or data readin yields no intelligible answer
 * @returns {undefined}
 */
swatk6_packet.prototype.setup = function(inData,isInitial) {
    if (typeof inData!=='object' || inData instanceof Buffer) {
	inData = swatk6_packet.coderDecoder(inData,'decode');
    }
    if (inData===null || typeof inData!=='object') {
	throw new Error('@swatk6/packet: incorrect packet setup data (null or not an object)');
    }
    var ttabm = null;
    var ttabo = null;
    if (typeof inData[swatk6_packet.allowedKeysMain[0]]!=='undefined') {
	ttabm = swatk6_packet.paramnames;
	ttabo = swatk6_packet.optnames;
    }
    else if (typeof inData[swatk6_packet.allowedPropsMain[0]]==='undefined') {
	throw new Error('@swatk6/packet: incorrect packet setup data (missing command identifier)');
    }
    var i,j,prop,prop2,optprops;
    var props = Object.getOwnPropertyNames(inData);
    for(i=0;i<props.length;i++) {
	prop = props[i];
	var actlprop = (ttabm!==null) ? ttabm[prop] : prop;
	if (typeof actlprop!=='undefined' && swatk6_packet.allowedPropsMain.indexOf(actlprop)>-1) {
	    if (actlprop==='options') {
		optprops = Object.getOwnPropertyNames(inData[prop]);
		for(j=0;j<optprops.length;j++) {
		    if (swatk6_packet.allowedKeysOpt.indexOf(optprops[j])>-1) {
			this.options[ttabo[optprops[j]]] = inData[prop][optprops[j]];
		    }
		    else if (swatk6_packet.allowedPropsOpt.indexOf(optprops[j])>-1) {
			this.options[optprops[j]] = inData[prop][optprops[j]];
		    }
		}
	    }
	    else if (actlprop==='payload' && isInitial===true) {
		this[actlprop] = JSON.parse(JSON.stringify(inData[prop]));
	    }
	    else {
		this[actlprop] = inData[prop];
	    }
	} else {
	    actlprop = (ttabo!==null) ? ttabo[prop] : prop;
	    if (typeof actlprop!=='undefined' && swatk6_packet.allowedPropsOpt.indexOf(actlprop)>-1) {
		this.options[actlprop] = inData[prop];
	    }
	}
    }
    if (typeof inData['states']!=='undefined') {
	this.states = inData['states'];
    }
    if (typeof inData['_commdata']!=='undefined') {
	this._commdata = inData['_commdata'];
    }
};

/*
 * ----------------------------------------------------------------------------
 * OPTIONS AND BEHAVIOURS METHODS
 * ----------------------------------------------------------------------------
 */
/**
 * ACKs the packet.
 * 
 * ACK is used for ACKnowledging receipt of packets (only needed if options.requestack is true).
 * 
 * @returns {swatk6_packet}
 */
swatk6_packet.prototype.ack = function() {
    this.reply(null,'OK','ACK');
    return this;
};
/**
 * Set the request-ACK option.
 * @param {Boolean} [rq=true]
 * @returns {swatk6_packet}
 */
swatk6_packet.prototype.requestAck = function(rq) {
    if (typeof rq === 'undefined') {
	rq = true;
    }
    this.options.requestack = rq === true;
    return this;
};
/**
 * Returns true if an ACK is required for this packet upon receipt.
 * @returns {Boolean}
 */
swatk6_packet.prototype.requestsAck = function() {
    return this.options.reply;
};
/**
 * Turn this packet into a reply packet.
 * 
 * This entails:
 * - turns off this.options.reply (which would cause an endless loop of replyRequested packets);
 * - this.type becomes 'RP' (ResPonse) instead of the default 'RQ' (ReQuest);
 * - this.payload and this.status changes by the given value (if status is not given, it's assumed to be 'OK');
 * - this.command might change if the nc (NewCommand) parameter is given; otherwise, it remains the same;
 * - this.origin and this.target is swapped.
 * 
 * @param {*} [rd=null] response data
 * @param {String} [st='OK'] response status
 * @param {String} [nc] response command (if not given, the command remains the same)
 * @returns {swatk6_packet}
 */
swatk6_packet.prototype.reply = function(rd,st,nc) {
    this.requireReply(false);
    this.options.type = 'RP';
    if (typeof rd === 'undefined') {
	rd = null;
    }
    if (typeof st === 'undefined') {
	st = 'OK';
    }
    this.payload = rd;
    this.status = st;
    var n = this.origin;
    this.origin = this.target;
    this.target = n;
    if (typeof nc !== 'undefined') {
	this.command = nc;
    }
    return this;
};
/**
 * Set the reply-required option.
 * @param {Boolean} [rq=true]
 * @returns {swatk6_packet}
 */
swatk6_packet.prototype.requireReply = function(rq) {
    if (typeof rq === 'undefined') {
	rq = true;
    }
    this.options.reply = rq === true;
    return this;
};
/**
 * Returns true if a reply is required for this packet.
 * @returns {Boolean}
 */
swatk6_packet.prototype.requiresReply = function() {
    return this.options.reply;
};
/**
 * Set the do-not-reconnect-after-receiving-this-packet option.
 * @param {Boolean} [rq=true]
 * @returns {swatk6_packet}
 */
swatk6_packet.prototype.noReconnectAfter = function(rq) {
    if (typeof rq === 'undefined') {
	rq = true;
    }
    this.options.donotreconnect = rq === true;
    return this;
};
/**
 * Returns the current state of the do-not-reconnect-after-receiving-this-packet option.
 * @returns {Boolean}
 */
swatk6_packet.prototype.doesntReconnectAfter = function() {
    return this.options.donotreconnect;
};
/**
 * Returns true if this packet is a request.
 * @returns {Boolean}
 */
swatk6_packet.prototype.isRequest = function() {
    return (this.options.type==='RQ');
};
/**
 * Returns true if this packet is a response.
 * @returns {Boolean}
 */
swatk6_packet.prototype.isResponse = function() {
    return (this.options.type==='RP');
};
/**
 * Set the block-ui-while-in-transit option.
 * @param {Boolean} [rq=true]
 * @returns {swatk6_packet}
 */
swatk6_packet.prototype.blockUI = function(rq) {
    if (typeof rq === 'undefined') {
	rq = true;
    }
    this.options.blockui = rq === true;
    return this;
};
/**
 * Returns the current state of the block-ui-while-in-transit option.
 * @returns {Boolean}
 */
swatk6_packet.prototype.blocksUI = function() {
    return this.options.blockui;
};

/*
 * ----------------------------------------------------------------------------
 * STATE MACHINE METHODS
 * ----------------------------------------------------------------------------
 */
/**
 * Returns true if UI should be blocked now.
 * @returns {Boolean} 
 */
swatk6_packet.prototype.shouldBlockUI = function() {
    return this.options.blockui===true && (this._commdata.sendstate==='sending' || this._commdata.sendstate==='replywait');
};
/**
 * Returns true if packet can be sent now.
 * @returns {Boolean} 
 */
swatk6_packet.prototype.canBeSent = function() {
    var nt = new Date().getTime();
    return this._commdata.sendstate==='queue' && this._commdata.sendwhen<nt ? true : false;
};
/**
 * Returns true if packet has completed its trip and can be discarded.
 * @returns {Boolean} 
 */
swatk6_packet.prototype.canBeRemoved = function() {
    return this._commdata.sendstate==='failed' || this._commdata.sendstate==='completed' ? true : false;
};
/**
 * Returns true if packet has timed out.
 * @returns {Boolean} 
 */
swatk6_packet.prototype.isTimedOut = function() {
    var nt = new Date().getTime();
    return (this._commdata.sendstate==='sending' || this._commdata.sendstate==='replywait') && this._commdata.timesout>0 && this._commdata.timesout<=nt ? true : false;
};
/**
 * Returns true if packet is currently in transit.
 * @returns {Boolean} 
 */
swatk6_packet.prototype.isActive = function() {
    return this._commdata.sendstate==='replywait' || this._commdata.sendstate==='sending';
};
/**
 * Returns true if packet is currently suspended.
 * @returns {Boolean} 
 */
swatk6_packet.prototype.isSuspended = function() {
    return this._commdata.suspended===true;
};
/**
 * Set whether the packet should be suspended (by the queue manager, usually).
 * @param {Boolean} [rq=true]
 * @returns {swatk6_packet}
 */
swatk6_packet.prototype.suspend = function(rq) {
    if (typeof rq === 'undefined') {
	rq = true;
    }
    this._commdata.suspended = rq === true;
    return this;
};
/**
 * Set packet's state to newstate and execute attached conditions.
 * @param {String} newstate 'failed'|'timeout'|'replywait'|'queue'|'sending'|'completed'
 * @returns {Array} [sending,completed,failed] = true or false if the respective event should be emitted in the queue manager
 */
swatk6_packet.prototype.toState = function(newstate) {
    var sending = null;
    var completed = null;
    var failed = null;
    var nt = new Date().getTime();
    // set when the packet timed out or failed
    if (newstate === 'failed' || newstate === 'timeout') {
	if (this._commdata.sendstate === 'sending') {
	    sending = false;
	}
	this._commdata.sendstate = newstate;
	this._commdata.sendwhen = 0;
	this._commdata.timesout = 0;
	//console.log('packet failed, retries: ' + this._commdata.retries);
	if (this._commdata.retries > 0) {
	    //console.log('retrying');
	    --this._commdata.retries;
	    this._commdata.sendwhen = nt + this._commdata.retrywait * 1000;
	    this._commdata.sendstate = 'queue';
	} else {
	    this._commdata.sendstate = 'failed';
	    failed = true;
	}
    }
    // set when the packet was sent but is waiting for a reply
    else if (newstate === 'replywait') {
	this._commdata.sendstate = newstate;
	this._commdata.sendwhen = 0;
	if (this._commdata.replytimeout > 0) {
	    this._commdata.timesout = nt + this._commdata.replytimeout * 1000;
	}
    }
    // set when the packet is enqueued
    else if (newstate === 'queue') {
	if (this._commdata.sendstate === 'sending') {
	    sending = false;
	}
	this._commdata.sendstate = newstate;
	this._commdata.sendwhen = 0;
	this._commdata.timesout = 0;
    }
    // set when the packet is sent
    else if (newstate === 'sending') {
	if (this._commdata.sendstate !== 'sending') {
	    sending = true;
	}
	this._commdata.sendstate = newstate;
	this._commdata.sendwhen = 0;
	this._commdata.timesout = 0;
	this._commdata.lastsent = nt;
	if (this._commdata.timeout > 0) {
	    this._commdata.timesout = nt + this._commdata.timeout * 1000;
	}
    }
    // set when the packet is completed
    else if (newstate === 'completed') {
	if (this._commdata.sendstate === 'sending') {
	    sending = false;
	}
	completed = true;
	this._commdata.sendstate = newstate;
	this._commdata.sendwhen = 0;
	this._commdata.timesout = 0;
    }
    return [sending, completed, failed];
};


/*
 * ----------------------------------------------------------------------------
 * HOUSEKEEPING METHODS
 * ----------------------------------------------------------------------------
 */
/**
 * Adds the current state to the state stack.
 * @returns {swatk6_packet}
 */
swatk6_packet.prototype.addState = function() {
    this.states.push({command:this.command,target:this.target,origin:this.origin,payload:this.payload,'type':this.options.type,sessionid:this.sessionid});
    return this;
};
/**
 * Links the _commdata.responselink prop to a response/websocket link.
 * @param {Object} resplink the response/websocket link object.
 * @returns {swatk6_packet}
 */
swatk6_packet.prototype.link = function(resplink) {
    this._commdata.responselink = resplink;
    return this;
};
/**
 * Unlinks the responselink object so that can be collected as well.
 * @returns {swatk6_packet}
 */
swatk6_packet.prototype.unlink = function() {
    this._commdata.responselink = null;
    this.states = [];
    return this;
};
/**
 * Deep-copies the packet object, and changes the prop names in the copy to shorthand if necessary.
 * 
 * It only deep-copies this.payload, as it can be anything. It copies this.options one by one, and uses the shorthand names if necessary. All other props are simple values.
 * 
 * @param {Boolean} [lit=false] if false, it uses the shorthand prop names in the copy.
 * @returns {Object}
 */
swatk6_packet.prototype.copy = function(lit) {
    if (typeof lit === 'undefined') {
	lit = false;
    }
    var o = {}, pn, pnl, pv;
    for (var n in swatk6_packet.allowedKeysMain) {
	pnl = swatk6_packet.paramnames[n];
	if (pnl==='options') {
	    pv = {};
	    for (var m in swatk6_packet.allowedKeysOpt) {
		pv[m] = this.options[swatk6_packet.optnames[m]];
	    }
	}
	else if (pnl==='payload') {
	    pv = JSON.parse(JSON.stringify(this.payload));
	}
	else {
	    pv = this[pnl];
	}
	pn = lit === true ? swatk6_packet.paramnames[n] : n;
	o[pn] = pv;
    }
    return o;
};
/**
 * Create a clone of this packet, using this.copy and a few extra options.
 * 
 * This copy does not receive from the original:
 * - this.states
 * - this._commdata.responselink
 * - this._commdata in toto
 * if the corresponding arguments are not true.
 * 
 * @param {Boolean} [copyresplink=true] if true, clone this packet's responselink object to the new one as well
 * @param {Boolean} [copycommdata=false] if true, clone this packet's entire ._commdata property as well.
 * @param {Boolean} [copystates=false] if true, clone this packet's entire .states property as well.
 * @returns {swatk6_packet}
 */
swatk6_packet.prototype.clone = function(copyresplink,copycommdata,copystates) {
    if (typeof copyresplink === 'undefined') {
	copyresplink = true;
    }
    if (typeof copycommdata === 'undefined') {
	copycommdata = false;
    }
    if (typeof copystates === 'undefined') {
	copystates = false;
    }
    var o = new swatk6_packet(this.copy(true));
    if (copycommdata === true) {
	for(var n in Object.getOwnPropertyNames(this._commdata)) {
	    if (n!=='responselink') {
		o._commdata[n] = this._commdata[n];
	    }
	}
    }
    if (copyresplink === true) {
	o._commdata.responselink = this._commdata.responselink;
    }
    if (copystates === true) {
	o.states = JSON.parse(JSON.stringify(this.states));
    }
    return o;
};
/**
 * Returns the packet cloned and serialized to be sent on its merry way.
 * @returns {String|Buffer}
 */
swatk6_packet.prototype.cloneForSend = function() {
    return swatk6_packet.coderDecoder(this.copy(),'encode');
};

/*
 * ----------------------------------------------------------------------------
 * STATIC DEFINITIONS
 * ----------------------------------------------------------------------------
 */
swatk6_packet.version = '1.1.1';
/**
 * The built-in JSON-based serializer or deserializer.
 * @param {*} ind data to encode or decode
 * @param {String} dir either 'encode' to return a serialized format, or 'decode', to return a deserialized object
 * @returns {String|Object}
 */
swatk6_packet.jsonPack = function(ind,dir) {
    if (dir==='encode') {
	return JSON.stringify(ind);
    }
    else {
	try {
	    var ded = JSON.parse(ind);
	    return ded;
	}
	catch(e) {
	    throw new Error('@swatk6/packet: incorrect packet data (JSON.parse failure)');
	}
    }
    return null;
};
/**
 * Simple unique ID generator.
 * @param {swatk6_packet} instan the instance for which the ID is generated
 * @returns {String}
 */
swatk6_packet.simpleId = function(instan) {
    var nt = new Date().getTime();
    return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1) + '-' + nt.toString();
};

/*
 * ----------------------------------------------------------------------------
 * STATIC DEFAULTS, CHANGE THEM AND ALL PACKETS WILL USE THE NEW OPTIONS
 * ----------------------------------------------------------------------------
 */
/** @type {Function} set this to the serializer/deserializer function you want to use as default (uses JSON as def) */
swatk6_packet.coderDecoder = swatk6_packet.jsonPack;
/** @type {Function} set this to the default packet sequence ID creator function */
swatk6_packet.makeSeqId = swatk6_packet.simpleId;
/** @type {Boolean} set the default value for options.requestack (true) */
swatk6_packet.defaultRequestAck = true;
/** @type {Boolean} set the default value for options.blockui (false) */
swatk6_packet.defaultBlocksUI = true;

/*
 * ----------------------------------------------------------------------------
 * DO NOT CHANGE ANY OF THESE BELOW; YOU CAN EXPAND THEM, THOUGH
 * ----------------------------------------------------------------------------
 */
swatk6_packet.paramnames = {
    CO: 'command',
    TA: 'target',
    OR: 'origin',
    PL: 'payload',
    OP: 'options',
    SI: 'sessionid',
    SQ: 'seqid',
    SS: 'seqserial',
    ST: 'status'
};
swatk6_packet.optnames = {
    RR: 'reply',
    RA: 'requestack',
    DA: 'destroyafter',
    NR: 'donotreconnect',
    BU: 'blockui',
    TY: 'type',
    LA: 'layer'
};
swatk6_packet.allowedKeysMain = Object.getOwnPropertyNames(swatk6_packet.paramnames);
swatk6_packet.allowedPropsMain = [];
var _q;
for(_q=0;_q<swatk6_packet.allowedKeysMain.length;_q++) {
    swatk6_packet.allowedPropsMain.push(swatk6_packet.paramnames[swatk6_packet.allowedKeysMain[_q]]);
}
swatk6_packet.allowedKeysOpt = Object.getOwnPropertyNames(swatk6_packet.optnames);
swatk6_packet.allowedPropsOpt = [];
for(_q=0;_q<swatk6_packet.allowedKeysOpt.length;_q++) {
    swatk6_packet.allowedPropsOpt.push(swatk6_packet.optnames[swatk6_packet.allowedKeysOpt[_q]]);
}

module.exports = swatk6_packet;
