var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var mongoose = require('mongoose');
var cred = require('./credentials.js');
var client = require('twilio')(cred.accountSID, cred.authToken);

var routes = require('./routes/index');
//var users = require('./routes/users');

var app = express();

var http = require('http').Server(app);
var io = require('socket.io')(http);

var basicAuth = require('basic-auth-connect');
//app.use(basicAuth(cred.mainUsername, cred.mainPassword));

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

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hjs');

// uncomment after placing your favicon in /public
//app.use(favicon(__dirname + '/public/favicon.ico'));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use('/audio', express.static(path.join(__dirname, 'public/audio')));
app.use('/', basicAuth(cred.mainUsername, cred.mainPassword), express.static(path.join(__dirname, 'public')));

var apiRouter = express.Router();

apiRouter.route('/teams')
  .get(function(req, res) {
    Booking.find({}, 'teamName pilotName tacticalName engineerName bookingTime status deathReason', function(err, teams) {
      if (err) {
        res.send(err);
      }
      else {
        res.json(teams);
      }
    });
  });

var twilioRouter = express.Router();

twilioRouter.route('/autoResponse/:_id')
  .post(function(req, res) {
    // We have had a selection made on the call, return twiml, save in mongodb and broadcast over socket io
    // Check post data is in range
    var responseDigit = parseInt(req.body.Digits);

    console.log('got number: '+responseDigit);
    // if(responseDigit>0 && responseDigit<4){

    //   Booking.findByIdAndUpdate(req.params._id, { 'briefCheckStatus': responseDigit }, function (err, team){
    //     if(err){
    //       console.log(err);
    //     }
    //     else{
    //       console.log('team updated:');
    //       console.log(team);
    //     }
    //   });
    // }
  });

twilioRouter.route('/callStatus/:_id')
  .post(function(req, res) {
    // Call has ended, check if response has already been made, if not set as no responce and broadcast

  });


app.use('/', routes);
app.use('/api', apiRouter);
app.use('/twilio', twilioRouter);
//app.use('/users', users);



function callCrew(systemNumber, bookingNumber, crewNumber){
  client.makeCall({

      to: bookingNumber, // Any number Twilio can call
      from: systemNumber, // A number you bought from Twilio and can use for outbound communication
      url: 'http://twimlets.com/echo?Twiml=%3CResponse%3E%0A%20%20%20%20%3CSay%3EDialing%20crew%20now%2C%20standby%3C%2FSay%3E%0A%20%20%20%20%3CDial%3E' + crewNumber + '%3C%2FDial%3E%0A%3C%2FResponse%3E&' // A URL that produces an XML document (TwiML) which contains instructions for the call

  }, function(err, responseData) {

      //executed when the call has been initiated.
      if(err){
        console.log('Error!');
        console.log(err);
      }
      else {
        console.log(responseData.from); // outputs "+14506667788"
      }

  });
}

