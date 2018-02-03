var responses = [];
function syncBlock(msecs) {
    var st = new Date().getTime(), et = null;
    do {
	et = new Date().getTime();
    } while((et-msecs)<=st);
}
function addResponse(resp) {
    responses.push(resp);
}
function matchResponses(expected) {
    var haderrors = false;
    for(var i=0;i<expected.length;i++) {
	if (typeof responses[i]==='undefined') {
	    console.error('mismatch at #'+i+', expected: ',expected[i],', got no counterpart');
	    haderrors = true;
	}
	else if (responses[i]!==expected[i]) {
	    console.error('mismatch at #'+i+', expected: ',expected[i],', got: ',responses[i]);
	    haderrors = true;
	}
    }
    if (responses.length>expected.length) {
	console.error('mismatch: more responses than expected, superflous part:',responses.slice(expected.length));
	haderrors = true;
    }
    if (haderrors===true) {
	process.exit(1);
    } else {
	console.info('all went as expected');
	process.exit(0);
    }
}

try {
    const packet = require('./index.js');
    var dump = {
	'CO':'test',
	'OR':'testsystem',
	'PL':{'one':1,'two':true},
	'OP':{
	    'RR':true,
	    'BU':true,
	    'TY':'RQ'
	}
    };
    var dumpjs = JSON.stringify(dump);
    var testpacket = new packet(dump);
    addResponse(testpacket.payload.two);
    testpacket.reply({'one':2,'two':null});
    addResponse(testpacket.payload.one);
    addResponse(testpacket.options.type);
    testpacket = new packet(dumpjs);
    addResponse(testpacket.command);
    addResponse(testpacket.payload.two);
    addResponse(testpacket.shouldBlockUI());
    testpacket._commdata['timeout'] = 2;
    testpacket.toState('sending');
    addResponse(testpacket.shouldBlockUI());
    syncBlock(1500);
    addResponse(testpacket.isTimedOut());
    syncBlock(1500);
    addResponse(testpacket.isTimedOut());
    testpacket.toState('failed');
    addResponse(testpacket.isActive());
    testpacket.ack();
    addResponse(testpacket.command);
}
catch(e) {
    addResponse(e);
}

matchResponses([true,2,'RP','test',true,false,true,false,true,false,'ACK']);
