'use strict';

//Set up express framework
var app = require('express')();

//Set port given by heroku else set default port 3000
app.set('port', (process.env.PORT || 3000));

//Create http server - express 4 no longer supports 
//server creation
var http = require('http').createServer(app);

//Set http server to listen on this port
http.listen(app.get('port'), function(){
	console.log('listening on *:' + app.get('port'));
});

//Attach socket.io to the http server
var io = require('socket.io')(http);

//Set default get path / home path
app.get('/', function(req, res){
	res.sendFile(__dirname + '/index.html');
});

app.get('transfer.html', function(req, res){
	res.sendFile(__dirname + '/transfer.html');
});

//XHR polling doesnt seem to work with heroku :|
//io.set('transports', ['xhr-polling']);

// Transmission stuff -------------------------------

var Transmission = require('transmission');
var transmission = new Transmission({
	port: 9091,
	host: '127.0.0.1',
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

function getTorrentDetails(id) {
    transmission.get(id, function(err, result) {
        if (err) {
            throw err;
        }
        if(result.torrents.length > 0){
        	console.log("Name = "+ result.torrents[0].name);
        	console.log("Download Rate = "+ result.torrents[0].rateDownload/1000);
        	console.log("Upload Rate = "+ result.torrents[0].rateUpload/1000);
        	console.log("Completed = "+ result.torrents[0].percentDone*100);
        	console.log("ETA = "+ result.torrents[0].eta/3600);
        	console.log("Status = "+ getStatusType(result.torrents[0].status));
        }
    });
}

function stopTorrent(id){
	transmission.stop(id, function(err, result){});
}

function removeTorrent(id) {
    transmission.remove(id, function(err) {
        if (err) {
            throw err;
        }
        console.log('torrent was removed');
    });
}

// End Transmission stuff -------------------------------

//Socket.io listners
io.sockets.on('connection', function(socket){
	console.log('a user connected');
	socket.on('disconnect',function(){
		console.log('a user disconnected');
	});

	socket.on('addLink', function(link){
		console.log(link);
	});

	// socket.on('chat message',function(msg){
	// 	console.log('message: '+msg);
	// 	io.emit('chat message',msg);
	// });

	socket.on('getTransferList', function(msg){
		i=96;
		var timeoutId = setInterval(function(){
			if(i>100){
				clearInterval(timeoutId);
			} else {
				var data = {
					name : 'test',
					val : i,
					id : 123,
					down : i,
					up : i,
					status : 'Downloading',
					eta : (100-i)+' hr'
				};
				i++;

				socket.emit('transferList',JSON.stringify(data));
			}
		},1000);
	});
});







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