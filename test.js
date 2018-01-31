var responses = [];
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
    var testpacket = new packet();
    
}
catch(e) {
    addResponse(e);
}

/* TODO */

matchResponses([]);
