'use strict';

var Transmission = require('transmission');
var transmission = new Transmission({
	port: 9091,
	host: '192.168.1.69',
	username: 'rambo',
	password: 'qwerty'
});

for(var i=0;i<10;i++){
	getTorrentDetails(i);
}

// Get details of all torrents
function getStats(){
	transmission.sessionStats(function(err, result){
	if(err){
		console.log(err);
	} else {
		console.log(result);
	}
	});
}

function deleteTorrent(id){
	transmission.remove(id, true, function(err, result){
		if (err){
			console.log(err);
		} else {
			console.log(result);
		}
	});
}

function addTorrent(url){
	transmission.addUrl(url, {
	    "download-dir" : "~/transmission/torrents"
	}, function(err, result) {
	    if (err) {
	        return console.log(err);
	    }
	    var id = result.id;
	    console.log('Just added a new torrent.');
	    console.log('Torrent ID: ' + id);
	});
}

function startTorrent(id){
	transmission.start(id, function(err, result){});
}

getAllActiveTorrents();

function getAllActiveTorrents(){
	transmission.active(function(err, result){
	if (err){
		console.log(err);
	}
	else {
		for (var i=0; i< result.torrents.length; i++){
			console.log(result.torrents[i].id);
			console.log(result.torrents[i].name);
		}
	}
	});
}

function stopAllActiveTorrents(){
	transmission.active(function(err, result){
	if (err){
		console.log(err);
	}
	else {
		for (var i=0; i< result.torrents.length; i++){
			stopTorrents(result.torrents[i].id);
		}
	}
	});
}

function stopTorrent(id){
	transmission.stop(id, function(err, result){});
}

function getTorrentDetails(id) {
    transmission.get(id, function(err, result) {
        if (err) {
            throw err;
        }
        if(result.torrents.length > 0){
        	// console.log(result.torrents[0]);
        	console.log("Name = "+ result.torrents[0].name);
        	console.log("Download Rate = "+ result.torrents[0].rateDownload/1000);
        	console.log("Upload Rate = "+ result.torrents[0].rateUpload/1000);
        	console.log("Completed = "+ result.torrents[0].percentDone*100);
        	console.log("ETA = "+ result.torrents[0].eta/3600);
        	console.log("Status = "+ getStatusType(result.torrents[0].status));
        }
    });
}

function getStatusType(type){
	if(type === 0){
		return 'STOPPED';
	} else if(type === 1){
		return 'CHECK_WAIT';
	} else if(type === 2){
		return 'CHECK';
	} else if(type === 3){
		return 'DOWNLOAD_WAIT';
	} else if(type === 4){
		return 'DOWNLOAD';
	} else if(type === 5){
		return 'SEED_WAIT';
	} else if(type === 6){
		return 'SEED';
	} else if(type === 7){
		return 'ISOLATED';
	}
}

function removeTorrent(id) {
    transmission.remove(id, function(err) {
        if (err) {
            throw err;
        }
        console.log('torrent was removed');
    });
}
