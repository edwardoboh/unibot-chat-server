const http = require('http');
const express = require('express');
const socketio = require('socket.io');
// const cors = require('cors');
// Dialogflow Imports
let botID
const dialogflow = require('@google-cloud/dialogflow');
const dialogflowConfig = require("./config");
const projectId = dialogflowConfig.project_id;
const configuration = {
  credentials: {
    private_key: dialogflowConfig.private_key,
    client_email: dialogflowConfig.client_email
  }
};

const { addUser, removeUser, getUser, getUsersInRoom } = require('./users');

const router = require('./router');
const { randomInt } = require('crypto');
const { response } = require('express');

const app = express();
const server = http.createServer(app);
const io = socketio(server);

// app.use(cors());
app.use(router);
const botName = "Unibot"
// let sessionID;

// ************************************DIALOGFLOW BEGIN*****************************************************

// Instantiates a session client
const sessionClient = new dialogflow.SessionsClient(configuration);

// async function detectIntent(
async function detectIntent(
  projectId,
  sessionId,
  query,
  contexts,
  languageCode
) {
  // The path to identify the agent that owns the created intent.
  const sessionPath = sessionClient.projectAgentSessionPath(
    projectId,
    sessionId
  );

  // The text query request.
  const request = {
    session: sessionPath,
    queryInput: {
      text: {
        text: query,
        languageCode: languageCode,
      },
    },
  };

  if (contexts && contexts.length > 0) {
    request.queryParams = {
      contexts: contexts,
    };
  }

  // const responses = await sessionClient.detectIntent(request);
  const responses = await sessionClient.detectIntent(request).then((responseData) => {
    // console.log("API RESPONSE: ", JSON.stringify(responseData));
    // const requiredResponse = responseData[0].queryResult;
    // return requiredResponse;
    return responseData
  })
  .catch((error) => {
    console.log("ERROR: " + error);
  });
  // console.log("RESPONSES: ", responses)
  return responses[0];
}

// ************************************DIALOGFLOW END*****************************************************

io.on('connect', (socket) => {
  console.log("A user has connected")
  socket.on('join', ({ name, room }, callback) => {
    // User Authentication
    // Get user from database
    // Create a DialogFlow User and set name to Unibot
    // sessionID = socket.id
    botID = Math.random() * 100
    const bot = addUser({id: botID, name: botName, room})
    const { error, user } = addUser({ id: socket.id, name, room });
    console.log(`A user has joined : ${user}`)

    if(error) return callback(error);

    socket.join(user.room);

    socket.emit('message', { user: 'Admin', text: `${user.name}, welcome to CPE query Bot.`});
    socket.broadcast.to(user.room).emit('message', { user: 'Admin', text: `${user.name} has joined!` });

    io.to(user.room).emit('roomData', { room: user.room, users: getUsersInRoom(user.room) });

    callback();
  });

  socket.on('sendMessage', (message, callback) => {
    const user = getUser(socket.id);
    const bot = getUser(botID)
    const query = message

    // Send User message to DialogFlow
    // ********************************PREPARE FOR REQUEST TO DIALOGFLOW
    let intentResponse;
    try{
      intentResponse = detectIntent(projectId, socket.id, query, null, "en-US")
      // console.log("intendedResponse: ",intentResponse)
      // console.log(`Fulfillment Text: ${intentResponse.queryResult.fulfillmentText}`);
    }catch(err){
      console.log(err)
    }
    // Get dialogFlow response and send to chat
    io.to(user.room).emit('message', { user: user.name, text: message });
    intentResponse.then((theResp) => {
      let botReply = theResp.queryResult.fulfillmentMessages.filter((reply) => {
        return reply.platform === 'PLATFORM_UNSPECIFIED'
      })
      botReply.map(reply => {
        io.to(user.room).emit('message', { user: bot.name, text: reply.text.text[0] });
      })
      // console.log("The response", theResp.queryResult.fulfillmentMessages[0].text.text[0])
    })
    // const responseList = intentResponse.queryResult.fulfillmentMessages
    // console.log(responseList)

    // io.to(user.room).emit('message', { user: user.name, text: message });

    callback();
  });

  socket.on('disconnect', () => {
    const user = removeUser(socket.id);
    const bot = removeUser(botID)

    if(user) {
      io.to(user.room).emit('message', { user: 'Admin', text: `${user.name} has left.` });
      io.to(user.room).emit('roomData', { room: user.room, users: getUsersInRoom(user.room)});
    }
  })
});
const PORT = process.env.PORT || 5000

server.listen(PORT, () => console.log(`Server has started on PORT ${PORT}`));