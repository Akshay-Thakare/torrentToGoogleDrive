/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Akshay Thakare. All rights reserved.
 *  Licensed under the MIT License. See license.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// 'use strict';			//Doesnt work in old node

// Initializations ----------------------------------------------------------------------------------------------

var express = require("express");
var app = require('express')();
var fs = require('fs');
var untildify = require('untildify');
var diskspace = require('diskspace');
var rimraf = require('rimraf');

app.set('port', (process.env.PORT || 8080));
var http = require('http').createServer(app);

http.listen(app.get('port'), function(){
	console.log('listening on *:' + app.get('port'));
});

var io = require('socket.io')(http);

app.use('/public', express.static(__dirname + '/public'));

app.get('/', function(req, res){
	res.sendFile(__dirname + '/start.html');
});

app.get('/startAuth',function(req, res) {
    var url = oauth2Client.generateAuthUrl({
		access_type: 'offline', // 'online' (default) or 'offline' (gets refresh_token)
		scope: scopes // If you only need one scope you can pass it as string
	});
	
	res.redirect(url);
});

app.get('/home', function(req, res){
	if(userEmail == '' || userEmail == null)
		res.sendFile(__dirname + '/err.html');
	else
		res.sendFile(__dirname + '/index.html');
});

app.get('/oauthcallback', function(req, res){
    // res.end();
	// console.log(req.query.code);
	getToken(req.query.code, function(resp){
		if(resp == 'err'){
			res.redirect("https://someurl:8080/err");
		} else {
			res.redirect("https://someurl:8080/home");	
		}
	});
});

app.get('/files', function(req, res){
	if(userEmail == '' || userEmail == null)
		res.sendFile(__dirname + '/err.html');
	else
		res.sendFile(__dirname + '/files.html');
});

app.get('/err', function(req, res){
	res.sendFile(__dirname + '/err.html');
});

app.get('/taffy_min.js', function(req,res){
	res.sendFile(__dirname + '/taffy_min.js');
});

// Transmission stuff ----------------------------------------------------------------------------------------------

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
		console.log('getFiles : '+path);
		listCompletedDownloads(path, function(res){
			// console.log(res);
			socket.emit('takeFiles',res);
		});
	});
	
	socket.on('emit_file',function(file_details){
		// console.log(file_details);
		file_details = JSON.parse(file_details);
		uploadFile2(file_details.file_path, file_details.file_name, function(){
			socket.emit('uploadComplete','');
		});
	});
	// TODO : Add disk space available to user
	
	socket.on('delete_file',function(file_details){
		console.log('del file : '+file_details);
		file_details = JSON.parse(file_details);
		// fs.unlinkSync();			// Old school
		// var path = untildify("~"+"/workspace/incomplete"+file_details.file_path+"/"+file_details.file_name);
		var path = untildify("~"+"/transmission"+file_details.file_path+"/"+file_details.file_name);
		if(file_details.file_name.indexOf('.') > -1)
			fs.unlinkSync(path);
		else 
			rimraf(path, function(err){
				console.log(err);			//TODO : Handle errors
			});
		socket.emit('fileDeleteDone','file_details');
	});
	
	socket.on('getUserName',function(blank){
		socket.emit('sendUserName',userName);
	});
	
	socket.on('getUserEmail',function(blank){
		socket.emit('sendUserEmail',userEmail);
	});
	
	socket.on('getDiskSpace',function(blank) {
	    diskspace.check('/', function (err, total, free, status)
		{
			// console.log((free/1000000000).toFixed(3));
			var val =  (free/1000000000).toFixed(3);
			if(val > 1){
				socket.emit('sendDiskSpace','Disk Space Left: '+val+' Gb');
			} else {
				val *= 100;
				socket.emit('sendDiskSpace','Disk Space Left: '+val+' mb');
			}
		});
		// socket.emit('sendDiskSpace','Disk Space Left: 0 mb');		//TODO : Fix bug
	});
});

// File reader stuff ----------------------------------------------------------------------------------------------

function listCompletedDownloads(path, caller){
	var path = untildify("~/workspace/incomplete"+path);
	// var path = untildify("~/transmission"+path);
	console.log(path);
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
	    	// console.log(JSON.stringify(arr));
	    	caller(JSON.stringify(arr));
		}
	});
}

// Google drive stuff ----------------------------------------------------------------------------------------------

var google = require('googleapis');
var OAuth2Client = google.auth.OAuth2;

const CLIENT_ID = "";
const CLIENT_SECRET = "";

var token;

const REDIRECT_URL = "https://someurl:8080/oauthcallback";

var oauth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URL);

// generate a url that asks permissions for Google+ and Google Calendar scopes
var scopes = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/plus.me',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
];

function getToken(reqCode, callback){
    oauth2Client.getToken(reqCode, function(err, tokens){
        if(err){
            console.log('getToken method error - '+err);
        } else {
            // console.log(tokens);
            oauth2Client.setCredentials(tokens);
            getProfile(function(resp){
            	callback(resp);
            });
        }
    });
}

var userName, userEmail;
function getProfile(callback){
	var plus = google.plus('v1');
    plus.people.get({ userId: 'me', auth: oauth2Client }, function(err, response) {
		// handle err and response
		if(err){
			console.log(err);
			//TODO : Else show error page
			callback('err');
		} else {
			userName = response.displayName;
			userEmail = response.emails[0].value;
			callback('suc');
		}
	});
}

function uploadFile2(file_path, file_name, callback){
	// var path = untildify("~/transmission"+file_path+file_name);
	// var path = untildify("~/transmission/incomplete/panda.mkv");
	var path = untildify("~/workspace/incomplete"+file_path+file_name);
	var drive = google.drive('v2');
	console.log('start upload');
	var req = drive.files.insert({
		resource: {
			title: file_name
		},
		media: {
			body: fs.createReadStream(path)
		},
		auth: oauth2Client
	}, function(err, response, body) {
		if (err) {
			console.log(err);
		} else {
			console.log('finish upload');
			callback();
		 	// console.log(response);
		}
		 //console.log(body);
	});

}

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