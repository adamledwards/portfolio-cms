const express = require('express');
const graphqlHTTP = require('express-graphql');
const schema = require('./schema');
const multer = require('multer');
const md5 = require('md5');
const path = require('path');
const os = require('os');
var cors = require('cors');
const SETTINGS = require('./config/settings.js');

const app = express();
uploads = 
app.use(cors());
app.use(SETTINGS.MEDAIA_PATH, express.static(SETTINGS.MEDAIA_ROOT));

var uploads = multer({dest: os.tmpdir()}).fields([
  { name: 'file', maxCount: 1 },
  { name: 'file1', maxCount: 1 },
  { name: 'file2', maxCount: 1 }
]);
app.use('/graphql', uploads, graphqlHTTP((request) => ({
  schema: schema,
  graphiql: true,
  rootValue: { request: request },
})));

app.listen(4000, () => {
  console.log('Server started');
});