const express = require('express')
const app = express()
const bodyParser = require('body-parser')

const cors = require('cors')
const mongodb = require('mongodb');
const mongoose = require('mongoose')
const {Schema} = mongoose
mongoose.connect(process.env.MLAB_URI || 'mongodb://localhost/exercise-track', {useNewUrlParser: true})

const UserSchema = new Schema({
  username : {type: String, required: true}, 
  log : [{
     description: {type: String, required: true}, 
     duration: {type: Number, required: true},
     date: {type: Number, default: new Date().getTime()}
  }]
}), 
  User = mongoose.model('User', UserSchema)
const logSchema = new Schema({
  userId: {type: String, required: true}, 
  description: {type: String, required: true}, 
  duration: {type: Number, required: true},
  date: {type: Date, default: function () { 
    let d = new Date()
    return Date.now()
   // return d.getFullYear() + "-" + (d.getMonth() < 10 ? '0' + d.getMonth() : d.getMonth()) 
     // + "-" + (d.getDay() < 10 ? '0' + d.getDay() : d.getDay())
    } 
  }
}), 
  Log = mongoose.model('Log', logSchema)

/*
 @data: object containing data for the new mongo document 
 @createUserBool: if true use the User schema, else use Log schema
 @done: callback function with two params (error, data)
*/
function createAndSaveUser(data, done) {
  var user = new User(data) 
  user.save((err, data) => err ? done(err) : done(null, data))
}

function addLog(id, log, done) {
  findUserById(id, (err, user) => {
    if (err) return done(err)
    user.log.push(log)
    user.save((err, data) => err ? done(err) : done(null, data))
  })
}

function findUserById(userId, done) {
  User.findById({'_id': userId}, (err, data) => err ? done(err) : done(null, data))
}

function retrieveUsers(done) {
  User.find({}, {_id: 1, username: 1}, (err, data) => err ? done(err) : done(null, data))
}



app.use(cors())

app.use(bodyParser.urlencoded({extended: false}))
app.use(bodyParser.json())


app.use(express.static('public'))
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/views/index.html')
});

app.get('/api/exercise/users', (req, res) => {
  retrieveUsers((err, data) => err ? res.json({'error': err}) : res.json(data))
});

app.post('/api/exercise/new-user', (req, res) => {
  createAndSaveUser({username: req.body.username, log: []}, 
      (err, data)=> err ? res.json({"error": err}) : 
      res.json({username: data.username, _id: data._id}))
  
});

app.post('/api/exercise/add', (req, res) => {
  let log = { description: req.body.description, 
              duration: req.body.duration, date: new Date(req.body.date).getTime()}
  if (!log.date) delete log.date 
  addLog(req.body.userId, log, (err, data) => {
    if (err) res.json({error: err})
    let log = data.log[data.log.length -1]
    res.json({
      _id: data._id,
      username: data.username,
      description: log.description,
      duration: log.duration,
      date: new Date(log.date).toISOString().substr(0, 10)
    })
  })
})

app.get('/api/exercise/log', (req, res) => {
  let _id = req.query.userId
  let done = (err, data) => {
    if (err) res.json({'error': err}) 
    if (data == []) res.json({"error": "information not found"})
    let d = (data[0] ? data[0] : data)
    let json = {_id: d._id, username: d.username, 
                from: req.query.from, to: req.query.to, 
                limit: req.query.limit, count: d.log.length, log: []}
    if (d.log) d.log.forEach(l => json.log.push({
        description: l.description,
        duration: l.duration,
        date: new Date(l.date).toISOString().substr(0,10)
    }))
    res.json(json) 
  }  
  if (!_id) res.json({'error': 'Add query "?userId=ID_OF_USER" to the end of the url'}) 
  else if (Object.keys(req.query).length === 1) {
    findUserById(_id, done)
  }
  else if (Object.keys(req.query).length === 2 && req.query.limit) {
    User.findById({_id: mongoose.Types.ObjectId(_id)}, 
        {log: {$slice: parseInt(req.query.limit)}}, done)
  }
  else {
     let filter = {
      input: '$log',
      as: 'l',
      cond: (req.query.from && req.query.to ? {
        $and: [
          { $lte: [ "$$l.date", new Date(req.query.to).getTime() ] },
          { $gte: [ "$$l.date", new Date(req.query.from).getTime() ] },
        ]
      } : (req.query.from ? {
         $gte: [ "$$l.date", new Date(req.query.from).getTime() ] 
       } : {
         $lte: [ "$$l.date", new Date(req.query.to).getTime() ]
       })) 
     }
     let log_options = (req.query.limit ? { 
       $slice: [ {$filter: filter}, parseInt(req.query.limit)]
     } : {
        $filter: filter
     })

   
     User.aggregate([
      { $match: { "_id": mongoose.Types.ObjectId(req.query.userId) }},
      { $project: { // $project passes along the documents with the requested fields to the next stage in the pipeline
        log: log_options,
        username: 1, // include username in returned data
        _id: 1
      }}
    ], done)
  }
}) //end POST 'api/exercise/log'

// Not found middleware
app.use((req, res, next) => {
  return next({status: 404, message: 'not found'})
})

// Error Handling middleware
app.use((err, req, res, next) => {
  let errCode, errMessage

  if (err.errors) {
    // mongoose validation error
    errCode = 400 // bad request
    const keys = Object.keys(err.errors)
    // report the first validation error
    errMessage = err.errors[keys[0]].message
  } else {
    // generic or custom error
    errCode = err.status || 500
    errMessage = err.message || 'Internal Server Error'
  }
  res.status(errCode).type('txt')
    .send(errMessage)
})


//https://fuschia-custard.glitch.me/api/exercise/log?userId=ByU9ZV-dV <--get exercise log

const listener = app.listen(process.env.PORT || 3000, () => {
  console.log('Your app is listening on port ' + listener.address().port)
})

