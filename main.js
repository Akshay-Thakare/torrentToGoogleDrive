/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Akshay Thakare. All rights reserved.
 *  Licensed under the MIT License. See license.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// NOTE : I have written code for uploading folders recursively to Google Drive which has not been integrated here.
// Feel free to go through my repos and find that code and do justice to it :p

// 'use strict';			//Doesnt work in old node on compute engine.

// Declarations -------------------------------------------------------------------------------------------------

var express = require("express"), 
	app = require('express')(), 
	fs = require('fs'),
	untildify = require('untildify'),
	diskspace = require('diskspace'),
	rimraf = require('rimraf'),
	mysql = require('mysql'),
	Transmission = require('transmission'),
	google = require('googleapis'),
	recursive = require('recursive-readdir');

// Initializations ----------------------------------------------------------------------------------------------

app.set('port', (process.env.PORT || 8080));
var http = require('http').createServer(app);

http.listen(app.get('port'), function(){
	console.log('listening on *:' + app.get('port'));
});

var io = require('socket.io')(http);

app.use('/public', express.static(__dirname + '/public'));

app.get('/', function(req, res){
	res.sendFile(__dirname + '/public/html/landing.html');
});

app.get('/home', function(req, res){
	if(userEmail == '' || userEmail == null)
		res.sendFile(__dirname + '/public/html/err.html');
	else
		res.sendFile(__dirname + '/transfer.html');
});

app.get('/files', function(req, res){
	if(userEmail == '' || userEmail == null)
		res.sendFile(__dirname + '/public/html/err.html');
	else
		res.sendFile(__dirname + '/files.html');
});

app.get('/err', function(req, res){
	res.sendFile(__dirname + '/public/html/err.html');
});

app.get('/startAuth',function(req, res) {
    var url = oauth2Client.generateAuthUrl({
		access_type: 'offline', // 'online' (default) or 'offline' (gets refresh_token)
		scope: scopes // If you only need one scope you can pass it as string
	});
	
	res.redirect(url);
});

app.get('/oauthcallback', function(req, res){
    // res.end();
	// console.log(req.query.code);
	getToken(req.query.code, function(resp){
		if(resp == 'err'){
			res.redirect("http://akshay.xyz:8080/err");
		} else {
			res.redirect("http://akshay.xyz:8080/home");	
			createPlatformDirOnDrive();
		}
	});
});

app.get('*', function(req, res){
  res.status(404).send('You are in the wrong neighbourhood bro. Back off.');
});

// Database stuff ----------------------------------------------------------------------------------------------

//TODO : Start using connection pooling
var connection = mysql.createConnection({
  host     : 'localhost',
  user     : 'TRANSMISSION_USERNAME',
  password : 'TRANSMISSION_PASSWORD',
  database : 'transmit'
});
initDatabaseTables();
/*
Schema - Draft 5

We are not storing access / refresh token for security reasons.

userDetails
GoogleId | Name | Email | TimeStamp
//TODO : Add AccessCount in future to keep track of site popularity

userStorageDetails
GoogleId | Used | Total

torrentDetails
HashString | Name | Size (Float MB) | Location | TimeStamp

userTorrentDetails
GoogleId | HashString

userUploadDetails
GoogleId | HashString | Status

userFolderDetails
GoogleId | FolderId

*/

