

Transmission = require('transmission');
transmission = new Transmission({
	port: 9091,
	host: '192.168.1.69',
	username: 'rambo',
	password: 'qwerty'
});

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

function addTorrent(){
	transmission.addUrl('magnet:?xt=urn:btih:7EC0EC7275D8F78884B6CCEC7D8D0B0063D8FCC4&dn=ride+along+2+2016+hdrip+hc+x264+aac+viznu+p2pdl&tr=udp%3A%2F%2Ftracker.publicbt.com%3A80%2Fannounce&tr=udp%3A%2F%2Fglotorrents.pw%3A6969%2Fannounce', {
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

getTorrentDetails(5);

function getTorrentDetails(id) {
    transmission.get(id, function(err, result) {
        if (err) {
            throw err;
        }
        console.log('bt.get returned ' + result.torrents.length + ' torrents');
        console.log(result.torrents[0]);
//        result.torrents.forEach(function(torrent) {
//            console.log('hashString', torrent.hashString);
//        })
    });
}

function removeTorrent(id) {
    transmission.remove(id, function(err) {
        if (err) {
            throw err;
        }
        console.log('torrent was removed');
    })
}
