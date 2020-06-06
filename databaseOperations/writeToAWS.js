const axios = require('axios');
const secretCode = 'morecowbell';

module.exports = {
    writeStillTimepoint: function(timePointData,unitOperation) {
        let timePointMessage = JSON.stringify({
            timePointData:timePointData,
            secretCode:secretCode,
            unitOperation:unitOperation
        });
        axios.post('http://23.20.62.209:3000/sendtimepointdata', {
            timePointMessage
        }).then(res=>{
            console.log(res.message);
        });
    }
}