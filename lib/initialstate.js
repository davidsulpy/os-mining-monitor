'use strict';

var needle = require('needle');

const rigKeysToIgnore = ["bioses", "meminfo", "drive_name", "mobo", "lan_chip", "connected_displays", "ram", "pool", "server_time"];

exports.reduceEthosEvents = (item) => {
	return Object.keys(item).reduce((acc, key) => {
		// If the key is not one of the keys to ignore, stream it
		if (rigKeysToIgnore.indexOf(key) === -1) {
			var values = [];
			if (item[key]) {
				values = item[key].toString().split(' ');
			}
			values.forEach((v, i) => {
				var k = key;
				if (values.length > 1) {
					k = key + "_" + i;
				}
				acc.push({
					key: k,
					value: v,
					epoch: item["server_time"]
				});
			});
		}
		return acc;
	}, []);
};

function postCallback(todo, callback) {
	return (err, resp) => {
		if (err) {
			console.log("error posting to initialstate: %j", err);
		} else {
			console.log("status code: ", resp.statusCode);
			console.log("body: %j", resp.body);
		}
		todo--;
		if (todo === 0) {
			var statusError = null;
			if (Number(resp.statusCode) > 299) {
				statusError = resp.statusCode;
			}
			callback(statusError || err, resp);
		}
	};
}

exports.send = (events, bucketKey, accessKey, callback) => {

	var todo = 1;
	if (Array.isArray(bucketKey)) {
		todo = bucketKey.length;
	} else {
		bucketKey = [bucketKey];
	}

	for (var i = 0; i < todo; i++) {
		if (accessKey && bucketKey && bucketKey[i]) {
			needle.post("https://groker.initialstate.com/api/events",
				events,
				{
					json: true,
					headers: {
						"X-IS-AccessKey": accessKey,
						"X-IS-BucketKey": bucketKey[i],
						"Content-Type": "application/json",
						"Accept-Version": "~0"
					}
				}, postCallback(todo, callback));
		} else {
			console.log("ACCESSKEY AND BUCKET KEY REQUIRED");
			postCallback(todo, callback)("ACCESSKEY_AND_BUCKETKEY_REQUIRED");
		}
	}
};

exports.reduceCoinbase = (item) => {
	return item.data.reduce((acc, item) => {
		acc.push({
			key: `coinbase_${item.currency.toLowerCase()}_per_${item.base.toLowerCase()}`,
			value: Number(item.amount),
			epoch: (new Date())/1000
		});
		return acc;
	}, []);
};

exports.reduceNanoPoolGeneralInfo = (body) => {
	var items = [
		{
			key: 'nanopool_hashrate',
			value: body.data.hashrate
		},
		{
			key: 'nanopool_hashrate_avg_1h',
			value: body.data.avgHashrate.h1
		},
		{
			key: 'nanopool_hashrate_avg_3h',
			value: body.data.avgHashrate.h3
		},
		{
			key: 'nanopool_hashrate_avg_6h',
			value: body.data.avgHashrate.h6
		},
		{
			key: 'nanopool_hashrate_avg_12h',
			value: body.data.avgHashrate.h12
		},
		{
			key: 'nanopool_hashrate_avg_24h',
			value: body.data.avgHashrate.h24
		},
		{
			key: 'nanopool_eth_due',
			value: body.data.balance
		}
	];
	return body.data.workers.reduce((acc, item) => {
		acc.push({
			key: `nanopool_hashrate_${item.id}`,
			value: item.hashrate
		});
		return acc;
	}, items);
};

exports.reduceEtherchainStats = (body) => {
	return Object.keys(body["currentStats"]).reduce((acc, key) => {
		if (key !== "time") {
			let keyName = key;
			// NOTE: legacy translations:
			if (key === "block_time") {
				keyName = "blockTime";
			}
			if (key === "hashrate") {
				keyName = "hashRate";
			}
			// END NOTE
			acc.push({
				key: `eth_network_${keyName}`,
				value: body["currentStats"][key],
				epoch: (new Date())/1000
			});
		}

		return acc;
	}, []);
};