let counter = 0;

const sleep = (delay) => new Promise((resolve) => setTimeout(resolve,delay));

function test(loops, timeLimit) {
  console.log('Start test ' + loops + ' ' + timeLimit)
  this.counter = 0;
  return new Promise((resolve, reject) => {
    const intervalFunction = () => {
      clearInterval(this.testInterval);
      this.counter = this.counter + 1;
      console.log('counter ' + this.counter)

      // (async() => {await sleep (1000);})
      if (Date.now() >= timeLimit) {
        console.log('Resolve test')
        resolve('Reached timeLimit ' + timeLimit);
        return;
      } else if (this.counter>=loops) {
        console.log('Reject test')
        reject(new Error('Reached counter limit'));
        return;
      }
      // Calculate new interval
      this.testInterval = setInterval(intervalFunction, 1000);
    }
    this.testInterval = setInterval(intervalFunction, 1000);
    console.log('counter ' + this.counter)
  });
};

async function main(){
  try {
    let result = await test(5, Date.now()+3000);
    console.log("Result: " + result);
  } catch (e) {
    console.error("Error: " + e.message);
  }
  try {
    let result = await test(3, Date.now()+5000);
    console.log("Result: " + result);
  } catch (e) {
    console.error("Error: " + e.message);
  }
}

main();
