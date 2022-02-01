require('ts-node/register');
const {App} = require('./app');
const path = require('path');

const app = new App(path.join(process.cwd(), process.argv[2]));
app.run();
