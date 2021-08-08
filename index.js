/*
=-=-=-=-=-=-=-=-=-=-=-=-
Album Art Search
=-=-=-=-=-=-=-=-=-=-=-=-
Student ID:
Comment (Required):

=-=-=-=-=-=-=-=-=-=-=-=-
*/

const http = require('http');
const port = 3000;
const server = http.createServer();
const {client_id, client_secret} = require(('./auth/mal.json'));
const token = require(('./auth/mal_token.json'));
const url = require('url');
const baseURL = 'https://api.myanimelist.net/v2';
const https = require("https");
const crypto = require("crypto");
const querystring = require('querystring');
const anime_id = [];
let result_cache = {};
const code_anime_pair = [];
server.on("request", connection_handler);
function connection_handler(req, res){
	const fs = require('fs');
	console.log(`New Request for ${req.url} from ${req.socket.remoteAddress}`);
	
	if(req.url == '/' || req.url.startsWith('/?code=') || req.url.startsWith('/?title=')){
		const main = fs.createReadStream('html/main.html');
		res.writeHead(200,{'content-type':'text/html'});
		main.pipe(res);
	}
	else if(req.url == '/favicon.ico'){
		const main = fs.createReadStream('images/favicon.ico');
		res.writeHead(200,{'content-type':'image/x-icon'});
		main.pipe(res);
	}
	else if(req.url == '/images/banner.jpg'){
		const main = fs.createReadStream('images/banner.jpg');
		res.writeHead(200,{'content-type':'image/jpeg'});
		main.pipe(res);
	}
	
	
	else if(req.url.startsWith('/code_in')){
		const sURL = url.parse(req.url);
		const wURL = new URL(sURL.path,'http://localhost:3000/');
		const code = (wURL.searchParams.get('code'));
		console.log(code);
        if(code === undefined){
			return;
		}
		const mal_anime_id = code_anime_pair.pop();
		console.log(mal_anime_id);
		send_access_token_request(code, mal_anime_id, res);
	}


	else if(req.url.startsWith('/authorize')){
	//mal stuff
	//if the anime_id array is empty just do a token find other wise do it wiht anime id
	console.log(req.headers);
	if(req.headers['cookie'] && req.headers['cookie'].includes('access_token')){
		let cook = req.headers['cookie'].split(';');
		for(let c of cook){
			if(c.startsWith('access_token=')){
				//has a token already
				const code_challenge = 0;

				const mal_id = anime_id.pop();
				code_anime_pair.push({mal_id,code_challenge});
				console.log(code_anime_pair[0]);
				const token = c.substr(c.indexOf('=')+1);
				const mal_anime_id = code_anime_pair.pop();
				send_add_anime_request(mal_anime_id,{access_token:token},res,false);
			}
		}
		
	}
	else{
		redirect_to_MAL(res);
	}
	
	}
	

	
	else if(req.url == '/temp_images'){

		if (req.method == 'POST') {
        let body = [];

        req.on('data', function (data) {
            body.push(data)
			
        });
        req.on('end', function () {
			body = Buffer.concat(body);
			const header = req.headers['content-type'];
			const length = req.headers['content-length'];
			const options = {
			"method": "POST",
			"hostname": "api.trace.moe",
			"port": null,
			"path": "/search?anilistInfo",
			"headers": {
			"content-length": length,
			"content-type": header
			}
			};
			
			const anime_req = https.request(options, function (anime_res) {
				if(anime_res.statusCode != 200){
						const q_data = querystring.stringify({title:'Aime Not Found'});
						res.writeHead(302, {Location: `http://localhost:3000/?` + q_data})

					res.end();
					return;
				}
				const chunks = [];
				anime_res.on("data", function (chunk) {
					chunks.push(chunk);
				});

				anime_res.on("end", function () {
					const body = Buffer.concat(chunks);
					const body_2 = JSON.parse(body);
					console.log(body_2.result[0].anilist.idMal);
					anime_id.push(body_2.result[0].anilist.idMal);
					res.writeHead(302, {Location: `http://localhost:3000/authorize`})
					.end();

				});
			});

			anime_req.write(body);
			anime_req.end();
			
			
        });
		}
		
	
		
	}

	
	else{
		res.end("404 Not Found")
	}
}

