var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var mongoose = require('mongoose');

var routes = require('./routes/index');
//var users = require('./routes/users');

var app = express();

var http = require('http').Server(app);
var io = require('socket.io')(http);

// DB Setup
mongoose.connect('mongodb://localhost/bookings');
var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function callback () {
  // yay!
});

var bookingSchema = mongoose.Schema({
    teamName: String,
    pilotName: String,
    tacticalName: String,
    engineerName: String,
    contactNumber: String,
    bookingTime: Date,
    status: Number,
    contactEmail: String,
    deathReason: String
});

var Booking = mongoose.model('Booking', bookingSchema);

Booking.create({
    teamName: "Boop Team",
    pilotName: "Pilot name",
    tacticalName: "Tac name",
    engineerName: "Engineer name",
    contactNumber: "0987654321",
    bookingTime: Date(),
    status: 0,
    contactEmail: "boobs@boobs.com",
    deathReason: ""
})

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hjs');

// uncomment after placing your favicon in /public
//app.use(favicon(__dirname + '/public/favicon.ico'));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', routes);
//app.use('/users', users);

io.on('connection', function(socket){
  console.log('a user connected');
  socket.on('syncRequest', function(msg){
    // Grab all entries and send them
    console.log('syncRequest received');
    Booking.find('', function (err, data){
      if(err) console.log(err);
      else{
        socket.emit('syncResponce', data);
        console.log('sending syncResponce');
      }
    });
  });

  socket.on('addTeam', function (team){
    Booking.create(team, function (err, team){
      if(err) console.log(err);
      else{
        socket.emit('teamAddedSuccess', team);
        socket.broadcast.emit('teamAdded', team);
      }
    });
  });

  socket.on('removeTeam', function (team){
    if(team._id==''){
      console.log('error,no team');
    }
    else{
      console.log('removing team:');
      console.log(team._id);
      Booking.findByIdAndRemove(team._id, function (err, team){
        if(err) console.log(err);
        else{
          socket.emit('teamRemovedSuccess', team);
          socket.broadcast.emit('teamRemoved', team);
          console.log('team removed:');
          console.log(team._id);
        }
      });
    }
  });
});

http.listen(2000, function(){
  console.log('listening on *:2000');
});

// catch 404 and forward to error handler
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function(err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});


module.exports = app;
