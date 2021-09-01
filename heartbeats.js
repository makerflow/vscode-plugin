const _ = require("lodash");
const makerflow = require("./makerflow");
const config = require("./config");

let activityTimestamps = [];
const heartbeat = function() {
    activityTimestamps.push(Date.now())    
}

const processHeartbeats = async function() {
    await config.warnAboutApiTokenAvailability();
    if (activityTimestamps.length === 0) return;
    const temp = _.clone(activityTimestamps);
    activityTimestamps = [];
    makerflow.recordProductiveActivity(_.min(temp), _.max(temp))
}

module.exports = {
    heartbeat,
    processHeartbeats
}