function initDatabaseTables(){
	connection.query('CREATE TABLE IF NOT EXISTS userDetails (GoogleId VARCHAR(21) NOT NULL UNIQUE, Name VARCHAR(100) NOT NULL, Email VARCHAR(100) NOT NULL UNIQUE, TimeStamp TIMESTAMP NOT NULL DEFAULT NOW(), PRIMARY KEY(GoogleId))', function(err, rows, fields) { if (err) console.log(err); 
	// else console.log('created userDetails table'); 
	});
	connection.query('CREATE TABLE IF NOT EXISTS userStorageDetails (GoogleId VARCHAR(21) NOT NULL UNIQUE, Used INTEGER NOT NULL, Total FLOAT NOT NULL DEFAULT \'2048.0\', PRIMARY KEY (GoogleId))', function(err, rows, fields) { if (err) console.log(err); 
	// else console.log('created userStorageDetails table');
	});
	connection.query('CREATE TABLE IF NOT EXISTS torrentDetails (HashString VARCHAR(50) NOT NULL UNIQUE, Name VARCHAR(100) NOT NULL, Size FLOAT, Location VARCHAR(255) NOT NULL, TimeStamp TIMESTAMP NOT NULL DEFAULT NOW(), PRIMARY KEY (HashString))', function(err, rows, fields) { if (err) console.log(err); 
	// else console.log('created torrentDetails table');
	});
	connection.query('CREATE TABLE IF NOT EXISTS userTorrentDetails (GoogleId VARCHAR(21) NOT NULL, HashString VARCHAR(50) NOT NULL)', function(err, rows, fields) { if (err) console.log(err); 
	// else console.log('created userTorrentDetails table');
	});
	connection.query('CREATE TABLE IF NOT EXISTS userUploadDetails (GoogleId VARCHAR(21) NOT NULL, HashString VARCHAR(50) NOT NULL, Status INTEGER NOT NULL)', function(err, rows, fields) { if (err) console.log(err); 
	// else console.log('created userUploadDetails table');
	});
	connection.query('CREATE TABLE IF NOT EXISTS userFolderDetails (GoogleId VARCHAR(21) NOT NULL, FolderId VARCHAR(50) NOT NULL)', function(err, rows, fields) { if (err) console.log(err); 
	// else console.log('created userTorrentDetails table');
	});
}

// - Insert / Update / Delete Queries
function insertUserDetails(id, name, email){ connection.query("INSERT INTO userDetails (GoogleId, Name, Email) VALUES ("+id+",\""+name+"\",\""+email+"\")", function(err, rows, fields) { 
	if (err) { 
		// console.log(err); 
		if (err.errno == 1062) {	//Duplicate entry
			// console.log(id);
			connection.query("UPDATE userDetails SET TimeStamp=NOW() WHERE GoogleId=\""+id+"\"", function(err, rows, fields) { 
				if(err) console.log("user details update err"); else console.log("user details update success");
			});
		}
	} else console.log('added user details'); 
	
});}

// |- userStorageDetails
function insertUserStorageDetails(id, used){ connection.query("INSERT INTO userStorageDetails (GoogleId, Used) VALUES ("+id+","+used+")", function(err, rows, fields) { if (err) console.log(err); else console.log('added user storage details'); });}
function updateUserTotalStorageAllocation(id,total){ connection.query("UPDATE userStorageDetails SET Total="+total+" where GoogleId="+id+";", function(err, rows, fields) { if (err) console.log(err); else console.log('updated user total storage details'); });}
function updateUserUsedStorageAllocation(id,used){ connection.query("UPDATE userStorageDetails SET Used="+used+" where GoogleId="+id+";", function(err, rows, fields) { if (err) console.log(err); else console.log('updated user used storage details'); });}

// |- torrentDetails
function insertTorrentDetails(hashString, name, size, location){ connection.query("INSERT INTO torrentDetails (HashString, Name, Size, Location) VALUES (\""+hashString+"\",\""+name+"\","+size+",\""+location+"\");", function(err, rows, fields) { if (err) console.log(err); else console.log('added new torrent details to db'); });}
function deleteTorrentDetails(hashString){ connection.query("DELETE FROM torrentDetails where HashString=\""+hashString+"\"", function(err, rows, fields) { if (err) console.log(err); else console.log('delete torrent details from db'); });}

// |- userTorrentDetails
function insertUserTorrentDetails(googleId, hashString){ connection.query("INSERT INTO userTorrentDetails (GoogleId, HashString) VALUES (\""+googleId+"\",\""+hashString+"\");", function(err, rows, fields) { if (err) console.log(err); else console.log('added new user torrent details to db'); });}
function deleteUserTorrentDetails(googleId, hashString){ connection.query("DELETE FROM userTorrentDetails where HashString=\""+hashString+"\" and GoogleId=\""+googleId+"\";", function(err, rows, fields) { if (err) console.log(err); else console.log('delete user torrent details from db'); });}

