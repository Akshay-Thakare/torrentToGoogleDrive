/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Akshay Thakare. All rights reserved.
 *  Licensed under the MIT License. See license.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

// Initializations ----------------------------------------------------------------------------------------------

var app = require('express')();
app.set('port', (process.env.PORT || 3000));
var http = require('http').createServer(app);

http.listen(app.get('port'), function(){
	console.log('listening on *:' + app.get('port'));
});

var io = require('socket.io')(http);

app.get('/', function(req, res){
	res.sendFile(__dirname + '/index.html');
});

app.get('/files.html', function(req, res){
	res.sendFile(__dirname + '/files.html');
});

// Transmission stuff ----------------------------------------------------------------------------------------------

var Transmission = require('transmission');
var transmission = new Transmission({
	port: 9091,
	host: '52.90.33.177',
	username: 'rambo',
	password: 'qwerty'
});

function getStats(){
	transmission.sessionStats(function(err, result){
		if(err){
			console.log(err);
		} else {
			// TODO : If all torrents are paused then none of the transfers will be active. This is a workaround for that problem
			if(result.activeTorrentCount === 0)
				for(var i=1;i<=result.torrentCount;i++)
					startTorrent(i);
		}
	});
}

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
					val : result.torrents[i].percentDone*100 >>> 0,
					down : result.torrents[i].rateDownload/1000 >>> 0,
					up : result.torrents[i].rateUpload/1000 >>> 0,
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
	}, function(err, result) {if (err) {console.log(err);}});
}

function startTorrent(id){
	transmission.start(id, function(err, result){});
}

function stopTorrent(id){
	transmission.stop(id, function(err, result){});
}

function removeTorrent(id) {
    transmission.remove(id, function(err) {if (err) {throw err;}});
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

//Socket.io listners ----------------------------------------------------------------------------------------------

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
		getStats();	// Init torrents - workaround
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

	socket.on('getFiles',function(path){
		listCompletedDownloads(path, function(res){
			socket.emit('takeFiles',res);
		});
	});

});

// File reader stuff ----------------------------------------------------------------------------------------------

var fs = require('fs');
var untildify = require('untildify');

function listCompletedDownloads(path, caller){
	var path = untildify("~/temp/incomplete");
	fs.readdir(path, function(err, items) {
		if(err)
			console.log(err);
	 	else{
	 		var arr=[];
	    	for (var i=0; i<items.length; i++) {
	    		if(items[i].charAt(0) != '.'){
    				// console.log(items[i]);
    				arr.push(items[i]);
	        	}
	    	}
	    	caller(JSON.stringify(arr));
		}
	});
}

// Reading file binary
function readBinary(path){
var fstatus = fs.statSync(PNG_FILE);
	fs.open(PNG_FILE, 'r', function(status, fileDescripter) {
		if (status) {
			callback(status.message);
			return;
		}
		
		var buffer = new Buffer(fstatus.size);
		fs.read(fileDescripter, buffer, 0, fstatus.size, 0, function(err, num) {
			console.log(buffer);
		});
	});
}








// Google drive stuff ----------------------------------------------------------------------------------------------

var google = require('googleapis');
var async = require('async');
var request = require('request');
var OAuth2Client = google.auth.OAuth2;

const CLIENT_ID = "";
const CLIENT_SECRET = "";
const REFRESH_TOKEN =  "";

app.get('/oauthcallback', function(req, res){
    res.end();
	console.log(req.query.code);
	getToken(req.query.code);
});

const REDIRECT_URL = "http://localhost:8080/oauthcallback";		// FAKE

var oauth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URL);

// generate a url that asks permissions for Google+ and Google Calendar scopes
var scopes = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/drive.file'
];

// var url = oauth2Client.generateAuthUrl({
//   access_type: 'offline', // 'online' (default) or 'offline' (gets refresh_token)
//   scope: scopes // If you only need one scope you can pass it as string
// });

// console.log(url);

function getToken(reqCode){
    oauth2Client.getToken(reqCode, function(err, tokens){
        if(err){
            console.log('getToken method error - '+err);
        } else {
            console.log(tokens);
            oauth2Client.setCredentials(tokens);
        }
    });
}

const token={};
  
oauth2Client.setCredentials({
    access_token: token.access_token
});

function listGoogleFiles(){
    var service = google.drive('v3');
    service.files.list({
        auth: oauth2Client,
        pageSize: 10,
        fields: "nextPageToken, files(id, name)"
    }, function(err, response){
        if(err){
            console.log("The API returned an error: " + err);
            return;
        } else {
            var files = response.files;
            if (files.length == 0){
                console.log("No files found.");
                return;
            } else {
                console.log('Files');
                for (var i = 0; i < files.length; i++){
                    var file = files[i];
                    console.log("%s (%s)", file.name, file.id);
                }
            }
        }
    });
}