server.on("listening", listening_handler);
function listening_handler(){
	console.log(`Now Listening on Port ${port}`);
}

function send_access_token_request(code, mal_anime_id, res){
	let token_endpoint = "https://myanimelist.net/v1/oauth2/token";
	const grant_type = "authorization_code";
	const code_verifier = mal_anime_id.code_challenge;
	const post_data = querystring.stringify({client_id, client_secret, code,code_verifier,grant_type});
	console.log(post_data);
	let options = {
		method: "POST",
		headers:{
			"Content-Type":"application/x-www-form-urlencoded"
		},
	}
	https.request(
		token_endpoint,
		options, 
		(token_stream) => process_stream(token_stream, receive_access_token, mal_anime_id, res)
	).end(post_data);
}

function process_stream (stream, callback , ...args){
	let body = "";
	stream.on("data", chunk => body += chunk);
	stream.on("end", () => callback(body, ...args));
}

function receive_access_token(body, mal_anime_id, res){
	const access_token = JSON.parse(body);
	let update_cookie = true;
	console.log(access_token);
	send_add_anime_request(mal_anime_id, access_token, res,update_cookie);
}
//use mla api here
function send_add_anime_request(mal_anime_id, access_token, res, update_cookie){
	//if exists
	let cache_res = cache_get(mal_anime_id.mal_id, access_token);
	if(cache_res && cache_res.expiry >= new Date()){
		receive_response(cache_res.results,res,access_token,undefined,true);
			console.log("Cached Reuslts are Infinity");
	}
	else{
		const q_data = querystring.stringify({fields:'my_list_status'});
		const task_endpoint = "https://api.myanimelist.net/v2/anime/" + mal_anime_id.mal_id + '?' + q_data;

		const options = {
			method: "GET",
			headers: {
				Authorization: `Bearer ${access_token.access_token}`
			}
		}
		let cookie;
		if(update_cookie){
			let curDate = new Date()
			curDate.setMinutes(curDate.getMinutes() + 50);
			cookie = `access_token=${access_token.access_token};expires=${curDate.toUTCString()};Path=/`;
		}
		https.request(
			task_endpoint, 
			options, 
			(task_stream) => process_stream(task_stream, receive_response, res,access_token,cookie)
		).end();
	}
}

function receive_response(body, res,access_token,cookie,is_cache){
	const results = JSON.parse(body);
	let list_status;
	const title = results.title;
	if(!is_cache){
		cache_put(body, access_token.access_token);
	}
	if(results.my_list_status){
		list_status = results.my_list_status.status;
	}
	else{
		list_status = 'Not Watched';
	}
	console.log(body);
	console.log(results);
	const anime_image = results.main_picture.medium;
	const q_data = querystring.stringify({title,list_status,anime_image});
	
	if(cookie){	
		res.writeHead(302, {
		Location: `http://localhost:3000/?` + q_data,
		'Set-Cookie': cookie
		}).end();
	}
	else{
		res.writeHead(302, {
		Location: `http://localhost:3000/?` + q_data,
		}).end();
	}
	

}

function redirect_to_MAL(res){
	const authorization_endpoint = "https://myanimelist.net/v1/oauth2/authorize";
	console.log({client_id});
	const code_challenge = crypto.randomBytes(40).toString("hex");
	if(anime_id.length > 0){
		const mal_id = anime_id.pop();
		code_anime_pair.push({mal_id,code_challenge});
	}
	else{
		const mal_id = -99999
		code_anime_pair.push({mal_id,code_challenge});
	}
	const response_type = 'code';
    let uri = querystring.stringify({ response_type,client_id,code_challenge});
	res.writeHead(302, {Location: `${authorization_endpoint}?${uri}`})
	   .end();
}


function cache_put(results,token){
	let id = JSON.parse(results).id;
    if (!result_cache[token]) {
        result_cache[token] = {};
    }
	let curDate = new Date()
	curDate.setMinutes(curDate.getMinutes() + 1);
    result_cache[token][id] = {results: results, expiry: curDate};
}

function cache_get(id, token) {
    token = token.access_token;
    if (result_cache[token]) {
        return result_cache[token][id];
    } 
	else {
        return undefined;
    }
}

server.listen(port);