// |- userUploadDetails
function insertUploadDetails(googleId, hashString, status){ connection.query("INSERT INTO userUploadDetails (GoogleId, HashString, Status) VALUES (\""+googleId+"\",\""+hashString+"\""+status+");", function(err, rows, fields) { if (err) console.log(err); else console.log('added user upload details to db'); });}
function updateUploadDetails(hashString, status){ connection.query("UPDATE userUploadDetails SET Status="+status+" where HashString="+hashString+";", function(err, rows, fields) { if (err) console.log(err); else console.log('updated user upload details'); });}
function deleteUploadDetails(hashString){ connection.query("DELETE FROM userUploadDetails where HashString=\""+hashString+"\"", function(err, rows, fields) { if (err) console.log(err); else console.log('delete user upload details from db'); });}

// |- userFolderDetails
function insertUserFolderDetails(googleId, folderId){ connection.query("INSERT INTO userFolderDetails (GoogleId, FolderId) VALUES (\""+googleId+"\",\""+folderId+"\");", function(err, rows, fields) { if (err) console.log(err); else console.log('added new user folder id details to db'); });}
function updateUserFolderDetails(googleId, folderId){ connection.query("UPDATE userFolderDetails SET FolderId=\""+folderId+"\" where GoogleId="+googleId+";", function(err, rows, fields) { if (err) console.log(err); else console.log('updated user folder id details'); });}

// Read Queries
function getuserFolderId(id, callback){
	connection.query("SELECT * FROM userFolderDetails where GoogleId="+id+";", function(err, rows, fields) {
	    if(err) console.log(err);
	    else {
	    	// console.log(rows);		//TODO : Parse and return rows
	    	callback(rows);
	    }
	});	
}

function getUserTorrents(id,callback){
	connection.query("SELECT * FROM userTorrentDetails where GoogleId="+id+";", function(err, rows, fields) {
	    if(err) console.log(err);
	    else {
	    	// console.log(rows);		//TODO : Parse and return rows
	    	callback(rows);
	    }
	});
};

function getTorrentUsers(hash, callback){
	connection.query("SELECT * FROM userTorrentDetails where HashString='"+hash+"';", function(err, rows, fields) {
	    if(err) console.log(err);
	    else {
	    	// console.log(rows);		//TODO : Parse and return rows
	    	callback(rows);
	    }
	});
}

// Transmission stuff ----------------------------------------------------------------------------------------------

var transmission = new Transmission({
	port: 9091,
	host: 'REMOTE_TRANSMISSION_IP',
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

// TODO : remove this useless function.
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
					status : getStatusType(result.torrents[i].status),
					hash : result.torrents[i].hashString
				};
				arr.push(data);
			}
			caller(JSON.stringify(arr));
		}
	});
}

function getUsersActiveTorrents(caller, hash){
	
}

function addTorrent(url, callback){
	if(googleId != null){
		console.log(url);
		transmission.addUrl(url, {
		    "download-dir" : "~/Downloads"
		}, function(err, result) {
			if (err) {
				console.log(err);
			} else {
				insertUserTorrentDetails(googleId, result.hashString);
				callback();
	
				// var localTimeoutId = setInterval(function(){
				// 	getTorrent(result.id, function(res){
				// 		if(res>0){
				// 			clearInterval(localTimeoutId);
				// 			console.log(res);
				// 		}
				// 	});
				// }, 1000);
				/*
				{ 	hashString: '31ba3afb0fa231f6582900ce11c839b12bb95f1d',
	  				id: 1,
	  				name: 'wefw' }
				*/
			}
		});
	}
}

function getTorrent(id, callback) {
    transmission.get(id, function(err, result) {
        if (err) {
            throw err
        }
        // console.log(result.torrents[0].sizeWhenDone);
        callback(result.torrents[0].sizeWhenDone)
        // sizeWhenDone
        
        // removeTorrent(id);
    });
}

function startTorrent(id){
	transmission.start(id, function(err, result){});
}

function stopTorrent(id){
	transmission.stop(id, function(err, result){});
}

