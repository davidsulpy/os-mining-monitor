'use strict';

var needle = require('needle'),
	initialstate = require('./lib/initialstate');

exports.rigMonitor = (event, context, callback) => {
	console.log("calling url:", process.env.MINING_RIG_URL);
	let sns = new AWS.SNS();

	needle.get(process.env.MINING_RIG_URL, (err, resp, body) => {
		if (err) {
			console.log("mining rig request failed: %j", err);
			callback(err);
		} else {
			body = JSON.parse(body);
			console.log("mining rig data: %j", body);
			var rigCount = Object.keys(body.rigs).length;
			var processed = 0;

			var todo = rigCount + 1;
			var done = 0;
			var summaryEvents = [];
			Object.keys(body.rigs).forEach((rig) => {
				summaryEvents.push({
					key: rig+'_hash',
					value: body.rigs[rig].hash
				});
				var rigWatts = body.rigs[rig].watts.split(' ')
								.reduce((iter, item) => {
									return iter+(Number(item) || 0);
								}, 0);
				if (Number(body.rigs[rig].hash) <= 0) {
					rigWatts = 0;
				}
				summaryEvents.push({
					key: rig+'_watts',
					value: rigWatts
				});

				sns.publish({
					TopicArn: process.env.SEND_RIGDATA_TOPIC,
					Subject: rig,
					Message: JSON.stringify(body.rigs[rig])
				}, (err, resp) => {
					if (err) {
						console.log("error publishing sns: %j", err);
					} else {
						console.log("published! %j", resp);
					}
					processed++;
					done++;
					if (todo === done) {
						callback(null, "finished");
					}
				});
			});

			Object.keys(body).forEach((key) => {
				if (key !== "per_info" && key !== "rigs") {
					summaryEvents.push({
						key: key,
						value: body[key]
					});
				}
			});
			initialstate.send(summaryEvents, process.env.MAIN_BUCKET_KEY, process.env.ACCESS_KEY, (err) => {
				if (err) {
					console.log('error sending data to initialstate: %j', err);
				} else {
					console.log('successfully sent summary to initialstate: %j', summaryEvents);
				}
				done++;
				if (todo === done) {
					callback(null, "finished");
				}
			});
		}
	});
};

exports.sendRigData = (event, context, callback) => {

	var todo = event.Records.length + 1;
	var done = 0;

	event.Records.forEach((record) => {
		var item = JSON.parse(record.Sns.Message);

		// NOTE: the code below will exceed standard user rate limits in Initial State
		// with more than a couple rigs on ethos.... Use only if extra send rates have
		// been purchased.

		//var bucketKey = process.env.MAIN_BUCKET_KEY + '-' + record.Sns.Subject;
		//var events = initialstate.reduceEthosEvents(item);
		//console.log(JSON.stringify(events));

		// initialstate.send(events, bucketKey, process.env.ACCESS_KEY,
		// 	(err, resp) => {
		// 		if (err) {
		// 			console.log("error posting to initialstate: %j", err);
		// 		} else {
		// 			console.log(resp);
		// 		}
		// 		done++;
		// 		if (done === todo) {
		// 			callback(null, "finished sending rig data");
		// 		}
		// });

		initialstate.send([{key: `rigs-${record.Sns.Subject}-state`, value: item.condition}], process.env.MAIN_BUCKET_KEY, process.env.ACCESS_KEY, (err, resp) => {
			if (err) {
				console.log("error posting to initialstate: %j", err);
			} else {
				console.log(resp);
			}
			done++;
			if (done === todo) {
				callback(null, "finished sending rig data to master");
			}
		});
	});
};


function handleCallbackProgress(todo, done, errors, callback) {
	if (todo === done) {
		if (errors && errors.length > 0) {
			callback(errors);
		} else {
			callback(null, 'success!');
		}
	}
}

exports.networkMonitor = (event, context, callback) => {

	var todo = 2;
	var done = 0;
	var errors = [];

	needle.get("https://www.etherchain.org/api/basic_stats", (err, resp, body) => {
		if (err) {
			console.log("mining rig request failed: %j", err);
		} else {
			var events = initialstate.reduceEtherchainStats(body);

			initialstate.send(events, process.env.MAIN_BUCKET_KEY, process.env.ACCESS_KEY, (err) => {
				if (err) {
					console.log('error sending events to initialstate: %j', err);
					errors.push(err);
				} else {
					console.log('successfully sent events to initialstate: %j', events);
				}
			});
		}
		done++;
		handleCallbackProgress(todo, done, errors, callback);
	});

	needle.get("https://api.coinbase.com/v2/prices/USD/spot", (err, resp, body) => {
		if (err) {
			console.log("coinbase request failed: %j", err);
			errors.push(err);
		} else {
			var events = initialstate.reduceCoinbase(body);

			initialstate.send(events, process.env.MAIN_BUCKET_KEY, process.env.ACCESS_KEY, (err) => {
				if (err) {
					console.log('error sending events to initialstate: %j', err);
					errors.push(err);
				} else {
					console.log('successfully sent events to initialstate: %j', events);
				}

			});
		}
		done++;
		handleCallbackProgress(todo, done, errors, callback);
	});
};

exports.nanoPoolPaymentsMonitor = (event, context, callback) => {
	let AWS = require('aws-sdk'),
		dynamo = new AWS.DynamoDB.DocumentClient();

	needle.get(`https://api.nanopool.org/v1/eth/payments/${process.env.ETH_ADDRESS}`, (err, resp, body) => {
		if (err) {
			console.log("nanopool miner_stats failed: %j", err);
			callback(err);
		} else {
			console.log(body);
			if (body.data.length>0) {
				dynamo.update({
					TableName: process.env.CHECKPOINT_TABLE,
					Key: {
						id: `nanopool_tx_${process.env.ETH_ADDRESS}`,
					},
					UpdateExpression: 'set time_ms = :time, tx_hash = :txh add amt_paid :paid',
					ExpressionAttributeValues: {
						':time': body.data[0].date * 1000,
						':paid': body.data[0].amount,
						':txh': body.data[0].txHash
					},
					ConditionExpression: ':txh <> tx_hash',
					ReturnValues: "ALL_NEW"
				}, (err, data) => {
					if (err) {
						console.log("error setting the checkpoint: %j", err);
						callback(err);
					} else {
						console.log(data.Attributes);
						var events = [{
							key: 'nanopool_amt_paid',
							value: data.Attributes.amt_paid
						}];

						initialstate.send(events, [process.env.MAIN_BUCKET_KEY, `${process.env.MAIN_BUCKET_KEY}-sum`], process.env.ACCESS_KEY, (err) => {
							if (err) {
								console.log('error sending events to initialstate: %j', err);
								callback(err);
							} else {
								console.log('successfully sent events to initialstate: %j', events);
								callback(null, "success!");
							}
						});
					}
				});
			}
		}
	});
};

exports.nanoPoolUserMonitor = (event, context, callback) => {
	needle.get(`https://api.nanopool.org/v1/eth/user/${process.env.ETH_ADDRESS}`, (err, resp, body) => {
		if (err) {
			console.log("nanopool rig request failed: %j", err);
			callback(err);
		} else {
			var events = initialstate.reduceNanoPoolGeneralInfo(body);

			initialstate.send(events, process.env.MAIN_BUCKET_KEY, process.env.ACCESS_KEY, (err) => {
				if (err) {
					console.log('error sending events to initialstate: %j', err);
					callback(err);
				} else {
					console.log('successfully sent events to initialstate: %j', events);
					callback(null, "success!");
				}
			});
		}
	});
};