function formatTelephoneNumber(number){
  if(number.charAt(0)=='0'){
    return '+44' + number.substring(1, number.length);
  }
  else{
    return number;
  }
}

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

  socket.on('removeTeam', function (team){
    if(team._id==''){
      console.log('error,no team');
      socket.emit('teamRemovedFail', 'Incorrect ID');
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

  socket.on('updateTeam', function (team){
    if(team._id=='' || team._id==undefined){
      console.log('error,no team');
      socket.emit('teamUpdatedFail', 'No Team ID');
    }
    else{
      console.log('updating team:');
      console.log(team);
      Booking.findByIdAndUpdate(team._id, team.update, function (err, team){
        if(err){
          console.log(err);
          socket.emit('teamUpdatedFail', err);
        }
        else{
          socket.emit('teamUpdatedSuccess', team);
          socket.broadcast.emit('teamUpdated', team);
          console.log('team updated:');
          console.log(team);
        }
      });
    }
  });

  socket.on('queryTeam', function (team){
    if(team._id=='' || team._id==undefined){
      console.log('error, no team');
      socket.emit('queryTeamFail', 'No Team ID');
    }
    else{
      console.log('querying team:');
      console.log(team._id);
      Booking.findById(team._id, function (err, team){
        if(err){
          console.log(err);
          socket.emit('queryTeamFail', err);
        }
        else{
          socket.emit('queryTeamSuccess', team);
          console.log('team queried:');
          console.log(team._id);
        }
      });
    }
  });

  socket.on('addTeam', function (team){
    if(team!=''){
      console.log('adding team:');
      console.log(team.teamName);
      team['bookingTime'] = Date();
      team['status'] = 0;
      team['deathReason'] = "";
      console.log(team);
      if(team.teamName!='' && team.PilotName!='' && team.TacticalName!='' && team.EngineerName!=''){
        Booking.create(team, function (err, team){
          if(err) console.log(err);
          else{
            socket.emit('teamAddedSuccess', team);
            socket.broadcast.emit('teamAdded', team);
            console.log('team added:');
            console.log(team._id);
          }
        });
      }
      else {
        console.log('some feilds missing');
        socket.emit('teamAddedFail', 'Missing input');
      }
    }
  });

  socket.on('autoCall', function (team){
    if(team._id==''){
      console.log('error,no team');
      socket.emit('autoCallFail', 'No Team ID');
    }
    else{
      console.log('looking up team:');
      console.log(team._id);
      Booking.findById(team._id, function (err, team){
        if(err){
          console.log(err);
          socket.emit('autoCallFail', err);
        }
        else{
          if(team.contactNumber=='' || team.contactNumber==undefined){
            console.log('error, team has no number');
            socket.emit('autoCallFail', 'Team has no number');
          }
          else{
            console.log('iniating patch for:');
            console.log(team._id);
            client.makeCall({

                to: formatTelephoneNumber(team.contactNumber), // Any number Twilio can call
                from: cred.systemNumber, // A number you bought from Twilio and can use for outbound communication
                url: 'http://twimlets.com/echo?Twiml=%3CResponse%3E%0A%20%20%3CGather%20timeout%3D%225%22%20numDigits%3D%221%22%20method%3D%22POST%22%20action%3D%22http%3A%2F%2Fbooking.lhsbikeshed.com%2Ftwilio%2FautoResponse%2F' + team._id + '%22%3E%0A%20%20%20%20%3CPause%20length%3D%221%22%2F%3E%0A%20%20%20%20%3CPlay%3Ehttp%3A%2F%2Fbooking.lhsbikeshed.com%2Faudio%2FbookingNotification-Main.wav%3C%2FPlay%3E%0A%20%20%20%20%3CPause%20length%3D%225%22%2F%3E%0A%20%20%20%20%3CPlay%3Ehttp%3A%2F%2Fbooking.lhsbikeshed.com%2Faudio%2FbookingNotification-Main.wav%3C%2FPlay%3E%0A%20%20%3C%2FGather%3E%0A%20%20%3CHangup%2F%3E%0A%3C%2FResponse%3E&',
                statusCallback : 'http://booking.lhsbikeshed.com/twilio/callStatus/' + team._id

            }, function(err, responseData) {

                //executed when the call has been initiated.
                if(err){
                  console.log('Error!');
                  console.log(err);
                }
                else {
                  console.log('Call placed'); // outputs "+14506667788"
                  io.sockets.emit('alert', 'Automated Call placed for: '+ responseData.to);
                }

            });
          }
        }
      });
    }
  });

  socket.on('patchCall', function (team){
    if(team._id==''){
      console.log('error,no team');
      socket.emit('patchCallFail', 'No Team ID');
    }
    else{
      console.log('looking up team:');
      console.log(team._id);
      Booking.findById(team._id, function (err, team){
        if(err){
          console.log(err);
          socket.emit('patchCallFail', err);
        }
        else{
          if(team.contactNumber=='' || team.contactNumber==undefined){
            console.log('error, team has no number');
            socket.emit('patchCallFail', 'Team has no number');
          }
          else{
            console.log('iniating patch for:');
            console.log(team._id);
            client.makeCall({

                to: '+447733223902', // Any number Twilio can call
                from: cred.systemNumber, // A number you bought from Twilio and can use for outbound communication
                url: 'http://twimlets.com/echo?Twiml=%3CResponse%3E%0A%20%20%20%20%3CGather%20timeout%3D%2210%22%20numDigits%3D%221%22%20action%3D%22http%3A%2F%2Ftwimlets.com%2Fecho%3FTwiml%3D%253CResponse%253E%250A%2520%2520%2520%2520%253CSay%253EDialing%2520crew%2520now%252C%2520standby%253C%252FSay%253E%250A%2520%2520%2520%2520%253CDial%253E'+encodeURIComponent(formatTelephoneNumber(team.contactNumber))+'%253C%252FDial%253E%250A%253C%252FResponse%253E%22%3E%0A%3CPause%20length%3D%222%22%2F%3E%20%20%20%20%20%20%20%20%3CSay%3ECall%20will%20be%20patched%20to%20crew%20if%20you%20press%20any%20key%3C%2FSay%3E%0A%20%20%20%20%3C%2FGather%3E%0A%3C%2FResponse%3E&'

            }, function(err, responseData) {

                //executed when the call has been initiated.
                if(err){
                  console.log('Error!');
                  console.log(err);
                }
                else {
                  console.log('Call placed'); // outputs "+14506667788"
                  io.sockets.emit('alert', 'Call placed for: '+ responseData.to);
                }

            });
          }
        }
      });
    }
  });
});

http.listen(cred.portNum, function(){
  console.log('listening on *:'+cred.portNum);
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