function removeTorrent(id) {
	// Deletes torrents data too.
    transmission.remove(id,true, function(err) {if (err) {throw err;}});
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
	// connection.connect(function(err){
	// 	if(err){
	// 		console.log("DB connect error");
	// 		console.log(err);
	// 	} else {
	// 		insertUserDetails(googleId, userName, userEmail);			// Insert user details into db
	// 	}
	// });					// Connect to DB after user signin
	console.log('a user connected');

	socket.on('disconnect',function(){
		// connection.end(function(err){
		// 	if(err){
		// 		console.log(err);
		// 		console.log("DB close error");
		// 	}
		// });					// Disconnect to DB after user leaves
		console.log('a user disconnected');
		clearInterval(timeoutId);
	});

	socket.on('addLink', function(link){
		console.log(link);
		addTorrent(link, function(){
			// TODO : Emit updated torrent list
			getTransferListFunc(function(res){
				socket.emit('transferList',res);
			});
		});
	});

	socket.on('getTransferList', function(msg){
		getStats();	// Init torrents - workaround
		// Old Global Torrent List
		// timeoutId = setInterval(function(){
		// 	getAllActiveTorrents(function(res){
		// 		//console.log(res);
		// 		socket.emit('transferList',res);
		// 	});
		// }, 1000);
		
		// New - User Specific torrent List
		// Step 1 : Get all active user torrents
		
		// TODO : this is a bad hack find a better method
		timeoutId = setInterval(function(){
			getTransferListFunc(function(res){
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

	socket.on('delete',function(res){
		console.log('got del request');
		var data = JSON.parse(res);
		getTorrentUsers(data.hash, function(res){
			if(res.length == 1){
				removeTorrent(data.id);
				deleteUserTorrentDetails(googleId,data.hash);
			} else {
				deleteUserTorrentDetails(googleId,data.hash);
			}
		});
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
		// { file_name: 'test', file_path: '/' }
		// console.log(file_details);
		uploadFile2(file_details.file_path, file_details.file_name, function(){
			console.log('done uploading');
			socket.emit('uploadComplete','');
		});
	});
	// TODO : Add disk space available to user
	
	// TODO : handle err in case next request is for sub folder deletion
	socket.on('delete_file',function(file_details){
		console.log('del file : '+file_details);
		file_details = JSON.parse(file_details);
		// fs.unlinkSync();			// Old school
		// var path = untildify("~"+"/workspace/incomplete"+file_details.file_path+"/"+file_details.file_name);
		var path = untildify("~"+"/Downloads"+file_details.file_path+"/"+file_details.file_name);
		if(file_details.file_name.indexOf('.') > -1)
			fs.unlinkSync(path);
		else 
			rimraf(path, function(err){
				console.log(err);			//TODO : Handle errors
			});
		socket.emit('fileDeleteDone','');
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

function getTransferListFunc(callback){
	var arr = [];
	getUserTorrents(googleId, function(res){
			getAllActiveTorrents(function(res_torrents){
				res_torrents = JSON.parse(res_torrents);
				console.log(res_torrents);
				// TODO : Find a better matching function this is daam inefficient
				for(var i=0;i<res_torrents.length;i++){
					for(var j=0;j<res.length;j++){
						if((res[j].HashString).localeCompare(res_torrents[i].hash) == 0){
							arr.push(res_torrents[i])
						}
					}
				}
				callback(JSON.stringify(arr));
			});
		});
}

// File reader stuff ----------------------------------------------------------------------------------------------

function listCompletedDownloads(path, caller){
	var path = untildify("~/Downloads"+path);
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

var OAuth2Client = google.auth.OAuth2;

const CLIENT_ID = "OAUTH_CLIENT_ID_GOOGLE";
const CLIENT_SECRET = "OAUTH_CLIENT_SECRET_GOOGLE";

var token;

const REDIRECT_URL = "http://akshay.xyz:8080/oauthcallback";

var oauth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URL);

// generate a url that asks permissions for Google+ and Google Calendar scopes
var scopes = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/drive.appfolder',
    'https://www.googleapis.com/auth/drive.metadata',
    'https://www.googleapis.com/auth/drive.appdata',
    'https://www.googleapis.com/auth/drive.file',
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

var userName, userEmail, googleId;
function getProfile(callback){
	var plus = google.plus('v1');
    plus.people.get({ userId: 'me', auth: oauth2Client }, function(err, response) {
		// handle err and response
		if(err){
			console.log(err);
			//TODO : Else show error page
			callback('err');
		} else {
			// console.log(response);
			googleId = response.id;
			userName = response.displayName;
			userEmail = response.emails[0].value;
			insertUserDetails(googleId, userName, userEmail);			// Insert user details into db
			callback('suc');
		}
	});
}

function uploadFile2(file_path, file_name, callback){
	
	// { file_name: 'test', file_path: '/' }
	var drive = google.drive('v2');
	var path = untildify("~/Downloads"+file_path+file_name);
	console.log('start upload');
	console.log('folder id : '+folderID);

	if(fs.lstatSync(path).isDirectory()){
		// TODO : Create recursive folder structures. The current implementation ignores it.
		recursive(path, function (err, files) {
			for(var i=0;i<files.length;i++){
				var req = drive.files.insert({
					resource: {
						title: files[i].split("/").pop(),
						parents: folderID
					},
					media: {
						body: fs.createReadStream(files[i])
					},
					auth: oauth2Client
				}, function(err, response, body) {
					if (err) {
						console.log(err);
					} else {
						if(i == (files.length)){
							console.log('finish upload');
							callback();
						}
					}
				});
			}
		  	console.log(files);
		});
	} else {		// It's a file
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
				// console.log(response.parents.pop().id);
				
				if(folderID != null){
					// var drive = google.drive('v2');
					drive.files.patch({
						fileId: response.id,
						addParents: folderID,
						removeParents: response.parents.pop().id,
						// fields: 'id, parents',
						auth: oauth2Client
					}, function(err, file) {
						if(err) {
						// Handle error
							console.log('patch err '+err);
						} else {
							console.log('hurray');
						// File moved.
						}
					});
					
					drive.children.insert({
						folderId: folderID,
						resource: {
							id: response.id
						},
						auth: oauth2Client
					}, function(err, response) {
						console.log(err, response);
					});
				}
				
				console.log('finish upload');
				callback();
			}
		});
	}

	// var drive = google.drive('v2');
	// console.log('start upload');
	// var req = drive.files.insert({
	// 	resource: {
	// 		title: file_name
	// 	},
	// 	media: {
	// 		body: fs.createReadStream(path)
	// 	},
	// 	auth: oauth2Client
	// }, function(err, response, body) {
	// 	if (err) {
	// 		console.log(err);
	// 	} else {
	// 		console.log('finish upload');
	// 		clearInterval(q);
	// 		// callback();				//DEBUG
	// 	 	// console.log(response);
	// 	}
	// 	 //console.log(body);
	// });
	// var q = setInterval(function () {
 //        console.log("Uploaded: " + req.req.connection.bytesWritten);
 //    }, 250);
}

var folderID;

function listGoogleFiles(folderId, callback){
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
                // console.log('Files');
                var semaphore = 0;
                for (var i = 0; i < files.length; i++){
                    var file = files[i];
                    if(folderId.localeCompare(file.id) == 0){
                    	console.log('folderExists');
                    	semaphore++;
                    	callback(true);
                    }
                }
                if(i == (files.length) && semaphore!=1){
                	console.log('noFolderExists');
                	callback(false);
                } 
            }
        }
    });
}

function createPlatformDirOnDrive(){
	// TODO : Check if dir exists
	getuserFolderId(googleId, function(res){
		if(res.length > 0){
			var gFid = res[0].FolderId;
			// console.log(res[0].FolderId);
			//TODO : Check if folder exists on drive
			// console.log(res[0].FolderId);
			listGoogleFiles(gFid, function(res){
				console.log(res);
				if(res){
					console.log(gFid);
					folderID = gFid;
				} else {
					// console.log('create new folder');
					createFolder(function (res){
						updateUserFolderDetails(googleId, res);
						folderID = res;
					});
				}
			});
		} else {
			// TODO : Error handling
			createFolder(function (res){
				console.log(googleId);
				insertUserFolderDetails(googleId,res);
				folderID = res;
			});
		}
	});
}

function createFolder(callback){
	console.log('create folder');
	var drive = google.drive('v3');
	var fileMetadata = {
	  'name' : 'TTGD',
	  'mimeType' : 'application/vnd.google-apps.folder'
	};
	drive.files.create({
	   auth: oauth2Client,
	   resource: fileMetadata,
	   fields: 'id'
	}, function(err, file) {
	  if(err) {
	    // Handle error
	    console.log(err);
	  } else {
	    console.log('Folder Id: ', file.id);
	    callback(file.id);
	  }
	});
}
