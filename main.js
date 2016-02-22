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

// Transmission stuff -------------------------------

var Transmission = require('transmission');
var transmission = new Transmission({
	port: 9091,
	host: '52.90.33.177',
	username: 'rambo',
	password: 'qwerty'
});

// getTorrents();

function getTorrents(){
	getAllActiveTorrents(function(res){
		console.log(res);
	});
}

function getAllActiveTorrents(caller){
	transmission.active(function(err, result){
		if (err){
			console.log(err);
		}
		else {
			var arr=[];

			for (var i=0; i< result.torrents.length; i++){
				var data = {
					id : result.torrents[i].id,
					name : result.torrents[i].name,
					val : result.torrents[i].percentDone*100,
					down : result.torrents[i].rateDownload/1000,
					up : result.torrents[i].rateUpload/1000,
					eta : result.torrents[i].eta/3600 >>> 0,			//TODO : better time management
					status : getStatusType(result.torrents[i].status)
				};
				arr.push(data);
			}
			caller(JSON.stringify(arr));
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
	});
}

function startTorrent(id){
	transmission.start(id, function(err, result){});
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

	var timeoutId;

	console.log('a user connected');
	socket.on('disconnect',function(){
		console.log('a user disconnected');
		clearInterval(timeoutId);
	});

	socket.on('addLink', function(link){
		addTorrent(link);
	});

	socket.on('getTransferList', function(msg){
		timeoutId = setInterval(function(){
			getAllActiveTorrents(function(res){
				//console.log(res);
				socket.emit('transferList',res);
			});
		}, 1000);
	});

	socket.on('start',function(id){
		startTorrent(id);
	});

	socket.on('pause',function(id){
		stopTorrent(id);
	});

	socket.on('delete',function(id){
		removeTorrent(id);
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