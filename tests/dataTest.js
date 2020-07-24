const winston = require('../config/winston');
const Data = require('../config/sqlite');
const { v4: uuidv4 } = require('uuid');
const util = require('util');

let sim_mode = false;
let db_location ='./data/sample.db';
if (process.argv.length > 2 && process.argv[2] == 'sim') {
  sim_mode = true;
  db_location = ':memory:';
}

let data = new Data({
  location: db_location,
  logger: winston
});

let startTime = Date.now();
let potColumnTemperature = 60.0;

// data.getRun(undefined, (data) => {
//   console.log(data);
// });
// data.getTimePoints(undefined, (data) => {
//   console.log(data);
// })

// Setup test Database
for (let j=0; j<5; j++) {
  let batchTime = startTime - (1000 * 60 * 60 * 24 * (5 - j));
  let batchID = uuidv4();
  let runData = {
    batchID: batchID,
    startTime: batchTime,
    input: {
      forcedTerminationTime: 8,
      volumeHearts: 38.8,
      alcoholPercent: 0.25,
      juniper: 175,
      cardamonm: 15,
      coriander: 50,
      angelica: 15,
      orange: 10,
      lemon: 15,
      typeOfRun: 'gin'
    }
  };
  data.createRun(runData, 'pot');
  for (let i=0; i<20; i++) {
    let timePointData = {
      batchID: batchID,
      epochtime: batchTime + (1000 * 60 * 10 * i),
      temperature: potColumnTemperature + (i * 2),
    };
    data.writeStillTimepoint(timePointData, 'pot');
    runData.result = {
      volume: 10,
      percent: 40
    }
    data.finishRun(runData, 'pot');
  }
  data.finishRun(runData, 'pot');
  data.getRun(batchID, (data) => {
    console.log(data);
  })
  // data.getTimePoints(batchID, (data) => {
  //   console.log(data);
  // })

}
// data.getRun(undefined, (data) => {
//   console.log(util.inspect(data, false, null, true));
// });
// data.getTimePoints(undefined, (data) => {
//   console.log(util.inspect(data, false, null, true))
// });
data.close();
